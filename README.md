# English-reading-skills
Improving English vocabulary through reading.

Read PDF books, highlight what matters, and turn your highlights into flashcards, Anki cards and weekly or monthly summaries.

There are two ways to use it:
- **📱 Reading Words app**: works in the browser on laptop and iPhone, offline, nothing to install. Share the link with friends.
- **💻 Python tool** (`vocab.py`): the same idea in the terminal.

---

# 📱 Reading Words app

**Open it:** https://yangbosen-web.github.io/English-reading-skills/

- **Offline**: after the first visit it works with no internet, including the built-in English–Chinese dictionary (48,000 words, English + 中文 meanings, phonetics, and word forms such as *ran → run*).
- **PDF highlights**: highlight words (1–3 words) and sentences in your PDF, then choose the file in **Add**. Only new highlights are imported.
- **Paper books**: on iPhone, open the photo of the page, press and hold the text, **Copy**, paste it in **Add**, and tap the words you don't know.
- **Review**: flashcards with spaced repetition (1, 3, 7, 14, 30 days). Each card shows the sentence from *your* book.
- **Summary**: this week / month / all time, words you keep missing, your favorite sentences. **Share summary** sends it to a friend.
- **Cambridge 剑桥词典** button on every word (needs internet).
- **Anki**: export a CSV with word, English + Chinese meaning and your example sentence.
- **Private**: words are stored only on your device. Use **More → Make backup** now and then, and **Restore / merge** to move words between laptop and phone (AirDrop works).

### Install on iPhone
Open the link in **Safari** → **Share** → **Add to Home Screen**. It gets its own icon and opens like a normal app.

For PDFs on iPhone, highlight in an app that saves standard highlights into the file: **Adobe Acrobat Reader** (free), PDF Expert or Xodo.
(Apple Books and the Files app don't save highlights in a form other apps can read.)

### Publishing the app (one time, for the repo owner)
1. Repo **Settings → General → Danger Zone → Change visibility → Public**.
2. Repo **Settings → Pages**: *Source* **Deploy from a branch**, *Branch* **English-reading**, folder **/docs**, **Save**.
3. After a minute the app is live at https://yangbosen-web.github.io/English-reading-skills/

### For developers
- The app is plain HTML/JS in `docs/`, no build step. Run it locally with `cd docs && python3 -m http.server`, then open http://localhost:8000.
- After changing app files, bump `SHELL` in `docs/sw.js` so installed copies update.
- The dictionary is generated from [ECDICT](https://github.com/skywind3000/ECDICT) (MIT) by `tools/build_dictionary.py`.
  PDF reading uses [pdf.js](https://mozilla.github.io/pdf.js/) (Apache 2.0), vendored in `docs/vendor/pdfjs`.

---

# 💻 Python tool

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
