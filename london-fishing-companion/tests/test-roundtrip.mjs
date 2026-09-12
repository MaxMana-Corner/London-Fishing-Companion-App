/* SCAN 35 - a backup round trip, with data that actually exists.

   test-port has 73 assertions on the pieces. What nothing does is take a
   REAL store - a trip, catches, a custom spot, favourites, spot packs - put
   it through buildExport, validateImport and planImport, and check what comes
   out the far side is what went in.

   That matters because a backup is the only copy of a log, and the parts that
   went wrong in this project were never the pieces - they were the joins. */
import * as PORT from "../src/portability.js";
import fs from "node:fs";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};
const head = (t) => console.log("\n-- " + t + " --");

console.log("\n=== PASS 2b: backup round trip ===");

/* A store with one of everything, shaped the way the app writes it. */
const CUSTOM_SPOT = {
  id: "mine1", custom: true, _v: 3, updatedAt: 1700000000000,
  name: "The bend below the trestle", area: "East end", water: "Thames — main branch",
  addr: "", ll: [42.98, -81.24], hydroStation: "",
  blurb: "Slow deep water on the outside of the bend.",
  depth: [0, 2, 4, 6, 5, 3, 0],
  hot: [{ i: 3, n: "Deep hole" }],
  density: { smb: 4, carp: 3 },
  access: { parking: 4, walk: 3, footing: 3, amenities: 2, cost: 5 },
  accessNote: "Lay-by on the road.", bank: "Grass",
  best: [6, 7, 8], tip: "After rain.",
};
const catalog = {
  spots: [CUSTOM_SPOT],
  species: [{ id: "mysp", custom: true, _v: 3, updatedAt: 1, name: "A fish I added", prov: "ON", season: "none" }],
  baits: [{ id: "myb", custom: true, _v: 3, updatedAt: 1, name: "My bait" }],
  knots: [], tips: [], tactics: [],
  photos: { mine1: "https://example.org/x.jpg" },
  links: { "spots:mine1": [{ url: "https://example.org/a", label: "A" }] },
  usefulLinks: [{ url: "https://example.org/b", label: "B" }],
};
const log = {
  trips: [{ id: "t1", spotId: "mine1", date: "2026-06-01", start: "06:00", end: "11:30", clarity: "Clear", sky: "Sun" }],
  catches: [
    { id: "c1", tripId: "t1", spotId: "mine1", speciesId: "smb", baitId: "tube", length: 14, kept: false, at: 1700000001000 },
    { id: "c2", tripId: null, spotId: "springbank", speciesId: "carp", baitId: "corn", length: 26, kept: true, at: 1700000002000 },
  ],
};

head("a full backup carries everything and reads back");
let text;
{
  const out = PORT.buildExport("full", { catalog, log, note: "a test backup" });
  chk("buildExport produced an object", !!out && typeof out === "object");
  text = JSON.stringify(out);
  chk("...that serialises", text.length > 200, text.length + " bytes");

  const v = PORT.validateImport(text);
  chk("its own output validates", v.ok === true, v.ok ? "ok" : (v.errors || []).join("; "));
  if (v.ok) {
    const d = v.data;
    chk("the trip survived", (d.trips || []).length === 1, (d.trips || []).length);
    chk("both catches survived", (d.catches || []).length === 2, (d.catches || []).length);
    chk("the custom spot survived", (d.catalog.spots || []).some((s) => s.id === "mine1"));
    chk("...with its depth profile intact",
        JSON.stringify((d.catalog.spots.find((s) => s.id === "mine1") || {}).depth) === JSON.stringify(CUSTOM_SPOT.depth),
        JSON.stringify((d.catalog.spots.find((s) => s.id === "mine1") || {}).depth));
    chk("...and its access block intact",
        JSON.stringify((d.catalog.spots.find((s) => s.id === "mine1") || {}).access) === JSON.stringify(CUSTOM_SPOT.access));
    chk("the custom species survived", (d.catalog.species || []).some((s) => s.id === "mysp"));
    chk("the custom bait survived", (d.catalog.baits || []).some((b) => b.id === "myb"));
  }
}

head("planImport onto an empty device");
{
  const v = PORT.validateImport(text);
  const plan = PORT.planImport({ catalog: { spots: [], species: [], baits: [], knots: [], tips: [], tactics: [] }, log: { trips: [], catches: [] } }, v.data);
  chk("a plan is produced", !!plan, typeof plan);
  const summary = JSON.stringify(plan).slice(0, 200);
  chk("...and it adds rather than skips everything", /added|add/i.test(summary), summary);
}

