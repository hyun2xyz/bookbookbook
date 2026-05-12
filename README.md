# Project Book

Local booklet maker for InDesign reader-spread PDFs.

## Run

```bash
./run_app.sh
```

Then open:

```text
http://127.0.0.1:8765
```

The app keeps files local. Uploaded PDFs are written under `work/uploads/`, and converted PDFs are written under `output/`.

## Supported Input

The first version expects this PDF shape:

- first PDF page is a single front cover
- middle PDF pages are two-page reader spreads
- last PDF page is a single back cover

The app splits reader spreads into logical pages, inserts blank pages before the back cover until the count is divisible by four, and writes a saddle-stitch printer-spread PDF.

## Test

```bash
PYTHONPATH=src /opt/miniconda3/bin/python3 -m unittest discover -s tests -v
```

