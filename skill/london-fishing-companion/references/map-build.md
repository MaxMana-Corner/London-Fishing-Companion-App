# The offline map pipeline, and how Overpass lies to you

`tools/build-map.mjs` turns OpenStreetMap data into the region files the app
draws. `tools/build-map-index.mjs` derives `map/index.json` from whatever
region files exist; the app's region dropdown reads that.

**Read the second half of this file before changing anything in the builder.**
It is not general advice. Every item is a failure that actually happened on
this project, and every one of them produced a build that reported success and
wrote a map file that looked fine by its size and was wrong.

---

## How it fits together

- **One file per region** in `map/<id>.json`, fetched at runtime — never
  bundled into `app.js`. Bundling one region costs ~440 KB and makes a
  multi-region dropdown impossible.
- **`london-on` is precached** in `sw.js` `ASSETS`, so the app works offline
  out of the box. Every other region is an opt-in download.
- **Downloaded regions live in `MAP_CACHE = "lfc-maps"`, deliberately
  unversioned**, and `sw.js`'s activate handler does not delete it. Half a
  megabyte somebody chose to keep must not vanish because the app shipped a
  new build. The precached region is checked *first* so it updates with the
  app rather than being shadowed by an older downloaded copy.
- **`map/index.json` is derived.** Never hand-edit it. `build-map.mjs`
  regenerates it automatically at the end of every region build, because
  leaving that to be remembered is how it drifts — and it did: Goderich built
  correctly, wrote correctly, and did not appear in the app at all, because the
  index had been written five minutes earlier and nothing told it there was a
  new region.
- **Canada only.** Land layers (`road`, `park`, `street`, `path`, `building`)
  are clipped with `area["ISO3166-1"="CA"]["admin_level"="2"]`. Water, rivers
  and place names are deliberately NOT clipped — the border runs down the
  middle of the Detroit and St. Clair rivers and clipping those would cut the
  best water in the region in half lengthwise. See `decisions.md`.
- **Layers are tiled** where a single response would be too large:
  `TILES = { building: 4, street: 2, path: 2 }`. Tiles overlap slightly and
  duplicates are removed by id.

---

## Anchors vs regions — the question that will come up again

Streets, paths and buildings are kept only near water, and the corridor is
built from **rivers plus the region's `anchors`** — not from all water, because
the 4,000-odd farm ponds in a 50 km box would make the corridor meaningless.

**So a lake-shore place with no river reaching it gets water, a name and its
points of interest, but no streets and no buildings.** That is what happened at
Port Stanley and Ipperwash Beach, and it looks exactly like "this place is not
covered" when in fact both sat comfortably inside an existing region — Port
Stanley 36 km from London's centre, Ipperwash 20 km from Grand Bend's.

**If a shoreline looks bare, add an anchor, not a region.** A new region
centred on the same spot would have had the identical hole, because its
`anchors` would be empty. A region is for somewhere a person drives to and
needs a whole map of; an anchor is for water the river network does not reach.
Anchors also widen the parking and washroom corridor, since `markFishable` and
`nearBank` are fed from the same list.

---

## THE OVERPASS RULE

**The dangerous failure is not an error. It is a plausible-looking success.**

Six distinct instances on this project, all in one session. Not one would have
been caught by "did the build exit zero". Do not remove any of the guards below
without understanding which of these it exists for.

### 1. A mirror with no area index
`area["ISO3166-1"="CA"]` resolves to nothing, `(area.ca)` matches nothing, and
every clipped land layer comes back empty. HTTP 200, no remark.

### 2. A REGIONAL mirror answering global questions
**`overpass.osm.ch` holds Switzerland and nothing else.** It answers a query
about Canada with HTTP 200, no remark, and zero elements. Verified directly: 0
results for water off Goderich, 3 for the same query in Geneva; every other
mirror returns 3 for both.

This one poisoned rivers, water, POIs and borders across five regions, and
because the corridor filters are built *from* the water, streets and buildings
then vanished behind it. **Goderich shipped at 26 KB with zero rivers, zero
water and zero streets.**

