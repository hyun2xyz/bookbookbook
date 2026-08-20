import { degrees, PDFDocument, rgb, type PDFEmbeddedPage, type PDFPage } from "pdf-lib";

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
  outputSheets: number;
  spreadsPerOutputSheet: number;
}

export type DetectedPdfShape = "single-pages" | "all-spreads" | "mixed-pages-and-spreads";

export interface BookletAnalysis extends ConversionSummary {
  detectedPdfShape: DetectedPdfShape;
  recommendedBlankPlacement: BlankPlacement;
}

export interface ConvertOptions {
  binding: Binding;
  blankPlacement?: BlankPlacement;
  duplexFlip?: DuplexFlipSelection;
  trimMarks?: TrimMarkOptions;
}

export interface ConvertResult {
  bytes: Uint8Array;
  duplexFlipEdge: DuplexFlipEdge;
  summary: ConversionSummary;
}

export type DuplexFlipSelection = "auto" | DuplexFlipEdge;
export type DuplexFlipEdge = "long-edge" | "short-edge";

export interface TrimMarkOptions {
  paperWidthMm: number;
  paperHeightMm: number;
}

interface LogicalPage {
  page: PDFEmbeddedPage;
  width: number;
  height: number;
}

interface SheetLayout {
  width: number;
  height: number;
  columns: number;
  rows: number;
  capacity: number;
  gridX: number;
  gridY: number;
  cellWidth: number;
  cellHeight: number;
  spreadWidth: number;
  spreadHeight: number;
  spreadRotation: 0 | 90;
}

interface SlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type FlipAxis = "vertical" | "horizontal";

const MIN_TRIM_MARK_MARGIN = millimetersToPoints(11);
const TRIM_MARK_GAP = millimetersToPoints(2);
const TRIM_MARK_LENGTH = millimetersToPoints(9);

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
  const trimWidth = singlePage.width * 2;
  const trimHeight = singlePage.height;
  const sheetLayout = options.trimMarks ? resolveSheetLayout(options.trimMarks, trimWidth, trimHeight) : undefined;
  const outputWidth = sheetLayout?.width ?? trimWidth;
  const outputHeight = sheetLayout?.height ?? trimHeight;
  const duplexFlipEdge = resolveDuplexFlipEdge(options.duplexFlip ?? "auto", outputWidth, outputHeight);
  const flipAxis = resolveFlipAxis(duplexFlipEdge, outputWidth, outputHeight);
  const spreadRotation = sheetLayout?.spreadRotation ?? 0;
  const swapBackSpreadPages = shouldSwapBackSpreadPages(flipAxis, spreadRotation);

  printerPairs.forEach((pair, pairIndex) => {
    const [leftNumber, rightNumber] = pairIndex % 2 === 1 && swapBackSpreadPages ? [pair[1], pair[0]] : pair;
    const sheet = outputDoc.addPage([trimWidth, trimHeight]);
    const leftPage = logicalPages[leftNumber - 1];
    const rightPage = logicalPages[rightNumber - 1];

    drawLogicalPage(sheet, leftPage, 0, 0, singlePage.width, singlePage.height);
    drawLogicalPage(sheet, rightPage, singlePage.width, 0, singlePage.width, singlePage.height);
  });

  const bookletBytes = await outputDoc.save();
  const packedOutput = sheetLayout
    ? await packPrinterSpreadsOnOutputSheets(bookletBytes, trimWidth, trimHeight, sheetLayout, flipAxis)
    : {
        bytes: bookletBytes,
        outputSheets: printerPairs.length,
        spreadsPerOutputSheet: 1,
      };

  return {
    bytes: packedOutput.bytes,
    duplexFlipEdge,
    summary: {
      originalPdfPages: sourcePages.length,
      readerPagesBeforePadding: readerSlots.length,
      readerPagesAfterPadding: paddedSlots.length,
      blankPagesAdded: paddedSlots.length - readerSlots.length,
      printerSpreads: printerPairs.length,
      outputSheets: packedOutput.outputSheets,
      spreadsPerOutputSheet: packedOutput.spreadsPerOutputSheet,
    },
  };
}

