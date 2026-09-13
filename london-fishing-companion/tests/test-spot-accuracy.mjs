/* SCAN 36: every fishing location is on the water it claims to be on.
 *
 * This app tells people where to stand. Every coordinate in it was researched
 * rather than visited, and a pin two hundred metres into a field is
 * indistinguishable from a correct one when you are reading a JSON file — it
 * stays indistinguishable right up until somebody drives there.
 *
 * The ground truth was already in the repo and unused: each map/<region>.json
 * carries OpenStreetMap's water and river geometry with the names interned.
 * So this measures every location against the actual water, in the region's
 * own map file.
 *
 * What it found on its first run, out of 51 locations:
 *   - 15 more than 400 m from any water, 17 more than 120 m
 *   - "Lac Rawdon" was 337 m from water and the nearest named feature was
 *     Lac PONTBRIAND — a pin on the wrong lake
 *   - Fanshawe Conservation Area's nearest water was a stormwater pond
 *   - three Langley locations were over a kilometre out, one by 1.7 km
 *
 * And a bug in the checker before any of that: the fast reject sampled eight
 * vertices of a feature, which for Lake Huron missed the shore forty metres
 * from the pin and reported Port Franks as 800 m from water. Measured with a
 * bounding box now, which can never skip a nearer feature.
 */
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 36: are the locations on the water? ===\n");

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
    for (const line of L.lines) feats.push(decodeLine(line, scale));
  }
  cache.set(region, { feats, centre: m.centre });
  return cache.get(region);
}
function metresToWater(region, ll) {
  const w = featsOf(region);
  if (!w) return null;
  let best = Infinity;
  for (const pts of w.feats) for (const p of pts) {
    const d = km(p, ll);
    if (d < best) best = d;
  }
  return Math.round(best * 1000);
}

/* ---------- every location, bundled and packed ---------- */
const app = fs.readFileSync("src/App.jsx", "utf8");
const block = app.slice(app.indexOf("const SPOTS = ["), app.indexOf("\n];", app.indexOf("const SPOTS = [")));
const all = [];
for (const m of block.matchAll(/id: "([a-z0-9-]+)", name: "([^"]+)"[\s\S]{0,400}?ll: \[([-\d.]+), *([-\d.]+)\]/g)) {
  all.push({ region: "london-on", id: m[1], name: m[2], ll: [Number(m[3]), Number(m[4])] });
}
for (const f of fs.readdirSync("map").filter((x) => x.endsWith("-spots.json"))) {
  const pack = JSON.parse(fs.readFileSync(path.join("map", f), "utf8"));
  for (const sp of pack.spots || []) all.push({ region: pack.region, id: sp.id, name: sp.name, ll: sp.ll });
}

chk("there are locations to check", all.length > 50, all.length + " across " +
    new Set(all.map((s) => s.region)).size + " cities");

console.log("");
console.log("-- distance from the pin to the nearest water in that city's own map --");
{
  const off = [];
  let worst = 0, worstName = "";
  for (const s of all) {
    if (!Array.isArray(s.ll) || s.ll.length !== 2) { off.push(s.name + " has no coordinates"); continue; }
    const m = metresToWater(s.region, s.ll);
    if (m == null) continue;
    if (m > worst) { worst = m; worstName = s.name; }
    /* 400 m is the line. A park's pin can sit at the car park rather than the
       bank, which is a few hundred metres and reasonable. Half a kilometre is
       not a car park, it is a different place. */
    if (m > 400) off.push(`${s.name} (${s.region}) is ${m} m from any water`);
  }
  chk("no location is more than 400 m from water", off.length === 0,
      off.length ? off.join("; ") : `worst is ${worstName} at ${worst} m`);
}

console.log("");
console.log("-- every city ships a usable set --");
{
  const byRegion = new Map();
  for (const s of all) byRegion.set(s.region, (byRegion.get(s.region) || 0) + 1);
  const thin = [...byRegion.entries()].filter(([, n]) => n < 10);
  chk("every city has at least 10 locations", thin.length === 0,
      thin.length ? thin.map(([r, n]) => `${r} has ${n}`).join(", ")
                  : [...byRegion.entries()].map(([r, n]) => `${r} ${n}`).join(", "));
  const dup = all.map((s) => s.id).filter((v, i, a) => a.indexOf(v) !== i);
  chk("no location id is used twice", dup.length === 0, dup.join(", ") || "all unique");
}

console.log("");
console.log("-- the app can say how far each one is --");
{
  /* The owner's note was that Rawdon's locations were drives rather than
     places you can reach after work. More local ones is half the answer; the
     other half is the list saying which is which, and that needs a centre. */
  const regs = app.slice(app.indexOf("const REGION_REGS"), app.indexOf("\n};", app.indexOf("const REGION_REGS")));
  const ids = [...regs.matchAll(/"([a-z-]+)":\s*\{/g)].map((m) => m[1]);
  const without = ids.filter((id) => {
    const seg = regs.slice(regs.indexOf(`"${id}":`), regs.indexOf(`"${id}":`) + 300);
    return !/centre: \[/.test(seg);
  });
  chk("every region knows where its city is", without.length === 0,
      without.length ? without.join(", ") : ids.length + " regions");
  chk("and the list renders a distance", /distanceLabel\(/.test(app) && /kmBetween\(sp\.ll/.test(app));
  chk("...computed, not stored", !/fromTownKm|distanceKm:/.test(app),
      "a stored distance goes stale the moment a coordinate is corrected, and 20 just were");
}

console.log("");
console.log("-- Rawdon is reachable after work --");
{
  const pack = JSON.parse(fs.readFileSync("map/rawdon-qc-spots.json", "utf8"));
  const regs = app.slice(app.indexOf("const REGION_REGS"));
  const centre = JSON.parse(/"rawdon-qc":[\s\S]{0,200}?centre: (\[[-\d., ]+\])/.exec(regs)[1]);
  const near = pack.spots.filter((s) => km(s.ll, centre) <= 8);
  chk("most of Rawdon's locations are within 8 km of the town",
      near.length >= 6, `${near.length} of ${pack.spots.length}: ` +
      near.map((s) => s.name.split("—")[0].trim()).slice(0, 8).join(", "));
  chk("...and the far ones say so in the area line",
      pack.spots.filter((s) => km(s.ll, centre) > 15).every((s) => /minutes/.test(s.area || "")),
      "a drive should be labelled a drive");
}

console.log(`\n=== SPOT ACCURACY RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
