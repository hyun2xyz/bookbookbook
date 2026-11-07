import { fileURLToPath } from "node:url";

import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import { buildPrinterPairs } from "../src/imposition";
import { analyzePdfForBooklet, convertPdfToBooklet } from "../src/pdf-engine";

async function createReaderSpreadFixture(): Promise<Uint8Array> {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  [
    [420, 595],
    [840, 595],
    [840, 595],
    [420, 595],
  ].forEach(([width, height], index) => {
    const page = source.addPage([width, height]);
    page.drawText(`page ${index + 1}`, { x: 24, y: height - 48, size: 14, font });
  });
  return source.save();
}

async function createAllSpreadFixture(): Promise<Uint8Array> {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  [
    [840, 595],
    [840, 595],
  ].forEach(([width, height], index) => {
    const page = source.addPage([width, height]);
    page.drawText(`spread ${index + 1}`, { x: 24, y: height - 48, size: 14, font });
  });
  return source.save();
}

async function createWideLandscapeFixture(): Promise<Uint8Array> {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  Array.from({ length: 4 }, (_value, index) => {
    const page = source.addPage([1280, 720]);
    page.drawText(`wide page ${index + 1}`, { x: 24, y: 672, size: 18, font });
    page.drawText("right edge", { x: 1160, y: 48, size: 18, font });
  });
  return source.save();
}

async function createSinglePageFixture(pageCount: number, width = 297, height = 420): Promise<Uint8Array> {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  Array.from({ length: pageCount }, (_value, index) => {
    const page = source.addPage([width, height]);
    page.drawText(`reader page ${index + 1}`, { x: 24, y: height - 48, size: 18, font });
  });
  return source.save();
}

interface TextPosition {
  x: number;
  y: number;
}

async function getTextPositions(bytes: Uint8Array, pageNumber: number): Promise<Map<string, TextPosition>> {
  const standardFontDataUrl = fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url));
  const document = await getDocument({ data: bytes.slice(), standardFontDataUrl }).promise;

  try {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();

    return new Map(
      textContent.items
        .filter((item): item is Extract<(typeof textContent.items)[number], { str: string }> => "str" in item)
        .map((item) => [item.str, { x: item.transform[4], y: item.transform[5] }]),
    );
  } finally {
    await document.destroy();
  }
}

function requireTextPosition(positions: Map<string, TextPosition>, text: string): TextPosition {
  const position = positions.get(text);

  if (!position) {
    throw new Error(`Missing expected PDF text: ${text}`);
  }

  return position;
}

async function createCenterLabelFixture(pageCount: number, width: number, height: number): Promise<Uint8Array> {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    source.addPage([width, height]).drawText(`P${pageNumber}`, { x: width / 2, y: height / 2, size: 8, font });
  }
  return source.save();
}

interface LabelPlacement {
  sheetSide: number;
  x: number;
  y: number;
  upX: number;
  upY: number;
}

/**
 * Finds where each centered `P<n>` label lands on paper. Back sides are mapped into front-side coordinates the way
 * a duplex printer turns the sheet: long-edge turns around the sheet's long side, short-edge around its short side.
 */
async function getPhysicalLabelPlacements(
  bytes: Uint8Array,
  flipEdge: "long-edge" | "short-edge",
): Promise<Map<string, LabelPlacement>> {
  const standardFontDataUrl = fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url));
  const document = await getDocument({ data: bytes.slice(), standardFontDataUrl }).promise;

  try {
    const placements = new Map<string, LabelPlacement>();

    for (let sheetSide = 1; sheetSide <= document.numPages; sheetSide += 1) {
      const page = await document.getPage(sheetSide);
      const [left, bottom, right, top] = page.view;
      const width = right - left;
      const height = top - bottom;
      const isBack = sheetSide % 2 === 0;
      const turnsAcrossColumns = (height >= width) === (flipEdge === "long-edge");
      const textContent = await page.getTextContent();

      for (const item of textContent.items) {
        if (!("str" in item) || !/^P\d+$/.test(item.str)) {
          continue;
        }

        const [, , c, d, x, y] = item.transform;
        const length = Math.hypot(c, d);
        const placement = { sheetSide, x, y, upX: c / length, upY: d / length };

        if (isBack && turnsAcrossColumns) {
          placement.x = width - x;
          placement.upX = -placement.upX;
        } else if (isBack) {
          placement.y = height - y;
          placement.upY = -placement.upY;
        }

        placements.set(item.str, placement);
      }
    }

    return placements;
  } finally {
    await document.destroy();
  }
}

