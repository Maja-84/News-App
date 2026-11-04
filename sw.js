const VERSION = "v8";
const SHELL = `shell-${VERSION}`, DATA = "news-data";
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./player.js", "./themen.json", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-192.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(Promise.all([caches.open(SHELL).then(c => c.addAll(ASSETS)), caches.open(DATA).then(c => c.add("./news.json"))]).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Audio nie cachen und Range-Requests unverändert an das Netz durchreichen
  if (url.pathname.includes("/audio/") || e.request.headers.has("range") || e.request.destination === "audio") return;
  if (url.pathname.endsWith("/news.json")) {
    e.respondWith((async () => {
      const cache = await caches.open(DATA);
      try {
        const res = await fetch(e.request, { cache: "no-store" });
        if (res.ok) await cache.put("./news.json", res.clone());
        return res;
      } catch {
        const c = await cache.match("./news.json");
        if (!c) return new Response('{"error":"offline"}', { status: 503, headers: { "Content-Type": "application/json" } });
        const h = new Headers(c.headers); h.set("X-From-Cache", "1");
        return new Response(await c.blob(), { status: 200, headers: h });
      }
    })());
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    if (res.ok) { const cl = res.clone(); caches.open(SHELL).then(c => c.put(e.request, cl)); }
    return res;
  }).catch(() => caches.match("./index.html"))));
});
