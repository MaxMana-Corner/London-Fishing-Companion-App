---
name: london-fishing-companion
description: Full accumulated context on the London Fishing Companion project — an offline-first, Canada-only fishing log and field guide PWA for the Thames River watershed, London Ontario, deployed at london-fishing-companion-app.netlify.app. Use this skill whenever the user mentions the London Fishing Companion app, "the fishing app," "my Netlify fishing project," "the Thames River app," london-fishing-companion-app.netlify.app or london-fishing.netlify.app, or asks to continue, debug, extend, redesign, or deploy any part of it — even if they don't name it explicitly and just describe a feature ("the hook drawings," "the Drive backup," "the gauge auto-select," "the archive-when-full thing") that belongs to this project. Always consult this skill before proposing changes to this codebase, since it encodes hard-won architecture decisions, known gotchas, and the current live status that should not be silently re-litigated or reversed.
---

# London Fishing Companion — project context

This is not a generic "how to build a PWA" skill. It is the accumulated,
hard-won state of one specific project, built across a long conversation.
Its job is to make a fresh Claude session behave as if it had been there for
all of it — same judgment, same constraints, same things NOT to re-suggest.

**Read this file first. Read a `references/*.md` file only when the task
actually touches that area** — don't front-load all of them into every reply.

---

## What this project is

An offline-first fishing log and field guide, purpose-built for the Thames
River watershed in London, Ontario (Fisheries Management Zone 16). Installs
on iPhone and Android as a home-screen PWA and works with the network off
after the first load.

- **Live site:** https://london-fishing-companion-app.netlify.app — this is
  the real, current domain, confirmed by the owner. An older
  `london-fishing.netlify.app` deploy also still answers and appears
  throughout earlier notes, but it is **not** the one to point people at.
  Whenever you write the URL anywhere — READMEs, privacy links, OAuth setup
  — use the `-companion-app` one.
  **Check before trusting Drive sign-in:** earlier notes asserted the OAuth
  authorized origin was registered as `https://london-fishing.netlify.app`.
  If that is still what Cloud Console holds, Google sign-in is broken on the
  live domain with an origin mismatch, which presents as "Drive is broken"
  rather than "wrong URL." The Cloud Console origin and the privacy-policy
  URL must both name the live domain.
- **Repo layout:** the deployable files (`index.html`, `app.js`, `sw.js`,
  `manifest.webmanifest`, `privacy.html`, icons, `netlify.toml`, `_headers`,
  `_redirects`, `README.md`) sit at the **root of `london-fishing-companion/`**,
  alongside `src/`, `tests/`, `apps-script/` and `standalone/`. There is **no
  `dist/` folder** — `netlify.toml` sets `publish = "."`, so the project root
  *is* the deploy folder. Older notes calling it `dist/` are out of date.
- **Deploys via:** dragging that folder onto Netlify — no build step at
  deploy time, no framework, no bundler config beyond a single esbuild
  command run by the developer before deploying
- **Stack:** vanilla React (no Next/Vite/CRA), compiled with esbuild into one
  `app.js`, a hand-written service worker, IndexedDB-first storage
- **Owner/deployer:** Dillon. The app is meant to be downloadable and usable
  by other people too, each with their **own** Google account for backup —
  this is not a single-user personal tool

## Scope: Canada only

**This is a Canadian app. Treat that as a constraint on every feature, not a
description of where it happens to have started.**

- **Regions are Canadian regions.** London ships first; Windsor, Sarnia and
  the GTA are defined and the mechanism is built to add more of Canada by the
  same route. There is no plan to cross the border, and a proposal that
  assumes otherwise is a proposal to change the project's scope — flag it as
  that, do not just build it.
- **Maps clip land detail to Canada** (`area["ISO3166-1"="CA"]` in
  `tools/build-map.mjs`). Across the border you get **the place name and the
  boundary line, and nothing else** — no streets, no buildings, no parks.
  Detroit is a label and an edge, not a city you can navigate.
