// Photos come from photos.json (written by add_photos.py) — no need to edit this file to add photos.
const STRIP_MIN = 8; // show the "最近拍的" strip once there are this many photos

const strip = document.getElementById("strip");
const grid = document.getElementById("albumGrid");
const tabs = document.getElementById("tabs");
let all = [], list = [], recent = [];

// "2026-10-03" → "'26 10 03", like a film camera's date stamp
const stamp = (d) => (d ? "'" + d.slice(2).replace(/-/g, " ") : "");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const shotHTML = (p, i, cls) => `
  <figure class="${cls}" style="--r:${(p.w / p.h).toFixed(3)}" tabindex="0" data-i="${i}" aria-label="查看大图：${esc(p.title || p.group)}">
    <div class="ph"><img src="photos/${p.file}" alt="${esc(p.title || p.group)}" width="${p.w}" height="${p.h}" loading="lazy"><span class="stamp">${stamp(p.date)}</span></div>
    <figcaption><span>${esc(p.title)}</span><span>${esc(p.place)}</span></figcaption>
  </figure>`;

function render(l) {
  list = l;
  grid.classList.toggle("few", l.length <= 5); // too few to leave a ragged last row: let them fill the width
  grid.innerHTML = l.map((p, i) => shotHTML(p, i, "shot")).join("");
}

fetch("photos.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((photos) => {
    all = photos;
    recent = photos.slice(0, 6);
    if (photos.length >= STRIP_MIN) {
      strip.innerHTML = recent.map((p, i) => shotHTML(p, i, "")).join("");
      document.getElementById("recent").hidden = false;
    }
    const groups = [...new Set(photos.map((p) => p.group))];
    tabs.innerHTML = ["全部", ...groups].map((g, i) => {
      const n = i === 0 ? photos.length : photos.filter((p) => p.group === g).length;
      return `<button type="button" aria-pressed="${i === 0}" data-g="${esc(g)}">${esc(g)}<span class="n">${n}</span></button>`;
    }).join("");
    tabs.hidden = groups.length < 2;
    render(photos);
  })
  .catch(() => { grid.innerHTML = '<p class="muted">照片没加载出来，刷新一下试试。</p>'; });

tabs.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  render(b.dataset.g === "全部" ? all : all.filter((p) => p.group === b.dataset.g));
});

// Lightbox
const lb = document.getElementById("lb");
let cur = 0, seq = [], back = null;
function show(i) {
  cur = (i + seq.length) % seq.length;
  const p = seq[cur];
  const img = document.getElementById("lbImg");
  img.src = `photos/${p.file}`; img.alt = p.title || p.group;
  document.getElementById("lbStamp").textContent = stamp(p.date);
  document.getElementById("lbTitle").textContent = p.title;
  document.getElementById("lbMeta").textContent = [p.group, p.place].filter(Boolean).join(" · ");
  document.getElementById("lbCount").textContent = `${cur + 1} / ${seq.length}`;
}
function openLb(s, i) { seq = s; back = document.activeElement; show(i); lb.hidden = false; document.body.style.overflow = "hidden"; document.getElementById("lbClose").focus(); }
function closeLb() { lb.hidden = true; document.body.style.overflow = ""; back?.focus(); }
[[strip, () => recent], [grid, () => list]].forEach(([el, src]) => {
  el.addEventListener("click", (e) => { const f = e.target.closest("figure"); if (f) openLb(src(), +f.dataset.i); });
  el.addEventListener("keydown", (e) => { const f = e.target.closest("figure"); if (f && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openLb(src(), +f.dataset.i); } });
});
document.getElementById("lbClose").onclick = closeLb;
document.getElementById("lbPrev").onclick = () => show(cur - 1);
document.getElementById("lbNext").onclick = () => show(cur + 1);
document.addEventListener("keydown", (e) => {
  if (lb.hidden) return;
  if (e.key === "Escape") closeLb();
  if (e.key === "ArrowLeft") show(cur - 1);
  if (e.key === "ArrowRight") show(cur + 1);
});
let tx = null;
lb.addEventListener("touchstart", (e) => (tx = e.touches[0].clientX), { passive: true });
lb.addEventListener("touchend", (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1)); tx = null; });

// Copy buttons
document.querySelectorAll("[data-copy]").forEach((btn) => btn.addEventListener("click", () => {
  const el = document.getElementById(btn.dataset.copy);
  const done = () => (btn.textContent = "已复制");
  if (navigator.clipboard) navigator.clipboard.writeText(el.textContent).then(done, select);
  else select();
  function select() {
    const r = document.createRange(); r.selectNodeContents(el);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = "已选中";
  }
}));

document.getElementById("year").textContent = new Date().getFullYear();
