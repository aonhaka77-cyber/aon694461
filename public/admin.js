const loginPanel = document.querySelector("#login-panel");
const editor = document.querySelector("#editor");
const statusMessage = document.querySelector("#status");
const cssEditor = document.querySelector("#css-editor");
const imageList = document.querySelector("#image-list");
const imageSelector = document.querySelector("#image-selector");
const staticHostMessage = document.querySelector("#static-host-message");
const documentTitle = document.querySelector("#document-title");
const documentSummary = document.querySelector("#document-summary");
const documentBody = document.querySelector("#document-body");
const imageRefs = [];
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
  const previousSelection = imageSelector.value;
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
  imageSelector.replaceChildren(...images.map((image) => {
    const option = document.createElement("option");
    option.value = image.id;
    option.textContent = image.originalName;
    return option;
  }));
  if (images.some((image) => image.id === previousSelection)) {
    imageSelector.value = previousSelection;
  }
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
  documentBody.value = site.document.body;
  imageRefs.splice(0, imageRefs.length, ...site.document.imageRefs);
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
          body: documentBody.value,
          imageRefs
        }
      })
    });
    setStatus("문서를 SQLite 데이터베이스에 저장했습니다.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.querySelector("#insert-image-button").addEventListener("click", () => {
  const imageId = imageSelector.value;
  if (!imageId) {
    setStatus("먼저 이미지를 업로드해 주세요.", true);
    return;
  }

  const start = documentBody.selectionStart;
  const end = documentBody.selectionEnd;
  const markerIndex = (documentBody.value.slice(0, start).match(/\{이미지\}/g) || []).length;
  const insertion = `${start > 0 && documentBody.value[start - 1] !== "\n" ? "\n" : ""}{이미지}${end < documentBody.value.length && documentBody.value[end] !== "\n" ? "\n" : ""}`;
  documentBody.setRangeText(insertion, start, end, "end");
  imageRefs.splice(markerIndex, 0, imageId);
  documentBody.focus();
  setStatus("커서 위치에 {이미지}를 넣고 선택한 이미지와 연결했습니다.");
});

documentBody.addEventListener("input", () => {
  const markerCount = (documentBody.value.match(/^\s*\{이미지\}\s*$/gm) || []).length;
  if (markerCount < imageRefs.length) {
    imageRefs.splice(markerCount);
  }
  if (markerCount !== imageRefs.length) {
    setStatus("본문의 {이미지} 표식마다 이미지 삽입 버튼으로 사진을 연결해 주세요.", true);
  } else {
    setStatus("");
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
