# Booklyst viewer

The viewer files and read-only Python server are in this folder. The catalog
CSV stays one level above, beside this folder.

## Run

open PowerShell in this folder and run:

    py server.py

The first page follows the row order in `books_catalog.csv`. Click a column
heading to sort; search and filters preserve that order until a sort is chosen.
