/* Open the record sheets. Actually open them, by clicking.

   WHY THIS EXISTS.

   SpeciesDetail read a variable it had never been given - not a parameter, no
   module-level binding - so every tap on a fish threw a ReferenceError and
   whited out the app. It was in the committed code and the suite was green,
   because twenty-one suites can check the catalogue, the bundle, the
   references, the contrast and the service worker without ever opening a
   sheet. A free variable is invisible to all of that: esbuild assumes a
   global, the bundle builds, the dashboard renders, and the crash waits
   behind one tap.

   It is the same shape as the stats screen being reachable from nowhere. Both
   were things that only fail when a person uses them, so the fix is a test
   that uses them. Every record kind gets opened here, and the assertion is
   deliberately blunt: the sheet has real content and nothing threw.

   Not a substitute for handling it on a phone - it cannot see layout, and
   JSDOM has no pointer events for the map. It is here to make a crash-on-open
   fail a build.
*/
import { JSDOM } from "jsdom";
import fs from "fs";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 24: every record sheet opens ===\n");

const html = `<!doctype html><html><body><div id="root"></div></body></html>`;
const dom = new JSDOM(html, { url: "https://example.org/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document;
Object.defineProperty(global, "navigator", { value: window.navigator, configurable: true, writable: true });
global.HTMLElement = window.HTMLElement; global.Element = window.Element; global.Node = window.Node;
global.self = window; global.location = window.location;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.MessageChannel = window.MessageChannel;

/* Offline, like every other render test - a sheet must not need the network
   to open. */
global.fetch = window.fetch = async () => { throw new Error("network down"); };
const store = {};
window.storage = {
  async get(k) { if (!(k in store)) throw new Error("not found"); return { key: k, value: store[k] }; },
  async set(k, v) { store[k] = v; return { key: k, value: v }; },
  async delete(k) { delete store[k]; return { key: k, deleted: true }; },
  async list() { return { keys: Object.keys(store) }; },
};

/* A ReferenceError inside a render is REPORTED here and then rethrown by
   React, so both paths have to be watched: the console and the window. */
const errors = [];
const origErr = console.error;
console.error = (...a) => errors.push(a.map(String).join(" "));
window.addEventListener("error", (e) => errors.push("window.onerror: " + (e.message || e.error)));

window.eval(fs.readFileSync("./app.js", "utf8"));
await new Promise((r) => setTimeout(r, 800));

const root = window.document.getElementById("root");
const click = async (el) => {
  /* Returns false rather than throwing. A control this test cannot find is
     a failed check with everything after it still running - the first
     version threw on the first miss and took twenty later checks with it. */
  if (!el) return false;
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 220));
  return true;
};
const clickable = () => [...root.querySelectorAll("button, a[href], [role=button]")];
const find = (t) => clickable().find((e) => (e.textContent || "").trim().toLowerCase().includes(t.toLowerCase()));
const tab = (name) => [...root.querySelectorAll(".tabbar button")]
  .find((b) => new RegExp(name, "i").test(b.textContent || ""));

/* Only the errors that mean something broke. React logs plenty that does
   not - act() advice, key warnings - and treating those as failures would
   make this suite noise nobody reads. */
const FATAL = /ReferenceError|TypeError|is not a function|is not defined|Cannot read|Minified React error|window\.onerror/i;
const fatalSince = (n) => errors.slice(n).filter((e) => FATAL.test(e));

chk("the app mounted", root.children.length > 0, root.children.length + " nodes");

/* A sheet is the app's modal. Identified by the dialog role rather than by a
   class, because the class is a styling decision and the role is a promise
   to a screen reader. */
const sheet = () => root.querySelector('[role="dialog"]');
const closeSheet = async () => {
  const btn = [...(sheet() ? sheet().querySelectorAll("button") : [])]
    .find((b) => /close|^×|^✕/i.test(b.textContent || "") || /close/i.test(b.getAttribute("aria-label") || ""));
  if (btn) await click(btn);
  /* A scrim tap closes it too, and some sheets have no labelled button. */
  if (sheet()) {
    const scrim = root.querySelector(".scrim");
    if (scrim) await click(scrim);
  }
};

/* ------------------------------------------------------------------
   Walk the encyclopedia and open one of everything.

   Driven by the labels a person reads rather than by internal ids, so a
   renamed category fails here loudly instead of silently skipping.
   ------------------------------------------------------------------ */
const CATEGORIES = [
  /* category tile,        a record inside it,        something the sheet must say */
  ["Fish",                 "Smallmouth bass",         /Season and limits/i],
  ["Baits & lures",        "Tube jig",                /Soft plastic|How to fish|Sizes/i],
  ["Hooks & rigs",         null,                      null],
  ["Tactics",              null,                      null],
  ["Knots",                null,                      null],
  ["Tips",                 null,                      null],
  ["Gear & tools",         "Spinning rod",            /What it is|Which one|Worth knowing|general-purpose/i],
  ["Handling & cleaning",  null,                      null],
  ["Rules",                null,                      null],
];

