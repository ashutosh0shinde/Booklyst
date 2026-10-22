"use strict";

const PAGE_SIZE = 40;
const state = {
  offset: 0,
  total: 0,
  searchTimer: null,
  sort: "",
  direction: "asc",
  requestId: 0,
  columns: [],
};

const getElement = (id) => document.getElementById(id);

const HTML_ESCAPE = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPE[character]);
}

function safeCoverUrl(value) {
  try {
    const url = new URL(value, location.origin);
    if (url.protocol === "https:" && url.hostname === "covers.openlibrary.org") {
      return url.href;
    }
  } catch {
    // Ignore invalid cover URLs and show a placeholder instead.
  }
  return "";
}

async function initialize() {
  const response = await fetch("/api/meta");
  if (!response.ok) {
    throw new Error("Could not load catalog summary.");
  }

  const metadata = await response.json();
  state.columns = metadata.columns || [];
  getElement("book-count").textContent = Number(metadata.total).toLocaleString();

  const genreCount = metadata.genres.length;
  getElement("genre-count").textContent =
    genreCount.toLocaleString() + (genreCount === 1 ? " genre" : " genres");
  getElement("genre-list").textContent = metadata.genres.join(" · ");

  const yearRange =
    metadata.year_min && metadata.year_max
      ? metadata.year_min + "–" + metadata.year_max
      : "Not available";
  getElement("year-range").textContent = yearRange;

  for (const genre of metadata.genres) {
    getElement("genre").add(new Option(genre, genre));
  }
  for (const language of metadata.languages) {
    getElement("language").add(new Option(language, language));
  }

  renderSortHeaders();
  await loadBooks();
}

function makeQueryParams() {
  return new URLSearchParams({
    q: getElement("search").value.trim(),
    genre: getElement("genre").value,
    language: getElement("language").value,
    year_from: getElement("year-from").value,
    year_to: getElement("year-to").value,
    sort: state.sort,
    direction: state.direction,
    offset: String(state.offset),
    limit: String(PAGE_SIZE),
  });
}

async function loadBooks() {
  const requestId = ++state.requestId;
  getElement("result-count").textContent = "Loading catalog.";

  try {
    const response = await fetch("/api/books?" + makeQueryParams());
    if (!response.ok) {
      throw new Error("Catalog request failed.");
    }

    const result = await response.json();
    if (requestId !== state.requestId) {
      return;
    }

    state.total = result.total;
    renderRows(result.items);

    const total = Number(result.total);
    getElement("result-count").textContent =
      total.toLocaleString() + (total === 1 ? " book found" : " books found");

    const first = total === 0 ? 0 : result.offset + 1;
    const last = Math.min(result.offset + result.items.length, total);
    getElement("page-count").textContent =
      total === 0
        ? "No results"
        : "Showing " +
          first.toLocaleString() +
          "–" +
          last.toLocaleString() +
          " of " +
          total.toLocaleString();

    getElement("previous").disabled = result.offset === 0;
    getElement("next").disabled =
      result.offset + result.items.length >= total;
    getElement("empty").hidden = result.items.length > 0;
    document.querySelector("table").hidden = result.items.length === 0;
  } catch {
    if (requestId !== state.requestId) {
      return;
    }

    getElement("result-count").textContent =
      "Could not load catalog. Check that the local server is running.";
    getElement("page-count").textContent = "—";
    getElement("empty").hidden = false;
    document.querySelector("table").hidden = true;
  }
}

function renderSortHeaders() {
  const headerRow = getElement("column-headers");
  const headers = ['<th aria-label="Cover"></th>'];

  for (const column of state.columns) {
    const isActive = state.sort === column;
    const arrow = isActive ? (state.direction === "asc" ? " ↑" : " ↓") : "";
    const label = column === "cover_url" ? "Cover link" : column.replaceAll("_", " ");
    headers.push(
      '<th aria-sort="' +
        (isActive ? (state.direction === "asc" ? "ascending" : "descending") : "none") +
        '"><button class="sort-button" data-sort="' +
        escapeHtml(column) +
        '" type="button" aria-label="Sort by ' +
        escapeHtml(label) +
        '">' +
        escapeHtml(label) +
        arrow +
        "</button></th>"
    );
  }

  headerRow.innerHTML = headers.join("");
  headerRow.querySelectorAll(".sort-button").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.sort;
      if (state.sort === field) {
        state.direction = state.direction === "asc" ? "desc" : "asc";
      } else {
        state.sort = field;
        state.direction = "asc";
      }
      state.offset = 0;
      renderSortHeaders();
      loadBooks();
    });
  });
}

function coverMarkup(book) {
  const coverUrl = safeCoverUrl(book.cover_url);
  if (!coverUrl) {
    return '<span class="cover-placeholder" aria-hidden="true">—</span>';
  }

  return (
    '<img class="cover" src="' +
    escapeHtml(coverUrl) +
    '" alt="" loading="lazy">'
  );
}


async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) {
    throw new Error("Clipboard copy was rejected.");
  }
}

