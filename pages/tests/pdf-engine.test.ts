import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

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

describe("browser PDF engine", () => {
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
      outputSheets: 4,
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
    expect(result.summary.outputSheets).toBe(4);
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
      outputSheets: 2,
      spreadsPerOutputSheet: 1,
    });
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getWidth()).toBeCloseTo(840);
    expect(output.getPage(0).getHeight()).toBeCloseTo(595);
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
      outputSheets: 2,
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
    expect(result.summary.outputSheets).toBe(4);
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
      outputSheets: 2,
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
      outputSheets: 2,
      spreadsPerOutputSheet: 3,
    });
    expect(output.getPageCount()).toBe(2);
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
      outputSheets: 4,
      spreadsPerOutputSheet: 1,
      detectedPdfShape: "mixed-pages-and-spreads",
      recommendedBlankPlacement: "before-back-cover",
    });
  });
});
