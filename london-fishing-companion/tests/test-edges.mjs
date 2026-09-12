/* MALFORMED INPUT REACHING A PURE FUNCTION.

   Every value in here can arrive from somewhere nobody controls: an imported
   backup, a community pack, a hand-edited JSON file, a corrupted storage
   write, or a weather reading that came back wrong. None of these functions
   validate their arguments, because most of the time they do not have to -
   and "most of the time" is what this suite exists to stop being the
   standard.

   Three real defects came out of it, all of them the same shape: nonsense in,
   crash or nonsense out, on the dashboard.

     hookRate returned NaN for a NaN rating, because clamp() passes NaN
     straight through - every comparison against it is false - and the
     dashboard printed "NaN%".

     regionalRate threw on a null in the spots list, reading .density off it.

     resolveFavourites threw on a non-string entry, reading .indexOf off it,
     which blanked the favourites grid on the home screen.

   It also cleared one thing I had wrongly called a bug: a protocol-relative
   url normalises to https and is not a scheme bypass. See the note by the
   url guards. */
import { hookRate, hookBand, regionalRate, rankSpecies } from "../src/odds.js";
import * as MAP from "../src/map.js";
import * as PORT from "../src/portability.js";
import * as SVC from "../src/services.js";
import * as FAV from "../src/favourites.js";
import * as LINKS from "../src/links.js";

console.log("\n=== SCAN 29: malformed input to pure functions ===");
let issues = 0;
const bad = (m) => { issues++; console.log("  ! " + m); };
const head = (t) => console.log("\n-- " + t + " --");

/* ---------------- odds: the edges ---------------- */
head("hook rate at its boundaries");
{
  const base = { density: 3, seasonOpen: true, rating: 50, inBestMonths: false };
  /* Nonsense in must not produce nonsense out - these values reach the model
     from a hand-edited import or a community pack. */
  const cases = [
    ["density 0", { ...base, density: 0 }],
    ["density undefined", { ...base, density: undefined }],
    ["density null", { ...base, density: null }],
    ["density NaN", { ...base, density: NaN }],
    ["density 99", { ...base, density: 99 }],
    ["density -5", { ...base, density: -5 }],
    ["density a string", { ...base, density: "4" }],
    ["rating 0", { ...base, rating: 0 }],
    ["rating 100", { ...base, rating: 100 }],
    ["rating -20", { ...base, rating: -20 }],
    ["rating 500", { ...base, rating: 500 }],
    ["rating NaN", { ...base, rating: NaN }],
    ["nothing at all", {}],
    ["undefined", undefined],
  ];
  for (const [label, arg] of cases) {
    let v;
    try { v = hookRate(arg); }
    catch (e) { bad(`hookRate(${label}) threw: ${e.message}`); continue; }
    if (!Number.isFinite(v)) { bad(`hookRate(${label}) returned ${v}`); continue; }
    if (v < 0 || v > 100) bad(`hookRate(${label}) returned ${v}, outside 0-100`);
  }
  /* A closed season is zero, whatever else is true. That is a claim the UI
     makes and it must hold at the extremes too. */
  const shut = hookRate({ density: 5, seasonOpen: false, rating: 100, inBestMonths: true });
  if (shut !== 0) bad(`a closed season with everything else perfect reads ${shut}, not 0`);
  /* And the cap. */
  const best = hookRate({ density: 5, seasonOpen: true, rating: 100, inBestMonths: true });
  if (best >= 90) bad(`the best possible rate is ${best} - it was supposed to stay under 90`);
  if (best < 50) bad(`the best possible rate is only ${best}`);
  /* Monotonic in density, which is the one property a user would notice. */
  let prev = -1;
  for (const d of [1, 2, 3, 4, 5]) {
    const v = hookRate({ ...base, density: d });
    if (v < prev) bad(`density ${d} reads ${v}, lower than density ${d - 1} at ${prev}`);
    prev = v;
  }
  for (const b of [0, 1, 50, 88, 100]) {
    if (typeof hookBand(b) !== "string" || !hookBand(b)) bad(`hookBand(${b}) is not a word`);
  }
  console.log("  checked 14 malformed inputs, the closed-season floor, the cap and monotonicity");
}

head("regionalRate with no usable spots");
{
  const cases = [
    ["no spots", []],
    ["undefined", undefined],
    ["spots with no density", [{ id: "a" }]],
    ["density for another species", [{ id: "a", density: { xyz: 5 } }]],
    ["a null in the list", [null, { id: "a", density: { smb: 4 } }]],
  ];
  for (const [label, spots] of cases) {
    try {
      const r = regionalRate("smb", spots, { seasonOpen: true, rating: 50, month: 6 });
      if (r && !Number.isFinite(r.rate)) bad(`regionalRate(${label}) rate is ${r.rate}`);
    } catch (e) { bad(`regionalRate(${label}) threw: ${e.message}`); }
  }
  try {
    const r = rankSpecies(undefined, undefined, {});
    if (!Array.isArray(r)) bad("rankSpecies with nothing returned " + typeof r);
  } catch (e) { bad("rankSpecies with nothing threw: " + e.message); }
  console.log("  checked 5 empty-region shapes and a bare rankSpecies");
}

