from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Literal


SlotPart = Literal["full", "left", "right", "blank"]
Binding = Literal["left", "right"]


@dataclass(frozen=True)
class SourceSlot:
    source_index: int | None
    part: SlotPart


def build_reader_slots(page_sizes: Iterable[tuple[float, float]]) -> list[SourceSlot]:
    sizes = list(page_sizes)
    if not sizes:
        raise ValueError("PDF has no pages")

    single_width = _infer_single_page_width(sizes)
    slots: list[SourceSlot] = []

    for index, (width, _height) in enumerate(sizes):
        if width >= single_width * 1.5:
            slots.append(SourceSlot(index, "left"))
            slots.append(SourceSlot(index, "right"))
        else:
            slots.append(SourceSlot(index, "full"))

    return slots


def pad_slots_for_saddle_stitch(slots: list[SourceSlot]) -> list[SourceSlot]:
    if not slots:
        raise ValueError("Cannot impose an empty document")

    missing = (-len(slots)) % 4
    if missing == 0:
        return list(slots)

    blanks = [SourceSlot(None, "blank") for _ in range(missing)]
    return [*slots[:-1], *blanks, slots[-1]]


def build_printer_pairs(total_pages: int, binding: Binding = "left") -> list[tuple[int, int]]:
    if total_pages <= 0:
        raise ValueError("Total page count must be greater than zero")
    if total_pages % 4 != 0:
        raise ValueError("Saddle-stitch page count must be divisible by four")
    if binding not in ("left", "right"):
        raise ValueError("Binding must be 'left' or 'right'")

    pairs: list[tuple[int, int]] = []
    sheet_count = total_pages // 4

    for sheet_index in range(sheet_count):
        front = (total_pages - (2 * sheet_index), 1 + (2 * sheet_index))
        back = (2 + (2 * sheet_index), total_pages - 1 - (2 * sheet_index))

        if binding == "right":
            front = (front[1], front[0])
            back = (back[1], back[0])

        pairs.append(front)
        pairs.append(back)

    return pairs


def _infer_single_page_width(page_sizes: list[tuple[float, float]]) -> float:
    widths = [width for width, _height in page_sizes]
    smallest_width = min(widths)

    if smallest_width <= 0:
        raise ValueError("PDF page width must be greater than zero")

    return smallest_width

