# English-reading-skills
Improving English vocabulary through reading.

`vocab.py` turns the books you read into a personal word list with spaced-repetition review.

## Setup
```bash
pip install -r requirements.txt
```

## Workflow
1. **Get the book as plain text** (`.txt`), for example from [Project Gutenberg](https://www.gutenberg.org).
2. **Scan it** for uncommon words, each with the sentence where it appears:
   ```bash
   python vocab.py scan samples/sample.txt --top 30
   ```
   Words that show up several times in the book are listed first, because they're the most useful to learn.
   `--max-zipf` sets how rare a word must be (default 3.5; raise it to 4 to see more everyday words).
3. **Save the words you want to learn**, with a meaning in your own words:
   ```bash
   python vocab.py add taciturn -m "saying very little; reserved"
   ```
4. **Hide words you already know** so later scans skip them:
   ```bash
   python vocab.py known lantern harbour
   ```
5. **Review every day.** You see the word and its sentence with the word blanked out. Words you remember come back after 1, 3, 7, 14, then 30 days. Words you forget come back tomorrow.
   ```bash
   python vocab.py review
   ```
6. **Optional:** export to Anki (File → Import, comma-separated):
   ```bash
   python vocab.py export --out anki_cards.csv
   ```

Your progress is stored in `data/` (`words.json`, `known.txt`). Commit it if you want to keep it across machines.
