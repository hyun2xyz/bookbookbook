export type SlotPart = "full" | "left" | "right" | "blank";
export type Binding = "left" | "right";
export type PresetBlankPlacement = "before-back-cover" | "after-front-cover" | "at-end";
export type BlankPlacement = PresetBlankPlacement | { type: "before-page"; pageNumber: number };

export interface PageSize {
  width: number;
  height: number;
}

export interface SourceSlot {
  sourceIndex: number | null;
  part: SlotPart;
}

export interface ReaderLayout {
  /** Booklet page size: the most common logical page size in the PDF. */
  singlePage: PageSize;
  slots: SourceSlot[];
  /** Source page indexes whose logical page size differs from `singlePage`. */
  mismatchedSourceIndexes: number[];
}

const SPREAD_WIDTH_MULTIPLIER = 1.5;
const SPREAD_MIN_ASPECT_RATIO = 1.33;
const SPREAD_MAX_ASPECT_RATIO = 1.67;

export function buildReaderSlots(pageSizes: PageSize[], binding: Binding = "left"): SourceSlot[] {
  return analyzeReaderLayout(pageSizes, binding).slots;
}

export function analyzeReaderLayout(pageSizes: PageSize[], binding: Binding = "left"): ReaderLayout {
  if (pageSizes.length === 0) {
    throw new Error("PDF has no pages");
  }

  const splitReference = inferSplitReferenceSize(pageSizes);
  const splitPages = pageSizes.map(
    (size) => size.width >= splitReference.width * SPREAD_WIDTH_MULTIPLIER && isSpreadLikeAspectRatio(size),
  );
  const logicalSizes = pageSizes.map((size, index) =>
    splitPages[index] ? { width: size.width / 2, height: size.height } : size,
  );
  const singlePage = pickDominantPageSize(logicalSizes, splitPages);
  const singlePageKey = pageSizeKey(singlePage);

  return {
    singlePage,
    slots: orderReaderSlots(splitPages, binding),
    mismatchedSourceIndexes: logicalSizes.flatMap((size, index) => (pageSizeKey(size) === singlePageKey ? [] : [index])),
  };
}

function orderReaderSlots(splitPages: boolean[], binding: Binding): SourceSlot[] {
  // A reader spread shows the earlier page on the left for left binding and on the right for right binding.
  const [earlierHalf, laterHalf] = binding === "right" ? (["right", "left"] as const) : (["left", "right"] as const);
  const slots = splitPages.flatMap((isSpread, index): SourceSlot[] =>
    isSpread
      ? [
          { sourceIndex: index, part: earlierHalf },
          { sourceIndex: index, part: laterHalf },
        ]
      : [{ sourceIndex: index, part: "full" }],
  );

  if (!splitPages.every(Boolean)) {
    return slots;
  }

  // A spread-only PDF has no single front-cover page, so its first spread is the outside cover:
  // [back | front] for left binding and [front | back] for right binding. The rest are reader spreads.
  const [backCover, frontCover, ...insidePages] = slots;
  return [frontCover, ...insidePages, backCover];
}

function pickDominantPageSize(logicalSizes: PageSize[], splitPages: boolean[]): PageSize {
  const groups = new Map<string, { size: PageSize; count: number }>();

  logicalSizes.forEach((size, index) => {
    const key = pageSizeKey(size);
    const group = groups.get(key) ?? { size, count: 0 };
    group.count += splitPages[index] ? 2 : 1;
    groups.set(key, group);
  });

  // Most pages wins; ties prefer the larger page so nothing is shrunk to fit an odd small page.
  const [dominant] = [...groups.values()].sort(
    (a, b) => b.count - a.count || b.size.width * b.size.height - a.size.width * a.size.height,
  );
  return { width: dominant.size.width, height: dominant.size.height };
}

function pageSizeKey(size: PageSize): string {
  // Group sizes within about 1pt so rounding noise from PDF exporters does not split one page size in two.
  return `${Math.round(size.width)}x${Math.round(size.height)}`;
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

  if (typeof blankPlacement === "object" && blankPlacement.type === "before-page") {
    const insertIndex = Math.min(Math.max(Math.round(blankPlacement.pageNumber) - 1, 0), slots.length - 1);
    return [...slots.slice(0, insertIndex), ...blanks, ...slots.slice(insertIndex)];
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
  return analyzeReaderLayout(pageSizes).singlePage;
}

// The narrowest single page tells which wider pages are two-page spreads. It is not the booklet page size:
// a cover exported at a different size must not shrink every other page (see pickDominantPageSize).
function inferSplitReferenceSize(pageSizes: PageSize[]): PageSize {
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
  return pageSizes.every(isSpreadLikeAspectRatio);
}

function isSpreadLikeAspectRatio(size: PageSize): boolean {
  const aspectRatio = size.width / size.height;
  return aspectRatio >= SPREAD_MIN_ASPECT_RATIO && aspectRatio <= SPREAD_MAX_ASPECT_RATIO;
}
