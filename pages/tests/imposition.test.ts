import { describe, expect, it } from "vitest";

import {
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

  it("splits every page when a PDF contains only reader spreads", () => {
    const pageSizes = [
      { width: 840, height: 595 },
      { width: 840, height: 595 },
    ];

    expect(buildReaderSlots(pageSizes)).toEqual([
      { sourceIndex: 0, part: "left" },
      { sourceIndex: 0, part: "right" },
      { sourceIndex: 1, part: "left" },
      { sourceIndex: 1, part: "right" },
    ]);
    expect(inferSinglePageSize(pageSizes)).toEqual({ width: 420, height: 595 });
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
