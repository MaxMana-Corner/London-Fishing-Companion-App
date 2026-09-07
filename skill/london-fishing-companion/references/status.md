# Status as of this skill's creation

**This file goes stale.** It captures a snapshot. If the user describes
something that contradicts it, trust the user and the actual project files
over this document — then, if you're able to update this skill, do so.

## What's fully built and shipped

All of the following were built, tested, and packaged into the current
deploy folder (`london-fishing-companion/` — not `dist/`, see
architecture.md):

- Original five tabs (Spots, Guide, Log, Stats, Learn) plus a sixth (Data)
- Live FMZ 16 season engine, computed from real regulation rules
- Depth cross-section visualizations per spot
- Full species/bait/hook encyclopedia, all hand-illustrated (25 baits,
  10 hooks, 7 rigs — the hooks/rigs redesigned with callouts + scale bars)
- Trip and catch logging with in-app camera capture
- Stats breakdowns
- Knot tutorials (now user-extensible via a wizard, matching every other
  content type)
- Offline astronomy: sunrise/sunset/moon phase/solunar windows, a
  Prime/Good/Fair/Slow scoring function
- Live weather (Open-Meteo) and river gauge data (Environment Canada),
  both cached with timestamps, both fail gracefully
- River gauge auto-selection by proximity (50 km cap, lazy per-spot)
- Export/import: Pack / Log / Full, validated, merge-previewed
- Google Sheets sync (developer's own identity, via Apps Script)
- **Google Drive backup, per-user** (`drive.file` scope, private files,
  session-only token) — the newest major feature
- Photo archiving to Drive when device storage passes 80%, oldest-first,
  upload-verified-before-delete, permanent local thumbnails
- Storage-tier probing (IndexedDB → localStorage → memory) with honest
  in-app warnings if nothing durable is available
- Two near-identical public READMEs: `london-fishing-companion/README.md`
  (ships with the site) and one at the repo root (GitHub landing page).
  There is no `MAINTAINER.md` — an earlier version of this skill claimed
  one existed; it never did.
- A privacy policy page (`privacy.html`), required for the OAuth
  consent screen, precached for offline access at `/privacy`

## What's tested, and why it matters

Ten Node-run test suites exist under `tests/`. **Run them from
`london-fishing-companion/`, not from `tests/`** — e.g. `node tests/audit.mjs`.
Their `fs` paths are resolved against the working directory (the deploy
root), while their `import` statements are file-relative (`../src/…`). The
suites that mount the compiled bundle need `jsdom` installed. Run the
relevant ones after any edit before calling something done:

| Suite | Checks |
|---|---|
| `test-astro.mjs` | Sunrise/moon phase against published real-world data; polar-day edge cases return `null` rather than a fabricated time |
| `test-port.mjs` | Export/import against malformed, truncated, and adversarial JSON (including a `__proto__` id, to rule out prototype pollution); merge idempotency |
| `test-drive-photos.mjs` | Drive scope stays narrow, no sharing calls exist in code (not just comments), token never persisted, archive upload-then-delete ordering, thumbnail never deleted |
| `test-dist.mjs` | Deployable folder structure, PWA manifest requirements, service worker correctness, that the compiled bundle actually contains the latest source changes |
| `test-live-new.mjs` | Boots the real compiled bundle in a hostile simulated environment: no IndexedDB, no network, no client ID configured, storage at 90% — must still render and must not dead-end its own advice |
| `verify-baitart.mjs` | Every bait has its own distinct drawing, no silent fallback-to-wrong-art (this test caught a real bug: four baits were pointing at nonexistent art keys and silently rendering the wrong picture) |
| `test-hookart.mjs` | Every hook and rig pattern has both a `Callout` and a `ScaleBar` — this test caught one hook pattern (`widegape`) that was initially missed in the redesign pass |
| `audit.mjs` | Source-level check against the full accumulated spec — offline-first invariants, Tier 3 exclusions, single network choke point, etc. |
| `test-render.mjs` | Headless render of the compiled bundle with failure injection |
| `test-single.mjs` | The standalone single-file build specifically: zero external requests, renders under the same hostile conditions as above |

Real bugs these suites actually caught before shipping, worth remembering as
evidence they're not ceremony:
- A storage-full warning that told people to "connect Google Drive" even
  when Drive wasn't configured in that build at all — a dead-end message.
- An IndexedDB schema version bump (adding the `photos` store) that would
  have silently broken the storage shim on whichever entry point wasn't
  updated to match.
- Four bait-illustration keys pointing at art that didn't exist, silently
  falling back to the wrong drawing.
- A gauge-station number recalled from memory during initial research that
  turned out to be wrong — caught by verifying against a live API call
  rather than trusting recollection.

## Most recent event (may already be resolved — confirm with the user)

Live Google sign-in returned **Error 403: access_denied** — "has not
completed the Google verification process… can only be accessed by
developer-approved testers" — diagnosed as **Gate 1** in
`deployment.md` (OAuth consent screen still in Testing publishing status,
developer's own account not yet added as a test user). Fix given: add the
account under Test users to unblock immediately, then click Publish App on
the consent screen to open it beyond the allowlist. **As of this skill's
creation, this fix had been explained but not yet confirmed working by the
user** — check whether it's been resolved before assuming Drive sign-in is
fully live for the public.

## Review pass (2026-09-02) — fixed here, NOT yet rebuilt or deployed

A full review of the repo against this skill found the skill's file paths had
drifted from reality and had broken the test suite. Fixed in that pass:

- **Test paths repaired.** Six suites pointed at a `dist/` folder that does
  not exist and two pointed at `solo2/`; all threw on a missing file before
  asserting anything. `test-port.mjs` and `test-astro.mjs` additionally had
  `./src/…` imports that cannot resolve from `tests/` — now `../src/…`.
  `test-dist.mjs`, `test-drive-photos.mjs` and `test-live-new.mjs` now route
  through a single `DIST` constant.
- **Two brittle assertions replaced.** One hardcoded `lfc-v5` (sw.js was on
  v6) and one required the README to echo the cache version. Both now read
  the version out of `sw.js`, and `test-dist.mjs` asserts no other file
  hardcodes a copy of it.
- **Client-ID assertion corrected** — it demanded an empty slot, but the
  deployed `index.html` legitimately carries a real (public) client ID. It
  now accepts empty or well-formed.
- **Custom knots were being destroyed by Sheets sync.** `applyRemote()` in
  `App.jsx` and `mergeData()` in `Code.gs` both rebuilt the catalog without
  a `knots` key, so the saved object lost them. Both fixed.
- **`callSync()` had no timeout** — a hung Apps Script request left the Sync
  panel spinning with no way out. Now aborts at 30s with a real message.
- **The two READMEs disagreed about the live domain.** Resolved by the owner
  on 2026-09-03: the real one is
  **`london-fishing-companion-app.netlify.app`**. Both READMEs, both privacy
  links and the JSDOM origin in `test-live-new.mjs` now use it. Note the
  review initially "fixed" this the wrong way round, on the strength of an
  earlier note in this skill claiming `london-fishing.netlify.app` was
  locked in — that claim was stale, and both domains answer, so nothing in
  the repo could settle it. **Ask, don't infer, when two docs disagree
  about a live URL.**
- **Open, needs checking in Google Cloud Console:** whether the authorized
  JavaScript origin matches the live `-companion-app` domain. If it still
  says `london-fishing.netlify.app`, Drive sign-in is broken in production
  with an origin mismatch while everything else works. See deployment.md.

**⚠️ Outstanding from that pass:** `src/App.jsx` changed, so `app.js` is
stale — the knots and timeout fixes are NOT in the compiled bundle. The
rebuild could not be run (no Node in that environment). Before this is
believed fixed on any phone: rebuild `app.js`, bump `CACHE` in `sw.js` (v6 →
v7), run the suites, redeploy. Until then the fixes exist only in `src/`.

## Known open items / things not yet built

- No formal Google verification submitted yet (optional — see Gate 2 in
  deployment.md; not required to ship, only removes the "unverified app"
  interstitial and the ~100-user cap).
- No automated deploy pipeline — every release is a manual drag-and-drop
  onto Netlify. Fine at current scale; worth flagging if that changes.
- Depth profiles for each spot are informed local-knowledge estimates, not
  sonar data — stated plainly in the public README, not a bug to fix.
