#!/usr/bin/env python3
"""Build the app's offline dictionary from ECDICT (https://github.com/skywind3000/ECDICT, MIT).

    curl -LO https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
    python tools/build_dictionary.py ecdict.csv

Writes docs/dict/<letter>.json with entries
    word: [phonetic, english, chinese]            a base word
    word: [phonetic, english, chinese, base]      a common word that is also a form of `base` (found -> find)
    form: "@base"                                 an inflected form (ran -> run)
"""
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "dict"
WORD = re.compile(r"^[a-z][a-z'-]*( [a-z][a-z'-]*){0,3}$")
MAX_SENSES = 3


def shard(word):
    c = word[0]
    return c if "a" <= c <= "z" else "_"


def trim(text, limit):
    lines = [l.strip() for l in text.replace("\\n", "\n").split("\n") if l.strip()]
    return "\n".join(lines[:limit])


def base_of(row):
    """The word this row is an inflection of, or "" (ECDICT stores it as "0:base" in exchange)."""
    for part in row["exchange"].split("/"):
        if part.startswith("0:") and part[2:] != row["word"]:
            return part[2:].lower()
    return ""


def keep(row):
    word = row["word"]
    if not WORD.match(word) or not row["translation"].strip():
        return False
    common = int(row["bnc"] or 0) > 0 or int(row["frq"] or 0) > 0
    return common or bool(row["collins"] or row["oxford"] or row["tag"])


def main(src):
    csv.field_size_limit(10**9)
    entries, forms = {}, {}
    with open(src, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            word = row["word"].strip()
            if word != word.lower() or not keep(row):
                continue
            base = base_of(row)
            if base and int(row["bnc"] or 0) == 0 and not row["collins"]:
                continue  # a plain inflected form: reached through its base word's "exchange" field
            entries[word] = [row["phonetic"], trim(row["definition"], MAX_SENSES),
                             trim(row["translation"], MAX_SENSES)] + ([base] if base else [])
            for part in row["exchange"].split("/"):
                kind, _, form = part.partition(":")
                if kind in "pdi3sr t" and form and form != word and " " not in form:
                    forms.setdefault(form.lower(), word)

    shards = defaultdict(dict)
    for word, entry in entries.items():
        shards[shard(word)][word] = entry
    for form, base in forms.items():
        if form not in entries and WORD.match(form):
            shards[shard(form)][form] = "@" + base

    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, data in sorted(shards.items()):
        path = OUT / f"{name}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        total += path.stat().st_size
    print(f"{len(entries)} words, {len(forms)} word forms, {total / 1e6:.1f} MB in {len(shards)} files")


if __name__ == "__main__":
    main(sys.argv[1])
