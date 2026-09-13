/* spot-check.mjs — is every fishing location actually on water?
   ============================================================

   THE PROBLEM THIS SOLVES. Every location in this app carries a latitude and
   a longitude that somebody (me) researched rather than stood on. A pin two
   hundred metres into a field is indistinguishable from a correct one when
   you are reading a JSON file, and it stays indistinguishable right up until
   somebody drives there.

   THE GROUND TRUTH WAS ALREADY IN THE REPO. Each map/<region>.json carries
   the water and river geometry drawn from OpenStreetMap, with the names
   interned in a table - 1,361 named waters for Rawdon alone. So a spot's
   coordinates can be measured against the actual water it claims to be on,
   and the nearest named feature can be printed next to what the record says.

   Three things it reports:

     1. DISTANCE TO WATER. How far the pin is from the nearest water or river
        line in that region's own map.
     2. WHAT THAT WATER IS CALLED, against what the record says it is. A spot
        named "Lac Rawdon" whose nearest water is "Lac Pontbriand" is either
        a wrong pin or a wrong name, and either way it is wrong.
     3. DISTANCE FROM TOWN. The owner's note was that Rawdon's locations were
        drives rather than places you can walk to after work.

   It is a REPORT, not a gate, for the same reason the access scores are
   absent: a lake with no mapped shoreline detail and a river in a culvert
   both look wrong and are not. Judgement stays with a person; this tool
   makes the judgement possible.
   ============================================================ */
import fs from "fs";
import path from "path";

const MAP_DIR = "map";
const R_EARTH = 6371;

/* Kept local rather than imported from src/map.js: that file is an ES module
   inside the app bundle and this is a build tool, and a copy of eleven lines
   is cheaper than a coupling. The format is documented in build-map.mjs. */
function decodeLine(line, scale) {
  const div = Math.pow(10, scale);
  const out = [];
  let y = 0, x = 0;
  for (let i = 0; i < line.length; i += 2) {
    if (i === 0) { y = line[0]; x = line[1]; }
    else { y += line[i]; x += line[i + 1]; }
    out.push([y / div, x / div]);
  }
  return out;
}

const toRad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const la1 = toRad(a[0]), la2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

/* Distance from a point to a segment, in km, flat-earth over the short
   distances this deals with. Done per segment rather than per vertex: a
   lake drawn with vertices 400 m apart would otherwise report a spot on its
   shore as 200 m from water. */
function pointToSegmentKm(p, a, b) {
  const latScale = 111.32;
  const lonScale = 111.32 * Math.cos(toRad(p[0]));
  const px = (p[1] - a[1]) * lonScale, py = (p[0] - a[0]) * latScale;
  const bx = (b[1] - a[1]) * lonScale, by = (b[0] - a[0]) * latScale;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px, py);
  let t = (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
}

/* ---------------- the map's water, decoded once per region ---------------- */
const cache = new Map();
function waterOf(regionId) {
  if (cache.has(regionId)) return cache.get(regionId);
  const file = path.join(MAP_DIR, regionId + ".json");
  if (!fs.existsSync(file)) { cache.set(regionId, null); return null; }
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  const feats = [];
  for (const key of ["water", "river"]) {
    const L = m.layers && m.layers[key];
    if (!L || !Array.isArray(L.lines)) continue;
    const scale = Number(L.scale) || 5;
    const table = Array.isArray(L.nameTable) ? L.nameTable : null;
    const names = Array.isArray(L.names) ? L.names : [];
    for (let i = 0; i < L.lines.length; i++) {
      const idx = names[i];
      const name = table && idx > 0 && idx <= table.length ? table[idx - 1] : null;
      const pts = decodeLine(L.lines[i], scale);
      /* Bounding box once per feature, so the search can reject without
         sampling. Sampling was the bug: eight probes into Lake Huron all
         missed the shore that was forty metres from the pin. */
      let minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
      for (const p of pts) {
        if (p[0] < minLa) minLa = p[0]; if (p[0] > maxLa) maxLa = p[0];
        if (p[1] < minLo) minLo = p[1]; if (p[1] > maxLo) maxLo = p[1];
      }
      feats.push({ pts, name, kind: key, box: [minLa, maxLa, minLo, maxLo] });
    }
  }
  const out = { centre: m.centre, radiusKm: m.radiusKm, city: m.city, feats };
  cache.set(regionId, out);
  return out;
}

/* Nearest water feature to a point, with its name. Bounded first by a cheap
   bounding-box reject, because a region file holds thousands of features and
   the exact test is the expensive one. */
