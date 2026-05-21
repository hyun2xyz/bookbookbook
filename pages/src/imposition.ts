export type SlotPart = "full" | "left" | "right" | "blank";
export type Binding = "left" | "right";

export interface PageSize {
  width: number;
  height: number;
}

export interface SourceSlot {
  sourceIndex: number | null;
  part: SlotPart;
}

export function buildReaderSlots(pageSizes: PageSize[]): SourceSlot[] {
  if (pageSizes.length === 0) {
    throw new Error("PDF has no pages");
  }

  const singleWidth = inferSinglePageWidth(pageSizes);
  const slots: SourceSlot[] = [];

  pageSizes.forEach((size, index) => {
    if (size.width >= singleWidth * 1.5) {
      slots.push({ sourceIndex: index, part: "left" });
      slots.push({ sourceIndex: index, part: "right" });
    } else {
      slots.push({ sourceIndex: index, part: "full" });
    }
  });

  return slots;
}

export function padSlotsForSaddleStitch(slots: SourceSlot[]): SourceSlot[] {
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

  return pageSizes.reduce((smallest, current) => (current.width < smallest.width ? current : smallest));
}

function inferSinglePageWidth(pageSizes: PageSize[]): number {
  const smallestWidth = Math.min(...pageSizes.map((size) => size.width));

  if (smallestWidth <= 0) {
    throw new Error("PDF page width must be greater than zero");
  }

  return smallestWidth;
}
