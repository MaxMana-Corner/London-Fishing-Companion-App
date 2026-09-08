# Creel — developer manual

## What this is

A React app with no framework, bundled by esbuild into one `app.js`, served as
static files with a hand-written service worker. No router, no state library,
no CSS framework, no build step beyond the bundle.

That is a deliberate position rather than an accident. The app has to work on a
riverbank with no signal, install from a static host, and still be readable in
five years. Every dependency is one more thing that can stop being true.

```bash
npm install
npm run build      # app.js + standalone/Creel.html, both verified
npm test           # 18 suites, 817 assertions
```

---

## Layout

```
london-fishing-companion/
  index.html            shell; inline critical CSS only
  app.js                the bundle (committed - it is what the site serves)
  sw.js                 service worker; bump CACHE on every ship
  manifest.webmanifest
  map/                  region files + index.json (derived)
  brand/                mark, colourways, icon generator
  standalone/Creel.html one-file build (derived)
  src/
    main.jsx            entry point; mounts App and registers the worker
    App.jsx             screens, and the CSS block
    baitart.jsx         drawn baits and lures, one component per shape
    hookart.jsx         drawn hooks and rigs, and the RIGS diagram set
    astro.js            sun, moon, solunar, the catch rating
    services.js         weather, river gauges, community URLs
    map.js              projection, simplification, clipping, rendering
    tactics.js          the Tactics dataset + cross-link helpers
    favourites.js       stars, usage counts, list ordering, search
    tiles.js            encyclopedia home layout
    links.js            reference links, structural safety gate
    qr.js               QR encoder
    portability.js      export, import, merge, migrate
    community.js        pack directory, submissions, pins
    photos.js           IndexedDB photo store
    gdrive.js           opt-in Drive archive
  tools/
    build.mjs           the bundle, with guards
    build-single.mjs    the one-file build
    build-map.mjs       OpenStreetMap -> a region file
    build-map-index.mjs map/index.json + the plausibility audit
    make-pack.mjs       spreadsheet -> pack JSON
    check-tactics.mjs   asserts every cross-link resolves
```

---

## Rules worth knowing before you change anything

**Bump `CACHE` in `sw.js` on every ship.** Otherwise installed users keep the
old bundle and will not see your change. Every version is a number, `lfc-vNN`.

**`app.js` and `standalone/Creel.html` are committed build outputs.** Run
`npm run build` before committing source changes or the site serves the old
one. The tests check the standalone matches `app.js` exactly.

**Never rename `APP_ID` or the `lfc:` storage prefix.** `APP_ID` is a wire
format identifier checked by the community Apps Script and the packs repo's
GitHub Action, and stamped into every file anyone has exported. `lfc:` is
where every install reads its data. The app being called Creel does not change
either. See the note above the constant in `portability.js`.

**Only three things touch the network**, all on demand: weather and river
gauges (`services.js`), community packs (`community.js`), and the Sheets sync
(which predates the rule and is optional). A test asserts first render fires
no request at all.

**`npm run build` is a script, not a command line.** It used to be an esbuild
invocation with `--define:process.env.NODE_ENV="production"`, and whether the
inner quotes survived depended on the shell. From Git Bash they did not, so
esbuild silently built a *development* React bundle — 772 KB instead of 463 —
and nothing failed. `tools/build.mjs` uses the JS API so no shell is involved,
and it aborts if it finds React's development strings in the output or the
bundle is unexpectedly large.

---

## Storage

Three tiers, chosen at load: IndexedDB, then localStorage, then memory. The
app renders and works in all three; on the last it warns that nothing will be
saved. `src/App.jsx` never touches `localStorage` directly — everything goes
through the shim.

Keys are `lfc:*`. `lfc:catalog` holds records, photos, record links and
useful links; `lfc:log` holds trips and catches; the rest are settings,
favourites, usage counts and the encyclopedia tile layout.

Records carry `_v` and go through `migrateStore()` on load, so old records
never render broken.

---

## The map pipeline

