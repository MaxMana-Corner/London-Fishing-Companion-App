# London Fishing Companion — Complete Project Brief

**Purpose of this document:** hand it to any AI assistant to bring it fully up to speed on this project in one shot — what the app is, what's in it, how it's built, the rules that must not be broken, and the traps that have already cost real data.

**Status of the facts here:** every number, filename and count was read directly out of the source on **2026-09-03**, not recalled. Where something is uncertain it says so.

---

## 1. What it is, in one paragraph

An offline-first fishing log and field guide for the **Thames River watershed in London, Ontario** (Ontario Fisheries Management Zone 16). It installs to an iPhone or Android home screen as a PWA and works fully with the network off after the first load. It is a bank angler's tool: where to fish, what lives there, what to throw at it, what's legally in season today, and a log of what you actually caught. No account, no ads, no analytics. Built by one person (GitHub org `MaxMana-Corner`), but designed for other people to download and use with **their own** Google account for backup — it is not a single-user personal tool.

- **Live:** https://london-fishing-companion-app.netlify.app
- **Repo:** https://github.com/MaxMana-Corner/London-Fishing-Companion-App
- **Working branch:** `Experimental` (capital E). `main` is behind it.

> **Domain caution.** An older deploy at `london-fishing.netlify.app` still answers and is referenced in stale notes. The `-companion-app` one is current and is what is registered with Google OAuth. Use it everywhere.

---

## 2. Tech stack, and the constraints that produced it

| Layer | Choice | Why |
|---|---|---|
| UI | **Vanilla React 18.3.1** | No Next/Vite/CRA. Pinned to 18.3.1 — the deployed bundle was built with it; do not drift to 19. |
| Build | **esbuild**, one command | Emits a single `app.js`. No framework, no bundler config file. |
| Hosting | **Netlify, drag-and-drop** | No build step at deploy time. Everything is pre-compiled before upload. |
| Offline | **Hand-written service worker** | ~60 lines. No Workbox. |
| Storage | **IndexedDB, then localStorage, then memory** | Three tiers, probed at boot, never assumed. |
| Backend | **None** | Except two *optional* Google integrations (section 9). |
| Tests | **12 Node suites, 402 assertions** | Plain `.mjs`, no test framework. jsdom for the ones that mount the bundle. |

There is no TypeScript, no CSS framework, no state library, no router. Styling is a hand-rolled CSS variable palette.

### Build and test — exact commands

Run from inside `london-fishing-companion/`:

```
npm install
npx esbuild src/main.jsx --bundle --minify --format=iife --target=es2019 --define:process.env.NODE_ENV='"production"' --loader:.jsx=jsx --outfile=app.js
for f in tests/*.mjs; do node "$f" || break; done
```

Then **bump `CACHE` in `sw.js`** and redeploy the folder to Netlify.

---

## 3. Repo layout (exact — older notes are wrong about this)

```
London-Fishing-Companion-App/
├── README.md                     GitHub landing page (near-duplicate of the one below)
└── london-fishing-companion/     <-- THIS folder is the Netlify publish dir
    ├── index.html                shell + Google client ID slot
    ├── app.js                    compiled bundle, 398,843 bytes - NEVER edit directly
    ├── sw.js                     service worker; sole home of the CACHE version
    ├── manifest.webmanifest
    ├── privacy.html              served at /privacy, required by Google OAuth
    ├── netlify.toml, _headers, _redirects
    ├── icon-180/192/512.png, icon-maskable-512.png
    ├── README.md                 public README that ships with the site
    ├── package.json / package-lock.json
    ├── .gitignore                node_modules/
    ├── src/                      <-- all edits happen here
    ├── tests/                    12 .mjs suites
    ├── apps-script/              Google Sheets sync backend (Code.gs, SETUP.md)
    └── standalone/               LondonFishing.html - single-file build, 408 KB
```

