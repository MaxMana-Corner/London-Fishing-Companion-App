/* water-find.mjs — what water is actually there, and where exactly.
   ============================================================

   The companion to spot-check.mjs. That one says a pin is wrong; this one
   says what the right answer is, out of the same OpenStreetMap geometry the
   app already ships.

     node tools/water-find.mjs rawdon-qc "lac rawdon"
        every named water matching that fragment, with a coordinate on it

     node tools/water-find.mjs rawdon-qc --near 8
        every named water within 8 km of the town centre, biggest first
        — which is how you find locations somebody can reach after work
          rather than locations that are a drive

   WHY A COORDINATE "ON IT" RATHER THAN A CENTROID. A lake's centroid is open
   water you cannot stand on. What a fishing location wants is a point on the
   SHORE, so this reports the feature's vertex nearest to whatever you asked
   about — the town centre by default — which is the near bank, which is
   where somebody would actually fish it from.
   ============================================================ */
import fs from "fs";
import path from "path";

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
function km(a, b) {
  const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const region = process.argv[2];
if (!region) {
  console.log("usage: node tools/water-find.mjs <region> <name fragment>");
  console.log("       node tools/water-find.mjs <region> --near <km>");
  console.log("       node tools/water-find.mjs <region> --snap <lat,lon> [name]");
  process.exit(1);
}
const file = path.join("map", region + ".json");
if (!fs.existsSync(file)) { console.log("no such map: " + file); process.exit(1); }
const m = JSON.parse(fs.readFileSync(file, "utf8"));
const centre = m.centre;

/* Every named feature, merged by name: OSM splits a long river into dozens of
   ways all carrying the same string, and reporting them separately turns one
   river into forty results. */
const byName = new Map();
for (const key of ["water", "river"]) {
  const L = m.layers && m.layers[key];
  if (!L || !Array.isArray(L.lines)) continue;
  const scale = Number(L.scale) || 5;
  const table = Array.isArray(L.nameTable) ? L.nameTable : [];
  const names = Array.isArray(L.names) ? L.names : [];
  for (let i = 0; i < L.lines.length; i++) {
    const idx = names[i];
    const name = idx > 0 && idx <= table.length ? table[idx - 1] : null;
    if (!name) continue;
    const pts = decodeLine(L.lines[i], scale);
    const rec = byName.get(name) || { name, kind: key, pts: [], parts: 0 };
    rec.pts.push(...pts);
    rec.parts++;
    byName.set(name, rec);
  }
}

/* --snap <lat,lon> [name fragment]: move a guessed coordinate onto the
   nearest point of the water it claims to be on. See the note above. */
const snapMode = process.argv[3] === "--snap";
if (snapMode) {
  const [la, lo] = String(process.argv[4] || "").split(",").map(Number);
  const want = (process.argv.slice(5).join(" ") || "").toLowerCase();
  if (!isFinite(la) || !isFinite(lo)) { console.log("usage: --snap <lat,lon> [name]"); process.exit(1); }
  const target = [la, lo];
  let best = Infinity, bestPt = null, bestName = null, bestKind = null;
  for (const key of ["water", "river"]) {
    const L = m.layers && m.layers[key];
    if (!L || !Array.isArray(L.lines)) continue;
    const scale = Number(L.scale) || 5;
    const table = Array.isArray(L.nameTable) ? L.nameTable : [];
    const names = Array.isArray(L.names) ? L.names : [];
    for (let i = 0; i < L.lines.length; i++) {
      const idx = names[i];
      const nm = idx > 0 && idx <= table.length ? table[idx - 1] : null;
      /* With a name given, only that water is a candidate - otherwise a pin
         200 m from a roadside ditch snaps to the ditch. */
      if (want && !(nm || "").toLowerCase().includes(want)) continue;
      for (const p of decodeLine(L.lines[i], scale)) {
        const d = km(p, target);
        if (d < best) { best = d; bestPt = p; bestName = nm; bestKind = key; }
      }
    }
  }
  if (!bestPt) { console.log("  nothing matching \"" + want + "\" in " + region); process.exit(1); }
  console.log("");
  console.log("  " + region + "  [" + la + ", " + lo + "]  ->  [" +
    bestPt[0].toFixed(4) + ", " + bestPt[1].toFixed(4) + "]");
  console.log("  moved " + Math.round(best * 1000) + " m onto " +
    (bestName || "(unnamed " + bestKind + ")"));
  console.log("");
  process.exit(0);
}

const nearMode = process.argv[3] === "--near";
const radius = nearMode ? Number(process.argv[4] || 10) : 0;
const query = nearMode ? null : (process.argv.slice(3).join(" ") || "").toLowerCase();

const results = [];
for (const rec of byName.values()) {
  /* Nearest vertex to the town centre: the near shore, which is the bank
     somebody would fish from rather than the middle of the lake. */
  let best = Infinity, bestPt = null;
  for (const p of rec.pts) { const d = km(p, centre); if (d < best) { best = d; bestPt = p; } }
  /* Extent of THE ONE YOU ARE BEING SHOWN, not of every namesake in the
     region. Quebec has a Lac Clair in most townships and OSM gives them all
     the same string, so a span measured across the merged set reported 103 km
     for a lake you can see across. Only vertices within 5 km of the nearest
     point count - that is the feature at that coordinate. */
  let minLa = 90, maxLa = -90, minLo = 180, maxLo = -180, near = 0;
  for (const p of rec.pts) {
    if (!bestPt || km(p, bestPt) > 5) continue;
    near++;
    if (p[0] < minLa) minLa = p[0]; if (p[0] > maxLa) maxLa = p[0];
    if (p[1] < minLo) minLo = p[1]; if (p[1] > maxLo) maxLo = p[1];
  }
  const spanKm = near ? km([minLa, minLo], [maxLa, maxLo]) : 0;
  const namesakes = rec.pts.length > near;
  results.push({ name: rec.name, kind: rec.kind, parts: rec.parts, namesakes,
                 fromTown: best, shore: bestPt, spanKm, vertices: rec.pts.length });
}

let show;
if (nearMode) {
  show = results.filter((r) => r.fromTown <= radius)
    .sort((a, b) => b.spanKm - a.spanKm || a.fromTown - b.fromTown);
  console.log(`\n  ${m.city || region}: ${show.length} named waters within ${radius} km of the centre\n`);
} else {
  show = results.filter((r) => r.name.toLowerCase().includes(query))
    .sort((a, b) => a.fromTown - b.fromTown);
  console.log(`\n  ${m.city || region}: ${show.length} named waters matching "${query}"\n`);
}

for (const r of show.slice(0, 60)) {
  console.log(
    "  " + r.name.slice(0, 34).padEnd(34) +
    " " + r.kind.padEnd(5) +
    " shore [" + r.shore[0].toFixed(4) + ", " + r.shore[1].toFixed(4) + "]" +
    "  " + r.fromTown.toFixed(1).padStart(5) + " km out" +
    "  span " + (r.spanKm < 1 ? Math.round(r.spanKm * 1000) + " m" : r.spanKm.toFixed(1) + " km") +
    (r.namesakes ? "  (name reused elsewhere in region)" : "")
  );
}
console.log("");