function nearestWater(water, ll) {
  let best = Infinity, bestFeat = null;
  for (const f of water.feats) {
    const pts = f.pts;
    /* Reject on the BOX, never on samples. Distance from the point to the
       feature's bounding box is a lower bound on the distance to the feature,
       so a box farther away than the best so far cannot contain a better
       answer - and unlike sampling, this can never be wrong. */
    const [minLa, maxLa, minLo, maxLo] = f.box;
    const latScale = 111.32, lonScale = 111.32 * Math.cos(toRad(ll[0]));
    const dLa = ll[0] < minLa ? (minLa - ll[0]) : ll[0] > maxLa ? (ll[0] - maxLa) : 0;
    const dLo = ll[1] < minLo ? (minLo - ll[1]) : ll[1] > maxLo ? (ll[1] - maxLo) : 0;
    if (Math.hypot(dLa * latScale, dLo * lonScale) > best) continue;
    for (let i = 1; i < pts.length; i++) {
      const d = pointToSegmentKm(ll, pts[i - 1], pts[i]);
      if (d < best) { best = d; bestFeat = f; }
    }
    if (pts.length === 1) {
      const d = haversineKm(ll, pts[0]);
      if (d < best) { best = d; bestFeat = f; }
    }
  }
  return { km: best, feat: bestFeat };
}

/* ---------------- gather every spot ---------------- */
function allSpots() {
  const out = [];
  /* The bundled London twelve live in the source, not in a pack. */
  const app = fs.readFileSync("src/App.jsx", "utf8");
  const start = app.indexOf("const SPOTS = [");
  const block = app.slice(start, app.indexOf("\n];", start));
  for (const m of block.matchAll(/id: "([a-z0-9-]+)", name: "([^"]+)"[\s\S]{0,400}?ll: \[([-\d.]+), *([-\d.]+)\]/g)) {
    out.push({ region: "london-on", id: m[1], name: m[2], ll: [Number(m[3]), Number(m[4])],
               water: null, source: "bundled" });
  }
  for (const f of fs.readdirSync(MAP_DIR).filter((x) => x.endsWith("-spots.json"))) {
    const pack = JSON.parse(fs.readFileSync(path.join(MAP_DIR, f), "utf8"));
    for (const sp of pack.spots || []) {
      out.push({ region: pack.region, id: sp.id, name: sp.name, ll: sp.ll,
                 water: sp.water || null, source: f });
    }
  }
  return out;
}

/* ---------------- run ---------------- */
const WARN_KM = 0.12;      /* a pin this far from water is worth a look */
const BAD_KM = 0.4;        /* this far is wrong, whatever the excuse */

const spots = allSpots();
const byRegion = new Map();
for (const s of spots) {
  if (!byRegion.has(s.region)) byRegion.set(s.region, []);
  byRegion.get(s.region).push(s);
}

let warn = 0, bad = 0, checked = 0;
const rows = [];

for (const [region, list] of [...byRegion.entries()].sort()) {
  const w = waterOf(region);
  if (!w) { console.log(`\n  ${region}: no map file — ${list.length} spots unchecked`); continue; }
  console.log(`\n  ${region}  (${list.length} locations, centre ${w.centre.map((n) => n.toFixed(3)).join(", ")})`);
  for (const s of list.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!Array.isArray(s.ll) || s.ll.length !== 2) { console.log(`    ?? ${s.name}: no coordinates`); continue; }
    checked++;
    const near = nearestWater(w, s.ll);
    const fromTown = haversineKm(s.ll, w.centre);
    const flag = near.km > BAD_KM ? "BAD " : near.km > WARN_KM ? "warn" : "  ok";
    if (near.km > BAD_KM) bad++; else if (near.km > WARN_KM) warn++;
    const m = Math.round(near.km * 1000);
    const nm = near.feat && near.feat.name ? near.feat.name : "(unnamed " + (near.feat ? near.feat.kind : "?") + ")";
    console.log(`    ${flag} ${s.name.padEnd(34).slice(0, 34)} ${String(m).padStart(5)} m to ${nm.slice(0, 30).padEnd(30)} ${fromTown.toFixed(1).padStart(5)} km from town`);
    rows.push({ region, id: s.id, name: s.name, metres: m, nearest: nm, fromTownKm: +fromTown.toFixed(1), says: s.water });
  }
}

console.log(`\n  ${checked} locations measured against their region's own water geometry`);
console.log(`  ${bad} beyond ${BAD_KM * 1000} m, ${warn} beyond ${WARN_KM * 1000} m\n`);

if (process.argv.includes("--json")) {
  fs.writeFileSync("spot-check.json", JSON.stringify(rows, null, 2));
  console.log("  wrote spot-check.json\n");
}

/* A report, not a gate - see the header. Exit 0 whatever it finds, so it can
   be run for information without a wrapper script having to swallow it. */
process.exit(0);
