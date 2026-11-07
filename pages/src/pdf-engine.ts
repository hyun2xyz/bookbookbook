import { degrees, PDFDocument, rgb, type PDFEmbeddedPage, type PDFPage } from "pdf-lib";

import {
  analyzeReaderLayout,
  type Binding,
  type BlankPlacement,
  type PageSize,
  type SourceSlot,
  buildPrinterPairs,
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
  /** 1-based source PDF page numbers that are scaled to fit because their size differs from the booklet page. */
  mismatchedSourcePages: number[];
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
  /** Back sides are printed upside down so they come out upright after this duplex flip. */
  backSidesTurned: boolean;
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
  /** Extra source width embedded past the page's right edge, from the other half of its source spread. */
  foldBleed: number;
}

/**
 * How a left-hand page tucks under its right-hand neighbour at the fold:
 * - "bleed": a left half of a source spread also carries the start of the other half, so nothing moves.
 * - "stretch": a single page has nothing past its edge, so it is stretched by FOLD_OVERLAP instead.
 */
type FoldOverlap = { kind: "none" } | { kind: "bleed"; sourceWidth: number } | { kind: "stretch" };

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
type SpreadRotation = 0 | 90 | 180 | 270;

const MIN_TRIM_MARK_MARGIN = millimetersToPoints(11);
const TRIM_MARK_GAP = millimetersToPoints(2);
const TRIM_MARK_LENGTH = millimetersToPoints(9);
// Two pages that merely touch at the fold show a hairline seam in PDF viewers (anti-aliasing on the shared edge).
// The left page slips this far under the right page instead; the overlap disappears into the fold when printed.
const FOLD_OVERLAP = 1;

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
  const { slots: readerSlots, singlePage } = analyzeReaderLayout(pageSizes, options.binding);
  const paddedSlots = padSlotsForSaddleStitch(readerSlots, options.blankPlacement);
  const outputDoc = await PDFDocument.create();
  const printerPairs = buildPrinterPairs(paddedSlots.length, options.binding);
  const foldOverlaps = resolveFoldOverlaps(printerPairs, paddedSlots, pageSizes, singlePage);
  const wholeSpreadSlots = new Set(
    printerPairs.flatMap(([leftNumber, rightNumber]) =>
      isWholeSourceSpread(paddedSlots[leftNumber - 1], paddedSlots[rightNumber - 1]) ? [leftNumber - 1, rightNumber - 1] : [],
    ),
  );
  const logicalPages = await Promise.all(
    paddedSlots.map((slot, index) => {
      const overlap = foldOverlaps[index];
      return wholeSpreadSlots.has(index)
        ? null
        : embedLogicalPage(outputDoc, sourcePages, slot, overlap.kind === "bleed" ? overlap.sourceWidth : 0);
    }),
  );
  const trimWidth = singlePage.width * 2;
  const trimHeight = singlePage.height;
  const sheetLayout = options.trimMarks ? resolveSheetLayout(options.trimMarks, trimWidth, trimHeight) : undefined;
  const outputWidth = sheetLayout?.width ?? trimWidth;
  const outputHeight = sheetLayout?.height ?? trimHeight;
  const duplexFlipEdge = resolveDuplexFlipEdge(options.duplexFlip ?? "auto", outputWidth, outputHeight);
  const flipAxis = resolveFlipAxis(duplexFlipEdge, outputWidth, outputHeight);
  const spreadRotation = sheetLayout?.spreadRotation ?? 0;
  const turnBacksUpsideDown = shouldTurnBacksUpsideDown(flipAxis, spreadRotation);

  for (const [leftNumber, rightNumber] of printerPairs) {
    const sheet = outputDoc.addPage([trimWidth, trimHeight]);
    const leftSlot = paddedSlots[leftNumber - 1];
    const rightSlot = paddedSlots[rightNumber - 1];

    const sourceSpread = isWholeSourceSpread(leftSlot, rightSlot)
      ? await embedLogicalPage(outputDoc, sourcePages, { sourceIndex: leftSlot.sourceIndex, part: "full" })
      : null;

    if (sourceSpread) {
      // The centre spread can come from one source spread: draw it whole so the fold has no seam or lost sliver.
      drawPage(sheet, sourceSpread, fitPage(sourceSpread, 0, 0, trimWidth, trimHeight));
      continue;
    }

    drawPagePair(
      sheet,
      logicalPages[leftNumber - 1],
      logicalPages[rightNumber - 1],
      singlePage.width,
      singlePage.height,
      foldOverlaps[leftNumber - 1],
    );
  }

  const bookletBytes = await outputDoc.save();
  const packedOutput = sheetLayout
    ? await packPrinterSpreadsOnOutputSheets(bookletBytes, trimWidth, trimHeight, sheetLayout, flipAxis, turnBacksUpsideDown)
    : {
        bytes: turnBacksUpsideDown ? await turnBackSpreadsUpsideDown(bookletBytes, trimWidth, trimHeight) : bookletBytes,
        outputSheets: printerPairs.length / 2,
        spreadsPerOutputSheet: 1,
      };

  return {
    bytes: packedOutput.bytes,
    duplexFlipEdge,
    backSidesTurned: turnBacksUpsideDown,
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
  turnBacksUpsideDown: boolean,
): Promise<{ bytes: Uint8Array; outputSheets: number; spreadsPerOutputSheet: number }> {
  const sourceDoc = await PDFDocument.load(bookletBytes);
  const sourcePages = sourceDoc.getPages();
  const outputDoc = await PDFDocument.create();
  const embeddedSpreads = await outputDoc.embedPdf(
    bookletBytes,
    sourcePages.map((_page, index) => index),
  );
  const pairSpan = sheetLayout.capacity * 2;
  const frontRotation = sheetLayout.spreadRotation;
  const backRotation = turnBacksUpsideDown ? ((frontRotation + 180) as SpreadRotation) : frontRotation;

  for (let baseIndex = 0; baseIndex < embeddedSpreads.length; baseIndex += pairSpan) {
    const frontSheet = outputDoc.addPage([sheetLayout.width, sheetLayout.height]);
    const backSheet = outputDoc.addPage([sheetLayout.width, sheetLayout.height]);

    for (let slotIndex = 0; slotIndex < sheetLayout.capacity; slotIndex += 1) {
      const frontSpread = embeddedSpreads[baseIndex + slotIndex * 2];
      const backSpread = embeddedSpreads[baseIndex + slotIndex * 2 + 1];
      const frontSlot = getSheetSlot(sheetLayout, slotIndex);
      const backSlot = getSheetSlot(sheetLayout, slotIndex, flipAxis);

      if (frontSpread) {
        drawPackedSpread(frontSheet, frontSpread, frontSlot, spreadWidth, spreadHeight, frontRotation);
        drawTrimMarks(frontSheet, frontSlot.x, frontSlot.y, frontSlot.width, frontSlot.height);
      }

      if (backSpread) {
        drawPackedSpread(backSheet, backSpread, backSlot, spreadWidth, spreadHeight, backRotation);
        drawTrimMarks(backSheet, backSlot.x, backSlot.y, backSlot.width, backSlot.height);
      }
    }
  }

  return {
    bytes: await outputDoc.save(),
    outputSheets: outputDoc.getPageCount() / 2,
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

// Turning a folded leaf keeps each page's "up" the same on both sides. When the printer's turn axis runs across the
// pages' up direction (e.g. long-edge on a landscape sheet), the back comes out upside down unless it is turned 180°.
function shouldTurnBacksUpsideDown(flipAxis: FlipAxis, spreadRotation: 0 | 90): boolean {
  return (flipAxis === "horizontal") !== (spreadRotation === 90);
}

async function turnBackSpreadsUpsideDown(bookletBytes: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const sourceDoc = await PDFDocument.load(bookletBytes);
  const outputDoc = await PDFDocument.create();
  const spreads = await outputDoc.embedPdf(bookletBytes, sourceDoc.getPageIndices());

  spreads.forEach((spread, index) => {
    const sheet = outputDoc.addPage([width, height]);
    drawPackedSpread(sheet, spread, { x: 0, y: 0, width, height }, width, height, index % 2 === 1 ? 180 : 0);
  });

  return outputDoc.save();
}

function drawPackedSpread(
  sheet: PDFPage,
  spread: PDFEmbeddedPage,
  slot: SlotRect,
  spreadWidth: number,
  spreadHeight: number,
  rotation: SpreadRotation,
): void {
  // pdf-lib rotates counter-clockwise around (x, y), so pick the slot corner that keeps the turned spread inside it.
  const origin = {
    0: { x: slot.x, y: slot.y },
    90: { x: slot.x + slot.width, y: slot.y },
    180: { x: slot.x + slot.width, y: slot.y + slot.height },
    270: { x: slot.x, y: slot.y + slot.height },
  }[rotation];

  sheet.drawPage(spread, {
    ...origin,
    width: spreadWidth,
    height: spreadHeight,
    rotate: degrees(rotation),
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
    outputSheets: buildPrinterPairs(paddedSlots.length).length / 2,
    spreadsPerOutputSheet: 1,
    detectedPdfShape: detectPdfShape(layout.slots),
    recommendedBlankPlacement: "before-back-cover",
    mismatchedSourcePages: layout.mismatchedSourceIndexes.map((index) => index + 1),
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
  foldBleed = 0,
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
  const { x: sourceX, y: sourceY } = sourcePage.getMediaBox();
  const halfWidth = sourceWidth / 2;

  if (slot.part === "left") {
    return {
      page: await outputDoc.embedPage(sourcePage, {
        left: sourceX,
        bottom: sourceY,
        right: sourceX + halfWidth + foldBleed,
        top: sourceY + sourceHeight,
      }),
      width: halfWidth,
      height: sourceHeight,
      foldBleed,
    };
  }

  if (slot.part === "right") {
    return {
      page: await outputDoc.embedPage(sourcePage, {
        left: sourceX + halfWidth,
        bottom: sourceY,
        right: sourceX + sourceWidth,
        top: sourceY + sourceHeight,
      }),
      width: halfWidth,
      height: sourceHeight,
      foldBleed: 0,
    };
  }

  return {
    page: await outputDoc.embedPage(sourcePage, {
      left: sourceX,
      bottom: sourceY,
      right: sourceX + sourceWidth,
      top: sourceY + sourceHeight,
    }),
    width: sourceWidth,
    height: sourceHeight,
    foldBleed: 0,
  };
}

function isWholeSourceSpread(
  leftSlot: SourceSlot,
  rightSlot: SourceSlot,
): leftSlot is SourceSlot & { sourceIndex: number } {
  return (
    leftSlot.sourceIndex !== null &&
    leftSlot.sourceIndex === rightSlot.sourceIndex &&
    leftSlot.part === "left" &&
    rightSlot.part === "right"
  );
}

function drawPagePair(
  sheet: PDFPage,
  leftPage: LogicalPage | null,
  rightPage: LogicalPage | null,
  pageWidth: number,
  pageHeight: number,
  leftOverlap: FoldOverlap,
): void {
  if (leftPage) {
    const rect = fitPage(leftPage, 0, 0, pageWidth, pageHeight);
    const scale = rect.width / leftPage.width;
    const width = leftOverlap.kind === "stretch" ? rect.width + FOLD_OVERLAP : rect.width + leftPage.foldBleed * scale;
    drawPage(sheet, leftPage, { ...rect, width });
  }

  if (rightPage) {
    drawPage(sheet, rightPage, fitPage(rightPage, pageWidth, 0, pageWidth, pageHeight));
  }
}

function resolveFoldOverlaps(
  printerPairs: [number, number][],
  slots: SourceSlot[],
  pageSizes: PageSize[],
  singlePage: PageSize,
): FoldOverlap[] {
  const overlaps: FoldOverlap[] = slots.map(() => ({ kind: "none" }));

  for (const [leftNumber, rightNumber] of printerPairs) {
    const leftSlot = slots[leftNumber - 1];
    const rightSlot = slots[rightNumber - 1];
    const leftSize = getLogicalPageSize(leftSlot, pageSizes);
    const rightSize = getLogicalPageSize(rightSlot, pageSizes);

    // Overlap only where two pages actually meet at the fold; next to a blank or letterboxed page it would show.
    if (
      isWholeSourceSpread(leftSlot, rightSlot) ||
      !leftSize ||
      !rightSize ||
      !reachesFold(leftSize, singlePage) ||
      !reachesFold(rightSize, singlePage)
    ) {
      continue;
    }

    overlaps[leftNumber - 1] =
      leftSlot.part === "left"
        ? { kind: "bleed", sourceWidth: (FOLD_OVERLAP * leftSize.width) / singlePage.width }
        : { kind: "stretch" };
  }

  return overlaps;
}

function getLogicalPageSize(slot: SourceSlot, pageSizes: PageSize[]): PageSize | null {
  if (slot.sourceIndex === null || slot.part === "blank") {
    return null;
  }

  const size = pageSizes[slot.sourceIndex];
  return slot.part === "full" ? size : { width: size.width / 2, height: size.height };
}

function reachesFold(size: PageSize, singlePage: PageSize): boolean {
  // A page reaches the fold when fitting it into the booklet page is limited by width, not height.
  return singlePage.width / size.width <= (singlePage.height / size.height) * (1 + 1e-6);
}

function fitPage(logicalPage: LogicalPage, x: number, y: number, width: number, height: number): SlotRect {
  const scale = Math.min(width / logicalPage.width, height / logicalPage.height);
  const drawWidth = logicalPage.width * scale;
  const drawHeight = logicalPage.height * scale;

  return {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}

function drawPage(sheet: PDFPage, logicalPage: LogicalPage, rect: SlotRect): void {
  sheet.drawPage(logicalPage.page, rect);
}
