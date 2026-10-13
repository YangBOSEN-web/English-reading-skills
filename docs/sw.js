// Offline support: the app and the dictionary are stored on the device after the first visit.
// Bump SHELL when app files change; the dictionary has its own cache so updates don't re-download it.
const SHELL = "reading-words-shell-v1";
const DICT = "reading-words-dict-v1";
const SHELL_FILES = [
  "./", "index.html", "app.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js",
];
const DICT_FILES = [..."abcdefghijklmnopqrstuvwxyz"].map(c => `dict/${c}.json`);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

async function fetchDictionary() {
  const cache = await caches.open(DICT);
  for (const f of DICT_FILES) {
    if (await cache.match(f)) continue;
    try {
      const r = await fetch(f);
      if (r.ok) await cache.put(f, r);
    } catch { /* offline: try again next time */ }
  }
}

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== DICT) await caches.delete(k);
    await self.clients.claim();
  })());
  event.waitUntil(fetchDictionary());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname.includes("/dict/")) {
    // dictionary: cache first, it never changes
    event.respondWith(caches.open(DICT).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
    return;
  }

  // app files: answer from the cache at once, refresh it in the background for next time
  event.respondWith(caches.open(SHELL).then(async c => {
    const key = req.mode === "navigate" ? "index.html" : req;
    const hit = await c.match(key, { ignoreSearch: true });
    const net = fetch(req).then(r => {
      if (r.ok && r.type === "basic") c.put(key, r.clone());
      return r;
    }).catch(() => null);
    if (hit) {
      event.waitUntil(net);
      return hit;
    }
    return (await net) || new Response("Offline", { status: 503 });
  }));
});

// The app asks at every start, so an interrupted dictionary download is finished later.
self.addEventListener("message", event => {
  if (event.data === "fetch-dictionary") event.waitUntil(fetchDictionary());
});
