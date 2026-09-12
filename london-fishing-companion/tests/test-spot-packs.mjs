/* Spot packs: a city's fishing locations, bound to the city rather than the app.

   The twenty-two researched Ontario spots used to live in src/App.jsx, in the
   bundle, so every phone carried Windsor's locations whether or not it had
   Windsor's map - and a new city could not have locations at all without
   shipping a new app. They are map/<city>-spots.json now and they arrive with
   the city's map download.

   That moved real content out of the file the other suites read, so this one
   exists to hold the pack format still. Three things it checks that nothing
   else can:

     - the loader's validation actually rejects things, rather than being a
       shape the good data happens to satisfy. Every guard is exercised with a
       pack built to trip it;
     - a pack's spots sit inside the region's own bbox. A record with a typo
       in a coordinate is invisible in the list and off the edge of the map;
     - a researched spot still carries no access block and no depth profile.
       That is a standing decision, not an oversight - inventing those is what
       strands somebody at a locked gate - and the Unchecked badge keys off the
       block being absent, so a well-meant addition would clear the badge and
       assert something nobody checked.
*/
import fs from "fs";
import { spotPackUrl, fetchSpotPack } from "../src/services.js";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 22: spot packs ===\n");

const index = JSON.parse(fs.readFileSync("map/index.json", "utf8"));
const packFiles = fs.readdirSync("map").filter((f) => f.endsWith("-spots.json")).sort();

/* ------------------------------------------------------------------
   The files on disk.
   ------------------------------------------------------------------ */
console.log("-- the packs themselves --");
chk("there are packs at all", packFiles.length >= 5, packFiles.length + " packs");

let totalSpots = 0;
for (const file of packFiles) {
  const id = file.replace(/-spots\.json$/, "");
  const pack = JSON.parse(fs.readFileSync("map/" + file, "utf8"));
  const region = index.regions.find((r) => r.id === id);

  chk(`${id}: has a region in the index`, !!region);
  chk(`${id}: schema 1 and names itself`, pack.schema === 1 && pack.region === id);
  chk(`${id}: has spots`, Array.isArray(pack.spots) && pack.spots.length > 0,
      (pack.spots || []).length);

  if (!region) continue;
  const [w, s, e, n] = region.bbox;
  let outside = 0, untagged = 0, invented = 0;
  for (const sp of pack.spots) {
    if (sp.region !== id) untagged++;
    const [lat, lon] = sp.ll || [];
    if (!(lat >= s && lat <= n && lon >= w && lon <= e)) outside++;
    /* The standing decision. A researched spot asserts water, species,
       months and hazards; it does not assert parking, footing or a depth
       cross-section, because those came from standing there. */
    if (sp.unverified && (sp.access || sp.depth || sp.hot || sp.bank)) invented++;
  }
  chk(`${id}: every spot is tagged to this region`, untagged === 0, untagged + " untagged");
  chk(`${id}: every spot is inside the region bbox`, outside === 0, outside + " outside");
  chk(`${id}: no unverified spot claims access, depth, hot spots or bank`,
      invented === 0, invented + " overclaim");

  /* The index has to agree with the file, or the picker offers a count that
     is not what arrives. */
  chk(`${id}: the index count matches the file`, region.spots === pack.spots.length,
      `index ${region.spots}, file ${pack.spots.length}`);
  totalSpots += pack.spots.length;
}
chk("spots across every pack", totalSpots >= 25, totalSpots);

/* ------------------------------------------------------------------
   Langley, the first city outside Ontario.
   ------------------------------------------------------------------ */
console.log("\n-- Langley, BC --");
{
  const bc = index.regions.find((r) => r.id === "langley-bc");
  chk("langley-bc is in the index", !!bc);
  if (bc) {
    chk("filed under British Columbia", bc.province === "British Columbia", bc.province);
    chk("its city is Langley", bc.city === "Langley", bc.city);
  }
  const file = "map/langley-bc-spots.json";
  chk("its pack exists", fs.existsSync(file));
  if (fs.existsSync(file)) {
    const pack = JSON.parse(fs.readFileSync(file, "utf8"));
    /* The owner asked for five to eight. */
    chk("five to eight locations", pack.spots.length >= 5 && pack.spots.length <= 8,
        pack.spots.length);
    const withHazards = pack.spots.filter((s) => s.hazards && s.hazards.length > 40).length;
    chk("every location carries a real hazard note",
        withHazards === pack.spots.length, `${withHazards} of ${pack.spots.length}`);
    const withBest = pack.spots.filter((s) => Array.isArray(s.best) && s.best.length).length;
    chk("every location says when it fishes",
        withBest === pack.spots.length, `${withBest} of ${pack.spots.length}`);
    /* The tidal/non-tidal licence split is the one thing about this region a
       person has to know before they buy a licence, and it is not something
       the app can infer from a coordinate - so the records say it. */
    const tidalMentions = pack.spots.filter((s) =>
      /tidal|licence/i.test((s.tip || "") + " " + (s.hazards || ""))).length;
    chk("the licence question is raised on the records", tidalMentions >= 5, tidalMentions);
  }
}

