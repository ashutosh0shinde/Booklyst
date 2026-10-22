"""Serve the read-only Booklyst catalog and its JSON endpoints."""

from __future__ import annotations

import csv
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


VIEWER_PATH = Path(__file__).resolve().parent
CSV_PATH = VIEWER_PATH.parent / "books_catalog.csv"
HOST = "127.0.0.1"
PORT = int(os.environ.get("BOOKS_PORT", "8000"))

STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/viewer.js": ("viewer.js", "text/javascript; charset=utf-8"),
}


def load_books(path: Path) -> list[dict[str, str]]:
    """Load the catalog into memory for read-only filtering and sorting."""
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        return [dict(row) for row in csv.DictReader(stream)]


def to_int(value: str | None) -> int | None:
    """Convert a CSV value to an integer, returning None for blank or invalid data."""
    try:
        return int(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def build_metadata(books: list[dict[str, str]]) -> dict[str, object]:
    years = [to_int(book.get("publication_year", "")) for book in books]
    valid_years = [year for year in years if year is not None]
    genres = sorted(
        {
            book.get("genre", "").strip()
            for book in books
            if book.get("genre", "").strip()
        },
        key=str.casefold,
    )
    languages = sorted(
        {
            book.get("language", "").strip()
            for book in books
            if book.get("language", "").strip()
        },
        key=str.casefold,
    )
    return {
        "columns": list(books[0].keys()) if books else [],
        "total": len(books),
        "genres": genres,
        "languages": languages,
        "year_min": min(valid_years) if valid_years else None,
        "year_max": max(valid_years) if valid_years else None,
    }


def sort_value(book: dict[str, str], field: str) -> str | int | None:
    value = book.get(field, "")
    if not value:
        return None
    if field in {"book_id", "publication_year", "page_count"}:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
    return value.casefold()


if not CSV_PATH.is_file():
    raise SystemExit(
        f"Catalog not found: {CSV_PATH}\n"
        "Keep books_catalog.csv beside the viewer folder."
    )

BOOKS = load_books(CSV_PATH)
METADATA = build_metadata(BOOKS)


class CatalogHandler(BaseHTTPRequestHandler):
    """Handle catalog reads; all write methods are disabled."""

    server_version = "BooklystCatalog/1.0"

    def send_content(
        self,
        body: bytes,
        content_type: str,
        *,
        head_only: bool = False,
    ) -> None:
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def send_json(self, value: object, *, head_only: bool = False) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_content(
            body,
            "application/json; charset=utf-8",
            head_only=head_only,
        )

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        parsed = urlparse(self.path)

        if parsed.path in STATIC_FILES:
            filename, content_type = STATIC_FILES[parsed.path]
            body = (VIEWER_PATH / filename).read_bytes()
            self.send_content(body, content_type)
            return

        if parsed.path == "/api/meta":
            self.send_json(METADATA)
            return

        if parsed.path == "/api/health":
            self.send_json({"ok": True, "count": len(BOOKS)})
            return

        if parsed.path == "/api/books":
            self.send_json(self.find_books(parse_qs(parsed.query)))
            return

        self.send_error(404, "Not found")

    def do_HEAD(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        parsed = urlparse(self.path)

        if parsed.path in STATIC_FILES:
            filename, content_type = STATIC_FILES[parsed.path]
            body = (VIEWER_PATH / filename).read_bytes()
            self.send_content(body, content_type, head_only=True)
            return

        if parsed.path == "/api/meta":
            self.send_json(METADATA, head_only=True)
            return

        if parsed.path == "/api/health":
            self.send_json({"ok": True, "count": len(BOOKS)}, head_only=True)
            return

        if parsed.path == "/api/books":
            self.send_json(
                self.find_books(parse_qs(parsed.query)),
                head_only=True,
            )
            return

        self.send_error(404, "Not found")

    def find_books(self, params: dict[str, list[str]]) -> dict[str, object]:
        def one(name: str, default: str = "") -> str:
            return params.get(name, [default])[0].strip()

        query = one("q").casefold()
        genre = one("genre").casefold()
        language = one("language").casefold()
        year_from = to_int(one("year_from"))
        year_to = to_int(one("year_to"))

        requested_sort = one("sort")
        sort_field = requested_sort if BOOKS and requested_sort in BOOKS[0] else None
        descending = one("direction", "asc").lower() == "desc"
        limit = min(max(to_int(one("limit", "40")) or 40, 1), 100)
        offset = max(to_int(one("offset", "0")) or 0, 0)

        results = []
        searchable_fields = (
            "title",
            "author_name",
            "isbn",
            "publisher_name",
            "description",
            "genre",
            "keywords",
        )

        for book in BOOKS:
            if genre and book.get("genre", "").casefold() != genre:
                continue
            if language and book.get("language", "").casefold() != language:
                continue

            year = to_int(book.get("publication_year", ""))
            if year_from is not None and (year is None or year < year_from):
                continue
            if year_to is not None and (year is None or year > year_to):
                continue

            if query:
                searchable_text = " ".join(
                    book.get(field, "") for field in searchable_fields
                ).casefold()
                if query not in searchable_text:
                    continue

            results.append(book)

        if sort_field:
            present = [
                book
                for book in results
                if sort_value(book, sort_field) is not None
            ]
            missing = [
                book
                for book in results
                if sort_value(book, sort_field) is None
            ]
            present.sort(
                key=lambda book: sort_value(book, sort_field),
                reverse=descending,
            )
            results = present + missing

        return {
            "total": len(results),
            "offset": offset,
            "limit": limit,
            "items": results[offset : offset + limit],
        }

    def do_POST(self) -> None:  # noqa: N802 - mutations are disabled
        self.send_error(405, "This catalog is read-only")

    do_PUT = do_POST
    do_PATCH = do_POST
    do_DELETE = do_POST

    def log_message(self, format_string: str, *args: object) -> None:
        message = format_string % args
        print(f"[{self.log_date_time_string()}] {message}")


if __name__ == "__main__":
    if not (VIEWER_PATH / "index.html").is_file():
        raise SystemExit(f"Viewer page not found: {VIEWER_PATH / 'index.html'}")

    print(f"Loaded {len(BOOKS):,} books from {CSV_PATH.name}")
    print(f"Read-only Booklyst viewer: http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop the server.")

    server = ThreadingHTTPServer((HOST, PORT), CatalogHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nViewer stopped.")
    finally:
        server.server_close()
