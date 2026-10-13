#!/usr/bin/env python3
"""Learn vocabulary from the books you read.

  pdf      import the words and sentences you highlighted in a PDF
  review   quiz yourself with spaced repetition (Leitner boxes)
  summary  weekly / monthly report with flashcards (HTML)
  export   build an Anki deck (.apkg) or a CSV
  scan     find the uncommon words in a plain-text book
  add      save a word by hand
  known    mark words you already know so they are skipped

Run with no command for an interactive menu.
"""
import argparse
import csv
import datetime as dt
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

from wordfreq import zipf_frequency

DATA = Path(__file__).with_name("data")
REPORTS = Path(__file__).with_name("reports")
WORDS_FILE = DATA / "words.json"
KNOWN_FILE = DATA / "known.txt"
LAST_SCAN = DATA / "last_scan.json"
SENTENCES_FILE = DATA / "sentences.json"
IMPORTED_FILE = DATA / "imported.json"
REVIEW_LOG = DATA / "review_log.json"

# Days to wait before the next review, by Leitner box.
BOX_INTERVALS = [0, 1, 3, 7, 14, 30]

# Fixed ids so re-exporting updates your Anki deck instead of duplicating it.
ANKI_MODEL_ID = 1729384756
ANKI_DECK_ID = 2059183746


