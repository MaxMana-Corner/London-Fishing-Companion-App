/* SCAN 37 - the map drawer's three stops.

   Two rounds of "better but still frustrating" ended with the owner choosing
   fixed stops over free dragging: peek, half, full, and it always lands on
   one of them.

   Sizing this thing took three attempts and the first two failed SILENTLY in
   a real browser, which is why the assertions here are about the pixel value
   rather than about the state:

     a percentage HEIGHT on a flex item did not resolve - the inline style
     went 16% to 45% to 82% and the rendered box stayed at 119px;

     a percentage FLEX-BASIS was worse - the inline style read 45% while the
     computed value stayed at 16%, so the element disagreed with its own
     style attribute.

   It is sized in pixels off its measured container now, so there is nothing
   left for the layout engine to reinterpret. JSDOM has no layout, so what is
   checked here is that the right number is computed and handed to the style;
   the rendered result was measured in a browser at 375x812 (119 / 336 / 612
   against a 746px shell).
*/
import { JSDOM } from "jsdom";
import fs from "fs";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 37: the map drawer ===\n");

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`,
  { url: "https://example.org/", runScripts: "outside-only", pretendToBeVisual: true });
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

/* JSDOM gives every element a zero rect, so the component's measurement would
   see a zero-height shell and fall back to a percentage. Give it a height. */
const SHELL = 746;
w.Element.prototype.getBoundingClientRect = function () {
  const h = this.classList && this.classList.contains("mapfull") ? SHELL : 0;
  return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: h, width: 375, height: h, toJSON() {} };
};
w.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe() { this.cb(); } disconnect() {} };

const errs = [];
const oe = console.error;
console.error = (...a) => errs.push(a.map(String).join(" "));
w.eval(fs.readFileSync("./app.js", "utf8"));
await new Promise((r) => setTimeout(r, 900));

const root = w.document.getElementById("root");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tab = (n) => [...root.querySelectorAll(".tabbar button")].find((b) => new RegExp(n, "i").test(b.textContent));
const click = async (el, ms = 320) => { if (!el) return false; el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); await wait(ms); return true; };

await click(tab("map"), 700);
const drawer = () => root.querySelector(".mapdrawer");
const grab = () => root.querySelector(".mapgrab");
chk("the map page has a drawer", !!drawer());
chk("...and a grab bar", !!grab());

/* A pointer event React will actually accept. isPrimary and pointerType are
   not optional - without them React's pointer handling ignores the event, and
   a browser test that omitted them reported the drawer as frozen when it was
   the test that was broken. */
/* JSDOM has no PointerEvent constructor, so a MouseEvent carries the same
   fields - React reads clientY, button and pointerId off whatever arrives. */
const mk = (type, y) => {
  const ev = new w.MouseEvent(type, { bubbles: true, clientY: y, button: 0 });
  Object.defineProperty(ev, "pointerId", { value: 1 });
  Object.defineProperty(ev, "isPrimary", { value: true });
  Object.defineProperty(ev, "pointerType", { value: "touch" });
  return ev;
};
const tap = async () => {
  grab().dispatchEvent(mk("pointerdown", 600));
  await wait(20);
  grab().dispatchEvent(mk("pointerup", 600));
  await wait(320);
};
const px = () => {
  const st = drawer().getAttribute("style") || "";
  const m = st.match(/height:\s*(\d+)px/);
  return m ? Number(m[1]) : null;
};
const listShown = () => {
  const b = root.querySelector(".mapdrawerbody");
  return !!b && !/display:\s*none/.test(b.getAttribute("style") || "");
};

const PEEK = Math.round(0.16 * SHELL), HALF = Math.round(0.45 * SHELL), FULL = Math.round(0.82 * SHELL);
chk("it opens at peek", px() === PEEK, `${px()} vs ${PEEK}`);
chk("...with the list hidden", !listShown());

await tap();
chk("one tap goes to half", px() === HALF, `${px()} vs ${HALF}`);
chk("...and the list appears", listShown());

await tap();
chk("two taps go to full", px() === FULL, `${px()} vs ${FULL}`);

await tap();
chk("three taps wrap back to peek", px() === PEEK, `${px()} vs ${PEEK}`);
chk("...and the list hides again", !listShown());

/* A drag that stops between two stops must SNAP, which is the whole point of
   the change - free positioning is what made it frustrating. */
{
  grab().dispatchEvent(mk("pointerdown", 600));
  for (const y of [560, 500, 470]) { grab().dispatchEvent(mk("pointermove", y)); await wait(30); }
  grab().dispatchEvent(mk("pointerup", 470));
  await wait(340);
  const landed = px();
  chk("a drag that ends between stops snaps to one of them",
      [PEEK, HALF, FULL].includes(landed), `${landed}, stops are ${PEEK}/${HALF}/${FULL}`);
}

/* And a keyboard reaches the same three positions rather than nudging.

   Driven from a KNOWN stop. The first version started wherever the drag above
   had left it, which was full - where ArrowUp correctly cannot go higher - and
   then called the clamp a failure. */
{
  const key = (k) => {
    grab().dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true }));
    return wait(300);
  };
  /* Down to the floor first, however many stops that takes. */
  for (let i = 0; i < 3; i++) await key("ArrowDown");
  chk("ArrowDown reaches peek and stops there", px() === PEEK, `${px()} vs ${PEEK}`);

  await key("ArrowUp");
  chk("ArrowUp moves one whole stop, not a nudge", px() === HALF, `${px()} vs ${HALF}`);
  await key("ArrowUp");
  chk("...and again", px() === FULL, `${px()} vs ${FULL}`);
  await key("ArrowUp");
  chk("...and clamps at full rather than wrapping", px() === FULL, `${px()} vs ${FULL}`);
  await key("ArrowDown");
  chk("ArrowDown comes back one stop", px() === HALF, `${px()} vs ${HALF}`);
}

console.error = oe;
const fatal = errs.filter((e) => /ReferenceError|TypeError|Cannot read|is not a function/i.test(e));
chk("nothing threw", fatal.length === 0, fatal[0] ? fatal[0].slice(0, 130) : "clean");

console.log(`\n=== DRAWER RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
