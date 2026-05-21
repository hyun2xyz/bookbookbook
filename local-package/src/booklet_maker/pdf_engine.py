from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

from pypdf import PageObject, PdfReader, PdfWriter, Transformation

from .imposition import Binding, SourceSlot, build_printer_pairs, build_reader_slots, pad_slots_for_saddle_stitch


@dataclass(frozen=True)
class ConversionSummary:
    original_pdf_pages: int
    reader_pages_before_padding: int
    reader_pages_after_padding: int
    blank_pages_added: int
    printer_spreads: int
    output_path: str

    def to_dict(self) -> dict[str, int | str]:
        return asdict(self)


def convert_pdf(input_path: str | Path, output_path: str | Path, binding: Binding = "left") -> ConversionSummary:
    input_path = Path(input_path)
    output_path = Path(output_path)

    reader = PdfReader(str(input_path))
    page_sizes = [_page_size(page) for page in reader.pages]
    reader_slots = build_reader_slots(page_sizes)
    padded_slots = pad_slots_for_saddle_stitch(reader_slots)
    single_width, single_height = _infer_single_page_size(page_sizes)

    logical_pages = [
        _slot_to_page(reader, slot, single_width=single_width, single_height=single_height)
        for slot in padded_slots
    ]
    printer_pairs = build_printer_pairs(len(logical_pages), binding=binding)

    writer = PdfWriter()
    for left_number, right_number in printer_pairs:
        sheet = PageObject.create_blank_page(width=single_width * 2, height=single_height)
        left_page = logical_pages[left_number - 1]
        right_page = logical_pages[right_number - 1]

        sheet.merge_transformed_page(left_page, Transformation().translate(0, 0), expand=False)
        sheet.merge_transformed_page(right_page, Transformation().translate(single_width, 0), expand=False)
        writer.add_page(sheet)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as handle:
        writer.write(handle)

    return ConversionSummary(
        original_pdf_pages=len(reader.pages),
        reader_pages_before_padding=len(reader_slots),
        reader_pages_after_padding=len(padded_slots),
        blank_pages_added=len(padded_slots) - len(reader_slots),
        printer_spreads=len(printer_pairs),
        output_path=str(output_path),
    )


def _slot_to_page(
    reader: PdfReader,
    slot: SourceSlot,
    *,
    single_width: float,
    single_height: float,
) -> PageObject:
    target = PageObject.create_blank_page(width=single_width, height=single_height)

    if slot.part == "blank":
        return target

    if slot.source_index is None:
        raise ValueError("Non-blank page slot is missing a source page")

    source = reader.pages[slot.source_index]
    media = source.mediabox
    source_width = float(media.width)
    source_left = float(media.left)
    source_bottom = float(media.bottom)

    if slot.part == "right":
        x_offset = source_left + (source_width / 2)
    else:
        x_offset = source_left

    transform = Transformation().translate(-x_offset, -source_bottom)
    target.merge_transformed_page(source, transform, expand=False)
    return target


def _page_size(page: PageObject) -> tuple[float, float]:
    return float(page.mediabox.width), float(page.mediabox.height)


def _infer_single_page_size(page_sizes: list[tuple[float, float]]) -> tuple[float, float]:
    if not page_sizes:
        raise ValueError("PDF has no pages")

    single_width, single_height = min(page_sizes, key=lambda size: size[0])
    return single_width, single_height