function renderRows(books) {
  const rows = books
    .map((book) => {
      const cells = ['<td>' + coverMarkup(book) + "</td>"];
      for (const column of state.columns) {
        const value = book[column] || "—";
        if (column === "cover_url" && value !== "—") {
          const url = safeCoverUrl(value);
          cells.push(
            '<td class="url-cell">' +
              (url
                ? '<button class="copy-cover-url" type="button" data-copy-url="' +
                  escapeHtml(url) +
                  '" aria-label="Copy cover URL">Copy</button>'
                : "—") +
              "</td>"
          );
        } else {
          const cellClasses = {
            book_id: "number-cell",
            isbn: "isbn-cell",
            title: "book-title",
            publication_year: "year-cell",
            author_name: "author-cell",
            publisher_name: "publisher-cell",
            description: "long-cell",
            genre: "genre-cell",
            keywords: "long-cell",
            page_count: "number-cell",
            language: "language-cell",
            avg_rating_10: "number-cell",
            popularity_count: "number-cell",
          };
          const className = cellClasses[column] || "";
          const displayValue =
            column === "popularity_count" && value !== "—"
              ? Number(value).toLocaleString()
              : value;
          cells.push(
            "<td" +
              (className ? ' class="' + className + '"' : "") +
              ">" +
              escapeHtml(displayValue) +
              "</td>"
          );
        }
      }
      return "<tr>" + cells.join("") + "</tr>";
    })
    .join("");

  const body = getElement("book-rows");
  body.innerHTML = rows;

  body.querySelectorAll("img.cover").forEach((image) => {
    image.addEventListener("error", () => {
      const placeholder = document.createElement("span");
      placeholder.className = "cover-placeholder";
      placeholder.textContent = "—";
      image.replaceWith(placeholder);
    });
  });

  body.querySelectorAll(".copy-cover-url").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const originalLabel = button.textContent;
      try {
        await copyText(button.dataset.copyUrl);
        button.textContent = "Copied";
        window.setTimeout(() => {
          button.textContent = originalLabel;
        }, 1200);
      } catch {
        button.textContent = "Copy failed";
        window.setTimeout(() => {
          button.textContent = originalLabel;
        }, 1500);
      }
    });
  });

  body.querySelectorAll("tr").forEach((row, index) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      showDetails(books[index]);
    });
  });
}

function showDetails(book) {
  const coverUrl = safeCoverUrl(book.cover_url);
  const cover = coverUrl
    ? '<img class="detail-cover" src="' +
      escapeHtml(coverUrl) +
      '" alt="Cover of ' +
      escapeHtml(book.title) +
      '">'
    : '<div class="detail-placeholder">No cover</div>';

  const metadata = [
    book.publication_year && "Published " + escapeHtml(book.publication_year),
    book.publisher_name && escapeHtml(book.publisher_name),
    book.page_count && escapeHtml(book.page_count) + " pages",
    book.language && escapeHtml(book.language),
  ]
    .filter(Boolean)
    .join(" · ");

  const subjects = (book.keywords || "")
    .split(",")
    .map((subject) => subject.trim())
    .filter(Boolean);

  const description = book.description
    ? '<div class="detail-label">Description</div><div class="detail-desc">' +
      escapeHtml(book.description) +
      "</div>"
    : "";

  const subjectList = subjects.length
    ? '<div class="detail-label">Subjects</div><div class="tags">' +
      subjects
        .map((subject) => "<span>" + escapeHtml(subject) + "</span>")
        .join("") +
      "</div>"
    : "";

  getElement("detail").innerHTML =
    "<div>" +
    cover +
    "</div>" +
    "<div>" +
    '<h2 id="detail-title">' +
    escapeHtml(book.title) +
    "</h2>" +
    "<div>" +
    escapeHtml(book.author_name || "Author not listed") +
    "</div>" +
    "<div>" +
    metadata +
    "</div>" +
    description +
    subjectList +
    '<div class="detail-label">ISBN</div><div class="detail-desc">' +
    escapeHtml(book.isbn || "Not listed") +
    "</div>" +
    "</div>";

  getElement("overlay").classList.add("open");
  getElement("close").focus();
}

function scheduleSearch() {
  clearTimeout(state.searchTimer);
  state.offset = 0;
  state.searchTimer = setTimeout(loadBooks, 180);
}


["search", "genre", "language", "year-from", "year-to"].forEach((id) => {
  const eventName = id === "search" ? "input" : "change";
  getElement(id).addEventListener(eventName, scheduleSearch);
});

getElement("reset").addEventListener("click", () => {
  ["search", "genre", "language", "year-from", "year-to"].forEach((id) => {
    getElement(id).value = "";
  });
  state.offset = 0;
  loadBooks();
});

getElement("previous").addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - PAGE_SIZE);
  loadBooks();
});

getElement("next").addEventListener("click", () => {
  if (state.offset + PAGE_SIZE < state.total) {
    state.offset += PAGE_SIZE;
    loadBooks();
  }
});

getElement("close").addEventListener("click", () => {
  getElement("overlay").classList.remove("open");
});

getElement("overlay").addEventListener("click", (event) => {
  if (event.target === getElement("overlay")) {
    getElement("overlay").classList.remove("open");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    getElement("overlay").classList.remove("open");
  }
});

initialize().catch(() => {
  getElement("result-count").textContent =
    "Could not load catalog. Check that the local server is running.";
  getElement("empty").hidden = false;
  document.querySelector("table").hidden = true;
});