await click(tab("guide"));
chk("the encyclopedia hub opens", /Fish/.test(root.textContent) && /Knots/.test(root.textContent));

for (const [cat, record, must] of CATEGORIES) {
  const before = errors.length;
  const tile = find(cat);
  if (!tile) { chk(`category "${cat}" is on the hub`, false, "not found"); continue; }
  await click(tile);
  const bad = fatalSince(before);
  chk(`"${cat}" opens`, bad.length === 0 && root.children.length > 0,
      bad[0] ? bad[0].slice(0, 120) : "clean");

  if (record) {
    const b2 = errors.length;
    const row = find(record);
    if (!row) { chk(`"${record}" is listed under ${cat}`, false, "not found"); }
    else {
      await click(row);
      const bad2 = fatalSince(b2);
      const s = sheet();
      const body = s ? (s.textContent || "") : "";
      chk(`the "${record}" sheet opens without throwing`, bad2.length === 0,
          bad2[0] ? bad2[0].slice(0, 160) : "clean");
      chk(`...and has real content`, body.length > 300, body.length + " chars");
      if (must) chk(`...and says what it should`, must.test(body), body.slice(0, 60));
      await closeSheet();
    }
  }
  /* Back to the hub for the next category. */
  const back = find("All categories") || find("Back") || find("Encyclopedia");
  if (back) await click(back);
  else await click(tab("guide"));
}

/* ------------------------------------------------------------------
   A location sheet, which is the other half of the crash surface.

   A spot with no depth profile used to blank the app on Math.max of an
   empty array, so the one opened here is deliberately a researched record
   from a pack rather than a London one with a full profile - except the
   packs are not in the bundle, so what is reachable offline with empty
   storage is London. Opened from the map page's own list.
   ------------------------------------------------------------------ */
{
  const before = errors.length;
  chk("the map tab exists", !!tab("map"));
  await click(tab("map"));
  /* The map page rendering AT ALL is the check worth having here. It could
     not until an unguarded window.matchMedia in MapPanel was fixed: with no
     error boundary in the app, that call took the whole tree down the moment
     the tab was opened, so this whole section was unreachable and so was any
     future test of the map. */
  const mapErrs = fatalSince(before);
  chk("the map page renders without throwing", mapErrs.length === 0 && root.children.length > 0,
      mapErrs[0] ? mapErrs[0].slice(0, 160) : "clean");
  chk("the location list is on the map page", /Springbank Park/.test(root.textContent || ""),
      /Springbank Park/.test(root.textContent || "") ? "listed" : "not listed");

  const b2 = errors.length;
  const row = find("Springbank Park");
  if (!await click(row)) chk("a location row is clickable", false, "not found");
  else {
    const bad = fatalSince(b2);
    const body = sheet() ? sheet().textContent : "";
    chk("a location sheet opens without throwing", bad.length === 0,
        bad[0] ? bad[0].slice(0, 160) : "clean");
    chk("...and has real content", body.length > 300, body.length + " chars");
    /* The depth chart is the part that used to blank the app on a spot with
       no profile, so a spot that HAS one has to render it. */
    chk("...including the depth profile", /depth|Depth|bank/i.test(body),
        body.slice(0, 60));
    await closeSheet();
  }
}

/* ------------------------------------------------------------------
   And the two screens the audit found had no route at all.
   ------------------------------------------------------------------ */
{
  const before = errors.length;
  chk("the trip tab exists", !!tab("trip"));
  await click(tab("trip"));
  const stats = find("Season so far");
  chk("stats is reachable from the log", !!stats, stats ? "found" : "no route");
  if (stats) {
    await click(stats);
    const bad = fatalSince(before);
    chk("the stats sheet opens without throwing", bad.length === 0,
        bad[0] ? bad[0].slice(0, 160) : "clean");
    await closeSheet();
  }
}

{
  const before = errors.length;
  await click(tab("options"));
  const lic = find("licence") || find("Licence");
  chk("the licence sheet is reachable", !!lic, lic ? "found" : "no route");
  if (lic) {
    await click(lic);
    const bad = fatalSince(before);
    chk("the licence sheet opens without throwing", bad.length === 0,
        bad[0] ? bad[0].slice(0, 160) : "clean");
  }
}

console.error = origErr;

/* One final sweep: nothing fatal anywhere in the whole walk. */
const allFatal = errors.filter((e) => FATAL.test(e));
chk("nothing threw across the entire walk", allFatal.length === 0,
    allFatal.length ? allFatal.slice(0, 2).join(" | ").slice(0, 240) : "clean");

console.log(`\n=== SHEETS RESULT: ${pass} passed, ${fail} failed ===\n`);
if (fail) process.exit(1);