/* ---------------- map maths ---------------- */
head("map geometry at its edges");
{
  const checks = [
    ["worldSize(0)", () => MAP.worldSize(0) === 256],
    ["lat clamped at the pole", () => Number.isFinite(MAP.latToWorldY(90, 10))],
    ["lat clamped at -90", () => Number.isFinite(MAP.latToWorldY(-90, 10))],
    ["lon at the date line", () => Number.isFinite(MAP.lonToWorldX(180, 10))],
    ["lon at -180", () => Number.isFinite(MAP.lonToWorldX(-180, 10))],
    ["decodeLine of nothing", () => { const r = MAP.decodeLine([]); return Array.isArray(r) || r == null; }],
    ["decodeLayer of nothing", () => { const r = MAP.decodeLayer(undefined); return r == null || Array.isArray(r) || typeof r === "object"; }],
    ["decodeRegion of nothing", () => { MAP.decodeRegion(null); return true; }],
    ["decodeRegion of junk", () => { MAP.decodeRegion({ layers: { river: "nonsense" } }); return true; }],
    ["clusterPins of nothing", () => Array.isArray(MAP.clusterPins([], {}, 10) || [])],
    ["filterPins of nothing", () => Array.isArray(MAP.filterPins(undefined, {}) || [])],
  ];
  for (const [label, fn] of checks) {
    try { if (!fn()) bad(`map: ${label} gave a bad answer`); }
    catch (e) { bad(`map: ${label} threw: ${e.message}`); }
  }
  console.log("  checked 11 geometry and decode edges");
}

/* ---------------- import validation ---------------- */
head("import validation against hostile input");
{
  const hostile = [
    ["empty string", ""],
    ["not json", "{{{"],
    ["null", "null"],
    ["an array", "[]"],
    ["a number", "42"],
    ["no schema", JSON.stringify({ catalog: {}, trips: [] })],
    ["a future schema", JSON.stringify({ schema: 999, catalog: {}, trips: [], catches: [] })],
    ["catalog is a string", JSON.stringify({ schema: 1, kind: "full", catalog: "nope", trips: [], catches: [] })],
    ["trips is an object", JSON.stringify({ schema: 1, kind: "full", catalog: {}, trips: {}, catches: [] })],
    ["deeply nested nonsense", JSON.stringify({ schema: 1, kind: "full", catalog: { spots: [{ id: { a: { b: 1 } } }] }, trips: [], catches: [] })],
    ["a prototype pollution attempt", '{"schema":1,"kind":"full","catalog":{},"trips":[],"catches":[],"__proto__":{"polluted":true}}'],
  ];
  for (const [label, text] of hostile) {
    try {
      const r = PORT.validateImport(text);
      if (r && r.ok === undefined) bad(`validateImport(${label}) returned no ok flag`);
    } catch (e) { bad(`validateImport(${label}) threw: ${e.message}`); }
  }
  if ({}.polluted !== undefined) bad("Object.prototype was polluted by an import");
  console.log("  checked 11 hostile payloads, including prototype pollution");
}

/* ---------------- url guards ---------------- */
head("url guards");
{
  const nasty = [
    "javascript:alert(1)", "data:text/html,<script>x</script>", "vbscript:x",
    "file:///etc/passwd", "http://bit.ly/x", "https://tinyurl.com/x",
    " javascript:alert(1)", "JaVaScRiPt:alert(1)", "\njavascript:alert(1)",
  ];
  for (const u of nasty) {
    const r = LINKS.addLink([], u, "test");
    if (!r.error) bad(`addLink accepted "${u}"`);
  }
  /* NOT in the list above: "//evil.example/x". A protocol-relative address
     normalises to https://evil.example/x - the same result as typing the host
     plainly - and the shortener check still fires on //bit.ly/x. The guard is
     for odd schemes and shorteners, and it catches both; refusing this would
     be refusing a legitimate way to write a url. */
  const good = LINKS.addLink([], "https://www.ontario.ca/page/fishing-licence", "Licence");
  if (good.error) bad("addLink refused a plain https url: " + good.error);
  console.log(`  checked ${nasty.length} hostile urls and one good one`);
}

head("community path guard");
{
  for (const p of ["../secrets", "/etc/passwd", "a/../../b", "http://x/y", "packs/../../x", ""]) {
    if (SVC.isSafeCommunityPath(p)) bad(`isSafeCommunityPath accepted "${p}"`);
  }
  console.log("  checked 6 traversal attempts");
}

/* ---------------- favourites ---------------- */
head("favourites with broken refs");
{
  const resolve = () => null;          /* nothing resolves */
  try {
    const r = FAV.resolveFavourites(["spots:gone", "species:vanished", "bogus", "", null], resolve);
    if (!Array.isArray(r)) bad("resolveFavourites returned " + typeof r);
    if (r.length) bad(`resolveFavourites kept ${r.length} entries that resolve to nothing`);
  } catch (e) { bad("resolveFavourites threw: " + e.message); }
  try {
    FAV.isFavourite(undefined, "spots", "x");
    FAV.toggleFavourite(undefined, "spots", "x");
  } catch (e) { bad("favourites threw on undefined input: " + e.message); }
  console.log("  checked unresolvable and malformed favourite refs");
}

console.log(`\n=== EDGES RESULT: ${issues ? 0 : 1} passed, ${issues} failed ===\n`);
process.exit(issues ? 1 : 0);
