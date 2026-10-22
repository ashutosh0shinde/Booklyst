# Booklyst viewer and catalog fields

The viewer reads `books_catalog.csv` from the parent folder. Its table builds columns from the CSV header, and clicking any header sorts by that field. Average rating and popularity sort numerically.

## Rating fields

- `avg_rating_10` is the average reader rating on a 0–10 scale. Book-Crossing explicit ratings are already on a 1–10 scale; its zero-valued implicit interactions are excluded. Open Library's 1–5 star average is multiplied by two.
- `popularity_count` is the number of explicit ratings reported by that row's source. It is a rating count, not sales or page views. Counts come from different communities and periods, so compare them within their source context. Blank rating cells mean the source did not provide a rating for that book.

The added general catalog records use Book-Crossing metadata and ratings. The computer-science records were selected from English Open Library editions whose catalog subjects match CS topics. Edition-specific ISBNs are checked and normalized title-author pairs are deduplicated against the existing catalog and among additions. Fields absent from the source are left blank instead of being estimated.

## Data sources

- [Book-Crossing dataset overview](https://mooc.grouplens.org/datasets/book-crossing/)
- [Open Library Search API](https://openlibrary.org/dev/docs/api/search)
- [Open Library star-rating scale](https://openlibrary.org/help/faq/reviews)
- [Open Library cover lookup](https://openlibrary.org/dev/docs/api/covers)

## Run

Open PowerShell in this folder and run:

    py server.py

The viewer is read-only. The CSV stays one level above this folder.
