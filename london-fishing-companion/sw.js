/* Offline cache. Bump CACHE when you redeploy so phones pick up the new build. */
const CACHE = "lfc-v41";

/* Region maps live in their own cache, and it is deliberately NOT versioned.

   A region you downloaded on purpose - half a megabyte, possibly over mobile
   data, possibly standing in a car park about to lose signal - must not be
   thrown away because the app shipped a new build. The versioned cache above
   is for the app; this one is for things the person chose to keep.

   The region that ships in ASSETS is not in here. It is precached with the
   rest of the app, so it updates with the app, and the fetch handler looks
   there first. */
const MAP_CACHE = "lfc-maps";
const isRegionFile = (url) =>
  /\/map\/[a-z0-9-]+\.json$/.test(url.pathname) && !url.pathname.endsWith("/index.json");
const ASSETS = [
  "./", "./index.html", "./app.js", "./manifest.webmanifest", "./privacy.html",
  "./icon-180.png", "./icon-192.png", "./icon-512.png", "./favicon-32.png",
  "./map/london-on.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(
        ks.filter((k) => k !== CACHE && k !== MAP_CACHE).map((k) => caches.delete(k))))
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

  // A downloaded region goes to the cache that survives an app update.
  // The precached one is checked FIRST so it updates with the app rather than
  // being shadowed by an older copy somebody downloaded.
  if (isRegionFile(url)) {
    e.respondWith(
      caches.open(CACHE).then((c) => c.match(req)).then((hit) => hit ||
        caches.open(MAP_CACHE).then((c) => c.match(req)).then((kept) => kept ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(MAP_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })))
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
