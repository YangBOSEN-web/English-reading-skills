"""Build the weekly / monthly summary: a few lines for the terminal and a self-contained HTML page."""
import datetime as dt
import json
from collections import Counter
from html import escape

MASTERED_BOX = 4  # a word that has survived reviews 1, 3, 7 and 14 days apart


def stats(words, sentences, log, start, end):
    in_range = lambda d: start <= dt.date.fromisoformat(d) <= end
    new_words = {w: i for w, i in words.items() if in_range(i.get("added", "1970-01-01"))}
    new_sentences = [s for s in sentences if in_range(s["added"])]
    reviews = [r for r in log if in_range(r["date"])]
    misses = Counter(r["word"] for r in reviews if not r["ok"])
    books = Counter(i.get("source") or "(no book)" for i in new_words.values())
    for s in new_sentences:
        books[s["source"]] += 0  # list books you only collected sentences from, too
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "new_words": new_words,
        "new_sentences": new_sentences,
        "reviews": len(reviews),
        "remembered": sum(r["ok"] for r in reviews),
        "review_days": len({r["date"] for r in reviews}),
        "struggling": [(w, n) for w, n in misses.most_common(10) if w in words],
        "mastered": sorted(w for w, i in words.items() if i["box"] >= MASTERED_BOX),
        "total_words": len(words),
        "books": books,
    }


def text_summary(s, label):
    acc = f"{100 * s['remembered'] // s['reviews']}%" if s["reviews"] else "-"
    lines = [
        f"{label} summary, {s['start']} to {s['end']}",
        f"  New words:      {len(s['new_words'])}   (total in your list: {s['total_words']})",
        f"  New sentences:  {len(s['new_sentences'])}",
        f"  Reviews:        {s['reviews']} on {s['review_days']} day(s), {acc} remembered",
        f"  Mastered:       {len(s['mastered'])} words",
    ]
    if s["struggling"]:
        lines.append("  Keep practising: " + ", ".join(w for w, _ in s["struggling"]))
    return "\n".join(lines)


def _bold_word(sentence, word):
    """Escape a sentence for HTML and bold the first occurrence of word in it."""
    i = sentence.lower().find(word.lower())
    if i < 0:
        return escape(sentence)
    j = i + len(word)
    return f"{escape(sentence[:i])}<b>{escape(sentence[i:j])}</b>{escape(sentence[j:])}"


def html_page(s, label, words):
    acc = f"{100 * s['remembered'] // s['reviews']}%" if s["reviews"] else "–"
    tiles = [
        (len(s["new_words"]), "new words"),
        (len(s["new_sentences"]), "sentences"),
        (s["reviews"], "reviews"),
        (acc, "remembered"),
        (len(s["mastered"]), "mastered"),
    ]
    tiles_html = "".join(f'<div class="tile"><b>{v}</b><span>{t}</span></div>' for v, t in tiles)

    rows = "".join(
        f"<tr><td class='w'>{escape(w)}</td><td>{escape(i['meaning']) or '<i>no meaning yet</i>'}"
        f"<div class='ctx'>{_bold_word(i['example'], w)}</div></td>"
        f"<td class='src'>{escape(i.get('source', ''))}{' p.' + str(i['page']) if i.get('page') else ''}</td></tr>"
        for w, i in sorted(s["new_words"].items(), key=lambda kv: kv[1].get("added", ""))
    ) or "<tr><td colspan=3><i>No new words in this period.</i></td></tr>"

    quotes = "".join(
        f"<blockquote>{escape(q['text'])}"
        f"{'<p class=note>' + escape(q['note']) + '</p>' if q.get('note') else ''}"
        f"<cite>{escape(q['source'])}, p.{q['page']}</cite></blockquote>"
        for q in s["new_sentences"]
    ) or "<p><i>No sentences highlighted in this period.</i></p>"

    hard = "".join(f"<li><b>{escape(w)}</b>: missed {n}×, {escape(words[w]['meaning'])}</li>"
                   for w, n in s["struggling"]) or "<li>Nothing! Great work.</li>"

    books = "".join(f"<li>{escape(b)}</li>" for b in s["books"]) or "<li>–</li>"

    # Flashcards: this period's words plus the ones you keep missing.
    deck = {w: words[w] for w in list(s["new_words"]) + [w for w, _ in s["struggling"]]}
    cards = [{"w": w, "m": i["meaning"], "c": i["example"]} for w, i in deck.items()]
    cards_json = json.dumps(cards, ensure_ascii=False).replace("</", "<\\/")

    return TEMPLATE.format(label=label, start=s["start"], end=s["end"], tiles=tiles_html,
                           rows=rows, quotes=quotes, hard=hard, books=books, cards=cards_json)


TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reading Summary</title>
<style>
:root {{ --bg:#fbfaf7; --fg:#22211f; --muted:#6d6a63; --card:#fff; --line:#e6e2da; --accent:#2f6f5e; --mark:#fff1b8; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg:#181816; --fg:#ebe8e1; --muted:#a19d94; --card:#23221f; --line:#36342f; --accent:#7cc3ad; --mark:#5a4d17; }} }}
:root[data-theme="dark"] {{ --bg:#181816; --fg:#ebe8e1; --muted:#a19d94; --card:#23221f; --line:#36342f; --accent:#7cc3ad; --mark:#5a4d17; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:16px/1.55 Georgia, "Times New Roman", serif; }}
main {{ max-width:860px; margin:0 auto; padding:32px 16px 64px; }}
h1 {{ font-size:2rem; margin:0; }} h2 {{ font-size:1.25rem; margin:40px 0 12px; border-bottom:1px solid var(--line); padding-bottom:6px; }}
.sub {{ color:var(--muted); margin:4px 0 24px; font-family:system-ui, sans-serif; font-size:.9rem; }}
.tiles {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:10px; font-family:system-ui, sans-serif; }}
.tile {{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }}
.tile b {{ display:block; font-size:1.6rem; color:var(--accent); }} .tile span {{ color:var(--muted); font-size:.85rem; }}
table {{ width:100%; border-collapse:collapse; }} td {{ padding:10px 8px; border-bottom:1px solid var(--line); vertical-align:top; }}
td.w {{ font-weight:bold; white-space:nowrap; }} td.src {{ color:var(--muted); font-size:.8rem; font-family:system-ui, sans-serif; }}
.ctx {{ color:var(--muted); font-size:.92rem; margin-top:4px; font-style:italic; }} .ctx b {{ background:var(--mark); color:var(--fg); font-style:normal; }}
blockquote {{ margin:0 0 14px; padding:12px 16px; background:var(--card); border-left:3px solid var(--accent); border-radius:0 8px 8px 0; }}
blockquote cite {{ display:block; color:var(--muted); font-size:.8rem; margin-top:6px; font-style:normal; font-family:system-ui, sans-serif; }}
.note {{ margin:6px 0 0; color:var(--accent); font-size:.9rem; }}
#fc {{ font-family:system-ui, sans-serif; }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:14px; min-height:220px; padding:28px 22px; text-align:center; cursor:pointer;
  display:flex; flex-direction:column; justify-content:center; gap:12px; user-select:none; }}
.card .word {{ font:bold 1.9rem Georgia, serif; }} .card .c {{ color:var(--muted); font-style:italic; font-family:Georgia, serif; }}
.card .m {{ font-size:1.1rem; }} .hint {{ color:var(--muted); font-size:.8rem; }}
.btns {{ display:flex; gap:10px; justify-content:center; margin-top:14px; flex-wrap:wrap; }}
button {{ font:inherit; padding:10px 18px; border-radius:8px; border:1px solid var(--line); background:var(--card); color:var(--fg); cursor:pointer; }}
button.primary {{ background:var(--accent); border-color:var(--accent); color:var(--bg); }}
#progress {{ text-align:center; color:var(--muted); font-size:.85rem; margin-bottom:10px; }}
</style></head><body><main>
<h1>{label} reading summary</h1>
<p class="sub">{start} → {end}</p>
<div class="tiles">{tiles}</div>

<h2>Practise now</h2>
<div id="fc"><div id="progress"></div><div class="card" id="card"></div>
<div class="btns" id="btns"></div></div>

<h2>New words</h2><table>{rows}</table>
<h2>Words to keep practising</h2><ul>{hard}</ul>
<h2>Sentences you highlighted</h2>{quotes}
<h2>Books</h2><ul>{books}</ul>
</main>
<script>
const all = {cards};
let queue = [], flipped = false, done = 0, total = 0;
const $ = id => document.getElementById(id);
const esc = s => s.replace(/[&<>"]/g, ch => ({{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}})[ch]);
function blank(c, w) {{ return esc(c).replace(new RegExp("\\\\b" + w.replace(/[.*+?^${{}}()|[\\]\\\\]/g, "\\\\$&") + "\\\\w*", "gi"), "_____"); }}
function start() {{
  queue = all.slice().sort(() => Math.random() - .5); done = 0; total = queue.length; show();
}}
function show() {{
  flipped = false;
  if (!total) {{ $("card").innerHTML = "<div class='hint'>No words in this period yet.</div>"; $("btns").innerHTML = ""; return; }}
  if (!queue.length) {{
    $("progress").textContent = "";
    $("card").innerHTML = "<div class='word'>All done!</div><div class='hint'>You went through " + total + " words.</div>";
    $("btns").innerHTML = "<button class='primary' onclick='start()'>Practise again</button>"; return;
  }}
  const c = queue[0];
  $("progress").textContent = done + " / " + total + " remembered";
  $("card").innerHTML = "<div class='word'>" + esc(c.w) + "</div>" + (c.c ? "<div class='c'>" + blank(c.c, c.w) + "</div>" : "") +
    "<div class='hint'>Do you know it? Tap to reveal</div>";
  $("btns").innerHTML = "";
}}
function flip() {{
  if (flipped || !queue.length) return; flipped = true;
  const c = queue[0];
  $("card").innerHTML = "<div class='word'>" + esc(c.w) + "</div><div class='m'>" + esc(c.m || "(no meaning saved)") + "</div>" +
    (c.c ? "<div class='c'>" + esc(c.c) + "</div>" : "");
  $("btns").innerHTML = "<button onclick='answer(false)'>Again</button><button class='primary' onclick='answer(true)'>Got it</button>";
}}
function answer(ok) {{
  const c = queue.shift();
  if (ok) done++; else queue.splice(Math.min(3, queue.length), 0, c);  // a missed card comes back soon
  show();
}}
$("card").onclick = flip;
document.addEventListener("keydown", e => {{
  if (e.key === " ") {{ e.preventDefault(); flip(); }}
  else if (flipped && (e.key === "1" || e.key === "ArrowLeft")) answer(false);
  else if (flipped && (e.key === "2" || e.key === "ArrowRight")) answer(true);
}});
start();
</script></body></html>
"""
