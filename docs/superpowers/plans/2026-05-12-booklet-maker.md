# Booklet Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local browser app that converts InDesign reader-spread PDFs into saddle-stitch printer-spread PDFs.

**Architecture:** Keep PDF behavior in a tested Python core, then expose it through a tiny local HTTP server and static browser UI. The PDF engine treats first and last single-width pages as covers, splits wide reader spreads into logical pages, pads blanks before the back cover, and imposes the result.

**Tech Stack:** Python 3, pypdf, unittest, standard-library http.server, static HTML/CSS/JavaScript.

---

### Task 1: Core Imposition Logic

**Files:**
- Create: `src/booklet_maker/imposition.py`
- Test: `tests/test_imposition.py`

- [ ] Write tests for page splitting, blank insertion before the back cover, and left-bound saddle-stitch pair order.
- [ ] Implement `SourceSlot`, `build_reader_slots`, `pad_slots_for_saddle_stitch`, and `build_printer_pairs`.
- [ ] Run `PYTHONPATH=src /opt/miniconda3/bin/python3 -m unittest tests/test_imposition.py`.

### Task 2: PDF Rendering Engine

**Files:**
- Create: `src/booklet_maker/pdf_engine.py`
- Test: `tests/test_pdf_engine.py`

- [ ] Write tests that create a synthetic spread PDF and assert imposed page count and output sheet size.
- [ ] Implement `convert_pdf` using pypdf page splitting and merge transforms.
- [ ] Run `PYTHONPATH=src /opt/miniconda3/bin/python3 -m unittest tests/test_pdf_engine.py`.

### Task 3: Local Browser App

**Files:**
- Create: `src/booklet_maker/server.py`
- Create: `static/index.html`
- Create: `static/styles.css`
- Create: `static/app.js`
- Create: `run_app.sh`

- [ ] Add a standard-library HTTP server with multipart upload handling.
- [ ] Add a focused drag-and-drop UI.
- [ ] Add a run script that chooses `/opt/miniconda3/bin/python3` when available.

### Task 4: Documentation and Verification

**Files:**
- Create: `README.md`

- [ ] Document how to run the local app.
- [ ] Verify with unit tests.
- [ ] Convert `/Users/han/Documents/무제 폴더 4/아레나가뭐예요.pdf` and verify the output with `pdfinfo`.

