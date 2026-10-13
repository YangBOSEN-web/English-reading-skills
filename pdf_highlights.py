"""Read the highlights you made in a PDF (any reader that saves standard highlight annotations)."""
import re

import pymupdf

# A highlight of this many words or fewer is treated as vocabulary; longer ones are sentences.
MAX_VOCAB_WORDS = 3

MARKUP_TYPES = (pymupdf.PDF_ANNOT_HIGHLIGHT, pymupdf.PDF_ANNOT_UNDERLINE)


def _clean(text):
    text = re.sub(r"(\w)-\s+(\w)", r"\1\2", text)  # re-join words hyphenated across lines
    return re.sub(r"\s+", " ", text).strip()


def _sentences(page_text):
    return re.split(r"(?:(?<=[.!?])|(?<=[.!?][\"'”’]))\s+(?=[\"'“‘A-Z])", _clean(page_text))


def _highlighted_text(page, annot, words):
    """Collect the words whose centre lies inside one of the highlight's quads."""
    v = annot.vertices or []
    rects = [pymupdf.Quad(v[i:i + 4]).rect for i in range(0, len(v) - 3, 4)] or [annot.rect]
    picked = []
    for w in words:
        cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
        if any(r.x0 <= cx <= r.x1 and r.y0 <= cy <= r.y1 for r in rects):
            picked.append(w)
    picked.sort(key=lambda w: (w[5], w[6], w[7]))  # block, line, word number
    return _clean(" ".join(w[4] for w in picked))


def extract(path):
    """Yield one dict per highlight: kind ('word' or 'sentence'), text, context, note, page."""
    with pymupdf.open(path) as doc:
        for page in doc:
            annots = list(page.annots(types=MARKUP_TYPES))
            if not annots:
                continue
            words = page.get_text("words")
            sentences = _sentences(page.get_text())
            for annot in annots:
                text = _highlighted_text(page, annot, words)
                if not text:
                    continue
                note = (annot.info.get("content") or "").strip()
                bare = re.sub(r"^[^A-Za-z]+|[^A-Za-z]+$", "", text)
                if bare and len(bare.split()) <= MAX_VOCAB_WORDS:
                    context = next((s for s in sentences
                                    if re.search(rf"\b{re.escape(bare)}\b", s, re.I)), "")
                    yield {"kind": "word", "text": bare.lower(), "context": context,
                           "note": note, "page": page.number + 1}
                else:
                    yield {"kind": "sentence", "text": text, "context": "",
                           "note": note, "page": page.number + 1}
