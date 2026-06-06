# Output Sheet Packing Design

Date: 2026-06-06
Project: Bookbookbook

## Goal

Bookbookbook should not stop at making a saddle-stitch booklet PDF. It should also prepare an efficient print-sheet PDF for the paper the user will actually print on.

The app will ask where the booklet will be printed, then place as many finished booklet printer-spreads as possible on each output sheet. This reduces wasted paper while keeping the saddle-stitch duplex order correct.

## User Flow

1. The user selects a PDF.
2. Bookbookbook detects whether the PDF is single-page, spread, or mixed.
3. The user chooses binding direction and output paper size.
4. Bookbookbook converts the PDF into saddle-stitch printer-spread order.
5. Bookbookbook computes how many finished spreads fit on the selected output paper.
6. Bookbookbook exports a print-ready PDF with trim marks on every placed spread.

## Output Paper Rules

The output paper selection replaces the current optional trim-mark idea. Trim marks are always included when an output paper is selected for print-sheet packing.

Supported paper choices should include common print sizes already present in the app:

- A4
- A3
- B5
- B4
- SRA4
- SRA3
- Letter
- Tabloid
- Custom millimeter size

If the selected paper cannot fit even one finished booklet spread plus trim-mark margin, conversion should stop with this warning:

`출력 용지가 작습니다. 판형을 키워주세요.`

## Packing Rules

The packing unit is one finished saddle-stitch printer spread, including its trim-mark safety margin.

Bookbookbook should choose the most efficient layout automatically:

- Try output paper portrait and landscape orientations.
- Try spread normal and rotated orientations if rotation preserves printable meaning.
- Compute how many spread boxes fit across columns and rows.
- Pick the layout with the highest count.
- If two layouts fit the same count, pick the one with less unused paper area.
- Center the full packed grid on the output sheet.

The app should support 1, 2, 3, or more spreads per output sheet whenever they fit. It must not stop at only one or two spreads.

The packed grid must always be centered on the selected output paper, both horizontally and vertically. This is required because duplex printers often have front/back registration drift. If there is leftover paper area, Bookbookbook should split that leftover area evenly on both sides instead of pushing the grid toward one edge.

## Duplex Ordering

The packed output must keep duplex pairs aligned by slot.

For a sheet that fits `n` spreads:

- Front output sheet uses printer-spread pages: `1, 3, 5, ...`
- Back output sheet uses printer-spread pages: `2, 4, 6, ...`
- Page `1` and page `2` occupy the same physical slot.
- Page `3` and page `4` occupy the same physical slot.
- Page `5` and page `6` occupy the same physical slot.
- Front and back output sheets use the exact same centered slot coordinates.

Example for two spreads per output sheet:

- Front: `1 / 3`
- Back: `2 / 4`

Example for three spreads per output sheet:

- Front: `1 / 3 / 5`
- Back: `2 / 4 / 6`

This is the corrected A3 duplex behavior tested manually with local PDFs.

## Trim Marks

Trim marks are always drawn around every placed spread in output-sheet packing mode.

The actual booklet spread size must remain unchanged. Bookbookbook should place the real-size spread onto the chosen output paper and add trim marks around the intended cut boundary. It should not scale the booklet content just to make it fit.

The existing trim mark style can be reused, but it should apply per placed spread instead of only once around the whole page.

## UI

The control currently labeled for trim marks should become an output paper control near the binding options.

Suggested text:

- Label: `출력 용지`
- Empty state: `출력 용지를 선택하면 재단선 포함 인쇄용 PDF로 배치됩니다.`
- Fit result examples:
  - `A3에 2개씩 배치됩니다.`
  - `SRA3에 4개씩 배치됩니다.`
  - `출력 용지가 작습니다. 판형을 키워주세요.`

The visual mood should stay consistent with the current Bookbookbook desktop/web design: small, quiet controls aligned with the existing binding controls.

## Engine Shape

The implementation should separate two concepts:

- Saddle-stitch imposition: logical reader pages become printer-spread pages.
- Output sheet packing: printer-spread pages are placed on larger physical print sheets.

This keeps the existing booklet conversion understandable and avoids mixing book order logic with paper efficiency logic.

## Testing

Unit tests should cover:

- One spread fits on selected output paper.
- Two spreads fit, producing `1 / 3` front and `2 / 4` back slot pairing.
- Three spreads fit, producing `1 / 3 / 5` front and `2 / 4 / 6` back slot pairing.
- Output paper too small throws the Korean warning.
- Existing plain booklet conversion still works when no output paper is selected.
- Trim boxes or drawn trim marks are generated per placed spread in output-sheet packing mode.

Smoke tests should still verify upload, analysis, conversion, and generated PDF download.

## Scope

In scope:

- Browser app PDF engine.
- Desktop app indirectly through the shared `pages/` build.
- Existing paper presets and custom millimeter input.
- Always-on trim marks for output sheet packing.

Out of scope:

- Printer driver automation.
- Acrobat print dialog control.
- True bleed generation or content extension beyond source PDF edges.
- Changing user PDF contents.
