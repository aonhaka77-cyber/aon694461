const loginPanel = document.querySelector("#login-panel");
const editor = document.querySelector("#editor");
const statusMessage = document.querySelector("#status");
const cssEditor = document.querySelector("#css-editor");
const imageList = document.querySelector("#image-list");
const staticHostMessage = document.querySelector("#static-host-message");

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
