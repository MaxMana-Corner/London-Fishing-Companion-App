# London Fishing Companion — Complete Project Brief

**Purpose of this document:** hand it to any AI assistant to bring it fully up to speed on this project in one shot — what the app is, what's in it, how it's built, the rules that must not be broken, and the traps that have already cost real data.

**Status of the facts here:** every number, filename and count was read directly out of the source on **2026-09-13**, not recalled. Where something is uncertain it says so.

**What changed since the 2026-09-03 revision:** the app went from one province to three, from 12 fishing locations to 84, and from 15 species to 45. Shared trips, a pre-cast wizard, a video library and a reading-the-water section all arrived. The test suite went from 12 files to 46. Treat any older copy of this document as wrong rather than merely stale — most of its numbers are off by a multiple.

---

## 1. What it is, in one paragraph

An offline-first fishing log and field guide covering **eight cities across three provinces** — Ontario, British Columbia and Quebec — of which London, Ontario (Fisheries Management Zone 16) is the one bundled with the app and the one the season table is written for. It installs to an iPhone or Android home screen as a PWA and works fully with the network off after the first load. It is a bank angler's tool: where to fish, what lives there, what to throw at it, what's legally in season today, and a log of what you actually caught. No account, no ads, no analytics. Built by one person (GitHub org `MaxMana-Corner`), but designed for other people to download and use with **their own** Google account for backup — it is not a single-user personal tool.

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
| Tests | **48 Node suites, 1,943 assertions** | Plain `.mjs`, no test framework. jsdom for the ones that mount the bundle. |
| Static checks | **6 tools** | `scope-check`, `tdz-check`, `props-check`, `dead-code`, `result-check`, `icon-contrast`. See section 13. |

There is no TypeScript, no CSS framework, no state library, no router. Styling is a hand-rolled CSS variable palette.

### Build and test — exact commands

Run from inside `london-fishing-companion/`:

```
npm install
node tools/build.mjs            # -> app.js, with a size ceiling and NODE_ENV checks
node tools/build-single.mjs     # -> standalone/Creel.html, the offline single file
node tools/build-map-index.mjs  # -> map/index.json, after any map or spot-pack change

# every static check, then every suite
for t in scope tdz props dead-code result icon-contrast; do node tools/$t-check.mjs 2>/dev/null || node tools/$t.mjs; done
for f in tests/*.mjs; do node "$f" || break; done   # *.mjs, not test-*.mjs
```

Do NOT call esbuild directly any more. `tools/build.mjs` uses the esbuild JS API — the CLI fails on Windows with `EINVAL` on `npx.cmd` — and it enforces a size ceiling and checks that NODE_ENV actually took, both of which have caught real problems.

Then **bump `CACHE` in `sw.js`** and redeploy the folder to Netlify.

---

## 3. Repo layout (exact — older notes are wrong about this)

```
London-Fishing-Companion-App/
├── README.md                     GitHub landing page (near-duplicate of the one below)
└── london-fishing-companion/     <-- THIS folder is the Netlify publish dir
    ├── index.html                shell + Google client ID slot
    ├── app.js                    compiled bundle, ~846 KB - NEVER edit directly
    ├── sw.js                     service worker; sole home of the CACHE version
    ├── manifest.webmanifest
    ├── privacy.html              served at /privacy, required by Google OAuth
    ├── netlify.toml, _headers, _redirects
    ├── icon-180/192/512.png, icon-maskable-512.png
    ├── README.md                 public README that ships with the site
    ├── package.json / package-lock.json
    ├── .gitignore                node_modules/
    ├── src/                      <-- all edits happen here
    ├── tests/                    46 .mjs suites
    ├── apps-script/              Google Sheets sync backend (Code.gs, SETUP.md)
    ├── tools/                    21 build and check scripts
    ├── map/                      8 region maps + spot packs + index.json
    └── standalone/               Creel.html - single-file build, ~2.6 MB (carries a map)
```

**There is no `dist/` folder.** `netlify.toml` sets `publish = "."`, so the project root *is* the deploy folder. Older documentation calls it `dist/`, `gas/` and `solo2/` — all three names are obsolete (now root, `apps-script/`, `standalone/`).

### `src/` module map