head("planImport onto a device that already has it");
{
  const v = PORT.validateImport(text);
  const plan = PORT.planImport({ catalog, log }, v.data);
  const s = JSON.stringify(plan);
  chk("importing the same backup twice adds nothing new",
      !/\"added\":[1-9]/.test(s), s.slice(0, 200));
}

head("mergeList: same id, newer wins");
{
  /* It returns { list, added, updated, unchanged } rather than a bare array -
     the counts are what the import summary is built from. */
  const older = [{ id: "x", name: "old", updatedAt: 100 }];
  const newer = [{ id: "x", name: "new", updatedAt: 200 }];
  const nameIn = (m) => (m.list.find((r) => r.id === "x") || {}).name;

  let m = PORT.mergeList(older, newer);
  chk("a newer incoming record wins", nameIn(m) === "new", nameIn(m));
  chk("...and is counted as an update", m.updated === 1 && m.added === 0, JSON.stringify(m).slice(-40));

  m = PORT.mergeList(newer, older);
  chk("an older incoming record does not win", nameIn(m) === "new", nameIn(m));
  chk("...and is counted as unchanged", m.unchanged === 1, JSON.stringify(m).slice(-40));

  m = PORT.mergeList([{ id: "x", name: "a" }], [{ id: "x", name: "b" }]);
  chk("no timestamps at all does not duplicate", m.list.length === 1, m.list.length);

  m = PORT.mergeList();
  chk("mergeList of nothing returns an empty list", Array.isArray(m.list) && m.list.length === 0,
      JSON.stringify(m));

  /* A backup can carry a null, and both loops already guard for it - which is
     worth asserting rather than assuming, because the same shape crashed
     regionalRate and resolveFavourites. */
  try {
    const r = PORT.mergeList([null, { id: "y" }], [{ id: "z" }, null, { noId: true }]);
    chk("a null or id-less record in either list is skipped, not fatal",
        Array.isArray(r.list) && r.list.length === 2, r.list.map((x) => x.id).join(","));
  } catch (e) { chk("a null in either list is survived", false, e.message); }
}

head("an unrecognised kind exports nothing, not everything");
{
  /* There is no "locations" kind in this module - that lives in the SHARE
     panel and goes through buildSubmission in community.js, which carries
     spots and no log at all. Asking buildExport for it used to fall through
     to a FULL export: the whole log, stamped with whatever string was
     passed. Not reachable from the UI, but the wrong default for the
     function that decides what leaves the device. */
  chk("an unknown kind returns nothing", PORT.buildExport("locations", { catalog, log }) === null);
  chk("a typo returns nothing", PORT.buildExport("ful", { catalog, log }) === null);
  chk("undefined returns nothing", PORT.buildExport(undefined, { catalog, log }) === null);
  chk("...while a real kind still works", !!PORT.buildExport("full", { catalog, log }));
  chk("...and a pack still works", !!PORT.buildExport("pack", { catalog, log }));
  chk("...and a log still works", !!PORT.buildExport("log", { catalog, log }));
  /* A pack must not carry the log, which is the real privacy boundary. */
  const pack = PORT.buildExport("pack", { catalog, log });
  chk("a pack carries no trips", !pack.trips || pack.trips.length === 0, (pack.trips||[]).length);
  chk("a pack carries no catches", !pack.catches || pack.catches.length === 0, (pack.catches||[]).length);
  chk("...but does carry the custom spot", (pack.catalog.spots||[]).some((x)=>x.id==="mine1"));
}
head("the filename says what it is");
{
  for (const kind of ["full", "locations", "pack"]) {
    const n = PORT.exportFilename(kind);
    chk(`exportFilename(${kind}) is a json file`, /\.json$/.test(n), n);
    chk(`...and is dated`, /\d{4}-\d{2}-\d{2}/.test(n), n);
  }
}

head("migrateStore brings an old store forward");
{
  /* A store from before the schema version existed. */
  const ancient = {
    trips: [{ id: "t", spotId: "springbank", date: "2025-05-01" }],
    catches: [{ id: "c", speciesId: "smb" }],
    catalog: { spots: [{ id: "s", name: "Old spot" }], species: [], baits: [] },
  };
  let m;
  try { m = PORT.migrateStore(ancient); }
  catch (e) { chk("migrateStore does not throw on an old store", false, e.message); m = null; }
  if (m) {
    chk("migrateStore does not throw on an old store", true);
    chk("...it keeps the trip", (m.trips || []).length === 1);
    chk("...it keeps the catch", (m.catches || []).length === 1);
    chk("...it keeps the spot", (m.catalog.spots || []).length === 1);
    chk("...and every catalog list exists afterwards",
        PORT.CATALOG_KEYS.every((k) => Array.isArray(m.catalog[k])),
        PORT.CATALOG_KEYS.filter((k) => !Array.isArray(m.catalog[k])).join(",") || "all present");
  }
  /* And a store that is nonsense must not throw either - it is read at boot. */
  for (const junk of [null, undefined, {}, { trips: "no" }, { catalog: null }]) {
    try {
      const r = PORT.migrateStore(junk);
      chk(`migrateStore(${JSON.stringify(junk)}) returns a usable store`,
          !!r && Array.isArray(r.trips) && !!r.catalog,
          r ? `${Array.isArray(r.trips)}, ${!!r.catalog}` : "nothing");
    } catch (e) {
      chk(`migrateStore(${JSON.stringify(junk)}) does not throw`, false, e.message);
    }
  }
}

console.log(`\n=== ROUNDTRIP RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
