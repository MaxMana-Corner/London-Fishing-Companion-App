/* Offline cache. Bump CACHE when you redeploy so phones pick up the new build. */
const CACHE = "lfc-v13";
const ASSETS = [
  "./", "./index.html", "./app.js", "./manifest.webmanifest", "./privacy.html",
  "./icon-180.png", "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Only ever touch our own files.

   This used to intercept and cache EVERY GET, cross-origin included, and
   serve it cache-first forever. That froze live weather and river levels at
   whatever was fetched first — while the app still stamped them "as of now",
   which is worse than showing stale data honestly. It also wrote Google Drive
   responses into the cache; those are fetched with an access token and were
   still sitting there after sign-out. And it pinned Google's sign-in script
   to a stale copy.

   Weather, river gauges and Google are live services with their own
   freshness rules. They are none of the service worker's business. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   // straight to the network

  // Falling back to index.html only makes sense for a page navigation. Doing
  // it for every request handed HTML to callers expecting JSON.
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).catch(() => caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      // Never cache a 404 or a 500 — one bad response would otherwise stick
      // for the life of this cache version.
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