- **Water is the deliberate exception and must stay that way.** The border
  runs down the middle of the Detroit and St. Clair rivers, which are some of
  the best fishing in the province. Clipping water to Canada would cut the
  best water in the region in half lengthwise. Rivers and lakes are drawn
  whole.
- **This is not only a tidiness rule, it is a build constraint.** A 50 km
  radius around Windsor reaches deep into Michigan. Fetching that much
  American building data returned an Overpass response larger than the
  longest string Node can hold, and the map build died on it. Clipping to
  Canada is what makes the secondary regions buildable at all.
- **Regulations, licences and seasons are Ontario's** (Fisheries Management
  Zone 16 for London). Anything that reaches for an authority — a rules link,
  a season table, a licence reminder — reaches for a Canadian one.

## Feature surface (what's built)

Five original tabs plus a sixth added mid-project:

- **Spots** — 12 waters, drawn depth cross-sections, per-species density,
  a five-part access rating, live FMZ 16 season status computed from real
  regulations (not a hardcoded date)
- **Guide** — 15 species (ID keys, habits, targeting tips), 25 illustrated
  baits/lures, 10 illustrated hook patterns + 7 terminal rigs (each with a
  labelled callout on its identifying feature and a size-scale reference)
- **Log** — trips with conditions, catches with species/size/bait/depth,
  in-app camera capture (native handoff, compressed, stored locally first)
- **Stats** — catch rate, personal bests, breakdowns by species/spot/bait/
  month/clarity
- **Learn** — knots (steppable diagrams, user-extensible), tips, full Zone
  16 regulations table
- **Data** — export (three separate files: Pack / Log / Full), validated
  import with merge-by-id and a preview before committing, licence expiry
  reminder, Google Drive backup, Google Sheets sync (separate optional
  system)

Every content type (spots, species, baits, knots, tips) has a guided,
one-question-per-screen add wizard.

**Conditions**, on any spot with coordinates, split deliberately in two:
- *Zero network, always available:* sunrise, sunset, moon phase, solunar
  major/minor feeding windows, a Prime/Good/Fair/Slow score for right now,
  pressure trend (diffed from cached readings)
- *Needs a connection, cached with a timestamp:* live weather + 3-day
  forecast (Open-Meteo), live river level/discharge (Environment Canada
  Water Survey) — river gauge is **auto-selected by proximity** (nearest
  within 50 km, lazily, when that spot is opened)

Full feature detail and end-user voice: see the public README shipped in
`london-fishing-companion/README.md`. Don't re-derive that content here —
it's already written. Note there is a **second, near-identical README at the
repo root** serving as the GitHub landing page. The two have drifted before
(the root one advertised the wrong live domain); if you change one, check
the other.

---

## Non-negotiable invariants

These were arrived at deliberately, several after finding a real bug. Don't
propose reversing any of them without flagging it as a deliberate tradeoff
change, not a bug fix.

1. **No screen's first render may depend on a network call completing.**
   Every fetch has a cached fallback and a "as of [time]" label.
2. **All network access is confined to `src/services.js`** (weather, river
   gauges) **and `src/gdrive.js`** (Drive), with **exactly one sanctioned
   exception:** `callSync()` in `src/App.jsx`, the Google Sheets sync call.
   It predates this rule and belongs to a separate optional system.
   `tests/audit.mjs` encodes the exception by allowing at most one `fetch(`
   in `App.jsx` — so don't "fix" `callSync` by moving it, and don't add a
   second call beside it. Any *other* network call is a smell.
3. **Every fetch returns `{ ok, ... }` or `{ ok:false, error }`. Never throws
   to the caller.** Timeouts (~9–45s depending on the call) on everything.
   `callSync()` is again the exception on the first half only: it throws,
   because all of its callers already wrap it in try/catch. It is **not** an
   exception to the timeout rule — it aborts at 30s. It shipped without a
   timeout once and could leave the Sync panel spinning forever.
4. **Storage is three-tier: IndexedDB → localStorage → memory**, with the
   app probing which tier it actually got and telling the user honestly if
   nothing can be saved. Storage writes are checked, not assumed.
