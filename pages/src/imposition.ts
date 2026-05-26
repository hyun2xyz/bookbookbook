export type SlotPart = "full" | "left" | "right" | "blank";
export type Binding = "left" | "right";
export type BlankPlacement = "before-back-cover" | "after-front-cover" | "at-end";

export interface PageSize {
  width: number;
  height: number;
}

export interface SourceSlot {
  sourceIndex: number | null;
  part: SlotPart;
}

export interface ReaderLayout {
  singlePage: PageSize;
  slots: SourceSlot[];
}

const SPREAD_WIDTH_MULTIPLIER = 1.5;
const ALL_SPREAD_ASPECT_RATIO = 1.25;

export function buildReaderSlots(pageSizes: PageSize[]): SourceSlot[] {
  return analyzeReaderLayout(pageSizes).slots;
}

export function analyzeReaderLayout(pageSizes: PageSize[]): ReaderLayout {
  if (pageSizes.length === 0) {
    throw new Error("PDF has no pages");
  }

  const singlePage = inferSinglePageSize(pageSizes);
  const slots: SourceSlot[] = [];

  pageSizes.forEach((size, index) => {
    if (size.width >= singlePage.width * SPREAD_WIDTH_MULTIPLIER) {
      slots.push({ sourceIndex: index, part: "left" });
      slots.push({ sourceIndex: index, part: "right" });
    } else {
      slots.push({ sourceIndex: index, part: "full" });
    }
  });

  return { singlePage, slots };
}

export function padSlotsForSaddleStitch(
  slots: SourceSlot[],
  blankPlacement: BlankPlacement = "before-back-cover",
): SourceSlot[] {
  if (slots.length === 0) {
    throw new Error("Cannot impose an empty document");
  }

  const missing = (4 - (slots.length % 4)) % 4;
  if (missing === 0) {
    return [...slots];
  }

  const blanks = Array.from({ length: missing }, () => ({
    sourceIndex: null,
    part: "blank" as const,
  }));

  if (blankPlacement === "after-front-cover") {
    return [slots[0], ...blanks, ...slots.slice(1)];
  }

  if (blankPlacement === "at-end") {
    return [...slots, ...blanks];
  }

  return [...slots.slice(0, -1), ...blanks, slots[slots.length - 1]];
}

export function buildPrinterPairs(totalPages: number, binding: Binding = "left"): [number, number][] {
  if (totalPages <= 0) {
    throw new Error("Total page count must be greater than zero");
  }

  if (totalPages % 4 !== 0) {
    throw new Error("Saddle-stitch page count must be divisible by four");
  }

  if (binding !== "left" && binding !== "right") {
    throw new Error("Binding must be 'left' or 'right'");
  }

  const pairs: [number, number][] = [];
  const sheetCount = totalPages / 4;

  for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
    let front: [number, number] = [totalPages - 2 * sheetIndex, 1 + 2 * sheetIndex];
    let back: [number, number] = [2 + 2 * sheetIndex, totalPages - 1 - 2 * sheetIndex];

    if (binding === "right") {
      front = [front[1], front[0]];
      back = [back[1], back[0]];
    }

    pairs.push(front, back);
  }

  return pairs;
}

export function inferSinglePageSize(pageSizes: PageSize[]): PageSize {
  if (pageSizes.length === 0) {
    throw new Error("PDF has no pages");
  }

  const smallestWidth = Math.min(...pageSizes.map((size) => size.width));

  if (smallestWidth <= 0) {
    throw new Error("PDF page width must be greater than zero");
  }

  if (shouldTreatUniformPagesAsSpreads(pageSizes)) {
    const narrowestSpread = pageSizes.reduce((smallest, current) => (current.width < smallest.width ? current : smallest));
    return { width: narrowestSpread.width / 2, height: narrowestSpread.height };
  }

  return pageSizes.reduce((smallest, current) => (current.width < smallest.width ? current : smallest));
}

function shouldTreatUniformPagesAsSpreads(pageSizes: PageSize[]): boolean {
  const widths = pageSizes.map((size) => size.width);
  const smallestWidth = Math.min(...widths);
  const largestWidth = Math.max(...widths);
  const hasMixedWidths = largestWidth >= smallestWidth * SPREAD_WIDTH_MULTIPLIER;

  if (hasMixedWidths) {
    return false;
  }

  // Uniform spread PDFs have no narrow cover page to reveal the single-page width.
  return pageSizes.every((size) => size.width / size.height >= ALL_SPREAD_ASPECT_RATIO);
}
