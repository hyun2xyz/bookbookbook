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
  const logicalPages = await Promise.all(
    paddedSlots.map((slot) => embedLogicalPage(outputDoc, sourcePages, slot, singlePage.width, singlePage.height)),
  );
  const printerPairs = buildPrinterPairs(logicalPages.length, options.binding);

  printerPairs.forEach(([leftNumber, rightNumber]) => {
    const sheet = outputDoc.addPage([singlePage.width * 2, singlePage.height]);
    const leftPage = logicalPages[leftNumber - 1];
    const rightPage = logicalPages[rightNumber - 1];

    if (leftPage) {
      sheet.drawPage(leftPage, {
        x: 0,
        y: 0,
        width: singlePage.width,
        height: singlePage.height,
      });
    }

    if (rightPage) {
      sheet.drawPage(rightPage, {
        x: singlePage.width,
        y: 0,
        width: singlePage.width,
        height: singlePage.height,
      });
    }
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
  singleWidth: number,
  singleHeight: number,
): Promise<PDFEmbeddedPage | null> {
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
    return outputDoc.embedPage(sourcePage, {
      left: 0,
      bottom: 0,
      right: halfWidth,
      top: sourceHeight,
    });
  }

  if (slot.part === "right") {
    return outputDoc.embedPage(sourcePage, {
      left: halfWidth,
      bottom: 0,
      right: sourceWidth,
      top: sourceHeight,
    });
  }

  return outputDoc.embedPage(sourcePage, {
    left: 0,
    bottom: 0,
    right: singleWidth,
    top: singleHeight,
  });
}
