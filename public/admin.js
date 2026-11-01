const loginPanel = document.querySelector("#login-panel");
const editor = document.querySelector("#editor");
const statusMessage = document.querySelector("#status");
const cssEditor = document.querySelector("#css-editor");
const imageList = document.querySelector("#image-list");
const staticHostMessage = document.querySelector("#static-host-message");
const documentTitle = document.querySelector("#document-title");
const documentSummary = document.querySelector("#document-summary");
const documentOverview = document.querySelector("#document-overview");
const documentFeatures = document.querySelector("#document-features");
const documentGalleryIntro = document.querySelector("#document-gallery-intro");
const publishButton = document.querySelector("#publish-button");

const isGitHubPages = location.hostname === "aon69446.p-e.kr"
  || location.hostname.endsWith(".github.io");

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "요청을 처리하지 못했습니다.");
  }
  return result;
}

function renderImages(images) {
  imageList.replaceChildren(...images.map((image) => {
    const item = document.createElement("div");
    item.className = "image-item";
    const preview = document.createElement("img");
    preview.src = image.url;
    preview.alt = image.originalName;
    const name = document.createElement("span");
    name.textContent = image.originalName;
    item.append(preview, name);
    return item;
  }));
}

async function loadEditor() {
  const session = await request("/api/editor/session");
  loginPanel.hidden = session.authenticated;
  editor.hidden = !session.authenticated;
  if (!session.authenticated) {
    return;
  }

  const site = await request("/api/site");
  documentTitle.value = site.document.title;
  documentSummary.value = site.document.summary;
  documentOverview.value = site.document.overview;
  documentFeatures.value = site.document.features.join("\n");
  documentGalleryIntro.value = site.document.galleryIntro;
  cssEditor.value = site.css;
  renderImages(site.images);
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setStatus("");
  try {
    const key = new FormData(form).get("key");
    await request("/api/editor/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });
    form.reset();
    await loadEditor();
    setStatus("로그인되었습니다.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.querySelector("#document-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");
  try {
    await request("/api/editor/document", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document: {
          title: documentTitle.value,
          summary: documentSummary.value,
          overview: documentOverview.value,
          features: documentFeatures.value.split(/\r?\n/),
          galleryIntro: documentGalleryIntro.value
        }
      })
    });
    setStatus("문서를 SQLite 데이터베이스에 저장했습니다.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.querySelector("#css-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");
  try {
    await request("/api/editor/css", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ css: cssEditor.value })
    });
    setStatus("CSS를 저장했습니다.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

publishButton.addEventListener("click", async () => {
  setStatus("");
  publishButton.disabled = true;
  try {
    const result = await request("/api/editor/publish", { method: "POST" });
    setStatus(`GitHub에 게시했습니다. Pages 배포가 완료될 때까지 잠시 기다려 주세요. ${result.url}`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    publishButton.disabled = false;
  }
});

document.querySelector("#upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setStatus("");
  try {
    const formData = new FormData(form);
    await request("/api/editor/images", { method: "POST", body: formData });
    form.reset();
    const site = await request("/api/site");
    renderImages(site.images);
    setStatus("이미지를 업로드했습니다.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await request("/api/editor/logout", { method: "POST" });
    await loadEditor();
    setStatus("로그아웃되었습니다.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.querySelector("#year").textContent = new Date().getFullYear();
if (isGitHubPages) {
  loginPanel.hidden = true;
  editor.hidden = true;
  staticHostMessage.hidden = false;
} else {
  staticHostMessage.hidden = true;
  loadEditor().catch((error) => {
    setStatus(error.message, true);
  });
}
