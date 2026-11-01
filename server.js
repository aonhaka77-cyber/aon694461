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
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("site_css", defaultCss);

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
  const images = db.prepare(
    "SELECT id, original_name AS originalName, '/uploads/' || filename AS url FROM images ORDER BY created_at DESC"
  ).all();
  res.json({ css, images });
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

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Aon is listening on 0.0.0.0:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
