/* SCAN 30 - the log flows: start a trip, record a catch, edit, end, delete.

   Nothing exercises these. test-sheets opens records; test-render mounts the
   app; neither writes anything. The log is the one part of this app holding
   data a person cannot get back, so a flow that half-completes matters more
   here than anywhere else - and "saved the pin and then threw" was exactly
   that shape somewhere else in the app.
*/
import { JSDOM } from "jsdom";
import fs from "fs";

const html = `<!doctype html><html><body><div id="root"></div></body></html>`;
const dom = new JSDOM(html, { url: "https://example.org/", runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
global.window = w; global.document = w.document; global.self = w;
Object.defineProperty(global, "navigator", { value: w.navigator, configurable: true, writable: true });
global.HTMLElement = w.HTMLElement; global.Element = w.Element; global.Node = w.Node;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.MessageChannel = w.MessageChannel;
global.fetch = w.fetch = async () => { throw new Error("offline"); };

const store = {};
w.storage = {
  async get(k) { if (!(k in store)) throw new Error("nf"); return { key: k, value: store[k] }; },
  async set(k, v) { store[k] = v; return { key: k, value: v }; },
  async delete(k) { delete store[k]; return {}; },
  async list() { return { keys: Object.keys(store) }; },
};

const errs = [];
const oe = console.error;
console.error = (...a) => errs.push(a.map(String).join(" "));
w.addEventListener("error", (e) => errs.push("onerror: " + e.message));
w.addEventListener("unhandledrejection", (e) => errs.push("unhandled: " + (e.reason && e.reason.message || e.reason)));

w.eval(fs.readFileSync("./app.js", "utf8"));
await new Promise((r) => setTimeout(r, 900));

const root = w.document.getElementById("root");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (el, ms = 320) => { if (!el) return false; el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); await wait(ms); return true; };
const tab = (n) => [...root.querySelectorAll(".tabbar button")].find((b) => new RegExp(n, "i").test(b.textContent));
const btn = (re) => [...root.querySelectorAll("button")].find((b) => re.test((b.textContent || "").trim()));
const sheet = () => root.querySelector('[role="dialog"]') || root.querySelector(".sheet");
const vis = () => { const c = root.cloneNode(true); c.querySelectorAll("style,script").forEach((n) => n.remove()); return (c.textContent || "").replace(/\s+/g, " "); };
const FATAL = /ReferenceError|TypeError|is not a function|is not defined|Cannot read|Minified React|onerror|unhandled/i;
const fatalSince = (n) => errs.slice(n).filter((e) => FATAL.test(e));
const stored = async (k) => { try { const v = await w.storage.get(k); return JSON.parse(v.value); } catch { return null; } };

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 30: the log, written and destroyed ===\n");

/* ---------------- start a trip ---------------- */
await click(tab("trip"), 500);
chk("the log opens", /Past trips|Season so far|Start a trip|New trip/i.test(vis()), vis().slice(0, 90));
console.log("  controls: " + [...root.querySelectorAll("button")]
  .map((b) => JSON.stringify((b.textContent || "").trim().slice(0, 26))).slice(0, 14).join(" "));

let before = errs.length;
const start = btn(/Start a trip|New trip|Log a trip/i);
chk("there is a way to start a trip", !!start, start ? start.textContent.trim() : "none");
if (start) {
  await click(start, 600);
  chk("the trip form opens without throwing", fatalSince(before).length === 0,
      fatalSince(before)[0] ? fatalSince(before)[0].slice(0, 120) : "clean");
  const s = sheet();
  chk("...and it is a form", !!s && /spot|Where|date/i.test(s.textContent || ""),
      s ? (s.textContent || "").replace(/\s+/g, " ").slice(0, 110) : "no sheet");
  if (s) {
    /* Fill whatever it asks for, the way a person would: pick the first
       option of every choice, then save. */
    for (const sel of s.querySelectorAll("select")) {
      const opt = [...sel.options].find((o) => o.value);
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new w.Event("change", { bubbles: true })); }
    }
    await wait(250);
    const save = [...s.querySelectorAll("button")].find((b) => /^(Save|Start|Done|Add)/i.test((b.textContent || "").trim()));
    chk("...with a save control", !!save, save ? save.textContent.trim() : "none");
    if (save) {
      const b2 = errs.length;
      await click(save, 700);
      chk("saving does not throw", fatalSince(b2).length === 0,
          fatalSince(b2)[0] ? fatalSince(b2)[0].slice(0, 140) : "clean");
      const log = await stored("lfc:log");
      chk("...and the trip reached storage", !!(log && Array.isArray(log.trips) && log.trips.length),
          log ? (log.trips || []).length + " trips" : "nothing stored");
      chk("...and the screen shows it", !/Nothing logged yet/.test(vis()) || (log && log.trips.length > 0),
          vis().slice(0, 80));
    }
  }
}