| File | Lines | Responsibility |
|---|---:|---|
| `App.jsx` | 15,234 | All UI, all screens, all app state, most content data. The monolith. |
| `baitart.jsx` | 490 | Hand-drawn SVG bait/lure illustrations, one per bait plus a per-kind fallback. |
| `tactics.js` | — | 21 tactics, their rigs, knots, target species and baits. |
| `readwater.js` | — | 15 "what you are looking at" entries: see / means / cast / present. |
| `precast.js` | — | The pre-cast wizard's survey and scoring engine. No DOM. |
| `sharedtrip.js` | — | Join codes, angler matching across phones, the handoff bundle. |
| `videos.js` | — | The video library: shelves, YouTube id parsing, the one oEmbed call. |
| `hookart.jsx` | 442 | 11 hook patterns + 7 rig diagrams, each with a labelled callout and a scale bar. |
| `photos.js` | 414 | Capture, compression, IndexedDB photo store, archive pipeline, photo export/import. |
| `portability.js` | 356 | Export/import, validation, merge-by-id, schema migration. |
| `gdrive.js` | 299 | Per-user Google Drive OAuth and upload. |
| `services.js` | 267 | **The only** file that calls weather / river-gauge APIs. |
| `astro.js` | 257 | Sunrise, moon phase, solunar, pressure trend. Pure functions, zero network. |
| `main.jsx` | 153 | Entry point: three-tier storage shim, SW registration, React boot. |

---

## 4. Feature surface — verified content inventory

Five tabs: **Home, Map, Trip, Guide, Options**. (Older notes say six — Spots, Guide, Log, Stats, Learn, Data. That layout is gone: Spots moved onto the Map, Stats became a sheet off Trip, and Learn and Data merged into Guide and Options.)

### Regions — 8 cities, 3 provinces, 84 fishing locations

| Province | Cities | Locations |
|---|---|---|
| Ontario | London *(bundled)*, Windsor, Sarnia, Goderich, Grand Bend, Greater Toronto | 12 + 50 |
| British Columbia | Langley | 10 |
| Quebec | Rawdon | 12 |

**Only London ships inside the app.** Every other city is a downloadable map, and its fishing locations come down **with that map** rather than with the app — they are in `map/<city>-spots.json`, not in `src/`. A pack that has ever been read is kept in storage for good, so a favourite survives a region change.

**Every coordinate has been measured against the OpenStreetMap water geometry in that city's own map file** (`tools/spot-check.mjs`). All 84 are within 400 m of the water they name; worst case is 146 m. Before that check existed, 15 were more than 400 m out and one — "Lac Rawdon" — was nearest to Lac *Pontbriand*.

Each location carries coordinates, hazards, best months and a tip. The London twelve additionally carry a 12-point depth cross-section, per-species density ratings and a five-part access rating. **Researched locations deliberately carry neither**, and are badged Unchecked — inventing an access score is how somebody ends up stuck in mud with nowhere to park.

### Guide — 45 species, 33 baits, 21 tactics, 15 water reads, 11 hooks, 7 rigs

Eleven categories, reached from one bar that spans both encyclopedia screens: **Fish, Baits & Lures, Hooks & Rigs, Gear, Reading Water, Tactics, Knots, Tips, Handling, Rules, Videos**.

- **45 species** — 20 Ontario, 14 British Columbia, 11 Quebec. Province-filtered: a Langley phone shows the BC fourteen and none of the Ontario twenty. Quebec's names carry the French, because the zone 8 rules tool is a French page and that is the name you need to search it with.
- **33 baits**, including 8 flies. Each has a **speed** (Dead slow / Slow / Medium / Fast / Varies / Static) and a one-line retrieve.
- **21 tactics**, province-filtered, each naming its rigs, knots, target species and baits.
- **15 "reading the water" entries**, each four things: what you **see**, what it **means**, where to **cast**, and how to **present**.
- Every fish page shows **tried-and-true pairings** — computed, never authored: the fish names the bait, the bait names the fish back, and a tactic names both. 45 of 45 fish have at least one.
- A **video library** on seven shelves. Nothing is preloaded; a YouTube link added to any record files itself onto the right shelf automatically.

### Trip

Trips (conditions, times, spot, party) and catches (species, length, weight, bait, hook/rig, depth, kept/released, notes, photo, **who caught it**). Warns **before saving** if the species is out of season on that date.

