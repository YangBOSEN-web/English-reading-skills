// Portfolio data — replace src with your own images (e.g. "photos/xxx.jpg").
const PHOTOS = [
  { src: "https://picsum.photos/id/1015/900/600", title: "河谷晨雾", cat: "风光" },
  { src: "https://picsum.photos/id/1027/700/1000", title: "午后", cat: "人像" },
  { src: "https://picsum.photos/id/1011/900/650", title: "湖上独行", cat: "风光" },
  { src: "https://picsum.photos/id/1059/700/950", title: "回眸", cat: "人像" },
  { src: "https://picsum.photos/id/1031/800/1100", title: "城市脉搏", cat: "街头" },
  { src: "https://picsum.photos/id/1036/900/600", title: "雪原", cat: "风光" },
  { src: "https://picsum.photos/id/1067/900/650", title: "街角", cat: "街头" },
  { src: "https://picsum.photos/id/1005/700/950", title: "少年", cat: "人像" },
  { src: "https://picsum.photos/id/1043/900/600", title: "林间", cat: "风光" },
  { src: "https://picsum.photos/id/1047/700/1000", title: "人潮", cat: "街头" },
  { src: "https://picsum.photos/id/1062/900/650", title: "相伴", cat: "婚礼" },
  { src: "https://picsum.photos/id/1080/700/1000", title: "甜蜜", cat: "婚礼" },
  { src: "https://picsum.photos/id/1016/900/600", title: "峡谷", cat: "风光" },
  { src: "https://picsum.photos/id/1012/700/950", title: "静候", cat: "婚礼" },
  { src: "https://picsum.photos/id/1056/900/650", title: "夜行", cat: "街头" },
];

const gallery = document.getElementById("gallery");
const filters = document.getElementById("filters");
let visible = PHOTOS;

const observer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add("in");
      observer.unobserve(e.target);
    }
  }
}, { rootMargin: "0px 0px -40px" });

function renderFilters() {
  const cats = ["全部", ...new Set(PHOTOS.map((p) => p.cat))];
  filters.innerHTML = cats
    .map((c, i) => `<button role="tab" aria-selected="${i === 0}" data-cat="${c}">${c}</button>`)
    .join("");
  filters.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    filters.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b === btn));
    const cat = btn.dataset.cat;
    renderGallery(cat === "全部" ? PHOTOS : PHOTOS.filter((p) => p.cat === cat));
  });
}

function renderGallery(list) {
  visible = list;
  gallery.innerHTML = list
    .map((p, i) => `
      <figure class="item" tabindex="0" data-i="${i}">
        <img src="${p.src}" alt="${p.title}" loading="lazy">
        <figcaption><b>${p.title}</b><span>${p.cat}</span></figcaption>
      </figure>`)
    .join("");
  gallery.querySelectorAll(".item").forEach((el) => observer.observe(el));
}

gallery.addEventListener("click", (e) => {
  const item = e.target.closest(".item");
  if (item) openLightbox(+item.dataset.i);
});
gallery.addEventListener("keydown", (e) => {
  const item = e.target.closest(".item");
  if (item && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    openLightbox(+item.dataset.i);
  }
});

// Lightbox
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbCap = document.getElementById("lbCap");
let current = 0;

function show(i) {
  current = (i + visible.length) % visible.length;
  const p = visible[current];
  // Ask for a larger version when the source is a picsum placeholder.
  lbImg.src = p.src.replace(/\/(\d+)\/(\d+)$/, (_, w, h) => `/${w * 2}/${h * 2}`);
  lbImg.alt = p.title;
  lbCap.textContent = `${p.title} · ${p.cat}`;
}
function openLightbox(i) {
  show(i);
  lb.classList.add("open");
  lb.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeLightbox() {
  lb.classList.remove("open");
  lb.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
document.getElementById("lbClose").onclick = closeLightbox;
document.getElementById("lbPrev").onclick = () => show(current - 1);
document.getElementById("lbNext").onclick = () => show(current + 1);
lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
document.addEventListener("keydown", (e) => {
  if (!lb.classList.contains("open")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") show(current - 1);
  if (e.key === "ArrowRight") show(current + 1);
});
let touchX = null;
lb.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
lb.addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
  touchX = null;
});

// Nav: solid background after scrolling past the hero, mobile menu
const nav = document.getElementById("nav");
const menuBtn = document.getElementById("menuBtn");
const links = document.getElementById("links");
const onScroll = () => nav.classList.toggle("solid", scrollY > innerHeight * 0.6);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

function setMenu(open) {
  links.classList.toggle("open", open);
  nav.classList.toggle("menu-open", open);
  menuBtn.setAttribute("aria-expanded", open);
}
menuBtn.onclick = () => setMenu(!links.classList.contains("open"));
links.addEventListener("click", (e) => { if (e.target.tagName === "A") setMenu(false); });

// Contact form: opens the visitor's mail app with the message filled in.
const CONTACT_EMAIL = "hello@example.com";
document.getElementById("contactForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const subject = `拍摄咨询：${f.get("type")} - ${f.get("name")}`;
  const body = `称呼：${f.get("name")}\n邮箱：${f.get("email")}\n类型：${f.get("type")}\n\n${f.get("message")}`;
  location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  document.getElementById("formNote").textContent = "谢谢！正在打开你的邮件应用……";
});

document.getElementById("year").textContent = new Date().getFullYear();
renderFilters();
renderGallery(PHOTOS);
