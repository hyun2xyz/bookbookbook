import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader, PdfWriter

from booklet_maker.pdf_engine import convert_pdf


class PdfEngineTests(unittest.TestCase):
    def test_convert_pdf_splits_spreads_pads_and_imposes_output(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "reader_spreads.pdf"
            output = Path(tmpdir) / "booklet.pdf"

            writer = PdfWriter()
            writer.add_blank_page(width=420, height=595)
            writer.add_blank_page(width=840, height=595)
            writer.add_blank_page(width=840, height=595)
            writer.add_blank_page(width=420, height=595)
            with source.open("wb") as handle:
                writer.write(handle)

            summary = convert_pdf(source, output, binding="left")

            reader = PdfReader(output)
            self.assertEqual(summary.original_pdf_pages, 4)
            self.assertEqual(summary.reader_pages_before_padding, 6)
            self.assertEqual(summary.reader_pages_after_padding, 8)
            self.assertEqual(summary.blank_pages_added, 2)
            self.assertEqual(summary.printer_spreads, 4)
            self.assertEqual(len(reader.pages), 4)
            self.assertAlmostEqual(float(reader.pages[0].mediabox.width), 840.0)
            self.assertAlmostEqual(float(reader.pages[0].mediabox.height), 595.0)


if __name__ == "__main__":
    unittest.main()

