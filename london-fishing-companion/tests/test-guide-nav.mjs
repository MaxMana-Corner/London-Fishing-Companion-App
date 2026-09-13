/* SCAN 30: the encyclopedia's category bar, and the three tabs that now search.
 *
 * Written because of a bug this suite would otherwise have shipped. The Rules
 * filters were inserted ABOVE the arrays they filter, so `const regRows` was
 * read before its initialiser ran - a temporal dead zone. scope-check passed
 * it, correctly: the identifier is in scope, it is simply not initialised yet.
 * Nothing else in the suite opens the Rules tab, so the only symptom would
 * have been a white screen on the tab that tells people what they may keep.
 *
 * So this walks every one of the nine categories, in both directions across
 * the two screens, and types into each of the searches.
 */
import { JSDOM } from "jsdom";
import fs from "fs";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 30: the encyclopedia bar, and searching every category ===\n");

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`,
  { url: "https://example.org/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document;
Object.defineProperty(global, "navigator", { value: window.navigator, configurable: true, writable: true });
global.HTMLElement = window.HTMLElement; global.Element = window.Element; global.Node = window.Node;
global.self = window; global.location = window.location;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.MessageChannel = window.MessageChannel;
global.fetch = window.fetch = async () => { throw new Error("network down"); };
const store = {};
window.storage = {
  async get(k) { if (!(k in store)) throw new Error("not found"); return { key: k, value: store[k] }; },
  async set(k, v) { store[k] = v; return { key: k, value: v }; },
  async delete(k) { delete store[k]; return { key: k, deleted: true }; },
  async list() { return { keys: Object.keys(store) }; },
};

const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(" ")); };

window.eval(fs.readFileSync("./app.js", "utf8"));
await new Promise((r) => setTimeout(r, 700));

const root = window.document.getElementById("root");
/* #root holds the injected <style> as well as the app, so root.textContent
   is ~60 KB of CSS whatever is on screen. Every length assertion written
   against it passes on a blank screen, and every /walleye/ test can match a
   comment in the stylesheet. Read the rendered screens only. */
const txt = () => [...root.children]
  .filter((el) => el.tagName !== "STYLE")
  .map((el) => el.textContent || "").join(" ");

/* React needs a real event with the properties it checks, and a tick to
   flush. `act` is not available on a built bundle, so a timeout it is. */
const click = async (el, ms = 160) => {
  if (!el) return false;
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  await new Promise((r) => setTimeout(r, ms));
  return true;
};
const byText = (sel, re) => [...root.querySelectorAll(sel)].find((b) => re.test(b.textContent || ""));

/* Native inputs need the value set through the prototype setter or React's
   own value tracker swallows the change as a no-op. */
const type = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 180));
};

/* ---------- get into the encyclopedia ---------- */
const guideTab = [...root.querySelectorAll(".tabbar button")]
  .find((b) => /guide|field|ency/i.test((b.getAttribute("aria-label") || "") + " " + b.textContent));
chk("the Guide tab is on the tab bar", !!guideTab);
await click(guideTab, 300);

/* The index tiles lead into the two screens. Any one of them will do - the
   bar is what this test is about, and it is on both screens. The tile head is
   the button; matching on any button whose text contains "Fish" catches the
   global search box instead and leaves the test on the index, passing against
   the index's own search. */
const anyTile = byText(".encytile-head", /^Fish/);
chk("an encyclopedia tile is on the index", !!anyTile);
await click(anyTile, 320);
/* The head EXPANDS the tile - it does not navigate. The row that opens the
   screen is the "See all 15 fish" link inside the expanded tile, and clicking
   the head alone leaves the test on the index typing into the index's own
   global search, where all three search assertions pass against the wrong
   box. That is how this test first came up 13/23 with three false passes. */
const seeAll = root.querySelector(".encyseeall");
chk("its See-all row opens the screen", !!seeAll, seeAll && seeAll.textContent.trim());
await click(seeAll, 360);

const bar = () => root.querySelector('.segbar[aria-label="Encyclopedia categories"]');
chk("the category bar is on screen", !!bar());

const CATS = ["Fish", "Baits & Lures", "Hooks & Rigs", "Gear",
  "Tactics", "Knots", "Tips", "Handling", "Rules"];
if (bar()) {
  const labels = [...bar().querySelectorAll("button")].map((b) => b.textContent.trim());
  chk("all nine categories are on it",
      CATS.every((c) => labels.includes(c)), labels.length + ": " + labels.join(" / "));
}

/* ---------- every category opens, in the order that crosses screens twice -- */
const fatal = () => errors.filter((e) =>
  /ReferenceError|TypeError|Cannot read|is not a function|before initialization|Minified React/i.test(e));

for (const cat of CATS) {
  errors.length = 0;
  const b = bar() && [...bar().querySelectorAll("button")].find((x) => x.textContent.trim() === cat);
  if (!b) { chk(`"${cat}" is reachable from the bar`, false, "no button"); continue; }
  await click(b, 260);
  const body = txt();
  chk(`"${cat}" opens and renders`, body.length > 400 && fatal().length === 0,
      fatal()[0] ? fatal()[0].slice(0, 150) : body.length + " chars");
  chk(`"${cat}" is marked as the one you are on`,
      !!(bar() && [...bar().querySelectorAll("button.on")].some((x) => x.textContent.trim() === cat)));
}

/* ---------- the three that had no search before ---------- */
const searchOn = (cat) => {
  const b = bar() && [...bar().querySelectorAll("button")].find((x) => x.textContent.trim() === cat);
  return b;
};

for (const [cat, term, expectHit, expectMiss] of [
  ["Hooks & Rigs", "carp", /Wide-gape|hair rig/i, /Fine-wire/i],
  ["Handling", "slime", /slime/i, null],
  ["Rules", "walleye", /Walleye/i, /Muskellunge/i],
]) {
  errors.length = 0;
  await click(searchOn(cat), 260);
  /* Must be the category's own box. The index's global search says "Search
     fish, baits, tactics…" and matching it would test nothing. */
  const input = [...root.querySelectorAll("input")]
    .find((i) => /search/i.test(i.placeholder || "") && !/fish, baits, tactics/i.test(i.placeholder || ""));
  if (!input) { chk(`"${cat}" has a search box`, false, "none found"); continue; }
  chk(`"${cat}" has a search box`, true, JSON.stringify(input.placeholder));

  await type(input, term);
  const after = txt();
  chk(`searching "${term}" in ${cat} keeps what matches`, expectHit.test(after),
      fatal()[0] ? fatal()[0].slice(0, 140) : after.length + " chars");
  if (expectMiss) {
    chk(`...and drops what does not`, !expectMiss.test(after),
        expectMiss.test(after) ? "still showing" : "dropped");
  }

  /* A search that finds nothing has to say so, not render a blank tab. */
  await type(input, "zzzzqqq");
  const empty = txt();
  chk(`a search with no hits in ${cat} explains itself`,
      /matches|No hook|Nothing/i.test(empty) && fatal().length === 0,
      fatal()[0] ? fatal()[0].slice(0, 140) : empty.slice(-120).replace(/\s+/g, " "));

  await type(input, "");
}

console.error = origErr;
console.log(`\n=== GUIDE NAV RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