**There is no `dist/` folder.** `netlify.toml` sets `publish = "."`, so the project root *is* the deploy folder. Older documentation calls it `dist/`, `gas/` and `solo2/` — all three names are obsolete (now root, `apps-script/`, `standalone/`).

### `src/` module map

| File | Lines | Responsibility |
|---|---:|---|
| `App.jsx` | 4,236 | All UI, all screens, all app state, all content data. The monolith. |
| `baitart.jsx` | 490 | 25 hand-drawn SVG bait/lure illustrations. |
| `hookart.jsx` | 442 | 11 hook patterns + 7 rig diagrams, each with a labelled callout and a scale bar. |
| `photos.js` | 414 | Capture, compression, IndexedDB photo store, archive pipeline, photo export/import. |
| `portability.js` | 356 | Export/import, validation, merge-by-id, schema migration. |
| `gdrive.js` | 299 | Per-user Google Drive OAuth and upload. |
| `services.js` | 267 | **The only** file that calls weather / river-gauge APIs. |
| `astro.js` | 257 | Sunrise, moon phase, solunar, pressure trend. Pure functions, zero network. |
| `main.jsx` | 153 | Entry point: three-tier storage shim, SW registration, React boot. |

---

## 4. Feature surface — verified content inventory

Six tabs: **Spots, Guide, Log, Stats, Learn, Data**.

### Spots — 12 waters

Springbank Park, Greenway Park, Harris Park & the Forks, Gibbons Park, Kilally Meadows ESA, Meadowlily Woods ESA, Vauxhall Park, Thames Park, Westminster Ponds / Pond Mills, Fanshawe Conservation Area, Komoka Provincial Park, Dorchester Mill Pond.

Each spot record carries coordinates, a **12-point depth cross-section** with labelled hot spots, **per-species density ratings** (1–5), a **five-part access rating** (parking / walk / footing / amenities / cost — not one vague star), bank description, hazards, best months, and a tip.

> Depth profiles are informed local knowledge, **not sonar data**. Stated plainly in the README. Not a bug to "fix".

### Guide — 15 species, 25 baits, 11 hook patterns, 7 rigs

Smallmouth bass, Largemouth bass, Northern pike, Walleye, Common carp, Channel catfish, Rock bass, Bluegill, Pumpkinseed, Black crappie, Yellow perch, White bass, Freshwater drum, Migratory trout & salmon, White sucker.

Every bait has its own distinct SVG drawing (25 art keys for 25 baits — a test enforces this after four baits were once found silently rendering the wrong picture). Every hook and rig drawing has a **callout ring plus leader line naming its identifying feature**, and a scale bar so the set reads as a comparable series.

### Log

Trips (conditions, times, spot) and catches (species, length, weight, bait, hook/rig, depth, kept/released, notes, photo). Warns you **before saving** if the species is out of season on that date. In-app camera capture hands off to the phone's native camera.

### Stats

Catch rate, personal bests, breakdowns by species, spot, bait, month and water clarity.

### Learn

6 built-in knots as steppable diagrams (user-extensible), 20 tips grouped by topic, and the full Zone 16 regulations table with today's status.

### Data

Export (three kinds), validated import with a preview, licence expiry reminder, Google Drive backup, Google Sheets sync.

**Every content type — spots, species, baits, knots, tips — has a guided, one-question-per-screen "add your own" wizard.**

---

## 5. Conditions: a deliberate two-tier split

This split is the core design idea of the app. Do not collapse it.

**Tier 1 — zero network, always available.** Anything computable from coordinates plus date: sunrise, sunset, moon phase and illumination, solunar major/minor feeding windows, a Prime/Good/Fair/Slow score for right now, and pressure trend diffed from cached readings. `astro.js` uses a minute-by-minute altitude scan (1440 iterations) rather than root-finding — less elegant, far harder to get subtly wrong, and free on a phone. It returns `null` for events that do not occur (polar day) rather than fabricating a time.

