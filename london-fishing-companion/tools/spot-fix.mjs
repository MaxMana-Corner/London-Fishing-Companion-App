/* spot-fix.mjs — propose a corrected coordinate for every pin that is off water.
   ============================================================

   spot-check says which pins are wrong. water-find --snap fixes one at a
   time, and needs to be told the coordinate - which is how I managed to
   "verify" a fix against a coordinate I had typed from memory rather than
   read from the file. This reads the files.

   For every location further than --over metres from any water in its own
   region's map, it reports the nearest point ON that water, how far the pin
   would move, and what the water is called. Nothing is written unless
   --write is passed, and even then only to the packs: the bundled London
   twelve live in src/App.jsx and are listed for a person to edit, because a
   regex rewriting source is a worse idea than twelve manual edits.

   THE MOVE DISTANCE IS THE THING TO READ. Forty metres is a pin nudged onto
   the bank. Two kilometres is a pin that was somewhere else entirely, and
   snapping it to the nearest water may put it in the wrong reach of a long
   river rather than at the place the record describes - so those are printed
   with a warning and left for a human.
   ============================================================ */
import fs from "fs";
import path from "path";

const OVER_M = Number((process.argv.find((a) => a.startsWith("--over=")) || "--over=200").split("=")[1]);
const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force");
const FAR_M = 600;   /* beyond this, a snap is a guess and says so */

function decodeLine(line, scale) {
  const div = Math.pow(10, scale);
  const out = []; let y = 0, x = 0;
  for (let i = 0; i < line.length; i += 2) {
    if (i === 0) { y = line[0]; x = line[1]; } else { y += line[i]; x += line[i + 1]; }
    out.push([y / div, x / div]);
  }
  return out;
}
const toRad = (d) => (d * Math.PI) / 180;
const km = (a, b) => {
  const dLa = toRad(b[0] - a[0]), dLo = toRad(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

const cache = new Map();
function featsOf(region) {
  if (cache.has(region)) return cache.get(region);
  const file = path.join("map", region + ".json");
  if (!fs.existsSync(file)) { cache.set(region, null); return null; }
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  const feats = [];
  for (const key of ["water", "river"]) {
    const L = m.layers && m.layers[key];
    if (!L || !Array.isArray(L.lines)) continue;
    const scale = Number(L.scale) || 5;
    const table = Array.isArray(L.nameTable) ? L.nameTable : [];
    const names = Array.isArray(L.names) ? L.names : [];
    for (let i = 0; i < L.lines.length; i++) {
      const idx = names[i];
      feats.push({ pts: decodeLine(L.lines[i], scale), kind: key,
                   name: idx > 0 && idx <= table.length ? table[idx - 1] : null });
    }
  }
  cache.set(region, feats);
  return feats;
}

/* Nearest VERTEX, not nearest point on a segment: a vertex is a coordinate
   the map actually contains, and a point interpolated along a segment can sit
   in open water halfway across a lake. A pin wants a place, not a midpoint. */
function snap(region, ll, wantName) {
  const feats = featsOf(region);
  if (!feats) return null;
  let best = Infinity, pt = null, name = null, kind = null;
  for (const f of feats) {
    if (wantName && !(f.name || "").toLowerCase().includes(wantName)) continue;
    for (const p of f.pts) {
      const d = km(p, ll);
      if (d < best) { best = d; pt = p; name = f.name; kind = f.kind; }
    }
  }
  return pt ? { metres: Math.round(best * 1000), ll: [+pt[0].toFixed(4), +pt[1].toFixed(4)], name, kind } : null;
}

let moved = 0, flagged = 0, manual = 0;

for (const file of fs.readdirSync("map").filter((f) => f.endsWith("-spots.json")).sort()) {
  const full = path.join("map", file);
  const pack = JSON.parse(fs.readFileSync(full, "utf8"));
  let touched = false;
  const lines = [];
  for (const sp of pack.spots || []) {
    if (!Array.isArray(sp.ll)) continue;
    const s = snap(pack.region, sp.ll);
    if (!s || s.metres < OVER_M) continue;
    flagged++;
    const far = s.metres > FAR_M;
    lines.push(`    ${far ? "?? " : "-> "}${sp.name.slice(0, 32).padEnd(32)} ` +
      `[${sp.ll[0]}, ${sp.ll[1]}] -> [${s.ll[0]}, ${s.ll[1]}]  ` +
      `${String(s.metres).padStart(5)} m onto ${s.name || "(unnamed " + s.kind + ")"}` +
      (far ? "   <-- a long way: check this is the right reach" : ""));
    if (far) manual++;
    /* A long move is a guess about WHICH REACH of a river, not a nudge onto
       a bank, so it is not written unless somebody says so explicitly. */
    if (WRITE && (!far || FORCE)) { sp.ll = s.ll; touched = true; moved++; }
  }
  if (lines.length) { console.log(`\n  ${file}`); lines.forEach((l) => console.log(l)); }
  if (touched) fs.writeFileSync(full, JSON.stringify(pack, null, 2) + "\n");
}

/* The bundled twelve are listed, never rewritten - see the header. */
const app = fs.readFileSync("src/App.jsx", "utf8");
const block = app.slice(app.indexOf("const SPOTS = ["), app.indexOf("\n];", app.indexOf("const SPOTS = [")));
const bundled = [];
for (const m of block.matchAll(/id: "([a-z0-9-]+)", name: "([^"]+)"[\s\S]{0,400}?ll: \[([-\d.]+), *([-\d.]+)\]/g)) {
  bundled.push({ id: m[1], name: m[2], ll: [Number(m[3]), Number(m[4])] });
}
const bl = [];
for (const sp of bundled) {
  const s = snap("london-on", sp.ll);
  if (!s || s.metres < OVER_M) continue;
  flagged++;
  const far = s.metres > FAR_M;
  if (far) manual++;
  bl.push(`    ${far ? "?? " : "-> "}${sp.name.slice(0, 32).padEnd(32)} ` +
    `[${sp.ll[0]}, ${sp.ll[1]}] -> [${s.ll[0]}, ${s.ll[1]}]  ` +
    `${String(s.metres).padStart(5)} m onto ${s.name || "(unnamed " + s.kind + ")"}` +
    (far ? "   <-- a long way: check this is the right reach" : ""));
}
if (bl.length) {
  console.log(`\n  src/App.jsx  (bundled London locations — edit by hand)`);
  bl.forEach((l) => console.log(l));
}

console.log(`\n  ${flagged} beyond ${OVER_M} m` +
  (manual ? `, ${manual} of them by more than ${FAR_M} m and worth a human` : "") +
  (WRITE ? `  —  ${moved} pack coordinates rewritten` : `  —  nothing written (pass --write)`) + "\n");