It is **not** in `OVERPASS_MIRRORS`, and there is a comment saying why.
**Do not add it back.**

### 3. A pinned mirror list going stale
Mirrors are probed once. Windsor probed early, when `overpass-api.de` was up
and kumi was returning 429, so every clipped query got pinned to api.de. Twenty
minutes later api.de stopped answering and the build spent six escalating
retries talking to a dead host **with live mirrors sitting unused in the
list**. An exhausted pool now discards the vetting and re-probes before giving
up.

### 4. A guard that did not cover the layers that mattered
The empty-result check tested `n === 1`, so it fired only for untiled layers —
meaning street, path and building, the three biggest and the only tiled ones,
had **no protection at all**. It is checked after the whole tile loop now.

### 5. A server-side timeout returned as HTTP 200
Overpass answers a timed-out query with **200, a `remark` field, and whatever
partial results it had — usually none.** Checking `res.ok` is not enough.
`goderich-on-poi.json` sat in the cache holding *"runtime error: Query timed
out in query at line 9 after 185 seconds"* and zero elements, **cached as a
success, permanently**. Goderich is a harbour town and its map had no piers on
it. After the fix: 175 POIs including 24 piers and 9 slipways.

A remark mentioning an error or a timeout is never cached and triggers a retry,
usually onto a different mirror, which is generally all it takes.

### 6. The query being wrong about the data
Not Overpass's fault, identical symptom. **OSM tags the Canada–US boundary
inconsistently along its length.** Around Windsor and Sarnia the boundary ways
carry `boundary=administrative`/`admin_level=2` themselves (38 and 17 of them).
At the Niagara River they carry no tags at all and the tags live only on the
parent relation — so asking for tagged ways returns nothing, cleanly and
wrongly. The GTA's map had no border on it.

The border query now asks for both shapes: tagged ways, **and** ways reached
through the relation (fetched into a set by a prelude — `out geom` on the
Canada relation would hand back the entire country).

---

## The guards, and what each is for

| Guard | Exists because of |
|---|---|
| Mirrors vetted by **one probe proving both Canadian data and area resolution**, used for **every** query | 1, 2 — the original mistake was vetting only the clipped queries and letting everything else go to the full list |
| `overpass.osm.ch` removed from the list | 2 |
| Exhausted pool **re-probes** instead of failing | 3 |
| Clipped layer **empty across every tile** fails the build and deletes its cache entries | 1, 2, 4 |
| A **`remark` mentioning error/timeout is never cached**, and retries | 5 |
| **A region with no rivers AND no water refuses to be written** | all of them — this single check would have caught the Swiss mirror in thirty seconds |
| Index regenerated automatically after every region build | stale-index drift |

**If a seventh variant turns up, the answer is another assertion about what the
data must contain — not another retry.**

---

## Other things that will bite

- **`ERR_STRING_TOO_LONG`.** Windsor's building query in a single request
  returned a body larger than the longest string Node can hold, so it could not
  be parsed at all. That is what tiling is for. It was also the practical
  reason for the Canada clip: most of that box was Detroit.
- **`around` is not the answer.** `way["building"](around.w:650)` on the river
  set is the query you would write by hand and it is far too slow — it timed
  out waiting for headers on London, which is a quarter of Windsor's size.
- **A refused socket is not an HTTP status.** Under load Overpass stops
  answering at the socket, which arrives as a *thrown* fetch. Retrying only on
  429/504 meant a busy afternoon killed builds twenty minutes in.
- **Be a good neighbour.** These are volunteer services on donated hardware.
  Responses are cached on disk in `tools/.osm-cache` (gitignored) — delete
  entries to force a refresh rather than re-running blind, sleep between
  queries, and do not run regions in parallel.
- **Node buffers stdout when redirected**, so a backgrounded build shows
  nothing until it exits. Watch `tools/.osm-cache/` to see progress.
