/* SCAN 32 - the photo layer, which had thirteen untested exports.

   Photos are the one thing in this app that can silently cost somebody
   something they cannot get back: the cap deletes the older photo of a catch
   with no undo, and archiving deletes local bytes after an upload. Both are
   destructive on purpose and neither had a test.

   IndexedDB is stubbed with an in-memory store rather than faked at a higher
   level, so the real tx() path runs. */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.org/" });
const w = dom.window;
global.window = w; global.document = w.document; global.self = w;
Object.defineProperty(global, "navigator", { value: w.navigator, configurable: true, writable: true });
global.Blob = w.Blob; global.URL = w.URL;

/* ---------------- an in-memory IndexedDB ---------------- */
const rows = new Map();
const done = (result) => {
  const req = { result, onsuccess: null, onerror: null };
  setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
  return req;
};
const store = {
  get: (id) => done(rows.get(id) || undefined),
  put: (rec) => { rows.set(rec.id, rec); return done(rec.id); },
  delete: (id) => { rows.delete(id); return done(undefined); },
  getAll: () => done([...rows.values()]),
  openCursor: () => done(null),
};
w.indexedDB = global.indexedDB = {
  open: () => {
    const req = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(() => {
      req.result = {
        objectStoreNames: { contains: () => true },
        transaction: () => ({
          objectStore: () => store,
          oncomplete: null, onerror: null, onabort: null,
          get complete() { return true; },
        }),
        createObjectStore: () => store,
        close() {},
      };
      /* The real tx() waits on the transaction's oncomplete, so fire it. */
      req.onsuccess && req.onsuccess({ target: req });
    }, 0);
    return req;
  },
};

const PH = await import("../src/photos.js");

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};
const head = (t) => console.log("\n-- " + t + " --");

console.log("\n=== SCAN 32: the photo layer ===");

/* ---------------- photoBlob and hasLocal, the pure pair ---------------- */
head("photoBlob: what counts as usable bytes");
{
  const cases = [
    ["null", null, false],
    ["undefined", undefined, false],
    ["an empty object", {}, false],
    ["a buf of nothing", { buf: new ArrayBuffer(0) }, false],
    ["a real buf", { buf: new ArrayBuffer(64), type: "image/jpeg" }, true],
    ["a buf with no type", { buf: new ArrayBuffer(64) }, true],
    ["a zero-size blob", { blob: new w.Blob([], { type: "image/jpeg" }) }, false],
    ["a real blob", { blob: new w.Blob(["xxxx"], { type: "image/jpeg" }) }, true],
    ["blob set to null", { blob: null }, false],
    ["a buf that is not a buffer", { buf: "nonsense" }, null],
  ];
  for (const [label, rec, want] of cases) {
    let got;
    try { got = !!PH.photoBlob(rec); }
    catch (e) { chk(`photoBlob(${label}) does not throw`, false, e.message); continue; }
    if (want === null) { chk(`photoBlob(${label}) does not throw`, true, got ? "blob" : "null"); continue; }
    chk(`photoBlob(${label}) -> ${want ? "bytes" : "null"}`, got === want, got);
    chk(`hasLocal(${label}) agrees`, PH.hasLocal(rec) === want);
  }
  /* localURL must return null rather than a dead URL - the caller falls
     through to the thumbnail on null and renders a broken image on a URL. */
  chk("localURL of nothing is null", PH.localURL(null) === null);
  chk("localURL of an empty buf is null", PH.localURL({ buf: new ArrayBuffer(0) }) === null);
}

head("fmtBytes across the range");
{
  const cases = [
    [0, "0 B"], [1, "1 B"], [1023, "1023 B"],
    [1024, "1 KB"], [1536, "2 KB"], [1024 * 1023, "1023 KB"],
    [1024 * 1024, "1.0 MB"], [1024 * 1024 * 5.5, "5.5 MB"],
    [1024 * 1024 * 1024, "1.00 GB"],
  ];
  for (const [n, want] of cases) {
    const got = PH.fmtBytes(n);
    chk(`fmtBytes(${n})`, got === want, got);
  }
  chk("fmtBytes(null) is a dash", PH.fmtBytes(null) === "—", PH.fmtBytes(null));
  chk("fmtBytes(undefined) is a dash", PH.fmtBytes(undefined) === "—");
  chk("fmtBytes of a negative does not throw", typeof PH.fmtBytes(-5) === "string", PH.fmtBytes(-5));
}

