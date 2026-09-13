/* SCAN 32: the people you fish with, and whose fish is whose.
 *
 * Two halves, and the first one is a privacy guarantee rather than a feature.
 *
 * A FIELD GUIDE PACK is the file you hand to a stranger. It carries your
 * spots, your species and your baits on purpose. Anglers are the names of
 * real people, and they must never leave the phone inside one. That is why
 * they live in their own storage key rather than in the catalog - the PACK
 * branch builds from CATALOG_KEYS and so cannot include them even by
 * accident - but "cannot by accident" is worth asserting rather than
 * assuming, because the next person to add a key may add it in the wrong
 * place.
 *
 * The second half is attribution arithmetic: a catch with no `by` is yours,
 * because every catch logged before this feature existed was.
 */
import fs from "fs";
import { buildExport, validateImport, planImport, KIND } from "../src/portability.js";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 32: anglers, attribution, and what must not leave the phone ===\n");

const ME = { id: "me1", name: "Dillon", self: true, createdAt: 1, updatedAt: 1 };
const DAVE = { id: "dv1", name: "Dave", createdAt: 2, updatedAt: 2 };
const ANGLERS = [ME, DAVE];

const LOG = {
  trips: [
    { id: "t1", date: "2026-06-01", spotId: "springbank", start: "06:00", end: "11:00",
      party: ["me1", "dv1"], hostBy: "me1", waterTemp: "17", updatedAt: 10 },
    { id: "t2", date: "2026-06-08", spotId: "gibbons", start: "07:00", end: "10:00", updatedAt: 11 },
  ],
  catches: [
    { id: "c1", tripId: "t1", speciesId: "smb", by: "me1", date: "2026-06-01", updatedAt: 12 },
    { id: "c2", tripId: "t1", speciesId: "pike", by: "dv1", date: "2026-06-01", updatedAt: 13 },
    { id: "c3", tripId: "t1", speciesId: "rock", by: "dv1", date: "2026-06-01", updatedAt: 14 },
    /* No `by` at all — a catch from before this feature existed. */
    { id: "c4", tripId: "t2", speciesId: "carp", date: "2026-06-08", updatedAt: 15 },
  ],
};
const CATALOG = {
  spots: [{ id: "s1", name: "A spot of mine", custom: true, updatedAt: 1 }],
  species: [], baits: [], knots: [], tips: [], tactics: [], photos: {}, links: {}, usefulLinks: [],
};

/* ---------- the privacy guarantee ---------- */
console.log("-- a pack you hand to a stranger --");
{
  const pack = buildExport(KIND.PACK, { catalog: CATALOG, log: LOG, anglers: ANGLERS });
  chk("a pack still builds", !!pack);
  const text = JSON.stringify(pack);
  chk("a pack carries NO anglers key", !("anglers" in pack), Object.keys(pack).join(", "));
  /* The names themselves, not just the key — a future refactor could tuck
     them somewhere else in the object and this still has to fail. */
  chk("and neither name appears anywhere in the file",
      !/Dillon/.test(text) && !/Dave/.test(text),
      /Dillon|Dave/.test(text) ? "A NAME LEAKED" : "clean");
  chk("a pack still carries no trips or catches",
      !/"trips"/.test(text) && !/"catches"/.test(text));
  chk("...but does carry what it is for", /A spot of mine/.test(text));
}