async function packPrinterSpreadsOnOutputSheets(
  bookletBytes: Uint8Array,
  spreadWidth: number,
  spreadHeight: number,
  sheetLayout: SheetLayout,
  flipAxis: FlipAxis,
): Promise<{ bytes: Uint8Array; outputSheets: number; spreadsPerOutputSheet: number }> {
  const sourceDoc = await PDFDocument.load(bookletBytes);
  const sourcePages = sourceDoc.getPages();
  const outputDoc = await PDFDocument.create();
  const embeddedSpreads = await outputDoc.embedPdf(
    bookletBytes,
    sourcePages.map((_page, index) => index),
  );
  const pairSpan = sheetLayout.capacity * 2;

  for (let baseIndex = 0; baseIndex < embeddedSpreads.length; baseIndex += pairSpan) {
    const frontSheet = outputDoc.addPage([sheetLayout.width, sheetLayout.height]);
    const backSheet = outputDoc.addPage([sheetLayout.width, sheetLayout.height]);

    for (let slotIndex = 0; slotIndex < sheetLayout.capacity; slotIndex += 1) {
      const frontSpread = embeddedSpreads[baseIndex + slotIndex * 2];
      const backSpread = embeddedSpreads[baseIndex + slotIndex * 2 + 1];
      const frontSlot = getSheetSlot(sheetLayout, slotIndex);
      const backSlot = getSheetSlot(sheetLayout, slotIndex, flipAxis);

      if (frontSpread) {
        drawPackedSpread(frontSheet, frontSpread, frontSlot, spreadWidth, spreadHeight, sheetLayout.spreadRotation);
        drawTrimMarks(frontSheet, frontSlot.x, frontSlot.y, frontSlot.width, frontSlot.height);
      }

      if (backSpread) {
        drawPackedSpread(backSheet, backSpread, backSlot, spreadWidth, spreadHeight, sheetLayout.spreadRotation);
        drawTrimMarks(backSheet, backSlot.x, backSlot.y, backSlot.width, backSlot.height);
      }
    }
  }

  return {
    bytes: await outputDoc.save(),
    outputSheets: outputDoc.getPageCount(),
    spreadsPerOutputSheet: sheetLayout.capacity,
  };
}

function resolveSheetLayout(trimMarks: TrimMarkOptions, trimWidth: number, trimHeight: number): SheetLayout {
  const paperWidth = validatePaperMillimeters(trimMarks.paperWidthMm, "가로");
  const paperHeight = validatePaperMillimeters(trimMarks.paperHeightMm, "세로");
  const paperLayouts = [
    { width: millimetersToPoints(paperWidth), height: millimetersToPoints(paperHeight) },
    { width: millimetersToPoints(paperHeight), height: millimetersToPoints(paperWidth) },
  ];
  const candidates = paperLayouts.flatMap((paper) =>
    ([0, 90] as const).map((spreadRotation) => {
      const spreadWidth = spreadRotation === 90 ? trimHeight : trimWidth;
      const spreadHeight = spreadRotation === 90 ? trimWidth : trimHeight;
      const cellWidth = spreadWidth + MIN_TRIM_MARK_MARGIN * 2;
      const cellHeight = spreadHeight + MIN_TRIM_MARK_MARGIN * 2;
      const columns = Math.floor(paper.width / cellWidth);
      const rows = Math.floor(paper.height / cellHeight);
      const capacity = columns * rows;
      const gridWidth = columns * cellWidth;
      const gridHeight = rows * cellHeight;

      return {
        ...paper,
        columns,
        rows,
        capacity,
        gridX: (paper.width - gridWidth) / 2,
        gridY: (paper.height - gridHeight) / 2,
        cellWidth,
        cellHeight,
        spreadWidth,
        spreadHeight,
        spreadRotation,
        gridWaste: paper.width * paper.height - gridWidth * gridHeight,
      };
    }),
  );
  const fittingLayouts = candidates.filter((layout) => layout.capacity > 0);

  if (fittingLayouts.length === 0) {
    throw new Error("출력 용지가 작습니다. 판형을 키워주세요.");
  }

  fittingLayouts.sort((a, b) => {
    if (b.capacity !== a.capacity) {
      return b.capacity - a.capacity;
    }

    if (a.gridWaste !== b.gridWaste) {
      return a.gridWaste - b.gridWaste;
    }

    return a.spreadRotation - b.spreadRotation;
  });

  return fittingLayouts[0];
}

function validatePaperMillimeters(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 20 || value > 2000) {
    throw new Error(`출력 용지 ${label} mm를 확인하세요.`);
  }

  return value;
}

