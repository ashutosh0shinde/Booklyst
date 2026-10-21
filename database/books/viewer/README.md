# Booklyst viewer

The viewer files and read-only Python server are in this folder. The catalog
CSV stays one level above, beside this folder.

## Run

Double-click `run_viewer.bat`, keep its terminal open, and open
<http://127.0.0.1:8000/>. To stop the server, press **Ctrl+C** in the terminal.

Or open PowerShell in this folder and run:

    py server.py

Use `python server.py` if the `py` launcher is unavailable. The server uses only
Python's standard library.

The first page follows the row order in `books_catalog.csv`. Click a column
heading to sort; search and filters preserve that order until a sort is chosen.
