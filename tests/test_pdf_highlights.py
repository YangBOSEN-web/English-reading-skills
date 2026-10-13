import sys
import tempfile
import unittest
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pdf_highlights import extract  # noqa: E402

SAMPLE = Path(__file__).resolve().parent.parent / "samples" / "sample.txt"


def make_pdf(path, highlights, notes=None):
    """Write sample.txt into a PDF and highlight each phrase in `highlights`."""
    notes = notes or {}
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_textbox(pymupdf.Rect(50, 50, 545, 800), SAMPLE.read_text(), fontsize=11)
    for phrase in highlights:
        quads = page.search_for(phrase, quads=True)
        assert quads, phrase
        if " " not in phrase:
            quads = quads[:1]  # only the first occurrence of a single word
        annot = page.add_highlight_annot(quads)
        if phrase in notes:
            annot.set_info(content=notes[phrase])
            annot.update()
    doc.save(path)


class ExtractTest(unittest.TestCase):
    def test_words_sentences_and_notes(self):
        sentence = "When a schooner foundered on the rocks, it was his tenacity that saved the crew"
        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / "book.pdf"
            make_pdf(pdf, ["taciturn", "capricious", sentence],
                     notes={"capricious": "changing mood suddenly"})
            got = list(extract(pdf))

        words = {h["text"]: h for h in got if h["kind"] == "word"}
        sentences = [h for h in got if h["kind"] == "sentence"]
        self.assertEqual(set(words), {"taciturn", "capricious"})
        self.assertEqual(words["capricious"]["note"], "changing mood suddenly")
        self.assertIn("turbulent and capricious", words["capricious"]["context"])
        self.assertEqual(words["taciturn"]["page"], 1)
        self.assertEqual(len(sentences), 1)
        self.assertIn(sentence, sentences[0]["text"])  # may keep trailing punctuation


if __name__ == "__main__":
    unittest.main()
