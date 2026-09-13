/* SCAN 31: the Options screens that were rebuilt — Help, and more than one licence.
 *
 * Neither had any render coverage. Help was one flat scroll and is now four
 * tabs with a search across all of them; the licence panel held exactly one
 * licence and now holds as many as you have. Both are places where a mistake
 * is silent: a Help tab that throws is a screen nobody visits often enough to
 * report, and a licence panel that drops the second licence looks exactly
 * like a licence panel that saved it.
 */
import { JSDOM } from "jsdom";
import fs from "fs";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 31: Help, and more than one licence ===\n");

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
/* #root carries the injected stylesheet as well as the app, so textContent
   would be 60 KB of CSS whatever is on screen. */
const txt = () => [...root.children].filter((el) => el.tagName !== "STYLE")
  .map((el) => el.textContent || "").join(" ");
const click = async (el, ms = 200) => {
  if (!el) return false;
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  await new Promise((r) => setTimeout(r, ms));
  return true;
};
const type = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
};
const fatal = () => errors.filter((e) =>
  /ReferenceError|TypeError|Cannot read|is not a function|before initialization|Minified React/i.test(e));

const optionsTab = [...root.querySelectorAll(".tabbar button")]
  .find((b) => /options/i.test((b.getAttribute("aria-label") || "") + " " + b.textContent));
chk("the Options tab is there", !!optionsTab);
await click(optionsTab, 300);

/* Tapping the Options TAB while already inside a group does nothing - the
   group is state inside the screen, and the way back to the index is the
   back button at the top. Without this the test opened Help, then tried to
   open Licence from inside Help, found no such button, and reported the
   licence panel missing. */
const backToIndex = async () => {
  for (let i = 0; i < 3; i++) {
    const back = [...root.querySelectorAll("button")]
      .find((x) => /^Options$/i.test((x.textContent || "").trim()) && !x.closest(".tabbar"));
    if (!back) return;
    await click(back, 280);
  }
};
const openGroup = async (name) => {
  await backToIndex();
  const b = [...root.querySelectorAll("button, a")]
    .find((x) => new RegExp("^" + name, "i").test((x.textContent || "").trim()) && !x.closest(".tabbar"));
  await click(b, 320);
  return !!b;
};

/* ---------------- Help ---------------- */
errors.length = 0;
chk("Help opens", await openGroup("Help"));
chk("...without throwing", fatal().length === 0, fatal()[0] ? fatal()[0].slice(0, 150) : "clean");

const helpBar = [...root.querySelectorAll(".segbar")]
  .find((x) => /Help/i.test(x.getAttribute("aria-label") || ""));
chk("Help has a category bar", !!helpBar);
const HELP_TABS = ["Start here", "Words", "Questions", "Problems"];
if (helpBar) {
  const labels = [...helpBar.querySelectorAll("button")].map((b) => b.textContent.trim());
  chk("all four Help headings are on it",
      HELP_TABS.every((t) => labels.some((l) => l.startsWith(t))), labels.join(" / "));
}

for (const t of HELP_TABS) {
  errors.length = 0;
  const b = helpBar && [...helpBar.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(t));
  if (!b) { chk(`Help › ${t} is reachable`, false, "no button"); continue; }
  await click(b, 240);
  chk(`Help › ${t} renders`, txt().length > 300 && fatal().length === 0,
      fatal()[0] ? fatal()[0].slice(0, 150) : "ok");
}

/* The new content, which is the reason the rebuild happened. */
const helpBtn = (t) => helpBar && [...helpBar.querySelectorAll("button")]
  .find((x) => x.textContent.trim().startsWith(t));
await click(helpBtn("Start here"), 240);
chk("Start here carries the walkthrough that did not exist before",
    /first five minutes/i.test(txt()) && /Pick where you are/i.test(txt()));
await click(helpBtn("Problems"), 240);
chk("Problems carries the troubleshooting that did not exist before",
    /map will not download/i.test(txt()));

/* One search across all four headings. */
const helpSearch = [...root.querySelectorAll("input")]
  .find((i) => /Search all of Help/i.test(i.placeholder || ""));
chk("Help has one search across all of it", !!helpSearch, helpSearch && helpSearch.placeholder);
if (helpSearch) {
  errors.length = 0;
  await type(helpSearch, "licence");
  chk("a search finds matches and says where they are",
      /\d/.test([...helpBar.querySelectorAll("button")].map((b) => b.textContent).join("")) &&
      fatal().length === 0,
      [...helpBar.querySelectorAll("button")].map((b) => b.textContent.trim()).join(" / "));

  await type(helpSearch, "zzzzqqq");
  chk("a search with no hits anywhere says so", /Nothing in Help matches/i.test(txt()));
  await type(helpSearch, "");
}

/* ---------------- more than one licence ---------------- */
errors.length = 0;
chk("Licence opens", await openGroup("Licence"));
chk("...without throwing", fatal().length === 0, fatal()[0] ? fatal()[0].slice(0, 150) : "clean");

const licRow = [...root.querySelectorAll("button")]
  .find((b) => /Fishing licence reminder/i.test(b.textContent || ""));
chk("the licence row is on the group", !!licRow);
await click(licRow, 340);

const addAnother = [...root.querySelectorAll("button")]
  .find((b) => /Add another licence/i.test(b.textContent || ""));
chk("the panel offers a second licence", !!addAnother);

if (addAnother) {
  const dateBefore = root.querySelectorAll('input[type="date"]').length;
  errors.length = 0;
  await click(addAnother, 280);
  const dateAfter = root.querySelectorAll('input[type="date"]').length;
  chk("adding one gives it its own date field",
      dateAfter === dateBefore + 1 && fatal().length === 0,
      fatal()[0] ? fatal()[0].slice(0, 140) : dateBefore + " -> " + dateAfter);

  /* Its type picker has to offer every province, because a second licence is
     usually for somewhere other than where you are standing. */
  const sel = [...root.querySelectorAll("select")].pop();
  chk("its type picker groups by who issued it",
      !!sel && sel.querySelectorAll("optgroup").length >= 3,
      sel ? [...sel.querySelectorAll("optgroup")].map((g) => g.label).join(" / ") : "no select");

  /* And it has to be removable, or a mistyped one is there for ever. */
  const remove = [...root.querySelectorAll("button")].find((b) => /Remove this one/i.test(b.textContent || ""));
  chk("and it can be removed again", !!remove);
  if (remove) {
    await click(remove, 260);
    chk("removing it takes the field away too",
        root.querySelectorAll('input[type="date"]').length === dateBefore && fatal().length === 0,
        root.querySelectorAll('input[type="date"]').length + " date fields");
  }
}

console.error = origErr;
console.log(`\n=== OPTIONS RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