**Tier 2 — best-effort, cached with a visible timestamp.** Live weather plus 3-day forecast (Open-Meteo) and live river level/discharge (Environment Canada GeoMet). Always degrades to the last known reading labelled "as of [time]", never to an error. River gauge is **auto-selected by proximity** — nearest within 50 km, lazily, only when that spot is opened.

**Tier 3 — explicitly rejected.** UTRCA advisory-page scraping (the data is not cleanly structured; a page-watcher is fragile) and any shared/community catch-reporting layer (it turns a single-user app into a multi-user one). **Do not quietly reintroduce either as a "nice to have."**

---

## 6. Season engine

Seasons are **computed from the real regulation rules**, never hardcoded dates. `nthWeekday(year, month, weekday, n)` resolves things like "4th Saturday in June". Twelve season rules cover bass, walleye, pike, musky, trout, a Thames-specific trout exception, catfish, perch, crappie, sunfish, always-open and always-closed. `isOpenOn(key, date)` and `nextOpen(key, date)` drive the home screen's "what is legally open right now" and the out-of-season warning when logging a catch.

Limits are carried as strings, e.g. `"S-6 / C-2"` — sport licence / conservation licence.

---

## 7. Data model

Every record — spot, species, bait, knot, tip, trip, catch — carries:

- `id` — stable string
- `_v` — schema version (currently **2**); `migrateRecord()` and `migrateStore()` upgrade old shapes on load rather than breaking
- `updatedAt` — epoch ms; **this is what merge-by-id compares**
- `custom: true` on user-added records, which is what separates them from built-in content when building a shareable Pack

**Storage keys** (via the three-tier shim): `lfc:catalog`, `lfc:log`, `lfc:sync`, `lfc:env`, `lfc:licence`, `lfc:drive`.

**IndexedDB:** database `lfc`, version 2, two object stores — `kv` (general key/value) and `photos` (keyed by photo id). The version is declared in **two places** (`main.jsx` and `photos.js`) and they must match.

### The "photos" naming trap

Two unrelated things are both called photos. Confusing them has already caused a shipped bug.

| Name | What it actually is |
|---|---|
| `catalog.photos` | A plain object map of spotId or baitId to an image — override pictures for Spots and Guide entries. |
| IndexedDB `photos` store | **Catch photos.** `{ id, catchId, buf, type, thumb, driveId, driveLink, archivedAt, ... }`, pointed at by `catch.photoId`. |

The catalog has exactly six keys: `spots`, `species`, `baits`, `knots`, `tips`, `photos`. **Any code that rebuilds the catalog object must list all six** — `applyRemote()` in `App.jsx` and `mergeData()` in `apps-script/Code.gs` both construct a fresh catalog and then save it, so an omitted key does not merely skip that content, it **deletes** it. Knots were missing from both for a while, which wiped custom knots on the first sync after adding one.

---

## 8. Photos pipeline — and the WebKit trap

Capture, compress to two sizes, store locally, optionally archive the full-size copy to Drive when the device fills up.

- Full-size: longest edge 1600 px, JPEG quality 0.82
- Thumbnail: longest edge 240 px, quality 0.7, stored as a data URL, **permanent — never deleted**, even after the original is archived away
- Archiving triggers at **80%** of device storage quota, oldest first, and archives down to 60% so it does not re-trigger on next launch

**Safety ordering is the whole model:** upload, verify a real file id came back, *then* drop the local original. Never the reverse. Unit-tested.

### The bug that ate every photo — do not reintroduce

**On WebKit/iOS, a `Blob` read out of IndexedDB and written back comes out zero-length and unreadable.** The "Back up everything now" flow recorded each photo's Drive id with `putPhoto({ ...p, driveId })` — re-saving the Blob it had just read — so a single backup silently destroyed every full-size photo in the library.

It then displayed as a *blank box* rather than the thumbnail, because `CatchPhoto` rendered `<img src={state.url || state.thumb}>` with no error handling: `createObjectURL()` on a dead Blob still returns a truthy string, so the "permanent thumbnail" fallback was never reached.

Fixed by:

1. Full-size bytes are stored as an **`ArrayBuffer` (`buf`), never a `Blob`**. ArrayBuffers round-trip through IndexedDB safely on every engine; a Blob is rebuilt only at the moment of display or upload, via `photoBlob()`.
2. A zero-length legacy Blob counts as **absent**, so the thumbnail takes over.
3. `setPhotoDrive()` records the Drive id without touching the bytes.
4. `CatchPhoto` has an `onError` that drops the failed URL and falls back to the thumbnail, then tries Drive **once** (guarded — a failing Drive image would otherwise loop forever).

**Rule: never put a `Blob` into a stored photo record.**

---

## 9. Two Google integrations — kept deliberately apart

They are **not** the same feature and must never be merged.

| | **Google Sheets sync** | **Google Drive backup** |
|---|---|---|
| Code | `apps-script/Code.gs` plus `callSync()` in `App.jsx` | `src/gdrive.js` |
| Identity | Runs as the **developer's** Google account, whoever deployed the Apps Script | Real per-person OAuth — **each user's own** account |
| Data lands in | One spreadsheet owned by the deployer | Each person's own private Drive |
| Setup | About 5 minutes, no Cloud Console | One-time OAuth client ID by the developer, then zero per user |
| Built | **First**, when the app was assumed personal | **Later**, when the requirement became "strangers download this" |

Sheets sync was kept rather than replaced because it genuinely suits a single-user or deliberately-shared log. Drive backup exists because an Apps-Script shared identity fundamentally *cannot* give strangers private backups — everyone's data would land in one person's Drive.

### Drive specifics (all deliberate)

- **Scope is `drive.file` only** — the app can touch only files it created itself. Never widened to `drive.appdata` or full Drive.
- **Files are created private, never link-shareable.** This was explicitly *flipped* mid-project once the users became real strangers. Do not flip it back.
- **The OAuth token lives in memory for the session and is never persisted.** Browser-only apps get short-lived access tokens, not refresh tokens — a refresh token needs a client secret, which cannot live safely in browser JS. The `connected` flag resets to `false` on every reload rather than lying about a session that no longer has a valid token.
- **Known asymmetry:** silent refresh depends on Google's browser-session cookie, which Safari's Intelligent Tracking Prevention interferes with. Expect more "reconnect" prompts on iOS than on Android. Platform limitation, not a bug to chase.
- OAuth requires an **exact** authorized JavaScript origin: `https://london-fishing-companion-app.netlify.app`, no trailing slash, no path.

### Google Cloud Console gates — do not confuse them

- **Gate 1 — Publishing status.** While the consent screen is in *Testing*, only listed Test users can sign in; everyone else gets a hard `Error 403: access_denied`. **This is the one that actually blocks sign-in.**
- **Gate 2 — Verification review.** Until Google completes formal verification, users see a "Google hasn't verified this app, Continue" interstitial and there is a roughly 100-user lifetime cap. **Cosmetic click-through, not a blocker.** Resolving it requires publishing the app, verifying domain ownership in Search Console (meta-tag method — DNS is impossible on a `netlify.app` subdomain), then submitting. Optional.

---

## 10. Export and import

Three deliberately separate export kinds, because sharing your knowledge and backing up your catch history are different acts with different privacy implications:

- **Pack** — custom spots/species/baits/knots/tips only. Safe to hand another angler. **Excludes built-in content** so importing never creates duplicates. Carries **no** catches and **no** catch photos.
- **Log** — trips, catches, catch photos.
- **Full** — both.

Import **always** validates the whole file, computes a merge plan, and **shows it before writing anything** ("12 new spots, 3 updated, 40 unchanged"). Merge is by `id`, newest `updatedAt` wins.

