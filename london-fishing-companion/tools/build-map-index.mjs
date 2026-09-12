#!/usr/bin/env node
/* ============================================================
   build-map-index.mjs — scan map/*.json and write map/index.json.

   The index is what the region dropdown reads. It is DERIVED: run this
   after build-map.mjs and never hand-edit it, the same rule the packs
   repository applies to its own index.

   It carries the download size for each region because that is the one
   thing a person needs to know before tapping a button on a phone that
   may be on mobile data at the time. Sizes are the real file size and
   the real brotli size, measured rather than estimated - what the
   server actually sends depends on its own compression, but brotli is
   what Netlify serves and it is the honest number to show.

     node tools/build-map-index.mjs
   ============================================================ */

import fs from "fs";
import path from "path";
import zlib from "zlib";

const dir = path.join(process.cwd(), "map");
if (!fs.existsSync(dir)) {
  console.error("  No map/ directory. Run tools/build-map.mjs first.");
  process.exit(1);
}

/* `<id>-spots.json` is a city's fishing locations, not a map region, and it
   lives in the same directory on purpose: the service worker's region rule
   already matches it, so a pack is cached and evicted alongside the map it
   belongs to. Held back from the region scan here, then attached to its
   region below - without this they would each be reported as "not a region
   file" and the real errors would be lost in the noise. */
const all = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json");
const packFiles = all.filter((f) => f.endsWith("-spots.json"));
const files = all.filter((f) => !f.endsWith("-spots.json")).sort();

if (!files.length) {
  console.error("  No region files in map/. Run tools/build-map.mjs first.");
  process.exit(1);
}

/* Region ids end in the postal abbreviation by convention - london-on,
   langley-bc - and have since the first one, so the suffix is a reliable
   fallback for a file that predates the province field. Unknown suffix is a
   hard stop rather than a guess: a region filed under the wrong province is
   worse than a region the builder refused to index, because nobody would
   notice. */
const PROVINCES = {
  ab: "Alberta", bc: "British Columbia", mb: "Manitoba", nb: "New Brunswick",
  nl: "Newfoundland and Labrador", ns: "Nova Scotia", nt: "Northwest Territories",
  nu: "Nunavut", on: "Ontario", pe: "Prince Edward Island", qc: "Quebec",
  sk: "Saskatchewan", yt: "Yukon",
};
function provinceFromId(id) {
  const suffix = id.split("-").pop();
  const name = PROVINCES[suffix];
  if (!name) {
    console.error(`  ! ${id} has no province field and no recognised id suffix ("${suffix}").`);
    process.exit(1);
  }
  return name;
}

const regions = [];
for (const file of files) {
  const full = path.join(dir, file);
  const raw = fs.readFileSync(full);
  let region;
  try { region = JSON.parse(raw.toString()); }
  catch { console.error(`  ! ${file} is not valid JSON — skipped.`); continue; }

  if (region.schema !== 1 || !region.region || !Array.isArray(region.bbox)) {
    console.error(`  ! ${file} is not a region file — skipped.`);
    continue;
  }
  const id = path.basename(file, ".json");
  if (region.region !== id) {
    console.error(`  ! ${file} calls itself "${region.region}" — skipped.`);
    continue;
  }

  const layers = region.layers || {};
  const counts = {};
  for (const [key, layer] of Object.entries(layers)) {
    const n = Array.isArray(layer) ? layer.length
      : Array.isArray(layer.lines) ? layer.lines.length : 0;
    if (n) counts[key] = n;
  }

  regions.push({
    id,
    name: region.name || id,
    /* The picker is Province > City > spots, so it needs both parts as
       fields rather than as halves of a display string. The file is the
       authority when it carries them; the suffix table below covers the six
       regions built before build-map.mjs wrote them, so adding the hierarchy
       did not mean re-running six Overpass builds. */
    province: region.province || provinceFromId(id),
    city: region.city || (region.name || id).split(",")[0].trim(),
    centre: region.centre,
    radiusKm: region.radiusKm,
    bbox: region.bbox,
    generatedAt: region.generatedAt || null,
    ...(region.sparsePlaces ? { sparsePlaces: true } : {}),
    bytes: raw.length,
    /* What the browser actually downloads from a server that compresses,
       which is the number worth showing somebody on mobile data. */
    brotli: zlib.brotliCompressSync(raw).length,
    counts,
  });
}

/* ---------------- plausibility, per region ----------------

   A region can be complete, valid JSON, a sensible size, and still be wrong.
   That has happened three times now: goderich shipped at 425 KB with zero
   points of interest in a harbour town, grand-bend built with ONE named place
   across a 50 km radius because the area-clipped half of its query silently
   returned nothing, and before either of those a Swiss mirror produced five
   regions with no water at all.

   The builder refuses to WRITE a region that trips these, but files built
   before those guards existed are already on disk, and a region can be
   rebuilt by an older checkout. So the index judges every file it finds,
   every time, rather than trusting that whatever wrote it was careful.

   Judged on its own terms, never against the other regions: Goderich has 682
   buildings and the GTA has 18,373, and both are right. Comparing them would
   flag the countryside for being countryside. */