def load_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save_json(path, value):
    DATA.mkdir(exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def load_known():
    if not KNOWN_FILE.exists():
        return set()
    return {w.strip().lower() for w in KNOWN_FILE.read_text(encoding="utf-8").splitlines() if w.strip()}


def add_known(new):
    DATA.mkdir(exist_ok=True)
    known = load_known() | {w.lower() for w in new}
    KNOWN_FILE.write_text("\n".join(sorted(known)) + "\n", encoding="utf-8")
    return known


def new_word(meaning="", example="", source="", page=None):
    today = dt.date.today().isoformat()
    return {"meaning": meaning, "example": example, "source": source, "page": page,
            "box": 0, "due": today, "added": today}


_dictionary_online = True


def lookup(word):
    """Short definition from the free dictionaryapi.dev, or "" when offline or not found."""
    global _dictionary_online
    if not _dictionary_online:
        return ""
    url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + urllib.parse.quote(word)
    try:
        with urllib.request.urlopen(url, timeout=6) as r:
            entry = json.load(r)[0]
    except urllib.error.HTTPError:
        return ""  # the word isn't in the dictionary
    except (OSError, ValueError, IndexError):
        _dictionary_online = False  # offline: stop trying for the rest of this run
        print("  (dictionary not reachable, continuing without definitions)")
        return ""
    parts = [f"({m['partOfSpeech']}) {m['definitions'][0]['definition']}"
             for m in entry.get("meanings", [])[:2] if m.get("definitions")]
    return "; ".join(parts)


def split_sentences(text):
    text = re.sub(r"\s+", " ", text)
    return re.split(r"(?<=[.!?])\s+(?=[\"'A-Z])", text)


def base_form(word, vocab):
    """Fold simple inflections (cats, walked, running) onto a base form seen in the book."""
    candidates = []
    if word.endswith("ies"):
        candidates.append(word[:-3] + "y")
    if word.endswith("es"):
        candidates.append(word[:-2])
    if word.endswith("s") and not word.endswith("ss"):
        candidates.append(word[:-1])
    if word.endswith("ied"):
        candidates.append(word[:-3] + "y")
    if word.endswith("ed"):
        candidates += [word[:-2], word[:-1], word[:-3]]  # walked, saved, stopped
    if word.endswith("ing"):
        candidates += [word[:-3], word[:-3] + "e", word[:-4]]  # walking, making, running
    for c in candidates:
        if len(c) > 2 and c in vocab:
            return c
    return word


def cmd_pdf(args):
    from pdf_highlights import extract

    pdf = Path(args.pdf)
    book = args.book or pdf.stem
    imported = set(load_json(IMPORTED_FILE, []))
    words = load_json(WORDS_FILE, {})
    sentences = load_json(SENTENCES_FILE, [])
    known = load_known()
    today = dt.date.today().isoformat()

    fresh = []
    for h in extract(pdf):
        key = f"{pdf.name}|{h['page']}|{h['text']}"
        if key not in imported:
            imported.add(key)
            fresh.append(h)
    if not fresh:
        print("No new highlights since the last import.")
        return

    new_sentences = [h for h in fresh if h["kind"] == "sentence"]
    new_words = [h for h in fresh if h["kind"] == "word"
                 and h["text"] not in words and h["text"] not in known]
    new_words = list({h["text"]: h for h in reversed(new_words)}.values())[::-1]  # one per word
    print(f"Found {len(fresh)} new highlights: {len(new_words)} new words, {len(new_sentences)} sentences.\n")

    for s in new_sentences:
        sentences.append({"text": s["text"], "note": s["note"], "source": book,
                          "page": s["page"], "added": today})

    interactive = not args.yes
    if interactive and new_words:
        print("For each word: Enter = keep the suggested meaning, or type your own;\n"
              "  s = skip,  k = I already know it,  q = stop (the rest are saved without a meaning)\n")
    added = 0
    for i, h in enumerate(new_words, 1):
        word = h["text"]
        suggestion = h["note"] or (lookup(word) if not args.offline else "")
        meaning = suggestion
        if interactive:
            print(f"[{i}/{len(new_words)}] {word}   (p.{h['page']})")
            if h["context"]:
                print(f"  “{h['context']}”")
            print(f"  suggested: {suggestion or '(none)'}")
            answer = input("  meaning> ").strip()
            if answer.lower() == "q":
                interactive = False
            elif answer.lower() == "s":
                print()
                continue
            elif answer.lower() == "k":
                add_known([word])
                print()
                continue
            elif answer:
                meaning = answer
            print()
        words[word] = new_word(meaning, h["context"], book, h["page"])
        added += 1

    save_json(WORDS_FILE, words)
    save_json(SENTENCES_FILE, sentences)
    save_json(IMPORTED_FILE, sorted(imported))
    print(f"Saved {added} words and {len(new_sentences)} sentences from '{book}'. "
          f"You now have {len(words)} words.")
    missing = [w for w in words if not words[w]["meaning"]]
    if missing:
        print(f"{len(missing)} words have no meaning yet: {', '.join(missing[:10])}"
              f"{' ...' if len(missing) > 10 else ''}\n"
              "Add one with: python vocab.py add WORD -m 'meaning'")


def cmd_scan(args):
    text = Path(args.book).read_text(encoding="utf-8", errors="ignore")
    sentences = split_sentences(text)
    tokens = [w.lower() for w in re.findall(r"[A-Za-z]+(?:'[a-z]+)?", text)]
    raw_counts = Counter(t for t in tokens if "'" not in t)
    vocab = set(raw_counts)

    counts = Counter()
    for word, n in raw_counts.items():
        counts[base_form(word, vocab)] += n

    known = load_known() | set(load_json(WORDS_FILE, {}))
    picks = []
    for word, n in counts.most_common():
        if len(word) < 4 or word in known:
            continue
        zipf = zipf_frequency(word, "en")
        # zipf 0 means "not in the dictionary" -- usually a name or a typo.
        if not (0 < zipf <= args.max_zipf):
            continue
        # Skip proper nouns: words that only ever appear capitalised.
        if not re.search(rf"(?<![A-Za-z]){word}", text):
            continue
        example = next((s.strip() for s in sentences
                        if re.search(rf"\b{word}\w*\b", s, re.I)), "")
        picks.append({"word": word, "count": n, "zipf": zipf, "example": example})
        if len(picks) >= args.top:
            break

    save_json(LAST_SCAN, {"book": args.book, "words": picks})
    print(f"{'word':<18}{'times':>6}{'rarity':>8}  example")
    for p in picks:
        ex = p["example"] if len(p["example"]) <= 90 else p["example"][:87] + "..."
        print(f"{p['word']:<18}{p['count']:>6}{p['zipf']:>8.1f}  {ex}")
    print(f"\n{len(picks)} words. Lower rarity = less common. "
          "Save one with: python vocab.py add WORD -m 'meaning'")


def cmd_add(args):
    words = load_json(WORDS_FILE, {})
    word = args.word.lower()
    if word in words:  # update the meaning / example, keep the review progress
        words[word]["meaning"] = args.meaning or words[word]["meaning"]
        words[word]["example"] = args.example or words[word]["example"]
        save_json(WORDS_FILE, words)
        print(f"Updated '{word}'.")
        return
    scan = load_json(LAST_SCAN, {})
    hit = {p["word"]: p for p in scan.get("words", [])}.get(word, {})
    words[word] = new_word(
        meaning=args.meaning or "",
        example=args.example or hit.get("example", ""),
        source=Path(scan["book"]).stem if hit else "",
    )
    save_json(WORDS_FILE, words)
    print(f"Saved '{word}'. You now have {len(words)} words.")


def cmd_known(args):
    print(f"{len(add_known(args.words))} known words.")


def cmd_review(args):
    words = load_json(WORDS_FILE, {})
    today = dt.date.today()
    due = [w for w, info in words.items() if dt.date.fromisoformat(info["due"]) <= today]
    if not due:
        print("Nothing to review today. Read some more!")
        return
    print(f"{len(due)} words due. Press Enter to reveal, then answer y/n. Ctrl-C to stop.\n")
    right = 0
    log = load_json(REVIEW_LOG, [])
    try:
        for word in due:
            info = words[word]
            example = re.sub(rf"\b{re.escape(word)}\w*\b", "_____", info["example"], flags=re.I)
            print(f"  {word}\n  {example}" if example else f"  {word}")
            input("  (Enter to show meaning) ")
            print(f"  -> {info['meaning'] or '(no meaning saved yet)'}")
            ok = input("  Did you know it? [y/n] ").strip().lower().startswith("y")
            info["box"] = min(info["box"] + 1, len(BOX_INTERVALS) - 1) if ok else 0
            info["due"] = (today + dt.timedelta(days=BOX_INTERVALS[info["box"]] or 1)).isoformat()
            right += ok
            log.append({"date": today.isoformat(), "word": word, "ok": ok})
            print()
    except (KeyboardInterrupt, EOFError):
        print()
    save_json(WORDS_FILE, words)
    save_json(REVIEW_LOG, log)
    print(f"Done: {right} remembered. Progress saved.")


def cmd_summary(args):
    import report

    end = dt.date.today()
    days = {"week": 7, "month": 30}.get(args.period)
    start = end - dt.timedelta(days=days - 1) if days else dt.date(1970, 1, 1)
    label = {"week": "Weekly", "month": "Monthly"}.get(args.period, "All-time")

    words = load_json(WORDS_FILE, {})
    s = report.stats(words, load_json(SENTENCES_FILE, []), load_json(REVIEW_LOG, []), start, end)
    print(report.text_summary(s, label))

    REPORTS.mkdir(exist_ok=True)
    out = Path(args.out) if args.out else REPORTS / f"{args.period}-{end.isoformat()}.html"
    out.write_text(report.html_page(s, label, words), encoding="utf-8")
    print(f"\nFull report with flashcards: {out}  (open it in your browser)")


def cmd_export(args):
    words = load_json(WORDS_FILE, {})
    if args.out.endswith(".csv"):
        with open(args.out, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            for word, info in sorted(words.items()):
                writer.writerow([word, info["meaning"], info["example"]])
        print(f"Wrote {len(words)} cards to {args.out} (front, back, example).")
        return

    import genanki
    from html import escape

    model = genanki.Model(
        ANKI_MODEL_ID, "English reading vocab",
        fields=[{"name": "Word"}, {"name": "Meaning"}, {"name": "Context"}, {"name": "Source"}],
        templates=[{
            "name": "Word -> Meaning",
            "qfmt": "<div class=word>{{Word}}</div><div class=ctx>{{Context}}</div>",
            "afmt": "{{FrontSide}}<hr id=answer><div class=meaning>{{Meaning}}</div>"
                    "<div class=src>{{Source}}</div>",
        }],
        css=".card{font-family:Georgia,serif;text-align:center;font-size:20px}"
            ".word{font-size:32px;font-weight:bold;margin-bottom:12px}"
            ".ctx{font-style:italic;color:#777}.ctx b{color:#2f6f5e;font-style:normal}"
            ".meaning{font-size:22px}.src{font-size:13px;color:#999;margin-top:14px}",
    )
    deck = genanki.Deck(ANKI_DECK_ID, args.deck)
    for word, info in sorted(words.items()):
        context = re.sub(rf"\b({re.escape(word)}\w*)", r"<b>\1</b>", escape(info["example"]),
                         count=1, flags=re.I)
        source = escape(info.get("source") or "")
        if info.get("page"):
            source += f", p.{info['page']}"
        deck.add_note(genanki.Note(
            model=model, fields=[escape(word), escape(info["meaning"]), context, source],
            guid=genanki.guid_for("english-reading", word),
        ))
    genanki.Package(deck).write_to_file(args.out)
    print(f"Wrote {len(words)} cards to {args.out}. In Anki: File -> Import, then pick this file.\n"
          "Re-exporting later updates the same cards, so your Anki progress is kept.")


MENU = """
What would you like to do?
  1  Import highlights from a PDF
  2  Review today's words
  3  Weekly summary
  4  Monthly summary
  5  Export Anki deck
  6  Scan a plain-text book for new words
  q  Quit
"""


def interactive_menu():
    words = load_json(WORDS_FILE, {})
    today = dt.date.today()
    due = sum(dt.date.fromisoformat(i["due"]) <= today for i in words.values())
    print(f"English reading vocab: {len(words)} words saved, {due} due for review today.")
    while True:
        print(MENU)
        try:
            choice = input("> ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print()
            return
        ns = argparse.Namespace
        if choice == "1":
            path = input("PDF file path: ").strip().strip("'\"")
            if Path(path).is_file():
                cmd_pdf(ns(pdf=path, book=None, yes=False, offline=False))
            else:
                print("File not found.")
        elif choice == "2":
            cmd_review(ns())
        elif choice in ("3", "4"):
            cmd_summary(ns(period="week" if choice == "3" else "month", out=None))
        elif choice == "5":
            cmd_export(ns(out="english_reading.apkg", deck="English Reading"))
        elif choice == "6":
            path = input("Text file path: ").strip().strip("'\"")
            if Path(path).is_file():
                cmd_scan(ns(book=path, top=40, max_zipf=3.5))
            else:
                print("File not found.")
        elif choice in ("q", "quit", "exit"):
            return


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers()

    p = sub.add_parser("pdf", help="import your highlights from a PDF")
    p.add_argument("pdf")
    p.add_argument("--book", help="book title to show on cards (default: the file name)")
    p.add_argument("-y", "--yes", action="store_true", help="don't ask, keep the suggested meanings")
    p.add_argument("--offline", action="store_true", help="don't look words up in the online dictionary")
    p.set_defaults(func=cmd_pdf)

    p = sub.add_parser("review", help="spaced-repetition quiz")
    p.set_defaults(func=cmd_review)

    p = sub.add_parser("summary", help="weekly / monthly report with flashcards")
    p.add_argument("period", nargs="?", choices=["week", "month", "all"], default="week")
    p.add_argument("--out", help="where to write the HTML report")
    p.set_defaults(func=cmd_summary)

    p = sub.add_parser("export", help="export an Anki deck (.apkg) or CSV")
    p.add_argument("--out", default="english_reading.apkg", help="file name; end it in .csv for CSV")
    p.add_argument("--deck", default="English Reading", help="Anki deck name")
    p.set_defaults(func=cmd_export)

    p = sub.add_parser("scan", help="find uncommon words in a plain-text book")
    p.add_argument("book")
    p.add_argument("--top", type=int, default=40, help="how many words to show")
    p.add_argument("--max-zipf", type=float, default=3.5,
                   help="only words at most this common (7=very common, 3=uncommon)")
    p.set_defaults(func=cmd_scan)

    p = sub.add_parser("add", help="save a word by hand (or update its meaning)")
    p.add_argument("word")
    p.add_argument("-m", "--meaning")
    p.add_argument("-e", "--example", help="your own example sentence")
    p.set_defaults(func=cmd_add)

    p = sub.add_parser("known", help="mark words you already know")
    p.add_argument("words", nargs="+")
    p.set_defaults(func=cmd_known)

    args = parser.parse_args()
    if hasattr(args, "func"):
        args.func(args)
    else:
        interactive_menu()


if __name__ == "__main__":
    main()
