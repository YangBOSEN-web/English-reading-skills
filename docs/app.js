// Reading Words: learn English vocabulary from the books you read. Everything stays on this device.

const STORE_KEY = "reading-words-v1";
const INTERVALS = [0, 1, 3, 7, 14, 30]; // days until the next review, by Leitner box
const MASTERED_BOX = 4;
const CAMBRIDGE = "https://dictionary.cambridge.org/dictionary/english-chinese-simplified/";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $("#view");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ---------- dates (local days, YYYY-MM-DD) ---------- */
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => isoDay(new Date());
function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}

/* ---------- storage ---------- */
function emptyDb() {
  return { words: {}, sentences: [], log: [], imported: [], lastBook: "", theme: "" };
}
function loadDb() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY));
    if (d && typeof d.words === "object") return Object.assign(emptyDb(), d);
  } catch { /* private mode or corrupt data: start empty */ }
  return emptyDb();
}
let db = loadDb();
function saveDb() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
    return true;
  } catch {
    toast("Couldn't save on this device. Please make a backup in More.");
    return false;
  }
}
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- offline dictionary ---------- */
const shards = {};
function shard(letter) {
  if (!/^[a-z]$/.test(letter)) return Promise.resolve(null);
  shards[letter] ??= fetch(`dict/${letter}.json`)
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
    .then(d => { if (!d) delete shards[letter]; return d; });
  return shards[letter];
}
export function cleanWord(raw) {
  return String(raw).toLowerCase().replace(/[’‘`]/g, "'").replace(/^[^a-z]+|[^a-z]+$/g, "").replace(/\s+/g, " ");
}
async function rawEntry(w) {
  const d = await shard(w[0]);
  return d ? d[w] : undefined;
}
// -> {word, form, phonetic, en, zh, also} or null. `form` is what was looked up when it is an inflection.
async function lookup(raw) {
  let w = cleanWord(raw);
  if (!w) return null;
  const tries = [w];
  if (w.endsWith("'s")) tries.push(w.slice(0, -2));
  if (w.includes("-")) tries.push(w.replace(/-/g, " "), w.replace(/-/g, ""));
  for (const t of tries) {
    let e = await rawEntry(t), word = t, form = t === w ? "" : w;
    if (typeof e === "string") {
      form = w;
      word = e.slice(1);
      e = await rawEntry(word);
    }
    if (Array.isArray(e)) return { word, form, phonetic: e[0], en: e[1], zh: e[2], also: e[3] || "" };
  }
  return null;
}

/* ---------- words ---------- */
function wordForms(key) {
  return [key, ...(db.words[key]?.forms || [])];
}
function formsRegex(forms) {
  const parts = forms.filter(Boolean).sort((a, b) => b.length - a.length).map(f => `${reEsc(f)}\\w*`);
  return new RegExp(`\\b(?:${parts.join("|")})`, "gi");
}
function blankOut(sentence, forms) {
  return esc(sentence).replace(formsRegex(forms), "_____");
}
function boldWord(sentence, forms) {
  const s = String(sentence || "");
  const m = formsRegex(forms).exec(s);
  if (!m) return esc(s);
  return esc(s.slice(0, m.index)) + `<b>${esc(m[0])}</b>` + esc(s.slice(m.index + m[0].length));
}
function saveWord(key, fields) {
  key = cleanWord(key);
  if (!key) return null;
  const old = db.words[key];
  const now = Date.now();
  db.words[key] = old
    ? { ...old, ...fields, forms: [...new Set([...(old.forms || []), ...(fields.forms || [])])], updated: now }
    : { en: "", zh: "", phonetic: "", example: "", forms: [], source: "", page: null,
        ...fields, box: 0, due: today(), added: today(), updated: now };
  return key;
}
function dueWords() {
  const t = today();
  return Object.keys(db.words).filter(k => db.words[k].due <= t);
}
function shortZh(zh) {
  return (zh || "").split("\n")[0].replace(/^[a-z]+\.\s*/i, "");
}
function cambridgeLink(word, label = "Cambridge 剑桥词典") {
  return `<a class="btn cam" href="${CAMBRIDGE}${encodeURIComponent(word.replace(/ /g, "-"))}" target="_blank" rel="noopener">${label} ↗</a>`;
}
function entryHtml(r, { example = "", forms = [] } = {}) {
  return `<div class="entry">
    <div><span class="word">${esc(r.word)}</span>${r.phonetic ? `<span class="phon">/${esc(r.phonetic)}/</span>` : ""}</div>
    ${r.form && r.form !== r.word ? `<div class="form">${esc(r.form)} → ${esc(r.word)}</div>` : ""}
    ${r.also ? `<div class="form">also a form of <b>${esc(r.also)}</b></div>` : ""}
    ${r.en ? `<div class="en">${esc(r.en)}</div>` : ""}
    ${r.zh ? `<div class="zh">${esc(r.zh)}</div>` : ""}
    ${example ? `<div class="ex">${boldWord(example, [r.word, r.form, ...forms])}</div>` : ""}
  </div>`;
}

/* ---------- text helpers ---------- */
function splitSentences(text) {
  const flat = text.replace(/(\w)-\n(\w)/g, "$1$2").replace(/\s+/g, " ").trim();
  return (flat.match(/[^.!?]+(?:[.!?]+["'”’)]*|$)/g) || []).map(s => s.trim()).filter(Boolean);
}
function sentenceWith(sentences, phrase) {
  const re = new RegExp(`\\b${reEsc(phrase)}`, "i");
  return sentences.find(s => re.test(s)) || "";
}
function isVocab(text) {
  const bare = cleanWord(text);
  return bare && bare.split(" ").length <= 3 ? bare : "";
}

/* ---------- PDF highlights ---------- */
async function extractPdf(file, onProgress) {
  const pdfjs = await import("./vendor/pdfjs/pdf.min.js");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.js", import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const found = [];
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress?.(p, doc.numPages);
    const page = await doc.getPage(p);
    const annots = (await page.getAnnotations()).filter(a => ["Highlight", "Underline", "Squiggly"].includes(a.subtype));
    if (!annots.length) continue;

    // Page text, plus for every character the centre of the word it belongs to,
    // so a highlight selects whole words (letter positions are only estimates).
    const tc = await page.getTextContent();
    let text = "";
    const pos = [];
    for (const it of tc.items) {
      if (typeof it.str !== "string") continue;
      const [a, b, , , e, f] = it.transform;
      const h = it.height || Math.hypot(a, b) || 10;
      const n = it.str.length;
      const at = Array(n).fill(null);
      for (const m of it.str.matchAll(/\S+/g)) {
        const cx = e + (it.width * (m.index + m[0].length / 2)) / n;
        for (let i = m.index; i < m.index + m[0].length; i++) at[i] = [cx, f + h * 0.35];
      }
      pos.push(...at);
      text += it.str;
      if (it.hasEOL) { text += "\n"; pos.push(null); }
    }
    const sentences = splitSentences(text);

    for (const a of annots) {
      const q = a.quadPoints?.length >= 8 ? a.quadPoints : null;
      const rects = [];
      if (q) {
        for (let i = 0; i + 7 < q.length; i += 8) {
          const xs = [q[i], q[i + 2], q[i + 4], q[i + 6]], ys = [q[i + 1], q[i + 3], q[i + 5], q[i + 7]];
          rects.push([Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1]);
        }
      } else if (a.rect) rects.push(a.rect);
      let picked = "";
      for (let i = 0; i < text.length; i++) {
        const c = pos[i];
        const inside = c && rects.some(r => c[0] >= r[0] && c[0] <= r[2] && c[1] >= r[1] && c[1] <= r[3]);
        picked += inside ? text[i] : "\u0000";
      }
      const hl = picked.split(/\u0000+/).filter(s => s.trim()).join(" ")
        .replace(/(\w)-\s+(\w)/g, "$1$2").replace(/\s+/g, " ").trim();
      if (!hl) continue;
      const note = (a.contentsObj?.str ?? a.contents ?? "").trim();
      const vocab = isVocab(hl);
      found.push(vocab
        ? { kind: "word", text: vocab, context: sentenceWith(sentences, vocab), note, page: p }
        : { kind: "sentence", text: hl, note, page: p });
    }
  }
  return found;
}

/* ---------- views ---------- */
const routes = { today: renderToday, add: renderAdd, words: renderWords, summary: renderSummary, more: renderMore, review: renderReview };
function route() {
  const name = location.hash.slice(1) || "today";
  const fn = routes[name] || renderToday;
  const tab = `#${name === "review" ? "today" : name}`;
  $$("nav.tabs a").forEach(a => (a.getAttribute("href") === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.onkeydown = null;
  fn();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

function streak() {
  const days = new Set(db.log.map(l => l.d));
  let n = 0, d = today();
  if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

function renderToday() {
  const due = dueWords().length;
  const total = Object.keys(db.words).length;
  const s = streak();
  view.innerHTML = `
    <h1>Reading Words</h1>
    <p class="muted">${total ? `${total} words saved${s ? ` · ${s}-day streak 🔥` : ""}` : "Learn the words you meet in your books."}</p>
    <div class="card hero">
      <div class="big">${due}</div>
      <div class="muted">word${due === 1 ? "" : "s"} to review today</div>
      <div class="row" style="justify-content:center;margin-top:16px">
        ${due ? `<a class="btn primary" href="#review">Start review</a>` : total ? `<a class="btn" href="#review">Practise anyway</a>` : `<a class="btn primary" href="#add">Add your first words</a>`}
      </div>
    </div>
    <h2>Look up a word</h2>
    <form id="lookupForm" class="row" autocomplete="off">
      <input class="grow" type="search" id="q" placeholder="Type a word, e.g. taciturn" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" aria-label="Word to look up">
    </form>
    <div id="result" aria-live="polite"></div>`;
  const q = $("#q"), out = $("#result");
  let seq = 0;
  const run = async () => {
    const my = ++seq, value = q.value;
    if (!cleanWord(value)) { out.innerHTML = ""; return; }
    const r = await lookup(value);
    if (my !== seq) return;
    const word = r?.word || cleanWord(value);
    const saved = !!db.words[word];
    out.innerHTML = `<div class="card" style="margin-top:12px">
      ${r ? entryHtml(r) : `<p><b>${esc(word)}</b></p><p class="muted small">Not in the offline dictionary. Try Cambridge (needs internet), or save it with your own meaning.</p>`}
      <div class="row" style="margin-top:14px">
        <button class="primary" id="saveLookup">${saved ? "Edit saved word" : "Save word"}</button>
        ${cambridgeLink(word)}
      </div></div>`;
    $("#saveLookup").onclick = () => saved ? openEditor(word) : openEditor(null, {
      word, en: r?.en || "", zh: r?.zh || "", phonetic: r?.phonetic || "", forms: r?.form ? [r.form] : [], source: db.lastBook,
    });
  };
  let timer;
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 180); });
  $("#lookupForm").onsubmit = e => { e.preventDefault(); clearTimeout(timer); run(); };
}

function renderAdd() {
  view.innerHTML = `
    <h1>Add words</h1>
    <p class="muted">From a PDF you highlighted, or from a paper book.</p>

    <h2>📄 From a PDF</h2>
    <div class="card">
      <p class="small muted">Highlight words (1–3 words) and sentences in your PDF reader and save the file, then choose it here.
      A note on a highlight is kept as your own meaning.</p>
      <div class="drop" id="drop">
        <label class="btn primary" for="pdfFile">Choose PDF…</label>
        <input id="pdfFile" type="file" accept="application/pdf,.pdf" class="hidden">
        <div class="small muted" style="margin-top:8px">or drop it here</div>
      </div>
      <div id="pdfOut" aria-live="polite"></div>
    </div>

    <h2>📖 From a paper book or photo</h2>
    <div class="card">
      <p class="small muted">On iPhone: open the photo of the page, press and hold the text, tap <b>Copy</b>, then paste it below
      (or use the camera's Live Text button). Then tap the words you don't know.</p>
      <label class="field"><span>Sentence or paragraph</span><textarea id="pasteText" placeholder="Paste or type text from your book…"></textarea></label>
      <div class="row">
        <label class="field grow"><span>Book</span><input type="text" id="pasteBook" value="${esc(db.lastBook)}" placeholder="Book title"></label>
        <label class="field" style="width:90px"><span>Page</span><input type="number" id="pastePage" inputmode="numeric" min="1"></label>
      </div>
      <div id="tokens" class="tokens"></div>
      <div id="picked"></div>
      <label class="row small" style="margin:10px 0"><input type="checkbox" id="keepSentence"> Also save this text as a favorite sentence</label>
      <button class="primary" id="savePaste" disabled>Save</button>
    </div>`;

  // PDF
  const input = $("#pdfFile"), drop = $("#drop");
  input.onchange = () => input.files[0] && importPdf(input.files[0]);
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => {
    e.preventDefault();
    drop.classList.remove("over");
    const f = e.dataTransfer.files[0];
    if (f) importPdf(f);
  });

  // Paste: tap words to pick them
  const ta = $("#pasteText"), tokens = $("#tokens"), picked = $("#picked");
  const chosen = new Map(); // word -> lookup result
  const refresh = () => {
    $("#savePaste").disabled = !chosen.size && !$("#keepSentence").checked;
    picked.innerHTML = [...chosen.entries()].map(([w, r]) => `<div class="pick"><div class="grow">
        <span class="w" style="font:700 1.05rem var(--serif)">${esc(r?.word || w)}</span>
        ${r?.form ? `<span class="small muted"> (${esc(r.form)})</span>` : ""}
        ${r ? `<div class="en">${esc(r.en)}</div><div class="zh">${esc(r.zh)}</div>` : `<div class="small muted">Not in the offline dictionary. You can add the meaning later.</div>`}
      </div></div>`).join("");
  };
  ta.addEventListener("input", () => {
    chosen.clear();
    const parts = ta.value.split(/([A-Za-z][A-Za-z'’-]*)/);
    tokens.innerHTML = parts.map((p, i) => (i % 2
      ? `<button type="button" aria-pressed="false" data-w="${esc(p)}">${esc(p)}</button>`
      : esc(p).replace(/\n/g, "<br>"))).join("");
    tokens.style.marginBottom = ta.value.trim() ? "8px" : "0";
    refresh();
  });
  tokens.addEventListener("click", async e => {
    const b = e.target.closest("button[data-w]");
    if (!b) return;
    const w = cleanWord(b.dataset.w);
    const on = b.getAttribute("aria-pressed") !== "true";
    $$(`button[data-w]`, tokens).filter(x => cleanWord(x.dataset.w) === w).forEach(x => x.setAttribute("aria-pressed", on));
    if (on) chosen.set(w, await lookup(w)); else chosen.delete(w);
    refresh();
  });
  $("#keepSentence").onchange = refresh;
  $("#savePaste").onclick = () => {
    const text = ta.value.replace(/\s+/g, " ").trim();
    const book = $("#pasteBook").value.trim(), page = parseInt($("#pastePage").value) || null;
    const sentences = splitSentences(ta.value);
    let n = 0;
    for (const [w, r] of chosen) {
      const key = r?.word || w;
      if (db.words[key]) continue;
      saveWord(key, { en: r?.en || "", zh: r?.zh || "", phonetic: r?.phonetic || "", forms: r?.form ? [r.form] : [],
        example: sentenceWith(sentences, w) || text, source: book, page });
      n++;
    }
    let s = 0;
    if ($("#keepSentence").checked && text) {
      db.sentences.push({ text, note: "", source: book, page, added: today() });
      s = 1;
    }
    db.lastBook = book;
    saveDb();
    toast(`Saved ${n} word${n === 1 ? "" : "s"}${s ? " and 1 sentence" : ""}.`);
    ta.value = "";
    ta.dispatchEvent(new Event("input"));
    $("#keepSentence").checked = false;
    refresh();
  };
}

async function importPdf(file) {
  const out = $("#pdfOut");
  out.innerHTML = `<p class="muted" style="margin-top:12px">Opening ${esc(file.name)}…</p>`;
  let found;
  try {
    found = await extractPdf(file, (p, n) => { out.innerHTML = `<p class="muted" style="margin-top:12px">Reading page ${p} of ${n}…</p>`; });
  } catch (err) {
    console.error(err);
    out.innerHTML = `<p style="margin-top:12px;color:var(--danger)">Couldn't read this PDF. Is it password-protected or damaged?</p>`;
    return;
  }
  const imported = new Set(db.imported);
  const keyOf = h => `${file.name}|${h.page}|${h.text}`;
  const fresh = found.filter(h => !imported.has(keyOf(h)));
  if (!found.length) {
    out.innerHTML = `<p style="margin-top:12px">No highlights found in this PDF.</p>
      <p class="small muted">Make sure your reader saves highlights into the file (on iPhone: Adobe Acrobat Reader, PDF Expert or Xodo),
      and that the PDF has real text (a scanned book is just pictures).</p>`;
    return;
  }
  if (!fresh.length) {
    out.innerHTML = `<p style="margin-top:12px">All ${found.length} highlights were already imported. Highlight more and import again later!</p>`;
    return;
  }
  // Look every word up and merge duplicates.
  const words = new Map(), sentences = [];
  for (const h of fresh) {
    if (h.kind === "sentence") { sentences.push(h); continue; }
    const r = await lookup(h.text);
    const key = r?.word || h.text;
    if (!words.has(key)) words.set(key, { ...h, key, r });
  }
  const book = file.name.replace(/\.pdf$/i, "");
  out.innerHTML = `
    <p style="margin-top:14px"><b>${words.size}</b> word${words.size === 1 ? "" : "s"} and <b>${sentences.length}</b> sentence${sentences.length === 1 ? "" : "s"} found
    ${found.length > fresh.length ? `<span class="muted small">(${found.length - fresh.length} imported before)</span>` : ""}</p>
    <label class="field"><span>Book title</span><input type="text" id="pdfBook" value="${esc(book)}"></label>
    <div>${[...words.values()].map((h, i) => {
      const have = !!db.words[h.key];
      return `<label class="pick"><input type="checkbox" data-w="${i}" ${have ? "" : "checked"}>
        <div class="grow"><b style="font:700 1.05rem var(--serif)">${esc(h.key)}</b>
          ${h.r?.form ? `<span class="small muted"> (${esc(h.r.form)})</span>` : ""}
          <span class="small muted"> · p.${h.page}${have ? " · already saved" : ""}</span>
          ${h.note ? `<div class="en">📝 ${esc(h.note)}</div>` : ""}
          ${h.r ? `<div class="en">${esc(h.r.en)}</div><div class="zh">${esc(h.r.zh)}</div>` : `<div class="small muted">Not in the offline dictionary.</div>`}
          ${h.context ? `<div class="ctx">${boldWord(h.context, [h.key, h.text])}</div>` : ""}
        </div></label>`;
    }).join("")}
    ${sentences.map((h, i) => `<label class="pick"><input type="checkbox" data-s="${i}" checked>
        <div class="grow"><div style="font-family:var(--serif)">“${esc(h.text)}”</div>
        ${h.note ? `<div class="small" style="color:var(--accent)">${esc(h.note)}</div>` : ""}
        <div class="small muted">p.${h.page}</div></div></label>`).join("")}
    </div>
    <div class="row" style="margin-top:14px"><button class="primary" id="savePdf">Save selected</button></div>`;
  const wordList = [...words.values()];
  $("#savePdf").onclick = () => {
    const bookTitle = $("#pdfBook").value.trim() || book;
    let nw = 0, ns = 0;
    $$("input[data-w]", out).forEach(cb => {
      if (!cb.checked) return;
      const h = wordList[+cb.dataset.w];
      saveWord(h.key, {
        en: h.note || h.r?.en || "", zh: h.r?.zh || "", phonetic: h.r?.phonetic || "",
        forms: h.text !== h.key ? [h.text] : [], example: h.context, source: bookTitle, page: h.page,
      });
      nw++;
    });
    $$("input[data-s]", out).forEach(cb => {
      if (!cb.checked) return;
      const h = sentences[+cb.dataset.s];
      db.sentences.push({ text: h.text, note: h.note, source: bookTitle, page: h.page, added: today() });
      ns++;
    });
    for (const h of fresh) db.imported.push(keyOf(h));
    db.lastBook = bookTitle;
    saveDb();
    out.innerHTML = `<div class="card" style="margin-top:14px;background:var(--accent-soft)">
      <p><b>Saved ${nw} word${nw === 1 ? "" : "s"} and ${ns} sentence${ns === 1 ? "" : "s"}</b> from “${esc(bookTitle)}”.</p>
      <a class="btn primary" href="#review">Review now</a></div>`;
    $("#pdfFile").value = "";
  };
}

/* ---------- review ---------- */
function renderReview() {
  const due = dueWords();
  const practice = !due.length; // nothing due: practise without changing the schedule
  const queue = (practice ? Object.keys(db.words) : due).sort(() => Math.random() - 0.5).slice(0, practice ? 20 : Infinity);
  const total = queue.length;
  let remembered = 0, shown = false;
  if (!total) { location.hash = "#add"; return; }

  const draw = () => {
    const word = queue[0];
    if (!word) {
      view.innerHTML = `<div class="card hero" style="margin-top:24px">
        <div style="font-size:2.4rem">🎉</div><h1>Done!</h1>
        <p class="muted">You remembered ${remembered} of ${total} word${total === 1 ? "" : "s"}.</p>
        <div class="row" style="justify-content:center"><a class="btn primary" href="#today">Back to Today</a><a class="btn" href="#summary">Summary</a></div></div>`;
      document.onkeydown = null;
      return;
    }
    const w = db.words[word], forms = wordForms(word);
    view.innerHTML = `
      <div class="row"><a href="#today" class="btn ghost" aria-label="Close review">✕</a>
        <div class="grow small muted" style="text-align:right">${practice ? "Practice (doesn't change your schedule) · " : ""}${total - queue.length} / ${total}</div></div>
      <div class="progress"><div style="width:${((total - queue.length) / total) * 100}%"></div></div>
      <div class="card flash" id="flash" role="button" tabindex="0" aria-label="Show answer">
        <div class="entry"><div class="word">${esc(word)}</div></div>
        ${w.example ? `<div class="entry"><div class="ex">${blankOut(w.example, forms)}</div></div>` : ""}
        <div class="small muted" style="margin-top:18px">Do you remember it? Tap to check</div>
      </div>
      <div id="answers"></div>`;
    shown = false;
    $("#flash").onclick = reveal;
  };
  const reveal = () => {
    if (shown || !queue[0]) return;
    shown = true;
    const word = queue[0], w = db.words[word];
    $("#flash").outerHTML = `<div class="card">
      ${entryHtml({ word, phonetic: w.phonetic, en: w.en, zh: w.zh }, { example: w.example, forms: w.forms })}
      ${!w.en && !w.zh ? `<p class="small muted">No meaning saved yet. Tap Edit to add one.</p>` : ""}
      <div class="row" style="margin-top:12px">${cambridgeLink(word)}<button class="cam" id="editNow">Edit</button></div></div>`;
    $("#editNow").onclick = () => openEditor(word, null, () => { shown = false; draw(); reveal(); });
    $("#answers").innerHTML = `<div class="answers">
      <button id="no">😕 Forgot <span class="kbd small muted">(1)</span></button>
      <button class="primary" id="yes">✓ Remembered <span class="kbd small">(2)</span></button></div>`;
    $("#no").onclick = () => answer(false);
    $("#yes").onclick = () => answer(true);
  };
  const answer = ok => {
    const word = queue.shift();
    if (!practice) {
      const w = db.words[word];
      w.box = ok ? Math.min(w.box + 1, INTERVALS.length - 1) : 0;
      w.due = addDays(today(), INTERVALS[w.box] || 1);
      db.log.push({ d: today(), w: word, ok, t: Date.now() });
      saveDb();
    }
    if (ok) remembered++;
    else if (practice) queue.splice(Math.min(3, queue.length), 0, word);
    draw();
  };
  document.onkeydown = e => {
    if ($("#editor").open) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); reveal(); }
    else if (shown && (e.key === "1" || e.key === "ArrowLeft")) answer(false);
    else if (shown && (e.key === "2" || e.key === "ArrowRight")) answer(true);
  };
  draw();
}

/* ---------- words & sentences ---------- */
let wordsTab = "words", wordsQuery = "";
function renderWords() {
  const keys = Object.keys(db.words);
  view.innerHTML = `
    <h1>My words</h1>
    <div class="row" style="margin:10px 0 14px">
      <div class="seg" role="group" aria-label="Show">
        <button aria-pressed="${wordsTab === "words"}" data-tab="words">Words (${keys.length})</button>
        <button aria-pressed="${wordsTab === "sentences"}" data-tab="sentences">Sentences (${db.sentences.length})</button>
      </div>
    </div>
    <div id="wl"></div>`;
  $$(".seg button", view).forEach(b => b.onclick = () => { wordsTab = b.dataset.tab; renderWords(); });
  const wl = $("#wl");
  if (wordsTab === "sentences") {
    wl.innerHTML = db.sentences.length
      ? db.sentences.map((s, i) => ({ s, i })).reverse().map(({ s, i }) => `<blockquote>${esc(s.text)}
          ${s.note ? `<div class="small" style="color:var(--accent);font-family:var(--sans)">${esc(s.note)}</div>` : ""}
          <cite>${esc(s.source || "")}${s.page ? `, p.${s.page}` : ""} · ${esc(s.added)}
          <button class="ghost danger small" style="min-height:28px;padding:2px 8px;float:right" data-del="${i}">Delete</button></cite></blockquote>`).join("")
      : `<p class="muted">No sentences yet. Highlight a long passage in a PDF, or tick “Also save this text” when pasting.</p>`;
    $$("[data-del]", wl).forEach(b => b.onclick = () => {
      if (!confirm("Delete this sentence?")) return;
      db.sentences.splice(+b.dataset.del, 1);
      saveDb();
      renderWords();
    });
    return;
  }
  if (!keys.length) {
    wl.innerHTML = `<p class="muted">No words yet. <a href="#add">Add some</a> or look one up on <a href="#today">Today</a>.</p>`;
    return;
  }
  wl.innerHTML = `<input type="search" id="wq" placeholder="Search your words" value="${esc(wordsQuery)}" aria-label="Search your words" autocapitalize="off" style="margin-bottom:8px"><ul class="list" id="wlist"></ul>`;
  const draw = () => {
    const q = wordsQuery.toLowerCase();
    const t = today();
    const rows = keys
      .filter(k => !q || k.includes(q) || (db.words[k].zh || "").includes(q) || (db.words[k].source || "").toLowerCase().includes(q))
      .sort((a, b) => (db.words[b].updated || 0) - (db.words[a].updated || 0));
    $("#wlist").innerHTML = rows.map(k => {
      const w = db.words[k];
      const left = daysBetween(t, w.due);
      const status = w.box >= MASTERED_BOX ? "mastered" : left <= 0 ? "due today" : `in ${left} day${left === 1 ? "" : "s"}`;
      return `<li><button class="item" data-k="${esc(k)}"><div class="row"><span class="w grow">${esc(k)}</span><span class="pill">${status}</span></div>
        <div class="z">${esc(shortZh(w.zh)) || `<span class="muted">${esc((w.en || "").split("\n")[0]) || "no meaning yet"}</span>`}</div>
        ${w.source ? `<div class="small muted">${esc(w.source)}${w.page ? `, p.${w.page}` : ""}</div>` : ""}</button></li>`;
    }).join("") || `<li class="muted">No match.</li>`;
    $$("#wlist button.item").forEach(b => b.onclick = () => openEditor(b.dataset.k, null, renderWords));
  };
  $("#wq").addEventListener("input", e => { wordsQuery = e.target.value; draw(); });
  draw();
}

/* ---------- editor dialog ---------- */
function openEditor(key, draft, onDone) {
  const dlg = $("#editor");
  const w = key ? db.words[key] : draft;
  const word = key || draft.word;
  dlg.innerHTML = `<form method="dialog">
    <div class="row"><h2 class="grow" style="margin:0">${esc(word)}</h2>${w.phonetic ? `<span class="muted">/${esc(w.phonetic)}/</span>` : ""}</div>
    <label class="field" style="margin-top:12px"><span>English meaning</span><textarea name="en" rows="3">${esc(w.en)}</textarea></label>
    <label class="field"><span>中文意思</span><textarea name="zh" rows="2" lang="zh">${esc(w.zh)}</textarea></label>
    <label class="field"><span>Example sentence</span><textarea name="example" rows="2">${esc(w.example)}</textarea></label>
    <div class="row">
      <label class="field grow"><span>Book</span><input type="text" name="source" value="${esc(w.source)}"></label>
      <label class="field" style="width:90px"><span>Page</span><input type="number" name="page" inputmode="numeric" value="${esc(w.page ?? "")}"></label>
    </div>
    <div class="row" style="margin-top:6px">
      <button class="primary" value="save">Save</button>
      <button value="cancel" formnovalidate>Cancel</button>
      ${cambridgeLink(word, "Cambridge")}
      <span class="grow"></span>
      ${key ? `<button value="delete" class="ghost danger">Delete</button>` : ""}
    </div></form>`;
  dlg.onclose = () => {
    const f = $("form", dlg);
    const val = dlg.returnValue;
    if (val === "save") {
      const fields = {
        en: f.en.value.trim(), zh: f.zh.value.trim(), example: f.example.value.trim(),
        source: f.source.value.trim(), page: parseInt(f.page.value) || null,
      };
      if (!key) Object.assign(fields, { phonetic: draft.phonetic || "", forms: draft.forms || [] });
      saveWord(word, fields);
      if (fields.source) db.lastBook = fields.source;
      saveDb();
      toast(key ? "Saved." : `Saved “${word}”.`);
    } else if (val === "delete" && key) {
      if (confirm(`Delete “${key}”?`)) {
        delete db.words[key];
        saveDb();
        toast("Deleted.");
      }
    }
    dlg.returnValue = "";
    if (val === "save" || val === "delete") (onDone || route)();
  };
  dlg.showModal();
}

/* ---------- summary ---------- */
let period = "week";
export function computeStats(data, start, end) {
  const inRange = d => d && d >= start && d <= end;
  const newWords = Object.entries(data.words).filter(([, w]) => inRange(w.added));
  const newSentences = data.sentences.filter(s => inRange(s.added));
  const reviews = data.log.filter(l => inRange(l.d));
  const misses = {};
  for (const l of reviews) if (!l.ok) misses[l.w] = (misses[l.w] || 0) + 1;
  const books = {};
  for (const [, w] of newWords) books[w.source || "(no book)"] = (books[w.source || "(no book)"] || 0) + 1;
  for (const s of newSentences) books[s.source || "(no book)"] ??= 0;
  return {
    newWords, newSentences, reviews: reviews.length, remembered: reviews.filter(l => l.ok).length,
    days: new Set(reviews.map(l => l.d)).size,
    struggling: Object.entries(misses).filter(([w]) => data.words[w]).sort((a, b) => b[1] - a[1]).slice(0, 10),
    mastered: Object.values(data.words).filter(w => w.box >= MASTERED_BOX).length,
    books,
  };
}
function renderSummary() {
  const end = today();
  const start = period === "week" ? addDays(end, -6) : period === "month" ? addDays(end, -29) : "0000-01-01";
  const s = computeStats(db, start, end);
  const acc = s.reviews ? `${Math.round((100 * s.remembered) / s.reviews)}%` : "–";
  const label = { week: "This week", month: "This month", all: "All time" }[period];
  view.innerHTML = `
    <h1>Summary</h1>
    <div class="row" style="margin:10px 0 4px">
      <div class="seg" role="group" aria-label="Period">
        ${["week", "month", "all"].map(p => `<button data-p="${p}" aria-pressed="${p === period}">${{ week: "Week", month: "Month", all: "All" }[p]}</button>`).join("")}
      </div>
    </div>
    <p class="small muted">${period === "all" ? "Everything so far" : `${start} → ${end}`}</p>
    <div class="tiles">
      <div class="tile"><b>${s.newWords.length}</b><span>new words</span></div>
      <div class="tile"><b>${s.newSentences.length}</b><span>sentences</span></div>
      <div class="tile"><b>${s.reviews}</b><span>reviews</span></div>
      <div class="tile"><b>${acc}</b><span>remembered</span></div>
      <div class="tile"><b>${s.days}</b><span>days studied</span></div>
      <div class="tile"><b>${s.mastered}</b><span>mastered (total)</span></div>
    </div>
    <div class="row" style="margin-top:14px"><button id="shareSum">Share summary</button>
      ${s.struggling.length ? `<button id="practiseHard" class="primary">Practise hard words</button>` : ""}</div>

    <h2>Keep practising</h2>
    ${s.struggling.length ? `<ul class="list">${s.struggling.map(([w, n]) => `<li><span class="w">${esc(w)}</span> <span class="pill">missed ${n}×</span>
      <div class="z">${esc(shortZh(db.words[w].zh))}</div></li>`).join("")}</ul>` : `<p class="muted">No missed words. Great work!</p>`}

    <h2>New words</h2>
    ${s.newWords.length ? `<ul class="list">${s.newWords.sort((a, b) => (a[1].added < b[1].added ? 1 : -1)).map(([k, w]) => `<li>
      <span class="w">${esc(k)}</span> <span class="z">${esc(shortZh(w.zh))}</span>
      ${w.example ? `<div class="small muted" style="font-family:var(--serif);font-style:italic">${boldWord(w.example, wordForms(k))}</div>` : ""}</li>`).join("")}</ul>`
      : `<p class="muted">No new words ${period === "all" ? "yet" : "in this period"}.</p>`}

    <h2>Sentences you highlighted</h2>
    ${s.newSentences.length ? s.newSentences.map(q => `<blockquote>${esc(q.text)}${q.note ? `<div class="small" style="color:var(--accent);font-family:var(--sans)">${esc(q.note)}</div>` : ""}
      <cite>${esc(q.source || "")}${q.page ? `, p.${q.page}` : ""}</cite></blockquote>`).join("") : `<p class="muted">None ${period === "all" ? "yet" : "in this period"}.</p>`}

    <h2>Books</h2>
    ${Object.keys(s.books).length ? `<ul class="list">${Object.entries(s.books).map(([b, n]) => `<li>${esc(b)} <span class="pill">${n} word${n === 1 ? "" : "s"}</span></li>`).join("")}</ul>` : `<p class="muted">–</p>`}`;
  $$(".seg button", view).forEach(b => b.onclick = () => { period = b.dataset.p; renderSummary(); });
  $("#shareSum").onclick = async () => {
    const text = `📚 My English reading, ${label.toLowerCase()}:\n` +
      `• ${s.newWords.length} new words, ${s.newSentences.length} sentences\n` +
      `• ${s.reviews} reviews on ${s.days} days, ${acc} remembered\n` +
      (s.newWords.length ? `• New: ${s.newWords.slice(0, 12).map(([k]) => k).join(", ")}${s.newWords.length > 12 ? "…" : ""}` : "");
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast("Summary copied."); }
    } catch (e) { if (e.name !== "AbortError") toast("Couldn't share."); }
  };
  const hard = $("#practiseHard");
  if (hard) hard.onclick = () => {
    // make the struggling words due today, then review them
    for (const [w] of s.struggling) db.words[w].due = today();
    saveDb();
    location.hash = "#review";
  };
}

/* ---------- more: backup, Anki, settings ---------- */
async function deliver(name, text, type) {
  const file = new File([text], name, { type });
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function csvCell(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}
export function ankiCsv(data) {
  const html = s => esc(s).replace(/\n/g, "<br>");
  const lines = ["#separator:Comma", "#html:true", "#columns:Word,Meaning,Example,Source,Tags", "#tags column:5"];
  for (const [k, w] of Object.entries(data.words).sort()) {
    const meaning = [w.phonetic && `<span style="color:#888">/${html(w.phonetic)}/</span>`, html(w.en), w.zh && `<span lang="zh">${html(w.zh)}</span>`]
      .filter(Boolean).join("<br><br>");
    const source = [w.source, w.page && `p.${w.page}`].filter(Boolean).join(", ");
    const tag = (w.source || "").trim().replace(/\s+/g, "_");
    lines.push([k, meaning, boldWord(w.example, [k, ...(w.forms || [])]), esc(source), tag].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}
// Merge a backup (from this app or the Python tool) into the current data; newer edits win.
export function mergeBackup(cur, inc) {
  const out = structuredClone(cur);
  for (const [k, w0] of Object.entries(inc.words || {})) {
    const w = { ...w0 };
    if (w.meaning !== undefined && w.en === undefined) { w.en = w.meaning; delete w.meaning; } // Python tool format
    const key = cleanWord(k);
    if (!key) continue;
    const full = { en: "", zh: "", phonetic: "", example: "", forms: [], source: "", page: null, box: 0, due: today(), added: today(), updated: 0, ...w };
    if (!out.words[key] || (full.updated || 0) > (out.words[key].updated || 0)) out.words[key] = full;
  }
  const sKey = s => `${s.text}|${s.source}`;
  const haveS = new Set(out.sentences.map(sKey));
  for (const s of inc.sentences || []) if (!haveS.has(sKey(s))) { out.sentences.push(s); haveS.add(sKey(s)); }
  const lKey = l => `${l.d}|${l.w}|${l.ok}|${l.t ?? ""}`;
  const incLog = (inc.log || inc.review_log || []).map(l => (l.date ? { d: l.date, w: l.word, ok: l.ok } : l));
  const haveL = new Set(out.log.map(lKey));
  for (const l of incLog) if (!haveL.has(lKey(l))) { out.log.push(l); haveL.add(lKey(l)); }
  out.imported = [...new Set([...out.imported, ...(inc.imported || [])])];
  return out;
}

async function dictionaryStatus() {
  if (!("caches" in window)) return "";
  try {
    const keys = await (await caches.open("reading-words-dict-v1")).keys();
    const n = keys.filter(r => /\/dict\/[a-z]\.json$/.test(r.url)).length;
    return n >= 26 ? "✅ Offline dictionary ready (48,000 words)." : `⏳ Downloading the offline dictionary… ${n}/26`;
  } catch { return ""; }
}

function renderMore() {
  const n = Object.keys(db.words).length;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  view.innerHTML = `
    <h1>More</h1>

    ${standalone ? "" : `<div class="card"><h2 style="margin-top:0">📲 Install on your phone</h2>
      <p class="small"><b>iPhone / iPad:</b> open this page in <b>Safari</b> → tap <b>Share</b> → <b>Add to Home Screen</b>.<br>
      <b>Android:</b> Chrome menu → <b>Install app</b>.<br><b>Laptop:</b> Chrome/Edge address bar → install icon, or just bookmark it.</p>
      <p class="small muted">After the first visit it works without internet.</p></div>`}

    <div class="card"><h2 style="margin-top:0">💾 Backup & move to another device</h2>
      <p class="small muted">Your ${n} words live only on this device. Make a backup now and then. To move words between laptop and phone,
      back up on one and restore on the other (AirDrop works). Restoring <b>merges</b>: nothing is lost.</p>
      <div class="row"><button class="primary" id="backup">Make backup</button>
        <label class="btn" for="restoreFile">Restore / merge…</label><input type="file" id="restoreFile" accept=".json,application/json" class="hidden"></div></div>

    <div class="card"><h2 style="margin-top:0">🗂 Anki</h2>
      <p class="small muted">Export all words for Anki (desktop: File → Import; iPhone: AnkiMobile → Import). Each card has the word,
      English + Chinese meaning, and the sentence from your book.</p>
      <button id="anki" ${n ? "" : "disabled"}>Export for Anki (.csv)</button></div>

    <div class="card"><h2 style="margin-top:0">🎨 Appearance</h2>
      <div class="seg" role="group" aria-label="Theme">
        ${[["", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => `<button data-theme="${v}" aria-pressed="${(db.theme || "") === v}">${l}</button>`).join("")}
      </div></div>

    <div class="card"><h2 style="margin-top:0">ℹ️ About</h2>
      <p class="small" id="dictStatus"></p>
      <p class="small muted">Everything stays on your device. No account, no tracking.<br>
      Dictionary: <a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noopener">ECDICT</a> (MIT).
      PDF reading: <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noopener">pdf.js</a> (Apache 2.0).
      Cambridge links open dictionary.cambridge.org and need internet.</p>
      <button class="ghost danger" id="wipe">Delete all my data</button></div>`;

  dictionaryStatus().then(s => { const el = $("#dictStatus"); if (el) el.textContent = s; });
  $("#backup").onclick = () => deliver(`reading-words-backup-${today()}.json`,
    JSON.stringify({ app: "reading-words", version: 1, exported: new Date().toISOString(), ...db }), "application/json");
  $("#restoreFile").onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      let inc = JSON.parse(await f.text());
      if (!inc || typeof inc !== "object") throw new Error("not a backup");
      if (!inc.words && !Array.isArray(inc.sentences)) {
        // data/words.json from the Python tool is just {word: {...}}
        const vals = Object.values(inc);
        if (!vals.length || !vals.every(v => v && typeof v === "object" && "due" in v)) throw new Error("not a backup");
        inc = { words: inc };
      }
      const before = Object.keys(db.words).length;
      db = mergeBackup(db, inc);
      saveDb();
      toast(`Merged. ${Object.keys(db.words).length - before} new words.`);
      renderMore();
    } catch {
      toast("That file isn't a Reading Words backup.");
    }
  };
  $("#anki").onclick = () => deliver(`reading-words-anki-${today()}.csv`, ankiCsv(db), "text/csv");
  $$("[data-theme]", view).forEach(b => b.onclick = () => { db.theme = b.dataset.theme; saveDb(); applyTheme(); renderMore(); });
  $("#wipe").onclick = () => {
    if (!confirm("Delete ALL words, sentences and history on this device? Make a backup first!")) return;
    if (!confirm("Really delete everything?")) return;
    db = emptyDb();
    saveDb();
    toast("All data deleted.");
    renderMore();
  };
}

function applyTheme() {
  if (db.theme) document.documentElement.dataset.theme = db.theme;
  else delete document.documentElement.dataset.theme;
}

/* ---------- start ---------- */
if (!globalThis.__READING_WORDS_TEST__) {
  applyTheme();
  route();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(reg => reg.active?.postMessage("fetch-dictionary"))
      .catch(() => {});
  }
}