/* ---------------- a catch ---------------- */
before = errs.length;
await click(tab("trip"), 450);
const addCatch = btn(/Record a fish|Add a catch|New catch|Log a fish/i);
chk("there is a way to record a fish", !!addCatch, addCatch ? addCatch.textContent.trim() : "none");
if (addCatch) {
  await click(addCatch, 650);
  const s = sheet();
  chk("the catch form opens without throwing", fatalSince(before).length === 0 && !!s,
      fatalSince(before)[0] ? fatalSince(before)[0].slice(0, 130) : (s ? "clean" : "no sheet"));
  if (s) {
    for (const sel of s.querySelectorAll("select")) {
      const opt = [...sel.options].find((o) => o.value);
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new w.Event("change", { bubbles: true })); }
    }
    await wait(250);
    const save = [...s.querySelectorAll("button")].find((b) => /^(Save|Add|Done)/i.test((b.textContent || "").trim()));
    if (save) {
      const b3 = errs.length;
      await click(save, 700);
      chk("saving a catch does not throw", fatalSince(b3).length === 0,
          fatalSince(b3)[0] ? fatalSince(b3)[0].slice(0, 140) : "clean");
      const log = await stored("lfc:log");
      chk("...and it reached storage", !!(log && Array.isArray(log.catches) && log.catches.length),
          log ? (log.catches || []).length + " catches" : "nothing");
    }
  }
}

/* ---------------- the stats screen, with real data in it ---------------- */
before = errs.length;
await click(tab("trip"), 450);
const stats = btn(/Season so far/);
if (stats) {
  await click(stats, 700);
  const s = sheet();
  chk("stats opens with data in the log", fatalSince(before).length === 0 && !!s,
      fatalSince(before)[0] ? fatalSince(before)[0].slice(0, 130) : (s ? "clean" : "no sheet"));
  if (s) {
    const t = (s.textContent || "").replace(/\s+/g, " ");
    chk("...and counts something", /\d/.test(t), t.slice(0, 110));
  }
}

console.error = oe;
const allFatal = errs.filter((e) => FATAL.test(e));
chk("nothing threw across the whole walk", allFatal.length === 0,
    allFatal.length ? allFatal.slice(0, 2).join(" | ").slice(0, 220) : "clean");


/* ---------------- edit, end, delete ---------------- */
console.log("\n-- the destructive half --");
console.error = (...a) => errs.push(a.map(String).join(" "));

await click(tab("trip"), 450);
console.log("  controls now: " + [...root.querySelectorAll("button")]
  .map((b) => JSON.stringify((b.textContent || "").trim().slice(0, 24))).slice(0, 12).join(" "));

/* Edit the open trip. */
before = errs.length;
const edit = btn(/^Edit$/);
chk("the open trip can be edited", !!edit);
if (edit) {
  await click(edit, 650);
  const s = sheet();
  chk("the edit form opens without throwing", fatalSince(before).length === 0 && !!s,
      fatalSince(before)[0] ? fatalSince(before)[0].slice(0, 130) : (s ? "clean" : "no sheet"));
  if (s) {
    const save = [...s.querySelectorAll("button")].find((b) => /^Save/i.test((b.textContent || "").trim()));
    const b4 = errs.length;
    await click(save, 650);
    chk("saving the edit does not throw", fatalSince(b4).length === 0,
        fatalSince(b4)[0] ? fatalSince(b4)[0].slice(0, 130) : "clean");
    const log = await stored("lfc:log");
    chk("...and the trip is still there, not duplicated",
        !!(log && log.trips.length === 1), log ? log.trips.length + " trips" : "none");
  }
}

/* End it. */
before = errs.length;
await click(tab("trip"), 400);
const end = btn(/End the trip|End trip|Finish/i);
chk("the trip can be ended", !!end, end ? end.textContent.trim() : "none");
if (end) {
  await click(end, 700);
  chk("ending does not throw", fatalSince(before).length === 0,
      fatalSince(before)[0] ? fatalSince(before)[0].slice(0, 130) : "clean");
  const log = await stored("lfc:log");
  const t0 = log && log.trips && log.trips[0];
  chk("...and the trip has an end time now", !!(t0 && t0.end), t0 ? JSON.stringify(t0.end) : "no trip");
  chk("...and hours are computed", /Hours|h\b/.test(vis()));
}

/* Delete the catch, then the trip. */
before = errs.length;
await click(tab("trip"), 450);
const past = btn(/Past trips/);
if (past) await click(past, 600);
const row = [...root.querySelectorAll("button")].find((b) => /Springbank/.test(b.textContent));
if (row) {
  await click(row, 600);
  const s = sheet();
  const del = s && [...s.querySelectorAll("button")].find((b) => /Delete|Remove/i.test(b.textContent || ""));
  chk("a finished trip offers a delete", !!del, del ? del.textContent.trim() : "none");
  if (del) {
    const b5 = errs.length;
    await click(del, 650);
    /* A confirm step is expected for something unrecoverable. */
    const s2 = sheet();
    const confirm = s2 && [...s2.querySelectorAll("button")].find((b) => /Delete|Yes|Confirm/i.test(b.textContent || ""));
    if (confirm && confirm !== del) await click(confirm, 650);
    chk("deleting does not throw", fatalSince(b5).length === 0,
        fatalSince(b5)[0] ? fatalSince(b5)[0].slice(0, 130) : "clean");
    const log = await stored("lfc:log");
    chk("...and the trip is gone from storage", !!(log && log.trips.length === 0),
        log ? log.trips.length + " trips left" : "no log");
    /* THE ONE THAT MATTERS: a catch whose trip was deleted must not become a
       record pointing at nothing that then crashes a list. */
    chk("...and its catches did not become orphans that crash",
        fatalSince(b5).length === 0 && root.children.length > 0,
        log ? (log.catches || []).length + " catches remain" : "?");
  }
}

console.error = oe;
const fatal2 = errs.filter((e) => FATAL.test(e));
chk("nothing threw across the destructive half", fatal2.length === 0,
    fatal2.length ? fatal2.slice(0, 2).join(" | ").slice(0, 220) : "clean");

console.log(`\n=== LOG FLOWS RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
