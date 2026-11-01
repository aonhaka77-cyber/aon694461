require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const editorDir = path.join(rootDir, "editor");
const uploadsDir = path.join(publicDir, "uploads");
const dataDir = path.join(rootDir, "data");

if (!process.env.SITE_EDIT_KEY || process.env.SITE_EDIT_KEY.length < 12) {
  throw new Error("SITE_EDIT_KEY must be configured and at least 12 characters long.");
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be configured and at least 32 characters long.");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "aon.sqlite"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const defaultCss = `/* Aon 사이트 디자인을 이곳에서 바꿀 수 있습니다. */
.hero {
  background: linear-gradient(135deg, #f1f5ff, #ffffff);
}

.gallery img {
  border-radius: 16px;
}`;
const defaultDocument = {
  title: "Aon",
  summary: "Aon에 관한 정보를 모아 둔 문서입니다.",
  body: "== 개요 ==\nAon은 아이디어와 취향을 기록하고 나누기 위한 개인 공간이다. 이 문서에 Aon에 관한 내용을 자유롭게 정리할 수 있다.\n\n== 특징 ==\n * Aon을 소개하는 개인 위키 문서\n * 문서 안에 이미지를 원하는 위치에 삽입\n\n== 이미지 ==\n이미지를 업로드한 뒤 편집기에서 원하는 위치에 삽입한다.",
  imageRefs: []
};
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("site_css", defaultCss);
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(
  "site_document",
  JSON.stringify(defaultDocument)
);
const storedDocument = JSON.parse(
  db.prepare("SELECT value FROM settings WHERE key = ?").get("site_document").value
);
if (typeof storedDocument.body !== "string") {
  const legacyImages = db.prepare(
    "SELECT id FROM images ORDER BY created_at DESC"
  ).all();
  const legacyBody = [
    "== 개요 ==",
    storedDocument.overview || defaultDocument.body.split("\n")[1],
    ...(Array.isArray(storedDocument.features) && storedDocument.features.length
      ? ["", "== 주요 기능 ==", ...storedDocument.features.map((feature) => ` * ${feature}`)]
      : []),
    ...(storedDocument.galleryIntro || legacyImages.length
      ? [
          "",
          "== 이미지 모음 ==",
          ...(storedDocument.galleryIntro ? [storedDocument.galleryIntro] : []),
          ...legacyImages.map(() => "{이미지}")
        ]
      : [])
  ].join("\n");
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(
    JSON.stringify({
      title: storedDocument.title || "Aon",
      summary: storedDocument.summary || "",
      body: legacyBody,
      imageRefs: legacyImages.map((image) => image.id)
    }),
    "site_document"
  );
}

app.disable("x-powered-by");
if (isProduction) {
  app.set("trust proxy", 1);
}
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

const editorKey = Buffer.from(process.env.SITE_EDIT_KEY);
const sessionSecret = process.env.SESSION_SECRET;
const loginAttempts = new Map();
const loginWindowMs = 15 * 60 * 1000;
const loginMaxAttempts = 8;
const sessionDurationMs = 8 * 60 * 60 * 1000;
const attemptCleanup = setInterval(() => {
  const now = Date.now();
  for (const [address, attempt] of loginAttempts) {
    if (now - attempt.startedAt >= loginWindowMs) {
      loginAttempts.delete(address);
    }
  }
}, loginWindowMs);
attemptCleanup.unref();

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signatureFor(expiry) {
  return crypto.createHmac("sha256", sessionSecret).update(expiry).digest("hex");
}

function editorCookieValue() {
  const expiry = String(Date.now() + sessionDurationMs);
  return `${expiry}.${signatureFor(expiry)}`;
}

function isEditor(req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("aon_editor="));
  const [expiry, signature, extra] = (cookie ? cookie.slice("aon_editor=".length) : "").split(".");
  if (!expiry || !signature || extra || !/^\d+$/.test(expiry) || Number(expiry) <= Date.now()) {
    return false;
  }
  return safeEqual(signature, signatureFor(expiry));
}

function requireEditor(req, res, next) {
  if (!isEditor(req)) {
    return res.status(401).json({ error: "편집자 인증이 필요합니다." });
  }
  next();
}

const imageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["image/avif", ".avif"]
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDir),
    filename: (_req, file, callback) => {
      const extension = imageTypes.get(file.mimetype);
      if (!extension) {
        return callback(new Error("지원하지 않는 이미지 형식입니다."));
      }
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!imageTypes.has(file.mimetype)) {
      return callback(new Error("JPG, PNG, GIF, WebP, AVIF 이미지 파일만 업로드할 수 있습니다."));
    }
    callback(null, true);
  }
});

app.post("/api/editor/login", (req, res) => {
  const now = Date.now();
  const address = req.ip || req.socket.remoteAddress || "unknown";
  const current = loginAttempts.get(address);
  if (current && now - current.startedAt < loginWindowMs && current.count >= loginMaxAttempts) {
    return res.status(429).json({ error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." });
  }

  const providedKey = typeof req.body?.key === "string" ? req.body.key : "";
  if (!safeEqual(providedKey, editorKey.toString())) {
    const attempts = current && now - current.startedAt < loginWindowMs
      ? current
      : { startedAt: now, count: 0 };
    attempts.count += 1;
    loginAttempts.set(address, attempts);
    return res.status(401).json({ error: "편집 키가 올바르지 않습니다." });
  }

  loginAttempts.delete(address);
  res.cookie("aon_editor", editorCookieValue(), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: sessionDurationMs,
    path: "/"
  });
  res.json({ ok: true });
});

app.post("/api/editor/logout", (_req, res) => {
  res.clearCookie("aon_editor", { httpOnly: true, secure: isProduction, sameSite: "strict", path: "/" });
  res.json({ ok: true });
});

app.get("/api/editor/session", (req, res) => {
  res.json({ authenticated: isEditor(req) });
});

app.get("/api/site", (_req, res) => {
  const css = db.prepare("SELECT value FROM settings WHERE key = ?").get("site_css").value;
  const document = JSON.parse(
    db.prepare("SELECT value FROM settings WHERE key = ?").get("site_document").value
  );
  const images = db.prepare(
    "SELECT id, original_name AS originalName, '/uploads/' || filename AS url FROM images ORDER BY created_at DESC"
  ).all();
  res.json({ document, css, images });
});

app.put("/api/editor/document", requireEditor, (req, res) => {
  const document = req.body?.document;
  if (
    !document
    || typeof document.title !== "string"
    || document.title.trim().length < 1
    || document.title.length > 120
    || typeof document.summary !== "string"
    || document.summary.length > 500
    || typeof document.body !== "string"
    || document.body.trim().length < 1
    || document.body.length > 50000
    || !Array.isArray(document.imageRefs)
    || document.imageRefs.length > 100
    || document.imageRefs.some((id) => typeof id !== "string")
    || (document.body.match(/^\s*\{이미지\}\s*$/gm) || []).length !== document.imageRefs.length
  ) {
    return res.status(400).json({ error: "문서 내용을 확인해 주세요. {이미지} 개수와 삽입할 이미지 개수가 같아야 합니다." });
  }

  const uniqueImageRefs = [...new Set(document.imageRefs)];
  const availableImages = db.prepare(
    `SELECT id FROM images WHERE id IN (${uniqueImageRefs.map(() => "?").join(",") || "NULL"})`
  ).all(...uniqueImageRefs).map((image) => image.id);
  if (availableImages.length !== uniqueImageRefs.length) {
    return res.status(400).json({ error: "문서에 연결한 이미지 중 업로드되지 않은 이미지가 있습니다." });
  }

  const normalizedDocument = {
    title: document.title.trim(),
    summary: document.summary.trim(),
    body: document.body.trim(),
    imageRefs: document.imageRefs
  };
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(
    JSON.stringify(normalizedDocument),
    "site_document"
  );
  res.json({ ok: true });
});

app.put("/api/editor/css", requireEditor, (req, res) => {
  const css = req.body?.css;
  if (typeof css !== "string" || css.length > 50000) {
    return res.status(400).json({ error: "CSS는 50,000자 이하의 텍스트여야 합니다." });
  }
  db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(css, "site_css");
  res.json({ ok: true });
});

app.post("/api/editor/images", requireEditor, upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "이미지 파일을 선택해 주세요." });
  }
  const id = crypto.randomUUID();
  const originalName = path.basename(req.file.originalname).slice(0, 255);
  db.prepare(
    "INSERT INTO images (id, filename, original_name, mime_type) VALUES (?, ?, ?, ?)"
  ).run(id, req.file.filename, originalName, req.file.mimetype);
  res.status(201).json({
    id,
    originalName,
    url: `/uploads/${req.file.filename}`
  });
});

app.post("/api/editor/publish", requireEditor, async (_req, res) => {
  const owner = process.env.GITHUB_OWNER;
  const repository = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repository || !token) {
    return res.status(503).json({
      error: "GitHub 게시 설정이 없습니다. .env에 GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN을 설정해 주세요."
    });
  }
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repository) || !/^[\w./-]+$/.test(branch)) {
    return res.status(500).json({ error: "GitHub 저장소 또는 브랜치 설정이 올바르지 않습니다." });
  }

  try {
    const images = db.prepare(
      "SELECT filename FROM images ORDER BY created_at DESC"
    ).all();
    const siteData = {
      document: JSON.parse(
        db.prepare("SELECT value FROM settings WHERE key = ?").get("site_document").value
      ),
      css: db.prepare("SELECT value FROM settings WHERE key = ?").get("site_css").value,
      images: db.prepare(
        "SELECT id, original_name AS originalName, '/uploads/' || filename AS url FROM images ORDER BY created_at DESC"
      ).all()
    };
    const indexPath = path.join(publicDir, "index.html");
    const indexTemplate = fs.readFileSync(indexPath, "utf8");
    const marker = /(<script id="site-data" type="application\/json">)[\s\S]*?(<\/script>)/;
    if (!marker.test(indexTemplate)) {
      throw new Error("public/index.html에 사이트 데이터 삽입 위치가 없습니다.");
    }
    const embeddedData = JSON.stringify(siteData)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    const files = [
      {
        path: "public/index.html",
        content: Buffer.from(indexTemplate.replace(
          marker,
          (_match, prefix, suffix) => `${prefix}${embeddedData}${suffix}`
        ))
      }
    ];
    let totalImageBytes = 0;
    for (const image of images) {
      if (path.basename(image.filename) !== image.filename) {
        throw new Error("데이터베이스의 이미지 파일 경로가 올바르지 않습니다.");
      }
      const filePath = path.join(uploadsDir, image.filename);
      const content = fs.readFileSync(filePath);
      totalImageBytes += content.length;
      files.push({ path: `public/uploads/${image.filename}`, content });
    }
    if (files.length > 101 || totalImageBytes > 50 * 1024 * 1024) {
      return res.status(413).json({
        error: "한 번에 게시할 수 있는 이미지는 최대 100개, 전체 용량은 50MB입니다."
      });
    }

    const apiBase = `https://api.github.com/repos/${owner}/${repository}`;
    const githubRequest = async (endpoint, options = {}) => {
      const response = await fetch(`${apiBase}${endpoint}`, {
        ...options,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          ...options.headers
        }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`GitHub API 요청 실패 (${response.status}): ${result.message || "게시할 수 없습니다."}`);
      }
      return result;
    };

    const ref = await githubRequest(`/git/ref/heads/${encodeURIComponent(branch)}`);
    const parentSha = ref.object.sha;
    const parentCommit = await githubRequest(`/git/commits/${parentSha}`);
    const blobs = await Promise.all(files.map(async (file) => {
      const blob = await githubRequest("/git/blobs", {
        method: "POST",
        body: JSON.stringify({
          content: file.content.toString("base64"),
          encoding: "base64"
        })
      });
      return {
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha
      };
    }));
    const tree = await githubRequest("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: blobs })
    });
    const commit = await githubRequest("/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: "Publish Aon site content",
        tree: tree.sha,
        parents: [parentSha]
      })
    });
    await githubRequest(`/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false })
    });
    res.json({
      ok: true,
      commit: commit.sha,
      url: `https://github.com/${owner}/${repository}/commit/${commit.sha}`
    });
  } catch (error) {
    console.error("GitHub publish failed:", error);
    res.status(502).json({
      error: error instanceof Error ? error.message : "GitHub에 게시하지 못했습니다."
    });
  }
});

app.get("/admin.html", (_req, res) => {
  res.sendFile(path.join(editorDir, "index.html"));
});

app.use(express.static(publicDir, {
  etag: true,
  maxAge: isProduction ? "1h" : 0,
  setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff")
}));

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE"
      ? "이미지는 8MB 이하만 업로드할 수 있습니다."
      : "이미지 업로드 요청을 확인해 주세요.";
    return res.status(400).json({ error: message });
  }
  if (err?.message === "지원하지 않는 이미지 형식입니다.") {
    return res.status(400).json({ error: "JPG, PNG, GIF, WebP, AVIF 이미지 파일만 업로드할 수 있습니다." });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "요청 본문이 올바른 JSON 형식이 아닙니다." });
  }
  if (err) {
    console.error("Request failed:", err);
    return res.status(500).json({ error: "서버에서 요청을 처리하지 못했습니다." });
  }
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Aon is listening on http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