/* ------------------------------------------------------------------
   spotPackUrl: the same id guard as the region files.
   ------------------------------------------------------------------ */
console.log("\n-- the url guard --");
chk("a normal id builds a path", spotPackUrl("langley-bc") === "./map/langley-bc-spots.json",
    spotPackUrl("langley-bc"));
chk("a traversal is refused", spotPackUrl("../../etc/passwd") === null);
chk("a slash is refused", spotPackUrl("map/london") === null);
chk("an absolute url is refused", spotPackUrl("https://elsewhere.example/x") === null);
chk("empty is refused", spotPackUrl("") === null);
chk("undefined is refused", spotPackUrl(undefined) === null);

/* ------------------------------------------------------------------
   fetchSpotPack, against a stubbed fetch.

   Every guard gets a pack built to trip it. Without this the validation is
   just a shape the real files happen to satisfy - which is how the QR
   round-trip passed twenty-two times with two encoder bugs in it.
   ------------------------------------------------------------------ */
console.log("\n-- the loader --");
const realFetch = globalThis.fetch;
const serve = (body, ok = true) => {
  globalThis.fetch = async () => ({
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
    headers: { get: () => "application/json" },
  });
};
const good = {
  schema: 1, region: "langley-bc",
  spots: [
    { id: "a", name: "A", region: "langley-bc", ll: [49.1, -122.6] },
    { id: "b", name: "B", region: "langley-bc", ll: [49.2, -122.5] },
  ],
};

try {
  serve(good);
  let r = await fetchSpotPack("langley-bc");
  chk("a good pack loads", r.ok && r.spots.length === 2, r.ok ? r.spots.length : r.error);

  serve({ ...good, schema: 2 });
  r = await fetchSpotPack("langley-bc");
  chk("a future schema is refused", !r.ok, r.ok ? "accepted" : r.error);

  serve({ ...good, region: "windsor-on" });
  r = await fetchSpotPack("langley-bc");
  chk("a pack for another region is refused", !r.ok, r.ok ? "accepted" : r.error);

  serve({ schema: 1, region: "langley-bc" });
  r = await fetchSpotPack("langley-bc");
  chk("a pack with no spots array is refused", !r.ok, r.ok ? "accepted" : r.error);

  serve({ schema: 1, region: "langley-bc", spots: [] });
  r = await fetchSpotPack("langley-bc");
  chk("an empty pack is refused", !r.ok, r.ok ? "accepted" : r.error);

  /* Partial rot: one good record among four bad ones. The good one has to
     survive and the bad ones have to go, because each of those shapes used
     to be a white screen rather than a missing row. */
  serve({
    schema: 1, region: "langley-bc",
    spots: [
      { id: "keep", name: "Keep", region: "langley-bc", ll: [49.1, -122.6] },
      { name: "No id", region: "langley-bc", ll: [49.1, -122.6] },
      { id: "noname", region: "langley-bc", ll: [49.1, -122.6] },
      { id: "nocoords", name: "No coords", region: "langley-bc" },
      { id: "nanll", name: "NaN coords", region: "langley-bc", ll: [NaN, -122.6] },
      { id: "elsewhere", name: "Wrong region", region: "windsor-on", ll: [49.1, -122.6] },
    ],
  });
  r = await fetchSpotPack("langley-bc");
  chk("bad records are dropped and the good one kept",
      r.ok && r.spots.length === 1 && r.spots[0].id === "keep",
      r.ok ? r.spots.map((x) => x.id).join(",") : r.error);

  serve(good, false);
  r = await fetchSpotPack("langley-bc");
  chk("a 404 is refused, not thrown", !r.ok, r.ok ? "accepted" : r.error);

  r = await fetchSpotPack("../evil");
  chk("a bad id never reaches the network", !r.ok, r.ok ? "accepted" : r.error);
} finally {
  globalThis.fetch = realFetch;
}

/* ------------------------------------------------------------------
   The service worker caches a pack alongside the map it belongs to.
   ------------------------------------------------------------------ */
console.log("\n-- the service worker --");
{
  const sw = fs.readFileSync("sw.js", "utf8");
  const m = sw.match(/const isRegionFile = \(url\) =>\s*([^;]+);/);
  chk("isRegionFile is where this test thinks it is", !!m);
  if (m) {
    /* Evaluated rather than eyeballed: the point is that the pack path
       matches the existing rule, which is the whole reason a pack is a
       sibling file in map/ rather than a new cache and a new rule. */
    const isRegionFile = new Function("url", "return (" + m[1] + ")");
    const p = (pathname) => isRegionFile({ pathname });
    chk("a region file matches", p("/map/langley-bc.json") === true);
    chk("a spot pack matches too", p("/map/langley-bc-spots.json") === true);
    chk("the index does not", p("/map/index.json") === false);
    chk("app.js does not", p("/app.js") === false);
  }
}

console.log(`\n=== SPOT PACK RESULT: ${pass} passed, ${fail} failed ===\n`);
if (fail) process.exit(1);