5. **Photo archiving uploads before it ever deletes, and only deletes after
   a verified success.** A failed upload must never cost a photo. The small
   thumbnail is *never* deleted — only the full-resolution original is ever
   archived away.
6. **Google Drive integration is per-user, private-by-default, narrowest
   scope (`drive.file`).** Files are never made link-shareable. The OAuth
   token is session-only, never persisted — this was a deliberate choice,
   not an oversight (see `references/decisions.md`).
7. **Two separate Google integrations coexist and must not be conflated:**
   Google Sheets sync (`apps-script/Code.gs`, runs under the *developer's*
   identity regardless of who's using the app) vs. Google Drive backup
   (`gdrive.js`, runs under *each person's own* identity). Extending one
   should never quietly touch the other.
8. **Editing `src/App.jsx` (or any `src/*` file) means recompiling
   `app.js`, and editing `sw.js` means bumping its `CACHE` version string.**
   The service worker only notices an update when its own bytes change —
   editing `index.html` or `app.js` alone does nothing until `sw.js` changes
   too. This has caused a real, confirmed production bug once already.
   `sw.js` is the **only** place the cache version is written down;
   `tests/test-dist.mjs` enforces that, because a second hardcoded copy of
   it in a test silently went stale for a whole release.
9. **The standalone single-file build (`standalone/LondonFishing.html`)
   cannot support Google sign-in**, by construction — OAuth needs a fixed,
   pre-registered origin, which a local file doesn't have. Don't propose
   adding it there.
10. **"Automatic" never means "runs in the background."** iOS gives web
    apps no background execution. Every "automatic" behavior (storage
    checks, sync, archiving, licence reminders) actually means "checked
    when the app is opened." Don't write UI copy that overpromises this.

---

## Where to go for more detail

| If the task touches… | Read |
|---|---|
| File responsibilities, storage/data model, PWA/service-worker mechanics, why the single-file build is limited | `references/architecture.md` |
| *Why* a specific choice was made (scope, sharing, ordering, thresholds, exclusions) — read before "improving" anything that looks arbitrary | `references/decisions.md` |
| Deploying, the Netlify domain, Google Cloud Console OAuth setup, verification/Testing-mode status, Apps Script sync setup | `references/deployment.md` |
| What's built, what's tested, the most recent live issue and where it stood when this skill was written | `references/status.md` |

---

## If the user hands you the project and asks for a change

1. Check `references/status.md` first — know what's already resolved vs.
   still open before touching anything.
2. Check `references/decisions.md` if the change touches Drive, photos,
   exports, gauges, or hook/bait art — a lot of surface area here looks
   arbitrary but isn't.
3. Make the edit in `src/`, never in the compiled `app.js` directly.
4. Rebuild, from inside `london-fishing-companion/`:
   `npx esbuild src/main.jsx --bundle --minify --format=iife
   --target=es2019 --define:process.env.NODE_ENV='"production"'
   --loader:.jsx=jsx --outfile=app.js`
   **This step is not optional and not cosmetic.** `app.js` is the only
   thing the browser runs; an edit to `src/` that isn't recompiled changes
   nothing a user will ever see.
5. If `sw.js` changed, bump `CACHE`. If it didn't change but you touched
   anything it precaches (`index.html`, `app.js`, `manifest.webmanifest`,
   `privacy.html`), bump it anyway — that's the only thing that makes
   already-installed copies notice.
6. Run the test suites relevant to what you touched (list and purpose of
   each is in `references/status.md`) before calling anything done. Run them
   **from `london-fishing-companion/`**, e.g. `node tests/audit.mjs` — the
   `fs` paths inside them are relative to that directory, not to `tests/`.
   They need `jsdom` available for the suites that mount the bundle.
7. Remind the user to redeploy — a rebuild only exists locally until the
   folder is dragged onto Netlify again.

Two public README files exist and must not drift apart:
`london-fishing-companion/README.md` (ships with the site) and a
near-identical copy at the repo root (the GitHub landing page). Update both
if a change affects what a user needs to know — don't create a third.
There is **no `MAINTAINER.md`**; earlier notes claiming one were wrong.
