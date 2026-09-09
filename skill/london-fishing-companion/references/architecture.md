# Architecture reference

## Where things actually live

Everything below is relative to `london-fishing-companion/`, which is both
the project root and the Netlify publish directory (`publish = "."`). The
deployable files sit at that root next to `src/`. **There is no `dist/`
folder, no `gas/` folder and no `solo2/` folder** — those names appear in
older notes and in a previous version of this skill, and they are wrong.
The build output is `app.js` at the root; the Apps Script backend is under
`apps-script/`; the single-file build is under `standalone/`.

## Source layout

| File | Purpose |
|---|---|
| `src/App.jsx` | All UI, all screens, all app-level state. Largest file. |
| `src/astro.js` | Sunrise, sunset, moon phase, solunar windows, pressure trend. **Pure functions, zero network, ever.** Verified against published sunrise/moon data. |
| `src/services.js` | The **only** file that talks to Open-Meteo (weather) and Environment Canada's GeoMet API (river gauges). Every export returns `{ ok, ... }`, never throws. |
| `src/gdrive.js` | Per-user Google Drive sign-in and upload. Google Identity Services token client, `drive.file` scope only. |
| `src/photos.js` | Camera capture handling, client-side compression (full + permanent thumbnail), IndexedDB photo store, storage-pressure detection, the archive pipeline. |
| `src/portability.js` | Export (Pack/Log/Full), import validation, merge-by-id logic, schema migration. Reused by both manual export/import and Drive backup. |
| `src/baitart.jsx` | 25 hand-drawn SVG bait/lure illustrations, keyed by bait id with a kind-based fallback. |
| `src/hookart.jsx` | 10 hook patterns + 7 rig diagrams, each with a `Callout` (labelled ring + leader line) on the identifying feature and a `ScaleBar` for relative size. |
| `src/main.jsx` | Entry point. Sets up the three-tier storage shim (`window.storage`), registers the service worker (hosted build only), boots React. |
| `app.js` | The compiled bundle — the only script the browser runs. Built from `src/main.jsx` by esbuild. Never edit directly. |
| `sw.js` | Hand-written service worker. Precaches a fixed asset list, cache-first with network fallback, `skipWaiting`/`clients.claim` so updates apply without requiring all tabs closed. Sole home of the `CACHE` version string. |
| `netlify.toml`, `_headers`, `_redirects` | Netlify config. The one that matters: `sw.js` served `must-revalidate` so it's never itself stuck in an HTTP cache. |
| `privacy.html` | Standalone privacy policy page, precached, served at `/privacy`. Required by Google's OAuth consent screen setup. |
| `apps-script/Code.gs`, `apps-script/SETUP.md` | Apps Script backend for the *separate* Google Sheets sync feature (developer's own identity — see decisions.md for why this must not be confused with Drive backup). |
| `standalone/LondonFishing.html` | Standalone single-HTML-file build. Same `src/App.jsx` as the hosted build; different entry point (no service worker, hardened storage-tier probing since a local file has fewer guarantees). Cannot do Google sign-in — see invariant #9 in SKILL.md. |
| `tests/*.mjs` | Node-run verification suites, no browser needed except where jsdom is used to actually mount the compiled bundle. See status.md for what each one checks. |

## Storage model

Three tiers, tried in order, every operation checked rather than assumed:

1. **IndexedDB** — primary. Two object stores: `kv` (general key/value —
   catalog, log, sync settings, licence, cached environment readings) and
   `photos` (keyed by photo id, added in schema v2 — bumping the DB version
   required updating **both** entry points, `src/main.jsx` and the old
   standalone entry, to create the same object store or the app would fail
   to open the DB on whichever entry point wasn't updated).
2. **localStorage** — fallback mirror.
3. **In-memory `Map`** — last resort, so the app never hard-crashes even if
   both real storage tiers are unavailable (private browsing edge cases,
   some `file://` contexts).

The app probes which tier it actually landed on at boot and surfaces an
honest, non-blocking banner if nothing durable is available — it never
pretends a save succeeded when it didn't.

## Data model shapes (informal)

Every record — spot, species, bait, knot, tip, trip, catch — carries:
- `id` (string, stable)
- `_v` (schema version, for migration — `migrateRecord()` / `migrateStore()`
  in `portability.js` upgrade old shapes on load rather than breaking)
- `updatedAt` (epoch ms) — this is what merge-by-id compares to decide which
  copy of a record wins when importing or syncing

Custom (user-added) records additionally carry `custom: true`, which is
what separates them from built-in content when building a Field Guide Pack
export (built-ins are excluded — see decisions.md).

The catalog has exactly six keys: `spots`, `species`, `baits`, `knots`,
`tips`, `photos`. **Any code that rebuilds the catalog object must list all
six.** `applyRemote()` in `App.jsx` and `mergeData()` in `apps-script/Code.gs`
both construct a fresh catalog and then save it, so a key omitted there is
not merely skipped — it is deleted. Knots were missing from both for a
while, which wiped a user's custom knots on their first sync after adding
one. If you add a seventh content type, grep for every place that spells the
key list out.

A **catch** record carries `photoId` (pointing into the IndexedDB `photos`
store) rather than embedding image data directly. A **photo** record
carries `blob` (full-resolution, present until archived), `thumb` (a small
data-URL thumbnail, **permanent, never deleted**), `driveId`/`driveLink`
(populated once archived), and `archivedAt`.

## PWA / service worker mechanics

- The service worker precaches a fixed list (`index.html`, `app.js`,
  `manifest.webmanifest`, `privacy.html`, icons) on install, and answers
  navigation with cache-first, falling back to network, falling back to the
  cached `index.html` if fully offline.
- **The browser only re-checks a service worker by diffing `sw.js`'s own
  bytes.** It does not re-inspect what's inside the precache list. This
  means editing `index.html` or `app.js` and redeploying does **nothing**
  for anyone who already has the app installed, until `sw.js`'s `CACHE`
  constant is also changed. This is invariant #8 in SKILL.md and has
  already caused one real, confirmed production incident (a filled-in
  Google OAuth client ID appeared not to work because a stale
  service-worker-cached copy of `index.html` — from before the ID was
  added — was still being served).
- `skipWaiting()` on install and `clients.claim()` on activate are both
  present specifically so an update takes effect on next load rather than
  requiring every open tab/instance to be closed first.

## Why the standalone single-file build is limited

`standalone/LondonFishing.html` inlines everything (icons, manifest, all
code) as one file with zero external references, specifically so it can be
opened directly with no hosting. Two hard, non-negotiable limits:

- **No service worker.** A lone HTML file cannot register one — the worker
  script must be a separate same-origin file. So this build cannot
  guarantee offline launch the way the hosted PWA does; it only guarantees
  offline *operation once loaded*.
- **No Google sign-in, ever.** OAuth requires a fixed, pre-registered
  origin. A local file has none. `driveSupported()` in `gdrive.js`
  explicitly detects and blocks this case with a clear message rather than
  failing silently or confusingly.

It remains useful as an Android-only fallback for someone who wants zero
hosting. On iOS, Safari opens local HTML in a sandboxed Quick Look-style
preview where storage does not reliably persist — this was tested and
confirmed, not assumed.
