#!/usr/bin/env python3
"""Learn vocabulary from the books you read.

  scan    find the uncommon words in a book, with an example sentence for each
  add     save a word (and its sentence from the book) to your word list
  known   mark words you already know so scans skip them
  review  quiz yourself with spaced repetition (Leitner boxes)
  export  write your word list as a CSV you can import into Anki
"""
import argparse
import csv
import datetime as dt
import json
import re
from collections import Counter
from pathlib import Path

from wordfreq import zipf_frequency

DATA = Path(__file__).with_name("data")
WORDS_FILE = DATA / "words.json"
KNOWN_FILE = DATA / "known.txt"
LAST_SCAN = DATA / "last_scan.json"

# Days to wait before the next review, by Leitner box.
BOX_INTERVALS = [0, 1, 3, 7, 14, 30]


def load_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save_json(path, value):
    DATA.mkdir(exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def load_known():
    if not KNOWN_FILE.exists():
        return set()
    return {w.strip().lower() for w in KNOWN_FILE.read_text(encoding="utf-8").split() if w.strip()}


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
    scan = {p["word"]: p for p in load_json(LAST_SCAN, {}).get("words", [])}
    hit = scan.get(args.word.lower(), {})
    words[args.word.lower()] = {
        "meaning": args.meaning or "",
        "example": args.example or hit.get("example", ""),
        "source": load_json(LAST_SCAN, {}).get("book", "") if hit else "",
        "box": 0,
        "due": dt.date.today().isoformat(),
    }
    save_json(WORDS_FILE, words)
    print(f"Saved '{args.word}'. You now have {len(words)} words.")


def cmd_known(args):
    DATA.mkdir(exist_ok=True)
    known = load_known() | {w.lower() for w in args.words}
    KNOWN_FILE.write_text("\n".join(sorted(known)) + "\n", encoding="utf-8")
    print(f"{len(known)} known words.")


def cmd_review(args):
    words = load_json(WORDS_FILE, {})
    today = dt.date.today()
    due = [w for w, info in words.items() if dt.date.fromisoformat(info["due"]) <= today]
    if not due:
        print("Nothing to review today. Read some more!")
        return
    print(f"{len(due)} words due. Press Enter to reveal, then answer y/n. Ctrl-C to stop.\n")
    right = 0
    try:
        for word in due:
            info = words[word]
            example = re.sub(rf"\b{word}\w*\b", "_____", info["example"], flags=re.I)
            print(f"  {word}\n  {example}" if example else f"  {word}")
            input("  (Enter to show meaning) ")
            print(f"  -> {info['meaning'] or '(no meaning saved yet)'}")
            ok = input("  Did you know it? [y/n] ").strip().lower().startswith("y")
            info["box"] = min(info["box"] + 1, len(BOX_INTERVALS) - 1) if ok else 0
            info["due"] = (today + dt.timedelta(days=BOX_INTERVALS[info["box"]] or 1)).isoformat()
            right += ok
            print()
    except (KeyboardInterrupt, EOFError):
        print()
    save_json(WORDS_FILE, words)
    print(f"Done: {right} remembered. Progress saved.")


def cmd_export(args):
    words = load_json(WORDS_FILE, {})
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for word, info in sorted(words.items()):
            writer.writerow([word, info["meaning"], info["example"]])
    print(f"Wrote {len(words)} cards to {args.out} (front, back, example).")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(required=True)

    p = sub.add_parser("scan", help="find uncommon words in a book (.txt)")
    p.add_argument("book")
    p.add_argument("--top", type=int, default=40, help="how many words to show")
    p.add_argument("--max-zipf", type=float, default=3.5,
                   help="only words at most this common (7=very common, 3=uncommon)")
    p.set_defaults(func=cmd_scan)

    p = sub.add_parser("add", help="save a word to your list")
    p.add_argument("word")
    p.add_argument("-m", "--meaning")
    p.add_argument("-e", "--example", help="your own example sentence")
    p.set_defaults(func=cmd_add)

    p = sub.add_parser("known", help="mark words you already know")
    p.add_argument("words", nargs="+")
    p.set_defaults(func=cmd_known)

    p = sub.add_parser("review", help="spaced-repetition quiz")
    p.set_defaults(func=cmd_review)

    p = sub.add_parser("export", help="export to an Anki-ready CSV")
    p.add_argument("--out", default="anki_cards.csv")
    p.set_defaults(func=cmd_export)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
