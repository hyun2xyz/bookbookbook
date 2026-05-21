import unittest

from booklet_maker.imposition import (
    SourceSlot,
    build_printer_pairs,
    build_reader_slots,
    pad_slots_for_saddle_stitch,
)


class ImpositionTests(unittest.TestCase):
    def test_build_reader_slots_splits_wide_reader_spreads(self):
        page_sizes = [
            (420.0, 595.0),
            (840.0, 595.0),
            (840.0, 595.0),
            (420.0, 595.0),
        ]

        slots = build_reader_slots(page_sizes)

        self.assertEqual(
            [(slot.source_index, slot.part) for slot in slots],
            [
                (0, "full"),
                (1, "left"),
                (1, "right"),
                (2, "left"),
                (2, "right"),
                (3, "full"),
            ],
        )

    def test_pad_slots_for_saddle_stitch_keeps_back_cover_last(self):
        slots = [SourceSlot(i, "full") for i in range(30)]

        padded = pad_slots_for_saddle_stitch(slots)

        self.assertEqual(len(padded), 32)
        self.assertEqual(padded[-1], SourceSlot(29, "full"))
        self.assertEqual(padded[-2].part, "blank")
        self.assertEqual(padded[-3].part, "blank")

    def test_build_printer_pairs_for_left_bound_book(self):
        pairs = build_printer_pairs(16, binding="left")

        self.assertEqual(
            pairs,
            [
                (16, 1),
                (2, 15),
                (14, 3),
                (4, 13),
                (12, 5),
                (6, 11),
                (10, 7),
                (8, 9),
            ],
        )

    def test_build_printer_pairs_for_right_bound_book_reverses_each_spread(self):
        pairs = build_printer_pairs(8, binding="right")

        self.assertEqual(
            pairs,
            [
                (1, 8),
                (7, 2),
                (3, 6),
                (5, 4),
            ],
        )


if __name__ == "__main__":
    unittest.main()