- **Shared trips.** A QR code — which is a link back to the app, since Creel has an encoder but no decoder and no camera — puts the same trip on a second phone. Both fish offline all day; either then sends the other their catches as a small file. See section 16.
- **The pre-cast wizard.** Nine questions about the water in front of you, then one lure and one tactic with the reasoning that produced them.

### Stats

Reached from the Trip tab or the dashboard banner. Catch rate, personal bests, breakdowns by species, spot, bait, month and water clarity — **your fish only**, with a separate "who caught what" block on seasons that include shared trips.

### Options

Appearance, licences, maps, community, backup, connected services, help, about.

- **Licences are a list**, each with province, type, purchase date and card number. Salt/tidal water is a separate group where it applies, because in BC it is a federal licence and the freshwater one is provincial.
- **People you fish with** — add, rename, remove. Removing somebody reassigns their catches to you rather than orphaning them.
- **Position history** — every "find my position", by place, date, time and coordinates, searchable and clearable.
- **Help** is four headings with one search across them, including a first-five-minutes walkthrough and a troubleshooting section.

**Every content type — locations, species, baits, knots, tips, tactics — has a guided, one-question-per-screen "add your own" wizard.**

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

## 13. Test suite — 48 files, 1,943 assertions, plus 7 static checks

Run from `london-fishing-companion/` as `node tests/<file>`. There is no runner and no framework: each file prints `PASS`/`FAIL` lines and exits non-zero if anything failed.

```
for f in tests/*.mjs; do node "$f" || break; done   # *.mjs, not test-*.mjs
```

### The seven static checks — run these first, they are seconds not minutes

| Tool | Asks |
|---|---|
| `scope-check.mjs` | Does every identifier read in expression position have something in scope? Catches the white-screen class. |
| `tdz-check.mjs` | Does any hook's **dependency array** name something declared *below* it? Catches the other white-screen class — see below. |
| `props-check.mjs` | Is every prop passed accepted, and every prop accepted passed? |
| `dead-code.mjs` | Any component never rendered, prop never read, name never read, or branch never reachable? |
| `dead-css.mjs` | Any class styled in the CSS block that no `className` can produce? |
| `result-check.mjs` | Does every `{ ok }` result actually get checked at its call sites? |
| `icon-contrast.mjs` | Does every icon clear 3:1 against its own fill, in both themes and both palettes? |

**`scope-check` and `tdz-check` are deliberately two tools.** `const` is hoisted but not initialised, so a name can be *in scope* and *not yet readable*. `scope-check` answers the first question and passes the second case — correctly, and uselessly. That gap has cost this project two production-shaped bugs: a Rules tab that would have white-screened, and a `useCallback` whose dependency array named a `useMemo` 500 lines below it, which took down 143 assertions across twelve suites at once. In a minified bundle it reads as `Cannot access 'Ze' before initialization`, naming neither the variable nor the line.

### The suites worth knowing about

| Suite | Covers |
|---|---|
| `audit.mjs` | Source-level check against the whole accumulated spec — offline-first invariants, single network choke point, hygiene. |
| `test-refs.mjs` | Every cross-reference between every record: species↔baits↔tactics↔spots↔knots↔gear, **both directions**, and province-scoped. |
| `test-spot-accuracy.mjs` | Every fishing location measured against the OpenStreetMap water geometry in its own city's map file. |
| `test-sharedtrip.mjs` | Join codes, angler matching across two phones, the handoff bundle, and who owns a trip record. |
| `test-precast.mjs` | The wizard's engine — including that its stated reasoning is the actual cause of its pick. |
| `test-videos.mjs` | The video library, including the six shapes of YouTube URL people paste and the eight that must be refused. |
| `test-licence.mjs` | Expiry arithmetic across three provinces with three different rules. |
| `test-matrix.mjs` | Every screen and sheet, once per province, watching for a throw, a blank render, or a raw internal id on screen. |
| `test-guide-nav.mjs`, `test-options.mjs`, `test-sharedtrip-ui.mjs`, `test-render.mjs`, `test-live-new.mjs` | Mount the real compiled bundle in jsdom under hostile conditions and drive it. |
| `regress.mjs` | Reintroduces each known historical bug into a copy of the tree and requires the relevant check to object. |

### Real bugs these caught, as evidence they are not ceremony

