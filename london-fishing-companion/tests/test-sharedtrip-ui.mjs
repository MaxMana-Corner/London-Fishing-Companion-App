/* SCAN 34: the shared-trip screens, driven rather than reasoned about.
 *
 * test-sharedtrip proves the arithmetic. This proves somebody can reach it:
 * start a trip, add a second angler, get a code, and — separately — arrive
 * holding one. Both halves have failed silently in this project before, and
 * a feature nobody can reach is indistinguishable from one that is not built.
 *
 * The guest half is driven through the URL, because that is the real path: a
 * phone's own camera app opens the link and Creel reads the payload out of
 * the fragment. Creel has no decoder and no camera, so if that path is broken
 * there is no other way in for somebody who was shown a code.
 */
import { JSDOM } from "jsdom";
import fs from "fs";
import { encodeJoin } from "../src/sharedtrip.js";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 34: the shared-trip screens ===\n");

const APP = fs.readFileSync("./app.js", "utf8");

/* A fresh app on a fresh phone, at whatever URL the test wants. */
function boot(url) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`,
    { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  global.window = window; global.document = window.document;
  Object.defineProperty(global, "navigator", { value: window.navigator, configurable: true, writable: true });
  global.HTMLElement = window.HTMLElement; global.Element = window.Element; global.Node = window.Node;
  global.self = window; global.location = window.location;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = clearTimeout;
  global.MessageChannel = window.MessageChannel;
  global.fetch = window.fetch = async () => { throw new Error("network down"); };
  /* JSDOM ships neither TextEncoder nor TextDecoder. Every browser has had
     both since 2017 and qr.js has always used them, so this is the test
     environment being behind the web rather than the app reaching for
     something exotic - but without them the code sheet throws here and the
     QR assertions below would be asserting nothing. */
  window.TextEncoder = global.TextEncoder;
  window.TextDecoder = global.TextDecoder;
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
  window.eval(APP);
  return { window, store, errors, restore: () => { console.error = origErr; } };
}

const settle = (ms = 700) => new Promise((r) => setTimeout(r, ms));

const helpers = (window) => {
  const root = window.document.getElementById("root");
  /* #root carries the injected stylesheet too, so textContent would be 60 KB
     of CSS whatever is on screen. */
  const txt = () => [...root.children].filter((el) => el.tagName !== "STYLE")
    .map((el) => el.textContent || "").join(" ");
  const click = async (el, ms = 220) => {
    if (!el) return false;
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    await new Promise((r) => setTimeout(r, ms));
    return true;
  };
  const btn = (re) => [...root.querySelectorAll("button")].find((b) => re.test((b.textContent || "").trim()));
  const type = async (input, value) => {
    const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
  };
  const field = (re) => [...root.querySelectorAll("input, textarea")]
    .find((i) => re.test(i.placeholder || "") ||
      re.test((i.closest("label") || i.parentElement || {}).textContent || ""));
  return { root, txt, click, btn, type, field };
};

const ORIGIN = "https://example.org/app/";

/* ================= the host ================= */
console.log("-- the host puts a trip on the other phone --");
{
  const app = boot(ORIGIN);
  await settle();
  const { root, txt, click, btn, type, field } = helpers(app.window);
  const fatal = () => app.errors.filter((e) =>
    /ReferenceError|TypeError|Cannot read|is not a function|before initialization|Minified React/i.test(e));

  const trip = [...root.querySelectorAll(".tabbar button")]
    .find((b) => /trip|log/i.test((b.getAttribute("aria-label") || "") + " " + b.textContent));
  chk("the Trip tab is there", !!trip);
  await click(trip, 320);

  chk("a trip can be started", await click(btn(/^Start a trip$/), 340));
  chk("the trip form opens", /Who is fishing/i.test(txt()), txt().slice(0, 60));

  /* Solo until you say otherwise — the whole point of the owner's call. */
  chk("it does not assume you have company",
      !!btn(/Fishing with someone/), "closed until opened");

  app.errors.length = 0;
  await click(btn(/Fishing with someone/), 320);
  chk("opening it does not throw", fatal().length === 0, fatal()[0] ? fatal()[0].slice(0, 140) : "clean");
  chk("...and puts you in the party", /\byou\b/i.test(txt()));

  chk("somebody else can be added", await click(btn(/Someone else/), 300));
  const nameBox = field(/Their name/i) || [...root.querySelectorAll("input")].pop();
  chk("there is a name field", !!nameBox);
  await type(nameBox, "Dave");
  app.errors.length = 0;
  await click(btn(/^Add them$/), 340);
  chk("Dave is on the trip", /Dave/.test(txt()) && fatal().length === 0,
      fatal()[0] ? fatal()[0].slice(0, 140) : "added");

  /* The code only appears once there is somebody to give it to. */
  const codeBtn = btn(/Put this trip on their phone/);
  chk("only then does a code appear", !!codeBtn);

  app.errors.length = 0;
  await click(codeBtn, 420);
  chk("the code sheet opens without throwing",
      /Fishing together/i.test(txt()) && fatal().length === 0,
      fatal()[0] ? fatal()[0].slice(0, 160) : "open");
  chk("it draws a QR", !!root.querySelector(".qrwrap svg path"),
      root.querySelector(".qrwrap") ? "square drawn" : "no qrwrap");
  chk("...with a quiet zone, not flush to the edge",
      /^-4 -4 /.test(root.querySelector(".qrwrap svg")?.getAttribute("viewBox") || ""),
      root.querySelector(".qrwrap svg")?.getAttribute("viewBox"));
  chk("and offers the code as text as well",
      /Copy the code/i.test(txt()),
      "a camera that will not focus is the likeliest failure");

  app.restore();
}

/* ================= the guest ================= */
console.log("");
console.log("-- somebody arrives holding a code --");
{
  const join = encodeJoin({
    tripId: "sharedt1", date: "2026-06-15", hostId: "hostaaaa",
    hostName: "Dillon", spotId: "springbank", spotName: "Springbank Park",
  }, { origin: ORIGIN });

  const app = boot(join.url);
  await settle(900);
  const { root, txt, click, btn, type } = helpers(app.window);
  const fatal = () => app.errors.filter((e) =>
    /ReferenceError|TypeError|Cannot read|is not a function|before initialization|Minified React/i.test(e));

  chk("the app opens on the join sheet", /Join this trip/i.test(txt()),
      fatal()[0] ? fatal()[0].slice(0, 160) : txt().slice(0, 80));
  chk("...without throwing", fatal().length === 0, fatal()[0] ? fatal()[0].slice(0, 160) : "clean");
  chk("it says which trip", /Springbank/i.test(txt()) && /2026-06-15/.test(txt()));
  chk("and who started it", /Dillon/.test(txt()));

  /* The code must not stay in the address bar: a refresh would re-offer a
     trip already joined, and it sits there on a phone handed around. */
  chk("the code is cleared from the address bar",
      !(app.window.location.hash || "").includes("#j="),
      JSON.stringify(app.window.location.hash));

  /* THE NAME QUESTION IS THE POINT OF THIS SCREEN. Matching across phones is
     by name, so a guest left as "You" hands the host a stranger called You. */
  chk("it asks what the host should see them as", /should they see you as/i.test(txt()));

  const nameBox = [...root.querySelectorAll("input")].find((i) => i.type !== "date" && i.type !== "time");
  chk("there is a name field to answer it in", !!nameBox);
  await type(nameBox, "Dave");

  app.errors.length = 0;
  await click(btn(/Add this trip/), 480);
  chk("the trip is added without throwing", fatal().length === 0,
      fatal()[0] ? fatal()[0].slice(0, 160) : "clean");

  /* It has to be actually in the log, not merely not-crashed. */
  const saved = JSON.parse(app.store["lfc:log"] || "{}");
  const trips = (saved && saved.value ? saved.value : saved).trips || [];
  const t = trips.find((x) => x.id === "sharedt1");
  chk("the trip is in the log under the SAME id both phones use", !!t,
      trips.map((x) => x.id).join(", ") || "no trips");
  if (t) {
    chk("the host is recorded as the host", t.hostBy === "hostaaaa", t.hostBy);
    chk("the party has two people on it", (t.party || []).length === 2, (t.party || []).join(", "));
    /* The one the merge depends on, and the least obvious. */
    chk("the guest's copy is stamped 0, so it can never beat the host's",
        t.updatedAt === 0,
        `a copy stamped now would block the host's readings ever arriving (${t.updatedAt})`);
  }

  const people = JSON.parse(app.store["lfc:anglers"] || "[]");
  const list = people && people.value ? people.value : people;
  chk("the guest named themselves", (list || []).some((a) => a.self && a.name === "Dave"),
      (list || []).map((a) => a.name + (a.self ? " (me)" : "")).join(", "));
  chk("and adopted the host's id, so the return journey needs no matching",
      (list || []).some((a) => a.id === "hostaaaa" && a.name === "Dillon"));
  chk("there is exactly one self on this phone",
      (list || []).filter((a) => a.self).length === 1,
      "two selves makes every attribution a coin toss");

  app.restore();
}

/* ================= a bad code ================= */
console.log("");
console.log("-- a code that is not one --");
{
  const app = boot(ORIGIN + "#j=obviously-not-a-real-code!!");
  await settle(900);
  const { txt } = helpers(app.window);
  const fatal = app.errors.filter((e) =>
    /ReferenceError|TypeError|Cannot read|is not a function|Minified React/i.test(e));
  chk("a bad code does not open a join sheet", !/Join this trip/i.test(txt()));
  chk("...and does not break the app", fatal.length === 0 && txt().length > 400,
      fatal[0] ? fatal[0].slice(0, 140) : txt().length + " chars rendered");
  app.restore();
}

console.log(`\n=== SHARED TRIP UI RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