function millimetersToPoints(value: number): number {
  return (value * 72) / 25.4;
}

function drawTrimMarks(sheet: PDFPage, trimX: number, trimY: number, trimWidth: number, trimHeight: number): void {
  const trimLineColor = rgb(0.35, 0.35, 0.35);
  const trimRight = trimX + trimWidth;
  const trimTop = trimY + trimHeight;

  [
    [[trimX - TRIM_MARK_GAP - TRIM_MARK_LENGTH, trimY], [trimX - TRIM_MARK_GAP, trimY]],
    [[trimX, trimY - TRIM_MARK_GAP - TRIM_MARK_LENGTH], [trimX, trimY - TRIM_MARK_GAP]],
    [[trimRight + TRIM_MARK_GAP, trimY], [trimRight + TRIM_MARK_GAP + TRIM_MARK_LENGTH, trimY]],
    [[trimRight, trimY - TRIM_MARK_GAP - TRIM_MARK_LENGTH], [trimRight, trimY - TRIM_MARK_GAP]],
    [[trimX - TRIM_MARK_GAP - TRIM_MARK_LENGTH, trimTop], [trimX - TRIM_MARK_GAP, trimTop]],
    [[trimX, trimTop + TRIM_MARK_GAP], [trimX, trimTop + TRIM_MARK_GAP + TRIM_MARK_LENGTH]],
    [[trimRight + TRIM_MARK_GAP, trimTop], [trimRight + TRIM_MARK_GAP + TRIM_MARK_LENGTH, trimTop]],
    [[trimRight, trimTop + TRIM_MARK_GAP], [trimRight, trimTop + TRIM_MARK_GAP + TRIM_MARK_LENGTH]],
  ].forEach(([[startX, startY], [endX, endY]]) => {
    sheet.drawLine({
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      thickness: 0.45,
      color: trimLineColor,
      opacity: 0.72,
    });
  });
}

function getSheetSlot(sheetLayout: SheetLayout, slotIndex: number, flipAxis?: FlipAxis): SlotRect {
  const sourceColumn = slotIndex % sheetLayout.columns;
  const sourceRow = Math.floor(slotIndex / sheetLayout.columns);
  const column = flipAxis === "vertical" ? sheetLayout.columns - 1 - sourceColumn : sourceColumn;
  const row = flipAxis === "horizontal" ? sheetLayout.rows - 1 - sourceRow : sourceRow;
  const visualRow = sheetLayout.rows - 1 - row;

  return {
    x: sheetLayout.gridX + column * sheetLayout.cellWidth + MIN_TRIM_MARK_MARGIN,
    y: sheetLayout.gridY + visualRow * sheetLayout.cellHeight + MIN_TRIM_MARK_MARGIN,
    width: sheetLayout.spreadWidth,
    height: sheetLayout.spreadHeight,
  };
}

function resolveDuplexFlipEdge(
  selection: DuplexFlipSelection,
  outputWidth: number,
  outputHeight: number,
): DuplexFlipEdge {
  if (selection === "long-edge" || selection === "short-edge") {
    return selection;
  }

  return outputHeight >= outputWidth ? "long-edge" : "short-edge";
}

function resolveFlipAxis(edge: DuplexFlipEdge, outputWidth: number, outputHeight: number): FlipAxis {
  const isPortrait = outputHeight >= outputWidth;

  if (edge === "long-edge") {
    return isPortrait ? "vertical" : "horizontal";
  }

  return isPortrait ? "horizontal" : "vertical";
}

function shouldSwapBackSpreadPages(flipAxis: FlipAxis, spreadRotation: 0 | 90): boolean {
  return (flipAxis === "horizontal") !== (spreadRotation === 90);
}

function drawPackedSpread(
  sheet: PDFPage,
  spread: PDFEmbeddedPage,
  slot: SlotRect,
  spreadWidth: number,
  spreadHeight: number,
  rotation: 0 | 90,
): void {
  if (rotation === 90) {
    sheet.drawPage(spread, {
      x: slot.x + slot.width,
      y: slot.y,
      width: spreadWidth,
      height: spreadHeight,
      rotate: degrees(90),
    });
    return;
  }

  sheet.drawPage(spread, {
    x: slot.x,
    y: slot.y,
    width: spreadWidth,
    height: spreadHeight,
  });
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
    outputSheets: buildPrinterPairs(paddedSlots.length).length,
    spreadsPerOutputSheet: 1,
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
