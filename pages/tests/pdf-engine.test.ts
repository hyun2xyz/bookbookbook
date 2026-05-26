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
    });
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getWidth()).toBeCloseTo(2560);
    expect(output.getPage(0).getHeight()).toBeCloseTo(720);
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
      detectedPdfShape: "mixed-pages-and-spreads",
      recommendedBlankPlacement: "before-back-cover",
    });
  });
});
