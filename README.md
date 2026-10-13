# English-reading-skills
Improving English vocabulary through reading.

Read PDF books, highlight what matters, and turn your highlights into flashcards, Anki cards and weekly or monthly summaries.

## Setup
```bash
pip install -r requirements.txt
```

## The workflow

### 1. Read and highlight
Read your PDF in any app that saves highlights into the file (Adobe Acrobat Reader, Preview on Mac, Foxit, Edge, Xodo, Okular, ...).

- **Highlight a word or a short phrase (1–3 words)** you don't know. It becomes a **vocabulary card**.
- **Highlight a longer passage** you find meaningful. It's saved as a **favorite sentence**.
- *Optional:* add a **note/comment** on a highlight. For a word, the note becomes its meaning; for a sentence, it's shown next to the quote.

### 2. Import after each reading session
```bash
python vocab.py pdf mybook.pdf --book "The Great Gatsby"
```
Only highlights you haven't imported before are read, so run it after every chapter. For each new word you see the sentence it came from and a suggested dictionary definition. Then:

| type | to |
|---|---|
| *Enter* | keep the suggested meaning |
| your own words | save your own meaning (best for remembering!) |
| `s` | skip this word |
| `k` | "I already know it" (won't be asked again) |
| `q` | stop asking, save the rest as-is |

Use `-y` to accept all suggestions without asking, or `--offline` to skip the dictionary.

### 3. Review a few minutes every day
```bash
python vocab.py review
```
The word is shown with its sentence, with the word itself blanked out. Words you remember come back after 1, 3, 7, 14, then 30 days. Words you forget come back tomorrow.

### 4. Anki (optional)
```bash
python vocab.py export            # writes english_reading.apkg
```
In Anki: *File → Import*. Each card shows the word and the sentence from your book; the back shows the meaning and the page. Re-export any time: existing cards are updated, not duplicated, and your Anki progress is kept.

### 5. Weekly / monthly summary
```bash
python vocab.py summary week      # or: month, all
```
It prints a short summary and writes `reports/week-YYYY-MM-DD.html`. Open that file in your browser to see:
- new words, sentences, reviews, % remembered, words mastered
- **flashcards you can click** for this period's words plus the ones you keep missing (also works on a phone; keys: space to flip, 1 = again, 2 = got it)
- the full list of new words with their sentences
- the sentences you highlighted, with your notes

### Interactive menu
Just run
```bash
python vocab.py
```
and pick from the menu: import a PDF, review, weekly/monthly summary, export.

## Try it
`samples/sample_highlighted.pdf` already has a few highlights (one with a note):
```bash
python vocab.py pdf samples/sample_highlighted.pdf --book "The Lighthouse Keeper"
python vocab.py summary week
```

## Other commands
- `python vocab.py scan book.txt`: list the uncommon words in a plain-text book (no highlighting needed).
- `python vocab.py add WORD -m "meaning"`: add a word by hand, or fix the meaning of a saved one.
- `python vocab.py known WORD ...`: mark words you already know.

Your progress lives in `data/` (`words.json`, `sentences.json`, `review_log.json`, `known.txt`). Commit it if you want to keep it across computers.

## Tests
```bash
python -m unittest discover tests
```