function audit(r) {
  const reasons = [];
  const c = r.counts || {};
  const n = (k) => c[k] || 0;

  if (!n("river") && !n("water")) reasons.push("no rivers and no water");
  if (!n("poi")) reasons.push("no points of interest");
  if (!n("street")) reasons.push("no streets");

  /* Places anchor the corridor that streets and buildings are filtered
     against, so a short place layer thins the whole region without any single
     layer looking broken. Only meaningful on a region big enough to contain
     settlements. */
  if (!r.sparsePlaces && r.radiusKm >= 25 && n("place") < 5) {
    reasons.push(`only ${n("place")} named place${n("place") === 1 ? "" : "s"} for a ${r.radiusKm} km radius`);
  }

  return reasons;
}

for (const r of regions) {
  const reasons = audit(r);
  if (reasons.length) {
    r.status = "experimental";
    r.statusReason = reasons.join("; ");
  }
}

/* The app ships with one region already in the service worker's precache;
   everything else is fetched when asked for. Saying which is which here
   means the app does not have to hard-code it in two places. */
const sw = fs.readFileSync(path.join(process.cwd(), "sw.js"), "utf8");
for (const r of regions) {
  r.bundled = sw.includes(`./map/${r.id}.json`);
}

/* ---------------- spot packs ----------------

   A city's locations are bound to the city, not to the app: download the
   Langley map and you get Langley's spots with it. So the index says which
   regions have a pack and how many locations are in it, because "7 locations"
   is worth showing next to the download size, and because the app has to know
   whether to look for the file at all rather than fetching a 404 every time
   somebody changes region. */
for (const file of packFiles) {
  const id = path.basename(file, "-spots.json");
  const region = regions.find((r) => r.id === id);
  if (!region) {
    console.error(`  ! ${file} has no region called "${id}" — orphaned pack.`);
    continue;
  }
  const raw = fs.readFileSync(path.join(dir, file));
  let pack;
  try { pack = JSON.parse(raw.toString()); }
  catch { console.error(`  ! ${file} is not valid JSON — skipped.`); continue; }

  if (pack.schema !== 1 || pack.region !== id || !Array.isArray(pack.spots)) {
    console.error(`  ! ${file} is not a spot pack for "${id}" — skipped.`);
    continue;
  }
  const bad = pack.spots.filter((s) => !s.id || !s.name || !Array.isArray(s.ll) || s.region !== id);
  if (bad.length) {
    console.error(`  ! ${file}: ${bad.length} spot${bad.length === 1 ? "" : "s"} missing id, name, ll, or tagged to another region — skipped.`);
    continue;
  }
  region.spots = pack.spots.length;
  region.spotBytes = raw.length;
}

/* The precached region's spots are in the app bundle, not in a pack, for the
   same reason its map is precached: it is the region the app opens on, cold
   and offline on a first run, and its content must not be able to fail to
   load. Flagged so the picker can tell "spots ship with the app" apart from
   "this city has no spots yet". */
for (const r of regions) {
  if (r.bundled && !r.spots) r.spotsBundled = true;
}

const bundled = regions.filter((r) => r.bundled).map((r) => r.id);
if (bundled.length !== 1) {
  console.error(`  ! ${bundled.length} regions are precached in sw.js (expected exactly 1).`);
}

/* Province, then city, alphabetically - so the picker can render the list in
   the order it is given and the grouping falls out of the sort rather than
   being rebuilt on every open. */
regions.sort((a, b) =>
  a.province.localeCompare(b.province) || a.city.localeCompare(b.city));

const out = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  note: "Derived file. Regenerated by tools/build-map-index.mjs. Do not hand-edit.",
  /* The one the app opens if it has never been told otherwise. */
  defaultRegion: bundled[0] || regions[0].id,
  regions,
};

fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(out, null, 2));

const kb = (n) => (n / 1024).toFixed(0).padStart(5) + " KB";
console.log("");
let province = null;
for (const r of regions) {
  if (r.province !== province) { province = r.province; console.log(`  ${province}`); }
  console.log(`    ${r.id.padEnd(16)} ${kb(r.bytes)} raw  ${kb(r.brotli)} sent` +
    (r.spots ? `  ${String(r.spots).padStart(2)} spots`
      : r.spotsBundled ? "  in bundle" : "   no spots") +
    (r.bundled ? "   (precached)" : "") +
    (r.status === "experimental" ? "   EXPERIMENTAL" : ""));
  if (r.statusReason) console.log(`    ${" ".repeat(16)} ^ ${r.statusReason}`);
}
const flagged = regions.filter((r) => r.status === "experimental");
if (flagged.length) {
  console.log(`\n  ${flagged.length} region${flagged.length === 1 ? " is" : "s are"} marked experimental in the app: ` +
    flagged.map((r) => r.id).join(", "));
}
console.log(`\n  wrote map/index.json  ${regions.length} region${regions.length === 1 ? "" : "s"}\n`);
