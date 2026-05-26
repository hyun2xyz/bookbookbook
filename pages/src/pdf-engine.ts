import { PDFDocument, type PDFEmbeddedPage, type PDFPage } from "pdf-lib";

import {
  analyzeReaderLayout,
  type Binding,
  type BlankPlacement,
  type SourceSlot,
  buildPrinterPairs,
  buildReaderSlots,
  inferSinglePageSize,
  padSlotsForSaddleStitch,
} from "./imposition";

export interface ConversionSummary {
  originalPdfPages: number;
  readerPagesBeforePadding: number;
  readerPagesAfterPadding: number;
  blankPagesAdded: number;
  printerSpreads: number;
}

export type DetectedPdfShape = "single-pages" | "all-spreads" | "mixed-pages-and-spreads";

export interface BookletAnalysis extends ConversionSummary {
  detectedPdfShape: DetectedPdfShape;
  recommendedBlankPlacement: BlankPlacement;
}

export interface ConvertOptions {
  binding: Binding;
  blankPlacement?: BlankPlacement;
}

export interface ConvertResult {
  bytes: Uint8Array;
  summary: ConversionSummary;
}

interface LogicalPage {
  page: PDFEmbeddedPage;
  width: number;
  height: number;
}

export async function convertPdfToBooklet(
  inputBytes: Uint8Array | ArrayBuffer,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const sourceDoc = await PDFDocument.load(inputBytes);
  const sourcePages = sourceDoc.getPages();
  const pageSizes = sourcePages.map((page) => ({
    width: page.getWidth(),
    height: page.getHeight(),
  }));
  const readerSlots = buildReaderSlots(pageSizes);
  const paddedSlots = padSlotsForSaddleStitch(readerSlots, options.blankPlacement);
  const singlePage = inferSinglePageSize(pageSizes);
  const outputDoc = await PDFDocument.create();
  const logicalPages = await Promise.all(paddedSlots.map((slot) => embedLogicalPage(outputDoc, sourcePages, slot)));
  const printerPairs = buildPrinterPairs(logicalPages.length, options.binding);

  printerPairs.forEach(([leftNumber, rightNumber]) => {
    const sheet = outputDoc.addPage([singlePage.width * 2, singlePage.height]);
    const leftPage = logicalPages[leftNumber - 1];
    const rightPage = logicalPages[rightNumber - 1];

    drawLogicalPage(sheet, leftPage, 0, 0, singlePage.width, singlePage.height);
    drawLogicalPage(sheet, rightPage, singlePage.width, 0, singlePage.width, singlePage.height);
  });

  return {
    bytes: await outputDoc.save(),
    summary: {
      originalPdfPages: sourcePages.length,
      readerPagesBeforePadding: readerSlots.length,
      readerPagesAfterPadding: paddedSlots.length,
      blankPagesAdded: paddedSlots.length - readerSlots.length,
      printerSpreads: printerPairs.length,
    },
  };
}

export async function analyzePdfForBooklet(inputBytes: Uint8Array | ArrayBuffer): Promise<BookletAnalysis> {
  const sourceDoc = await PDFDocument.load(inputBytes);
  const sourcePages = sourceDoc.getPages();
  const pageSizes = sourcePages.map((page) => ({
    width: page.getWidth(),
    height: page.getHeight(),
  }));
  const layout = analyzeReaderLayout(pageSizes);
  const paddedSlots = padSlotsForSaddleStitch(layout.slots);

  return {
    originalPdfPages: sourcePages.length,
    readerPagesBeforePadding: layout.slots.length,
    readerPagesAfterPadding: paddedSlots.length,
    blankPagesAdded: paddedSlots.length - layout.slots.length,
    printerSpreads: buildPrinterPairs(paddedSlots.length).length,
    detectedPdfShape: detectPdfShape(layout.slots),
    recommendedBlankPlacement: "before-back-cover",
  };
}

function detectPdfShape(slots: SourceSlot[]): DetectedPdfShape {
  const fullSlots = slots.filter((slot) => slot.part === "full").length;
  const splitSlots = slots.length - fullSlots;

  if (splitSlots === 0) {
    return "single-pages";
  }

  if (fullSlots === 0) {
    return "all-spreads";
  }

  return "mixed-pages-and-spreads";
}

async function embedLogicalPage(
  outputDoc: PDFDocument,
  sourcePages: PDFPage[],
  slot: SourceSlot,
): Promise<LogicalPage | null> {
  if (slot.part === "blank") {
    return null;
  }

  if (slot.sourceIndex === null) {
    throw new Error("Non-blank page slot is missing a source page");
  }

  const sourcePage = sourcePages[slot.sourceIndex];
  const sourceWidth = sourcePage.getWidth();
  const sourceHeight = sourcePage.getHeight();
  const halfWidth = sourceWidth / 2;

  if (slot.part === "left") {
    return {
      page: await outputDoc.embedPage(sourcePage, {
        left: 0,
        bottom: 0,
        right: halfWidth,
        top: sourceHeight,
      }),
      width: halfWidth,
      height: sourceHeight,
    };
  }

  if (slot.part === "right") {
    return {
      page: await outputDoc.embedPage(sourcePage, {
        left: halfWidth,
        bottom: 0,
        right: sourceWidth,
        top: sourceHeight,
      }),
      width: halfWidth,
      height: sourceHeight,
    };
  }

  return {
    page: await outputDoc.embedPage(sourcePage, {
      left: 0,
      bottom: 0,
      right: sourceWidth,
      top: sourceHeight,
    }),
    width: sourceWidth,
    height: sourceHeight,
  };
}

function drawLogicalPage(
  sheet: PDFPage,
  logicalPage: LogicalPage | null,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (!logicalPage) {
    return;
  }

  const scale = Math.min(width / logicalPage.width, height / logicalPage.height);
  const drawWidth = logicalPage.width * scale;
  const drawHeight = logicalPage.height * scale;

  sheet.drawPage(logicalPage.page, {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
}