- `capOnePerCatch` read the result wrapper instead of the photos, threw on its first line every load inside a `.catch(() => {})`, and **the one-photo-per-catch rule had therefore never once run**.
- A species record read an undeclared `regs`, white-screening on every fish — in committed code.
- 15 of 51 fishing locations were more than 400 m from any water; one was nearest to the wrong lake entirely.
- `fly-swing` was invisible to the entire cross-reference suite for months because the extractor required exactly four spaces of indentation and that one record is written `{    id:` on a single line.
- A tactic named **no baits at all** (`baits: []`) — it predated the app having any flies, and when eight arrived nothing came back to connect them.
- `buildExport`'s default branch exported the entire log for any unrecognised kind.
- `props-check` itself parsed the commas inside a placeholder string as prop separators.

**The tests have been wrong more often than the app in recent rounds.** Two of them "passed" against the wrong DOM element; one read `root.textContent`, which includes the 60 KB injected stylesheet, so every length assertion passed on a blank screen. Every new check is now verified by reintroducing the bug it was written for.

---

## 14. Current status (2026-09-13)

Working branch is `Experimental`. `main` is behind it and **is** the deploy branch — pushing to `Experimental` is not a release.

Service worker is at `lfc-v107`. `MAP_CACHE` is deliberately **unversioned** so downloaded maps survive an app update instead of being re-fetched.

Recent arcs, newest first:

| Arc | What |
|---|---|
| Options | Licences as a list with province/type/date/card and saltwater; friends; position history; the nav bar no longer covers any sheet's last control. |
| Guide | Rules organised general-then-province with all three always present; reading the water; bait speeds; computed tried-and-true pairings; the video library. |
| Trip | The pre-cast wizard; attribution across the whole log; searching past trips by who was on them. |
| Map | Every coordinate measured against real water; 28 new locations; Rawdon rebuilt around waters you can reach after work. |
| Dashboard | Barometer, wind and light as readings; the expanded season no longer clipped; a place card. |
| Shared trips | Phases 1 and 2 — anglers and attribution, then the join code and the handoff. |
| Quebec | Rawdon as the third province, and three tests that only knew two. |

### Open items

- **Test on a real iPhone — still genuinely unverified.** The WebKit Blob behaviour cannot be covered by Node, and neither can the QR code, the notch inset, or the map drag gestures.
- **Shared trips phase 3** — automatic merge for people who already share a Google Sheet — is designed and not built. It needs no rework to add.
- **The video library ships empty**, by request. It is the frame.
- **Cache-version drift is a live hazard.** `CACHE` gets bumped by hand in the GitHub UI as well as in git, so the two have disagreed before — git said v7 while production served v9. **Always check the live `sw.js` before choosing a new number.**

---

## 15. If you are an AI asked to change this app

1. **Edit `src/`, never `app.js`.**
2. Rebuild with `node tools/build.mjs` and bump `CACHE`. A source edit that is not recompiled changes nothing a user will ever see.
3. Run the seven static checks first — they take seconds — then the suites relevant to what you touched, from `london-fishing-companion/`.
4. **When you add a province, a species, a city or a category, grep for the existing ones as literals first.** This project's most common bug by a distance is code that had exactly two of something hard-coded and stayed correct right up until there were three. It has happened in the licence arithmetic, in two test files, in the bait targets and in the tactic links. Prefer deriving from `REGION_REGS` or from the record itself over listing.
5. **A tool that is wrong is worse than no tool, because its output gets believed.** Every checker here was wrong at least once before it was right — `spot-check` sampled eight vertices and declared a correct pin 800 m from water; `props-check` parsed the commas in a placeholder as props; `tdz-check` gave twenty false positives against one real finding. If a check tells you something surprising, verify the check before you act on it.
6. A lot of surface here looks arbitrary but is not — scope choices, ordering, thresholds, exclusions, the tie-break asymmetry. If a change appears to call an invariant in section 11 into question, **flag it as a deliberate trade-off rather than silently reversing it.**
7. Tell the owner to redeploy — a rebuild only exists locally until the folder is dragged onto Netlify again.
8. Two public READMEs exist (repo root and `london-fishing-companion/`) and have drifted before. If a change affects either audience, update both. There is no `MAINTAINER.md`, despite older notes claiming one.

### Voice, if you are writing user-facing copy

Plain, direct, unhyped, second person. Honest about limitations rather than smoothing them over — "no app can do anything while it's closed on an iPhone, that's an Apple platform rule, not a shortcut taken here." Ends with "Tight lines."
