import { describe, expect, it } from "vitest";

import {
  analyzeReaderLayout,
  buildPrinterPairs,
  buildReaderSlots,
  inferSinglePageSize,
  padSlotsForSaddleStitch,
} from "../src/imposition";

describe("browser imposition rules", () => {
  it("splits wide reader spreads into left and right logical pages", () => {
    const slots = buildReaderSlots([
      { width: 420, height: 595 },
      { width: 840, height: 595 },
      { width: 840, height: 595 },
      { width: 420, height: 595 },
    ]);

    expect(slots).toEqual([
      { sourceIndex: 0, part: "full" },
      { sourceIndex: 1, part: "left" },
      { sourceIndex: 1, part: "right" },
      { sourceIndex: 2, part: "left" },
      { sourceIndex: 2, part: "right" },
      { sourceIndex: 3, part: "full" },
    ]);
  });

  it("treats the first page of a spread-only PDF as the outside cover spread", () => {
    const pageSizes = [
      { width: 840, height: 595 },
      { width: 840, height: 595 },
      { width: 840, height: 595 },
    ];

    // Left-bound reader spreads are [back | front], [2 | 3], [4 | 5].
    expect(buildReaderSlots(pageSizes)).toEqual([
      { sourceIndex: 0, part: "right" },
      { sourceIndex: 1, part: "left" },
      { sourceIndex: 1, part: "right" },
      { sourceIndex: 2, part: "left" },
      { sourceIndex: 2, part: "right" },
      { sourceIndex: 0, part: "left" },
    ]);
    expect(inferSinglePageSize(pageSizes)).toEqual({ width: 420, height: 595 });
  });

  it("keeps the outside cover spread intact on the first printer sheet", () => {
    const pageSizes = Array.from({ length: 8 }, () => ({ width: 283.465, height: 170.079 }));
    const slots = padSlotsForSaddleStitch(buildReaderSlots(pageSizes, "left"));
    const [frontOfFirstSheet, backOfFirstSheet] = buildPrinterPairs(slots.length, "left");

    expect(frontOfFirstSheet.map((pageNumber) => slots[pageNumber - 1])).toEqual([
      { sourceIndex: 0, part: "left" },
      { sourceIndex: 0, part: "right" },
    ]);
    expect(backOfFirstSheet.map((pageNumber) => slots[pageNumber - 1])).toEqual([
      { sourceIndex: 1, part: "left" },
      { sourceIndex: 7, part: "right" },
    ]);
  });

  it("reads right-bound spread-only PDFs as [front | back] then right-to-left spreads", () => {
    const pageSizes = [
      { width: 840, height: 595 },
      { width: 840, height: 595 },
      { width: 840, height: 595 },
    ];

    // Right-bound reader spreads are [front | back], [3 | 2], [5 | 4].
    expect(buildReaderSlots(pageSizes, "right")).toEqual([
      { sourceIndex: 0, part: "left" },
      { sourceIndex: 1, part: "right" },
      { sourceIndex: 1, part: "left" },
      { sourceIndex: 2, part: "right" },
      { sourceIndex: 2, part: "left" },
      { sourceIndex: 0, part: "right" },
    ]);
  });

  it("reads right-bound reader spreads from right to left", () => {
    const slots = buildReaderSlots(
      [
        { width: 420, height: 595 },
        { width: 840, height: 595 },
        { width: 420, height: 595 },
      ],
      "right",
    );

    expect(slots).toEqual([
      { sourceIndex: 0, part: "full" },
      { sourceIndex: 1, part: "right" },
      { sourceIndex: 1, part: "left" },
      { sourceIndex: 2, part: "full" },
    ]);
  });

  it("uses the most common page size when only the cover has a different size", () => {
    const pageSizes = [
      { width: 198.425, height: 283.465 },
      ...Array.from({ length: 15 }, () => ({ width: 283.465, height: 425.197 })),
    ];
    const layout = analyzeReaderLayout(pageSizes);

    expect(layout.slots.every((slot) => slot.part === "full")).toBe(true);
    expect(layout.singlePage).toEqual({ width: 283.465, height: 425.197 });
    expect(layout.mismatchedSourceIndexes).toEqual([0]);
  });

  it("counts both halves of a spread when choosing the page size", () => {
    const pageSizes = [
      { width: 430, height: 605 },
      { width: 840, height: 595 },
      { width: 840, height: 595 },
      { width: 430, height: 605 },
    ];
    const layout = analyzeReaderLayout(pageSizes);

    expect(layout.slots).toHaveLength(6);
    expect(layout.singlePage).toEqual({ width: 420, height: 595 });
    expect(layout.mismatchedSourceIndexes).toEqual([0, 3]);
  });

  it("prefers the larger page size when page sizes are tied", () => {
    const layout = analyzeReaderLayout([
      { width: 198.425, height: 283.465 },
      { width: 283.465, height: 425.197 },
    ]);

    expect(layout.singlePage).toEqual({ width: 283.465, height: 425.197 });
    expect(layout.mismatchedSourceIndexes).toEqual([0]);
  });

  it("keeps ordinary one-page-per-sheet PDFs as full logical pages", () => {
    const pageSizes = [
      { width: 420, height: 595 },
      { width: 420, height: 595 },
      { width: 420, height: 595 },
    ];

    expect(buildReaderSlots(pageSizes)).toEqual([
      { sourceIndex: 0, part: "full" },
      { sourceIndex: 1, part: "full" },
      { sourceIndex: 2, part: "full" },
    ]);
    expect(inferSinglePageSize(pageSizes)).toEqual({ width: 420, height: 595 });
  });

  it("keeps very wide landscape PDFs as one-page-per-sheet PDFs", () => {
    const pageSizes = [
      { width: 1280, height: 720 },
      { width: 1280, height: 720 },
      { width: 1280, height: 720 },
      { width: 1280, height: 720 },
    ];

    expect(buildReaderSlots(pageSizes)).toEqual([
      { sourceIndex: 0, part: "full" },
      { sourceIndex: 1, part: "full" },
      { sourceIndex: 2, part: "full" },
      { sourceIndex: 3, part: "full" },
    ]);
    expect(inferSinglePageSize(pageSizes)).toEqual({ width: 1280, height: 720 });
  });

  it("pads blanks before the back cover so the final page count is divisible by four", () => {
    const slots = Array.from({ length: 30 }, (_value, index) => ({
      sourceIndex: index,
      part: "full" as const,
    }));

    const padded = padSlotsForSaddleStitch(slots);

    expect(padded).toHaveLength(32);
    expect(padded.at(-1)).toEqual({ sourceIndex: 29, part: "full" });
    expect(padded.at(-2)).toEqual({ sourceIndex: null, part: "blank" });
    expect(padded.at(-3)).toEqual({ sourceIndex: null, part: "blank" });
  });

  it("can pad blanks after the front cover when requested", () => {
    const slots = Array.from({ length: 6 }, (_value, index) => ({
      sourceIndex: index,
      part: "full" as const,
    }));

    const padded = padSlotsForSaddleStitch(slots, "after-front-cover");

    expect(padded).toHaveLength(8);
    expect(padded[0]).toEqual({ sourceIndex: 0, part: "full" });
    expect(padded[1]).toEqual({ sourceIndex: null, part: "blank" });
    expect(padded[2]).toEqual({ sourceIndex: null, part: "blank" });
    expect(padded.at(-1)).toEqual({ sourceIndex: 5, part: "full" });
  });

  it("can pad blanks before a custom reader page number", () => {
    const slots = Array.from({ length: 6 }, (_value, index) => ({
      sourceIndex: index,
      part: "full" as const,
    }));

    const padded = padSlotsForSaddleStitch(slots, { type: "before-page", pageNumber: 4 });

    expect(padded).toHaveLength(8);
    expect(padded[0]).toEqual({ sourceIndex: 0, part: "full" });
    expect(padded[1]).toEqual({ sourceIndex: 1, part: "full" });
    expect(padded[2]).toEqual({ sourceIndex: 2, part: "full" });
    expect(padded[3]).toEqual({ sourceIndex: null, part: "blank" });
    expect(padded[4]).toEqual({ sourceIndex: null, part: "blank" });
    expect(padded[5]).toEqual({ sourceIndex: 3, part: "full" });
  });

  it("can pad blanks at the end when requested", () => {
    const slots = Array.from({ length: 6 }, (_value, index) => ({
      sourceIndex: index,
      part: "full" as const,
    }));

    const padded = padSlotsForSaddleStitch(slots, "at-end");

    expect(padded).toHaveLength(8);
    expect(padded.at(-1)).toEqual({ sourceIndex: null, part: "blank" });
    expect(padded.at(-2)).toEqual({ sourceIndex: null, part: "blank" });
    expect(padded.at(-3)).toEqual({ sourceIndex: 5, part: "full" });
  });

  it("builds saddle-stitch printer pairs for left-bound books", () => {
    expect(buildPrinterPairs(16, "left")).toEqual([
      [16, 1],
      [2, 15],
      [14, 3],
      [4, 13],
      [12, 5],
      [6, 11],
      [10, 7],
      [8, 9],
    ]);
  });

  it("reverses each printer spread for right-bound books", () => {
    expect(buildPrinterPairs(8, "right")).toEqual([
      [1, 8],
      [7, 2],
      [3, 6],
      [5, 4],
    ]);
  });
});