/* ---------------- the cap, which deletes with no undo ---------------- */
head("capOnePerCatch keeps the newest and only the newest");
{
  rows.clear();
  const put = (id, catchId, takenAt) =>
    rows.set(id, { id, catchId, takenAt, buf: new ArrayBuffer(8), bytes: 8 });
  put("a1", "c1", 100); put("a2", "c1", 300); put("a3", "c1", 200);
  put("b1", "c2", 50);
  put("loose", null, 10);          /* no catchId - must be left alone */

  const removed = await PH.capOnePerCatch();
  chk("it removed the two older photos of that catch", removed === 2, removed);
  chk("...and kept the newest one", rows.has("a2"), [...rows.keys()].join(","));
  chk("...and dropped the older two", !rows.has("a1") && !rows.has("a3"));
  chk("...left the other catch alone", rows.has("b1"));
  chk("...and left a photo with no catch alone", rows.has("loose"));

  /* Running it twice must be a no-op, because it runs on every load. */
  const again = await PH.capOnePerCatch();
  chk("running it again removes nothing", again === 0, again);
  chk("...and the store is unchanged", rows.size === 3, rows.size);
}

head("capOnePerCatch with equal timestamps, and with none");
{
  rows.clear();
  rows.set("x1", { id: "x1", catchId: "c9", takenAt: 500, buf: new ArrayBuffer(8) });
  rows.set("x2", { id: "x2", catchId: "c9", takenAt: 500, buf: new ArrayBuffer(8) });
  const n = await PH.capOnePerCatch();
  chk("a tie still leaves exactly one", rows.size === 1, `${n} removed, ${rows.size} left`);

  rows.clear();
  rows.set("y1", { id: "y1", catchId: "c8", buf: new ArrayBuffer(8) });
  rows.set("y2", { id: "y2", catchId: "c8", buf: new ArrayBuffer(8) });
  await PH.capOnePerCatch();
  chk("no timestamps at all still leaves exactly one", rows.size === 1, rows.size);
}

/* ---------------- storage pressure ---------------- */
head("storageStatus when the browser will not say");
{
  const real = w.navigator.storage;
  Object.defineProperty(w.navigator, "storage", { value: undefined, configurable: true });
  let st = await PH.storageStatus();
  chk("no storage API reports unsupported rather than throwing", st.ok === false && st.supported === false, JSON.stringify(st).slice(0, 70));

  Object.defineProperty(w.navigator, "storage", {
    value: { estimate: async () => { throw new Error("denied"); } }, configurable: true,
  });
  st = await PH.storageStatus();
  chk("an estimate that throws is a return value", st.ok === false, JSON.stringify(st).slice(0, 70));

  Object.defineProperty(w.navigator, "storage", {
    value: { estimate: async () => ({ usage: 0, quota: 0 }) }, configurable: true,
  });
  st = await PH.storageStatus();
  chk("a zero quota does not divide by zero", st.ok === true && st.ratio === 0, st.ratio);
  chk("...and is not reported as pressured", st.pressured === false);

  Object.defineProperty(w.navigator, "storage", {
    value: { estimate: async () => ({ usage: 900, quota: 1000 }) }, configurable: true,
  });
  st = await PH.storageStatus();
  chk("90% of quota reads as pressured", st.pressured === true, st.ratio);

  Object.defineProperty(w.navigator, "storage", {
    value: { estimate: async () => ({ usage: 100, quota: 1000 }) }, configurable: true,
  });
  st = await PH.storageStatus();
  chk("10% of quota does not", st.pressured === false, st.ratio);
  Object.defineProperty(w.navigator, "storage", { value: real, configurable: true });
}

