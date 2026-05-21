# Bookbookbook Design

## Goal

Build Bookbookbook as a local PDF tool that converts a reader-spread PDF exported from InDesign into a saddle-stitch printer-spread PDF.

The first supported input shape is:

- page 1: front cover as a single page
- middle pages: two-page reader spreads
- last page: back cover as a single page

## Product Scope

The first version is a local browser app. It runs on the user's Mac, accepts a PDF upload, and writes the converted PDF into this project folder. No remote server or cloud upload is required.

The core transformation is:

1. Detect single-page covers and two-page spreads from page sizes.
2. Split each reader spread into left and right logical pages.
3. Insert blank pages before the back cover until the logical page count is divisible by four.
4. Create saddle-stitch printer spreads.
5. Save the imposed PDF.

## Saddle-Stitch Rules

Saddle-stitch booklets must have a final page count divisible by four because each folded sheet creates four book pages. For left-bound books, a 16-page booklet starts with printer spreads:

```text
front sheet outside: 16 | 1
front sheet inside:   2 | 15
```

The same pattern continues inward.

## MVP UI

The app starts on the actual tool screen:

- PDF drop zone and file picker
- Binding selector
- Convert button
- Result download link
- Basic conversion summary

## Non-Goals

- No InDesign automation in the first version.
- No cloud upload.
- No creep compensation in the first version.
- No printer marks in the first version.