**Catch photos travel** as of the latest work: full-size bytes when the device still holds them, thumbnail-only once archived (the original being recoverable from that person's Drive). Import never downgrades a local full-size copy to a thumbnail. Import cap is **64 MB**, raised from 20 MB once images were embedded.

> Tie-break nuance, deliberate: `mergeList()` in `portability.js` requires the incoming record to be *strictly* newer (`>`), while the two sync paths use `>=`. Strict `>` is what makes re-importing your own backup report "40 unchanged" rather than "40 updated". **Do not harmonise it.**

---

## 11. Non-negotiable invariants

1. **No screen's first render may depend on a network call completing.** Every fetch has a cached fallback and an "as of [time]" label.
2. **All network access lives in `services.js` and `gdrive.js`** — with exactly one sanctioned exception: `callSync()` in `App.jsx` (Sheets sync, which predates the rule). `tests/audit.mjs` enforces this by allowing at most one `fetch(` in `App.jsx`. Do not move `callSync`, do not add a second call beside it.
3. **Every fetch returns `{ ok, ... }` or `{ ok:false, error }` and never throws.** Timeouts on everything — 9 s weather and gauge, 30 s sync, 45 s Drive. `callSync` throws by design (all its callers wrap it) but it is **not** exempt from the timeout rule.
4. **Storage is three-tier and every write is checked**, never assumed. The app probes which tier it actually got and says so honestly if nothing durable is available.
5. **Photo archiving uploads before it deletes**, and only after a verified success. The thumbnail is never deleted.
6. **Drive is per-user, private-by-default, `drive.file` only**, with a session-only token.
7. **The two Google integrations must not be conflated.**
8. **Editing `src/*` means recompiling `app.js`. Editing anything the service worker precaches means bumping `CACHE` in `sw.js`.** The browser only re-checks a service worker by diffing `sw.js`'s own bytes — it never re-inspects the precache list. This has caused a real production incident: a correct OAuth client ID appeared broken because a stale SW-cached `index.html` from before the ID was added was still being served. **`sw.js` is the only place the cache version is written down.**
9. **The standalone single-file build cannot support Google sign-in**, by construction — OAuth needs a fixed pre-registered origin and a local file has none. `driveSupported()` detects and blocks this with a clear message rather than failing confusingly.
10. **"Automatic" never means "runs in the background."** iOS gives web apps no background execution. Every "automatic" behaviour — storage checks, sync, archiving, licence reminders — actually means "checked when the app is opened." Never write UI copy that overpromises this.

---

## 12. The service worker

About 60 lines. Cache-first with network fallback, `skipWaiting()` plus `clients.claim()` so updates land on next load rather than requiring every tab closed. `netlify.toml` and `_headers` serve `sw.js` with `must-revalidate` — load-bearing, because otherwise the worker file itself gets stuck in an HTTP cache and the byte-diff update mechanism never fires.

**It handles same-origin GETs only.** It previously intercepted and cached *every* GET including cross-origin, cache-first, forever. Confirmed live: an Open-Meteo request was written into the cache and then served frozen. That meant live weather and river levels stuck at their first-ever value while the UI still said "just now"; token-authenticated Google Drive responses sat in the cache after sign-out; Google's `gsi/client` script was pinned stale; and a single 500 became permanent. Now cross-origin passes straight through, the `index.html` fallback is scoped to `req.mode === "navigate"`, and only `res.ok` is cached.

`tests/test-sw.mjs` runs the worker for real — handlers invoked in a VM against fake `caches` and `fetch`. It fails 9 assertions against the old handler and passes 21 against the current one.

---

## 13. Test suite — 12 files, 402 assertions

Run from `london-fishing-companion/` as `node tests/<file>`.

| Suite | Assertions | Covers |
|---|---:|---|
| `test-port.mjs` | 73 | Export/import against malformed, truncated and adversarial JSON including a `__proto__` id; merge idempotency; weather shaping. |
| `audit.mjs` | 66 | Source-level check against the whole accumulated spec — offline-first invariants, Tier 3 exclusions, single network choke point, hygiene. |
| `test-drive-photos.mjs` | 63 | Drive scope stays narrow, no sharing calls exist *in code*, token never persisted, archive ordering, thumbnail never deleted, ArrayBuffer storage. |
| `test-dist.mjs` | 41 | Deployable structure, PWA manifest requirements, service worker correctness, bundle freshness. |
| `test-astro.mjs` | 34 | Sunrise and moon phase against published real-world data; polar-day edge cases return `null` rather than a fabricated time. |
| `test-hookart.mjs` | 23 | Every hook and rig has both a callout and a scale bar; live render. |
| `test-single.mjs` | 23 | Standalone build: zero external requests, renders under hostile conditions. |
| `test-sw.mjs` | 21 | Service worker handlers executed for real. |
| `test-live-new.mjs` | 18 | Boots the real compiled bundle with no IndexedDB, no network, no client ID and storage at 90% — must still render and must not dead-end its own advice. |
| `test-catch-photos.mjs` | 17 | Catch-photo export/import round trip, behaviourally, including hostile input. |
| `verify-baitart.mjs` | 13 | Every bait has its own distinct drawing, no silent fallback to the wrong art. |
| `test-render.mjs` | 10 | Headless render with failure injection. |

**Real bugs these caught before shipping**, as evidence they are not ceremony: a storage-full warning telling people to "connect Google Drive" in a build where Drive was not configured at all; an IndexedDB version bump that would have broken whichever entry point was not updated; four bait keys pointing at art that did not exist; a hook pattern missed in the callout redesign; a gauge station id recalled from memory that turned out to be wrong.

---

## 14. Current status (2026-09-03)

**All of the work below is merged into `main` and live in production.** `main` and `Experimental` have identical trees; the live site serves `lfc-v10` with the same-origin-only service worker.

| Commit | What |
|---|---|
| `beaf788` | Repaired the test suite — **8 of 10 suites were throwing before asserting anything** (paths pointing at a `dist/` and `solo2/` that do not exist; unresolvable `./src` imports). Fixed custom knots being wiped on Sheets sync. Added the missing `callSync` timeout. |
| `f59f301` | The iOS photo fixes (section 8) plus catch photos in exports (section 10). Built and tested. |
| `5dc9a01` | Service worker cross-origin fix (section 12) plus `test-sw.mjs`. |

Interleaved with those are several `Update sw.js` commits and merge commits made by the owner through the GitHub web UI.

### Open items

- **Test on a real iPhone — the one thing still genuinely unverified.** The WebKit Blob behaviour cannot be covered by Node. Take a photo, run "Back up everything now", confirm it survives, then export a Log and re-import it. The fix is deployed but has only been proven in a Node/VM harness.
- **Cache-version drift is a live hazard.** The owner bumps `CACHE` by hand in the GitHub UI and on the deploy folder as well as in git, so the two have disagreed before — git said v7 while production served v9. **Always check the live `sw.js` before choosing a new number.**
- Google branding/verification (Gate 2, section 9) is unresolved and optional.
- No automated deploy pipeline; every release is a manual drag-and-drop onto Netlify. Fine at this scale.
- No CI — the suites only run when someone runs them.

---

## 15. If you are an AI asked to change this app

1. **Edit `src/`, never `app.js`.**
2. Rebuild and bump `CACHE`. A source edit that is not recompiled changes nothing a user will ever see.
3. Run the suites relevant to what you touched, from `london-fishing-companion/`.
4. A lot of surface here looks arbitrary but is not — scope choices, ordering, thresholds, exclusions, the tie-break asymmetry. If a change appears to call an invariant in section 11 into question, **flag it as a deliberate trade-off rather than silently reversing it.**
5. Tell the owner to redeploy — a rebuild only exists locally until the folder is dragged onto Netlify again.
6. Two public READMEs exist (repo root and `london-fishing-companion/`) and have drifted before. If a change affects either audience, update both. There is no `MAINTAINER.md`, despite older notes claiming one.

### Voice, if you are writing user-facing copy

Plain, direct, unhyped, second person. Honest about limitations rather than smoothing them over — "no app can do anything while it's closed on an iPhone, that's an Apple platform rule, not a shortcut taken here." Ends with "Tight lines."