function requirePlacement(placements: Map<string, LabelPlacement>, pageNumber: number): LabelPlacement {
  const placement = placements.get(`P${pageNumber}`);

  if (!placement) {
    throw new Error(`Missing booklet page P${pageNumber}`);
  }

  return placement;
}

function expectFrontSpreadsInReadingOrder(
  placements: Map<string, LabelPlacement>,
  pageCount: number,
  binding: "left" | "right",
  pageWidth: number,
): void {
  buildPrinterPairs(pageCount, binding).forEach(([leftPage, rightPage], pairIndex) => {
    if (pairIndex % 2 === 1) {
      return;
    }

    const left = requirePlacement(placements, leftPage);
    const right = requirePlacement(placements, rightPage);
    const readingRightX = left.upY;
    const readingRightY = -left.upX;

    expect(right.sheetSide).toBe(left.sheetSide);
    expect(right.upX).toBeCloseTo(left.upX);
    expect(right.upY).toBeCloseTo(left.upY);
    // The left page slips 1pt under the right page at the fold, which moves its centre by half that.
    const distance = (right.x - left.x) * readingRightX + (right.y - left.y) * readingRightY;
    expect(Math.abs(distance - pageWidth)).toBeLessThan(1);
  });
}

function expectLeavesBackToBack(placements: Map<string, LabelPlacement>, pageCount: number): void {
  for (let recto = 1; recto < pageCount; recto += 2) {
    const front = requirePlacement(placements, recto);
    const back = requirePlacement(placements, recto + 1);

    expect(Math.ceil(back.sheetSide / 2), `P${recto + 1} shares a sheet with P${recto}`).toBe(Math.ceil(front.sheetSide / 2));
    expect(back.sheetSide).not.toBe(front.sheetSide);
    expect(Math.abs(back.x - front.x), `P${recto + 1} sits behind P${recto}`).toBeLessThan(1);
    expect(Math.abs(back.y - front.y), `P${recto + 1} sits behind P${recto}`).toBeLessThan(1);
    expect(back.upX, `P${recto + 1} is upright like P${recto}`).toBeCloseTo(front.upX);
    expect(back.upY, `P${recto + 1} is upright like P${recto}`).toBeCloseTo(front.upY);
  }
}