/* ---------- the backup guarantee ---------- */
console.log("");
console.log("-- a backup of your own log --");
for (const kind of [KIND.LOG, KIND.FULL]) {
  const out = buildExport(kind, { catalog: CATALOG, log: LOG, anglers: ANGLERS });
  chk(`a ${kind} export carries the anglers`,
      Array.isArray(out.anglers) && out.anglers.length === 2,
      out.anglers ? out.anglers.map((a) => a.name).join(", ") : "absent");
}
{
  /* The whole reason they travel: without them a restored backup has the
     trips and the catches and nobody attached to them. */
  const out = buildExport(KIND.LOG, { catalog: CATALOG, log: LOG, anglers: ANGLERS });
  const v = validateImport(JSON.stringify(out));
  chk("it validates", v.ok, (v.errors || []).join("; "));
  chk("...with the anglers intact", v.ok && v.data.anglers.length === 2,
      v.ok ? v.data.anglers.map((a) => a.name).join(", ") : "n/a");

  const plan = planImport({ catalog: CATALOG, log: { trips: [], catches: [] }, anglers: [], photoIds: [] }, v.data);
  chk("importing onto an empty phone adds them", plan.summary.anglers.added === 2,
      JSON.stringify(plan.summary.anglers));
  chk("and every attribution still resolves", (() => {
    const ids = new Set(plan.next.anglers.map((a) => a.id));
    return plan.next.log.catches.every((c) => !c.by || ids.has(c.by));
  })());

  /* Importing the same backup twice must add nothing the second time. */
  const again = planImport(
    { catalog: plan.next.catalog, log: plan.next.log, anglers: plan.next.anglers, photoIds: [] }, v.data);
  chk("importing it twice adds nobody the second time",
      again.summary.anglers.added === 0 && again.summary.catches.added === 0,
      `anglers +${again.summary.anglers.added}, catches +${again.summary.catches.added}`);
}

/* ---------- whose fish is whose ---------- */
console.log("");
console.log("-- attribution arithmetic --");
{
  /* The rule, lifted out of App.jsx so this tests the shipped one rather
     than a copy of it that can drift. */
  const app = fs.readFileSync("src/App.jsx", "utf8");
  const at = app.indexOf("const myCatches = (catches, anglers) => {");
  const end = app.indexOf("\n};", at);
  if (at < 0 || end < 0) { console.log("  FAIL  myCatches is not where this test looks for it"); process.exit(1); }
  const selfAt = app.indexOf("const selfAngler = (anglers) =>");
  const selfEnd = app.indexOf(";\n", selfAt);
  const myCatches = new Function(
    app.slice(selfAt, selfEnd + 1) + app.slice(at, end + 3) + "\nreturn myCatches;")();

  const mine = myCatches(LOG.catches, ANGLERS);
  chk("my own fish count", mine.some((c) => c.id === "c1"));
  chk("an unattributed fish counts as mine", mine.some((c) => c.id === "c4"),
      "every catch logged before this feature existed was yours");
  chk("Dave's two fish do not", !mine.some((c) => c.by === "dv1"), mine.length + " of 4");
  chk("so the season is 2 fish, not 4", mine.length === 2, mine.length);

  /* With no angler list at all — the state every existing phone is in until
     it fishes with somebody — nothing may be filtered out. */
  chk("a phone with no anglers keeps every catch",
      myCatches(LOG.catches, []).length === 4, myCatches(LOG.catches, []).length);
  chk("...and so does one with no self record",
      myCatches(LOG.catches, [DAVE]).length === 4);

  chk("an empty list is not a crash", myCatches(null, ANGLERS).length === 0);
}

/* ---------- a shared trip is one with more than one person on it ---------- */
console.log("");
console.log("-- what counts as shared --");
{
  const app = fs.readFileSync("src/App.jsx", "utf8");
  const at = app.indexOf("const isShared = (trip) =>");
  const isShared = new Function(app.slice(at, app.indexOf(";\n", at) + 1) + "\nreturn isShared;")();

  chk("a trip with two anglers is shared", isShared(LOG.trips[0]));
  chk("a trip with no party is not", !isShared(LOG.trips[1]));
  chk("a trip with only you on it is not", !isShared({ party: ["me1"] }),
      "one person is not a party");
  chk("undefined is not a crash", !isShared(undefined));
  chk("a party that is not an array is not shared", !isShared({ party: "me1" }));
}

console.log(`\n=== ANGLERS RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
