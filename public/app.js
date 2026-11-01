async function loadSite() {
  const response = await fetch("/api/site");
  if (!response.ok) {
    return;
  }

  const site = await response.json();
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