describe("browser PDF engine", () => {
  it("places pages with shifted media origins without copying the hidden left half", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    for (let index = 0; index < 4; index += 1) {
      const page = source.addPage([840, 595]);
      page.drawText("hidden", { x: 24, y: 500, font });
      page.drawText(`visible ${index + 1}`, { x: 444, y: 540, font });
      page.setMediaBox(420, 40, 420, 555);
      page.setCropBox(420, 40, 420, 555);
    }
    const result = await convertPdfToBooklet(await source.save(), { binding: "left" });
    const positions = await getTextPositions(result.bytes, 1);
    // Left pages slip 1pt under the right page at the fold, so their content stretches by a hair.
    expect(requireTextPosition(positions, "visible 4").x).toBeCloseTo(24, 0);
    expect(requireTextPosition(positions, "visible 1").x).toBeCloseTo(444);
    expect(requireTextPosition(positions, "visible 1").y).toBeCloseTo(500);
    expect(result.summary.outputSheets).toBe(1);
  });

  it("splits spreads, pads before the back cover, and emits printer-spread PDF bytes", async () => {
    const sourceBytes = await createReaderSpreadFixture();

    const result = await convertPdfToBooklet(sourceBytes, { binding: "left" });

    const output = await PDFDocument.load(result.bytes);
    const firstPage = output.getPage(0);

    expect(result.summary).toEqual({
      originalPdfPages: 4,
      readerPagesBeforePadding: 6,
      readerPagesAfterPadding: 8,
      blankPagesAdded: 2,
      printerSpreads: 4,
      outputSheets: 2,
      spreadsPerOutputSheet: 1,
    });
    expect(output.getPageCount()).toBe(4);
    expect(firstPage.getWidth()).toBeCloseTo(840);
    expect(firstPage.getHeight()).toBeCloseTo(595);
  });

  it("keeps right-bound output dimensions identical while reversing printer pairs", async () => {
    const sourceBytes = await createReaderSpreadFixture();

    const result = await convertPdfToBooklet(sourceBytes, { binding: "right" });

    const output = await PDFDocument.load(result.bytes);
    expect(result.summary.printerSpreads).toBe(4);
    expect(result.summary.outputSheets).toBe(2);
    expect(result.summary.spreadsPerOutputSheet).toBe(1);
    expect(output.getPage(0).getWidth()).toBeCloseTo(840);
    expect(output.getPage(0).getHeight()).toBeCloseTo(595);
  });

  it("auto-detects PDFs made entirely of two-page reader spreads", async () => {
    const sourceBytes = await createAllSpreadFixture();

    const result = await convertPdfToBooklet(sourceBytes, { binding: "left" });

    const output = await PDFDocument.load(result.bytes);
    expect(result.summary).toEqual({
      originalPdfPages: 2,
      readerPagesBeforePadding: 4,
      readerPagesAfterPadding: 4,
      blankPagesAdded: 0,
      printerSpreads: 2,
      outputSheets: 1,
      spreadsPerOutputSheet: 1,
    });
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getWidth()).toBeCloseTo(840);
    expect(output.getPage(0).getHeight()).toBeCloseTo(595);
  });

  it("prints the first page of a spread-only PDF as the outside cover spread", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    for (let index = 1; index <= 2; index += 1) {
      const page = source.addPage([840, 595]);
      page.drawText(`s${index}-left`, { x: 24, y: 540, size: 14, font });
      page.drawText(`s${index}-right`, { x: 444, y: 540, size: 14, font });
    }

    const result = await convertPdfToBooklet(await source.save(), { binding: "left" });
    const front = await getTextPositions(result.bytes, 1);
    const back = await getTextPositions(result.bytes, 2);

    expect(requireTextPosition(front, "s1-left").x).toBeCloseTo(24);
    expect(requireTextPosition(front, "s1-right").x).toBeCloseTo(444);
    expect(requireTextPosition(back, "s2-left").x).toBeCloseTo(24);
    expect(requireTextPosition(back, "s2-right").x).toBeCloseTo(444);
  });

  it("overlaps facing pages at the fold only when both pages reach it", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    for (let index = 1; index <= 3; index += 1) {
      source.addPage([200, 300]).drawText(`edge ${index}`, { x: 170, y: 150, size: 6, font });
    }

    // Three pages become [3 | 1] and [2 | blank]: only the first sheet has two pages meeting at the fold.
    const result = await convertPdfToBooklet(await source.save(), { binding: "left" });
    const front = await getTextPositions(result.bytes, 1);
    const back = await getTextPositions(result.bytes, 2);

    expect(requireTextPosition(front, "edge 3").x).toBeCloseTo((170 * 201) / 200);
    expect(requireTextPosition(front, "edge 1").x).toBeCloseTo(370);
    expect(requireTextPosition(back, "edge 2").x).toBeCloseTo(170);
  });

  it("tucks split spread halves under the fold without moving their content", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    for (let index = 1; index <= 4; index += 1) {
      const page = source.addPage([840, 595]);
      page.drawText(`s${index}-left`, { x: 24, y: 540, size: 14, font });
      page.drawText(`s${index}-gutter`, { x: 330, y: 500, size: 14, font });
    }

    // Four spreads print as [8 | 1], [2 | 7], [6 | 3], [4 | 5]; page 2 is the left half of spread 2.
    const result = await convertPdfToBooklet(await source.save(), { binding: "left" });
    const backOfFirstSheet = await getTextPositions(result.bytes, 2);

    expect(requireTextPosition(backOfFirstSheet, "s2-left").x).toBeCloseTo(24);
    expect(requireTextPosition(backOfFirstSheet, "s2-gutter").x).toBeCloseTo(330);
  });

  it("sizes the booklet from the most common page instead of a smaller cover", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    source.addPage([198.425, 283.465]).drawText("cover", { x: 10, y: 250, size: 12, font });
    for (let index = 2; index <= 16; index += 1) {
      source.addPage([283.465, 425.197]).drawText(`inside ${index}`, { x: 10, y: 400, size: 12, font });
    }

    const result = await convertPdfToBooklet(await source.save(), { binding: "left" });
    const output = await PDFDocument.load(result.bytes);
    const backOfFirstSheet = await getTextPositions(result.bytes, 2);

    expect(output.getPage(0).getWidth()).toBeCloseTo(566.93);
    expect(output.getPage(0).getHeight()).toBeCloseTo(425.197);
    expect(requireTextPosition(backOfFirstSheet, "inside 2").x).toBeCloseTo(10, 1);
    expect(requireTextPosition(backOfFirstSheet, "inside 15").x).toBeCloseTo(293.465);
  });

  it("keeps very wide landscape pages from being split or clipped", async () => {
    const sourceBytes = await createWideLandscapeFixture();

    const result = await convertPdfToBooklet(sourceBytes, { binding: "left" });

    const output = await PDFDocument.load(result.bytes);
    expect(result.summary).toEqual({
      originalPdfPages: 4,
      readerPagesBeforePadding: 4,
      readerPagesAfterPadding: 4,
      blankPagesAdded: 0,
      printerSpreads: 2,
      outputSheets: 1,
      spreadsPerOutputSheet: 1,
    });
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getWidth()).toBeCloseTo(2560);
    expect(output.getPage(0).getHeight()).toBeCloseTo(720);
  });

  it("places booklet spreads on the selected output paper with trim marks", async () => {
    const sourceBytes = await createReaderSpreadFixture();

    const result = await convertPdfToBooklet(sourceBytes, {
      binding: "left",
      trimMarks: { paperWidthMm: 297, paperHeightMm: 420 },
    });

    const output = await PDFDocument.load(result.bytes);
    const firstPage = output.getPage(0);
    expect(firstPage.getWidth()).toBeCloseTo((420 * 72) / 25.4);
    expect(firstPage.getHeight()).toBeCloseTo((297 * 72) / 25.4);
    expect(result.summary.outputSheets).toBe(2);
    expect(result.summary.spreadsPerOutputSheet).toBe(1);
  });

  it("packs two booklet spreads per output sheet while preserving duplex slots", async () => {
    const sourceBytes = await createSinglePageFixture(8);

    const result = await convertPdfToBooklet(sourceBytes, {
      binding: "left",
      trimMarks: { paperWidthMm: 297, paperHeightMm: 420 },
    });

    const output = await PDFDocument.load(result.bytes);
    expect(result.summary).toEqual({
      originalPdfPages: 8,
      readerPagesBeforePadding: 8,
      readerPagesAfterPadding: 8,
      blankPagesAdded: 0,
      printerSpreads: 4,
      outputSheets: 1,
      spreadsPerOutputSheet: 2,
    });
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getWidth()).toBeCloseTo((297 * 72) / 25.4);
    expect(output.getPage(0).getHeight()).toBeCloseTo((420 * 72) / 25.4);
  });

  it("packs three booklet spreads per output sheet when the selected paper allows it", async () => {
    const sourceBytes = await createSinglePageFixture(12, 100, 100);

    const result = await convertPdfToBooklet(sourceBytes, {
      binding: "left",
      trimMarks: { paperWidthMm: 280, paperHeightMm: 70 },
    });

    const output = await PDFDocument.load(result.bytes);
    expect(result.summary).toEqual({
      originalPdfPages: 12,
      readerPagesBeforePadding: 12,
      readerPagesAfterPadding: 12,
      blankPagesAdded: 0,
      printerSpreads: 6,
      outputSheets: 1,
      spreadsPerOutputSheet: 3,
    });
    expect(output.getPageCount()).toBe(2);
  });

  describe("folds into a correct booklet after duplex printing", () => {
    const layouts = [
      { name: "landscape spreads without output paper", pageCount: 16, width: 100, height: 100 },
      { name: "portrait spreads without output paper", pageCount: 16, width: 100, height: 300 },
      {
        name: "four spreads on landscape paper",
        pageCount: 16,
        width: 100,
        height: 100,
        trimMarks: { paperWidthMm: 190, paperHeightMm: 120 },
      },
      {
        name: "two spreads on portrait paper",
        pageCount: 8,
        width: 297,
        height: 420,
        trimMarks: { paperWidthMm: 297, paperHeightMm: 420 },
      },
    ];
    const cases = layouts.flatMap((layout) =>
      (["auto", "long-edge", "short-edge"] as const).flatMap((duplexFlip) =>
        (["left", "right"] as const).map((binding) => ({ ...layout, duplexFlip, binding })),
      ),
    );

    it.each(cases)("$name, $duplexFlip, $binding binding", async ({ pageCount, width, height, trimMarks, duplexFlip, binding }) => {
      const sourceBytes = await createCenterLabelFixture(pageCount, width, height);

      const result = await convertPdfToBooklet(sourceBytes, { binding, duplexFlip, trimMarks });
      const placements = await getPhysicalLabelPlacements(result.bytes, result.duplexFlipEdge);

      expectFrontSpreadsInReadingOrder(placements, pageCount, binding, width);
      expectLeavesBackToBack(placements, pageCount);
      // Automatic flipping picks the book-like edge, so its back sides never need to be printed upside down.
      if (duplexFlip === "auto") {
        expect(result.backSidesTurned).toBe(false);
      }
    });
  });

  it("resolves automatic duplex flipping to the upright book-like edge for the final sheet orientation", async () => {
    const landscapeSourceBytes = await createSinglePageFixture(16, 100, 100);
    const portraitSourceBytes = await createSinglePageFixture(8);

    const landscape = await convertPdfToBooklet(landscapeSourceBytes, {
      binding: "left",
      duplexFlip: "auto",
      trimMarks: { paperWidthMm: 190, paperHeightMm: 120 },
    });
    const portrait = await convertPdfToBooklet(portraitSourceBytes, {
      binding: "left",
      duplexFlip: "auto",
      trimMarks: { paperWidthMm: 297, paperHeightMm: 420 },
    });

    expect(landscape.duplexFlipEdge).toBe("short-edge");
    expect(portrait.duplexFlipEdge).toBe("long-edge");
  });

  it("warns when the selected output paper is smaller than the final spread", async () => {
    const sourceBytes = await createReaderSpreadFixture();

    await expect(
      convertPdfToBooklet(sourceBytes, {
        binding: "left",
        trimMarks: { paperWidthMm: 210, paperHeightMm: 297 },
      }),
    ).rejects.toThrow("출력 용지가 작습니다. 판형을 키워주세요.");
  });

  it("reserves enough paper margin for longer trim marks", async () => {
    const sourceBytes = await createReaderSpreadFixture();

    await expect(
      convertPdfToBooklet(sourceBytes, {
        binding: "left",
        trimMarks: { paperWidthMm: 311, paperHeightMm: 225 },
      }),
    ).rejects.toThrow("출력 용지가 작습니다. 판형을 키워주세요.");
  });

  it("reports booklet analysis before conversion", async () => {
    const sourceBytes = await createReaderSpreadFixture();

    const analysis = await analyzePdfForBooklet(sourceBytes);

    expect(analysis).toEqual({
      originalPdfPages: 4,
      readerPagesBeforePadding: 6,
      readerPagesAfterPadding: 8,
      blankPagesAdded: 2,
      printerSpreads: 4,
      outputSheets: 2,
      spreadsPerOutputSheet: 1,
      detectedPdfShape: "mixed-pages-and-spreads",
      recommendedBlankPlacement: "before-back-cover",
      mismatchedSourcePages: [],
    });
  });

  it("reports source pages whose size differs from the booklet page", async () => {
    const source = await PDFDocument.create();
    source.addPage([198.425, 283.465]);
    for (let index = 0; index < 3; index += 1) {
      source.addPage([283.465, 425.197]);
    }

    const analysis = await analyzePdfForBooklet(await source.save());

    expect(analysis.mismatchedSourcePages).toEqual([1]);
  });
});