head("archiveCandidates and planArchive");
{
  rows.clear();
  for (let i = 1; i <= 5; i++) {
    rows.set("p" + i, { id: "p" + i, catchId: "c" + i, takenAt: i * 100, bytes: 1000, buf: new ArrayBuffer(16) });
  }
  /* One already archived, and one with no local bytes: neither is a candidate. */
  rows.set("done", { id: "done", takenAt: 10, bytes: 1000, buf: new ArrayBuffer(16), archivedAt: 1 });
  rows.set("gone", { id: "gone", takenAt: 20, bytes: 1000 });

  const cand = await PH.archiveCandidates();
  chk("candidates exclude the already-archived", cand.ok && !cand.list.some((p) => p.id === "done"));
  chk("candidates exclude ones with no local bytes", !cand.list.some((p) => p.id === "gone"));
  chk("five candidates remain", cand.list.length === 5, cand.list.length);
  chk("...oldest first", cand.list[0].id === "p1" && cand.list[4].id === "p5",
      cand.list.map((p) => p.id).join(","));
  chk("...and the total is summed", cand.bytes === 5000, cand.bytes);

  /* planArchive should take the oldest few, just enough to get under target. */
  Object.defineProperty(w.navigator, "storage", {
    value: { estimate: async () => ({ usage: 8000, quota: 10000 }) }, configurable: true,
  });
  const plan = await PH.planArchive(0.6);
  chk("a plan is produced under pressure", plan.ok === true, plan.error);
  chk("...it needs to free the right amount", plan.need === 2000, plan.need);
  chk("...and picks the fewest oldest photos that cover it", plan.list.length === 2,
      plan.list.map((p) => p.id).join(","));
  chk("...oldest first", plan.list[0].id === "p1");
  chk("...freeing at least what was needed", plan.freed >= plan.need, `${plan.freed} vs ${plan.need}`);

  /* And with plenty of room: nothing to do, not an error. */
  Object.defineProperty(w.navigator, "storage", {
    value: { estimate: async () => ({ usage: 100, quota: 10000 }) }, configurable: true,
  });
  const none = await PH.planArchive(0.6);
  chk("with room to spare the plan is empty, not failed", none.ok === true && none.list.length === 0,
      `${none.list.length} photos, need ${none.need}`);
}

/* ---------------- archiving never loses bytes to a failed upload ---------------- */
head("archivePhotos: a failed upload must not cost a photo");
{
  rows.clear();
  rows.set("k1", { id: "k1", takenAt: 1, bytes: 100, buf: new ArrayBuffer(32), type: "image/jpeg" });
  rows.set("k2", { id: "k2", takenAt: 2, bytes: 100, buf: new ArrayBuffer(32), type: "image/jpeg" });

  const failing = async () => ({ ok: false, error: "upload refused" });
  const r1 = await PH.archivePhotos([rows.get("k1"), rows.get("k2")], failing);
  chk("a refused upload archives nothing", r1.archived === 0, JSON.stringify(r1).slice(0, 80));
  chk("...and reports the failures", r1.failed === 2, r1.failed);
  chk("...and BOTH photos still hold their bytes",
      PH.hasLocal(rows.get("k1")) && PH.hasLocal(rows.get("k2")),
      `k1 ${PH.hasLocal(rows.get("k1"))}, k2 ${PH.hasLocal(rows.get("k2"))}`);

  const throwing = async () => { throw new Error("network died mid-upload"); };
  const r2 = await PH.archivePhotos([rows.get("k1")], throwing);
  chk("an uploader that throws is caught, not propagated", r2.failed >= 1, JSON.stringify(r2).slice(0, 80));
  chk("...and the photo still holds its bytes", PH.hasLocal(rows.get("k1")));

  /* And the success path: bytes go only after the upload is confirmed. */
  const good = async () => ({ ok: true, id: "drive123", link: "https://drive.example/x" });
  const r3 = await PH.archivePhotos([rows.get("k1")], good);
  chk("a confirmed upload archives", r3.archived === 1, JSON.stringify(r3).slice(0, 80));
  const after = rows.get("k1");
  chk("...the local bytes are released", !PH.hasLocal(after), after && after.buf ? "still there" : "released");
  chk("...and it is marked archived with its Drive id",
      !!(after && after.archivedAt && after.driveId === "drive123"),
      after ? `${after.archivedAt ? "stamped" : "no stamp"}, ${after.driveId}` : "gone");
  chk("...and the record still exists", rows.has("k1"));
}

console.log(`\n=== PHOTOS RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