`tools/build-map.mjs` turns Overpass queries into a region file: fetch, clip to
Canada, simplify with Douglas–Peucker, filter to a corridor around water, quantise
to integers, write.

**Read `skill/london-fishing-companion/references/map-build.md` before touching
it.** It documents nine ways this pipeline has been handed a wrong answer with
an HTTP 200 on it, each with the guard that now catches it. The short version:

- Mirrors are vetted with a probe that proves they hold Canadian data *and*
  resolve the Canada area. A mirror that fails is used for nothing.
- A `remark` mentioning a timeout is never cached.
- An empty response is retried and never written to disk.
- **"Is it empty" is the wrong question; "is it plausible" is the right one.**
  A caller that knows a floor passes `minCount`. The place layer has one,
  because its Canadian half depends on the area index and its second clause
  can satisfy an emptiness check on its own — which is exactly how Grand Bend
  built with one named place across a 50 km radius.
- A region with no rivers and no water, no POIs, or fewer than five places is
  refused rather than written.

`tools/build-map-index.mjs` regenerates `map/index.json` and audits every
region it finds, marking thin ones `experimental` so the app can say so before
somebody spends mobile data on one. It judges each region on its own terms,
never against the others — Goderich has 682 buildings and the GTA has 18,373
and both are right.

**Never run two builds at once**, and check with `tasklist //FI "IMAGENAME eq
node.exe"` rather than `pgrep`, which does not see detached Windows children.
Two concurrent builds have corrupted `map/` twice. Do not `git add -A` while
one runs.

---

## Packs and the community bridge

There is no backend. Submissions go to a Google Apps Script that opens a pull
request on the packs repository. Three gates, none pretending to be the others:

1. **The app** validates shape before sending.
2. **The Apps Script** re-validates and applies the moderation lists.
3. **The GitHub Action** validates again on the PR, and a person reads it.

`moderation/blocklist.txt` in the packs repo is **intentionally empty**. The
matcher used to compare substrings, which on fishing prose is unusable —
"smallmouth bass" contains "ass" and "crappie" contains "crap" — so any term
list made every honest submission fail. Matching is whole-word now, with
`*term*` opting into substring, and 74 candidate terms are parked in
`blocklist-candidates.txt` awaiting review. `tools/check-blocklist.mjs` asserts
real fishing vocabulary does not trip whatever is live.

`tools/make-pack.mjs` builds a pack from CSV — see
[PACK-BUILDING.md](../london-fishing-companion/tools/PACK-BUILDING.md).

---

## Testing

18 suites, 817 assertions, plain Node with jsdom. No test runner.

```bash
npm test
node tests/test-map.mjs        # one suite
```

The suites that earn their keep are the ones asserting things that are true of
the *data* rather than the code: that every tactic cross-link resolves, that a
saved tile layout survives a category being added, that the QR encoder's output
decodes back to what went in, that the standalone build is current.

Two lessons are baked in:

- **`test-live-new`'s error check is an allowlist, not a denylist.** It used to
  match four phrasings and missed a `ReferenceError` that blanked an entire
  tab while reporting "clean". Everything is fatal now unless it is a
  known-benign line.
- **`test-single` asserts freshness.** Every other assertion in it checked
  whether the standalone was well-formed; none checked whether it was current,
  and it passed for five days against a build that predated six features.

---

## Adding a category to the encyclopedia

1. Add it to `ENCY_CATS` in `App.jsx` with a colour and an icon in `ENCY_ICONS`.
2. Add its records to `encyGroups`.
3. Handle it in `openRecord`.

`reconcile()` in `tiles.js` puts it on every existing user's home page rather
than only on new installs. That is the whole reason the function exists.

---

## Shipping

The `Experimental` branch is for review. **Merging to `main` is the deploy** —
Netlify builds from `main`. See [NETLIFY.md](NETLIFY.md).

Before merging:

```bash
npm run build      # regenerates app.js AND the standalone
npm test           # all 18 suites
```

and bump `CACHE` in `sw.js`.
