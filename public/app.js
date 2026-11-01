const isGitHubPages = location.hostname === "aon69446.p-e.kr"
  || location.hostname.endsWith(".github.io");

function createInlineContent(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /\{\{[^}]+\}\}|\[\[[^\]]+\]\]|'''[\s\S]+?'''|''[\s\S]+?''|~~[\s\S]+?~~|__[\s\S]+?__/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    fragment.append(document.createTextNode(text.slice(cursor, match.index)));
    const token = match[0];
    let element;
    if (token.startsWith("[[")) {
      const [label, target = ""] = token.slice(2, -2).split("|", 2);
      element = document.createElement("a");
      element.textContent = label;
      if (/^(https?:|mailto:|#|\/)/i.test(target)) {
        element.href = target || "#";
      } else {
        element.href = "#";
      }
    } else if (token.startsWith("'''")) {
      element = document.createElement("strong");
      element.textContent = token.slice(3, -3);
    } else if (token.startsWith("''")) {
      element = document.createElement("em");
      element.textContent = token.slice(2, -2);
    } else if (token.startsWith("~~")) {
      element = document.createElement("del");
      element.textContent = token.slice(2, -2);
    } else if (token.startsWith("__")) {
      element = document.createElement("u");
      element.textContent = token.slice(2, -2);
    } else {
      element = document.createElement("code");
      element.textContent = token.slice(2, -2);
    }
    fragment.append(element);
    cursor = match.index + token.length;
  }
  fragment.append(document.createTextNode(text.slice(cursor)));
  return fragment;
}

function renderWikiBody(site, imageById) {
  const body = document.querySelector("#wiki-content");
  const toc = document.querySelector("#toc-links");
  const headings = [];
  const lines = site.document.body.split(/\r?\n/);
  body.replaceChildren();
  toc.replaceChildren();

  let section = null;
  let paragraph = [];
  let list = null;
  let imageIndex = 0;

  function flushParagraph() {
    if (!paragraph.length) return;
    const element = document.createElement("p");
    element.append(createInlineContent(paragraph.join(" ")));
    (section || body).append(element);
    paragraph = [];
  }

  function flushList() {
    if (list) {
      (section || body).append(list);
      list = null;
    }
  }

  function finishBlocks() {
    flushParagraph();
    flushList();
  }

  for (const line of lines) {
    const heading = line.match(/^(={2,5})\s*(.+?)\s*\1\s*$/);
    if (heading) {
      finishBlocks();
      const number = headings.length + 1;
      const id = `wiki-section-${number}`;
      const level = Math.min(heading[1].length, 4);
      section = document.createElement("section");
      section.className = "article-section";
      section.id = id;
      const headingElement = document.createElement(`h${level}`);
      const numberElement = document.createElement("span");
      numberElement.className = "section-number";
      numberElement.textContent = `${number}.`;
      headingElement.append(numberElement, document.createTextNode(` ${heading[2]}`));
      section.append(headingElement);
      body.append(section);
      headings.push({ id, number, title: heading[2], level });
      continue;
    }

    if (!line.trim()) {
      finishBlocks();
      continue;
    }

    const imageMarker = line.match(/^\s*\{이미지\}\s*$/);
    if (imageMarker) {
      finishBlocks();
      const imageId = site.document.imageRefs[imageIndex++];
      const image = imageById.get(imageId);
      if (image) {
        const figure = document.createElement("figure");
        figure.className = "wiki-image";
        const element = document.createElement("img");
        element.src = image.url;
        element.alt = image.originalName;
        element.loading = "lazy";
        const caption = document.createElement("figcaption");
        caption.textContent = image.originalName;
        figure.append(element, caption);
        (section || body).append(figure);
      }
      continue;
    }

    const listItem = line.match(/^\s*([*#])\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      const desiredTag = listItem[1] === "*" ? "ul" : "ol";
      if (list && list.tagName.toLowerCase() !== desiredTag) {
        flushList();
      }
      if (!list) {
        list = document.createElement(desiredTag);
      }
      const item = document.createElement("li");
      item.append(createInlineContent(listItem[2]));
      list.append(item);
      continue;
    }

    if (/^\s*----+\s*$/.test(line)) {
      finishBlocks();
      (section || body).append(document.createElement("hr"));
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }
  finishBlocks();

  for (const heading of headings) {
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.style.paddingLeft = `${Math.max(0, heading.level - 2) * 12}px`;
    const number = document.createElement("span");
    number.textContent = `${heading.number}.`;
    link.append(number, document.createTextNode(heading.title));
    toc.append(link);
  }
}

function renderSite(site) {
  const { document: siteDocument } = site;
  document.querySelector("#document-title").textContent = siteDocument.title;
  document.querySelector("#document-summary").textContent = siteDocument.summary;
  document.querySelector(".info-card h2").textContent = siteDocument.title;
  document.title = `${siteDocument.title} - Aon 위키`;
  document.querySelector('meta[name="description"]').content = siteDocument.summary;
  document.querySelector("#updated-date").textContent = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long"
  }).format(new Date());

  const customStyle = document.createElement("style");
  customStyle.id = "custom-site-css";
  customStyle.textContent = site.css;
  document.querySelector("#custom-site-css")?.remove();
  document.head.append(customStyle);

  const imageById = new Map(site.images.map((image) => [image.id, image]));
  renderWikiBody(site, imageById);
}

async function loadSite() {
  if (isGitHubPages) {
    return JSON.parse(document.querySelector("#site-data").textContent);
  }
  const response = await fetch("/api/site", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`사이트 데이터를 불러오지 못했습니다. (${response.status})`);
  }
  return response.json();
}

document.querySelector("#year").textContent = new Date().getFullYear();
loadSite().then(renderSite).catch((error) => {
  console.error("사이트 데이터를 불러오지 못했습니다.", error);
});
