const isGitHubPages = location.hostname === "aon69446.p-e.kr"
  || location.hostname.endsWith(".github.io");

function renderDocument(siteDocument) {
  const title = document.querySelector("#document-title");
  const summary = document.querySelector("#document-summary");
  const overview = document.querySelector("#document-overview");
  const features = document.querySelector("#document-features");
  const galleryIntro = document.querySelector("#document-gallery-intro");

  title.textContent = siteDocument.title;
  summary.textContent = siteDocument.summary;
  overview.replaceChildren(...siteDocument.overview.split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const element = document.createElement("p");
      element.textContent = paragraph;
      return element;
    }));
  features.replaceChildren(...siteDocument.features.map((feature) => {
    const element = document.createElement("li");
    element.textContent = feature;
    return element;
  }));
  galleryIntro.textContent = siteDocument.galleryIntro;
  document.querySelector(".info-card h2").textContent = siteDocument.title;
  document.title = `${siteDocument.title} - Aon 위키`;
  document.querySelector('meta[name="description"]').content = siteDocument.summary;
}

async function loadSite() {
  const response = await fetch(isGitHubPages ? "/site-data.json" : "/api/site", {
    cache: "no-cache"
  });
  if (!response.ok) {
    throw new Error(`사이트 데이터를 불러오지 못했습니다. (${response.status})`);
  }

  const site = await response.json();
  renderDocument(site.document);
  const customStyle = document.createElement("style");
  customStyle.id = "custom-site-css";
  customStyle.textContent = site.css;
  document.head.append(customStyle);

  const gallery = document.querySelector("#gallery");
  if (site.images.length) {
    gallery.replaceChildren(...site.images.map((image) => {
      const img = document.createElement("img");
      img.src = image.url;
      img.alt = image.originalName;
      img.loading = "lazy";
      return img;
    }));
  }
}

document.querySelector("#year").textContent = new Date().getFullYear();
document.querySelector("#updated-date").textContent = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long"
}).format(new Date());
loadSite().catch((error) => {
  console.warn("Dynamic site content is unavailable on this static host.", error);
});
