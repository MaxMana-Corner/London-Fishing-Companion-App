/* SCAN 34 - the whole app, in both provinces, everything opened and closed.

   The earlier walks each covered one axis. This crosses them: every tab,
   every encyclopedia category, every settings group and every record sheet,
   run once per province, watching for three failures rather than one.

     it threw
     it rendered nothing at all          - the Appearance page shape
     it rendered a raw internal id       - the tactic pills shape
*/
import { JSDOM } from "jsdom";
import fs from "fs";

const REGIONS = ["london-on", "langley-bc"];
const app = fs.readFileSync("./app.js", "utf8");

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

/* Every internal id in the app, so a bare one appearing as visible text can
   be spotted. Drawn from the source rather than listed, or the check decays
   as records are added. */
const src = fs.readFileSync("src/App.jsx", "utf8");
const RAW_IDS = new Set();
for (const m of src.matchAll(/^    id: "([a-z][a-z0-9-]{1,12})", (?:name|title|cat):/gm)) RAW_IDS.add(m[1]);
for (const m of fs.readFileSync("src/tactics.js", "utf8").matchAll(/^    id: "([a-z0-9-]+)",/gm)) RAW_IDS.add(m[1]);
/* No blocklist, because none is needed once the check looks in the right
   place - see the note on rawIdsIn below. */

for (const region of REGIONS) {
  console.log(`\n=== ${region} ===\n`);

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

  /* Seed the region AND a pack for it, so the BC run has its spots without
     needing the network. */
  const packFile = `map/${region}-spots.json`;
  const store = { "lfc:mapRegion": JSON.stringify(region) };
  if (fs.existsSync(packFile)) {
    const pack = JSON.parse(fs.readFileSync(packFile, "utf8"));
    store["lfc:spotPacks"] = JSON.stringify({ [region]: pack.spots });
  }
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

  w.eval(app);
  await new Promise((r) => setTimeout(r, 900));

  const root = w.document.getElementById("root");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = async (el, ms = 300) => { if (!el) return false; el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); await wait(ms); return true; };
  const tab = (n) => [...root.querySelectorAll(".tabbar button")].find((b) => new RegExp(n, "i").test(b.textContent));
  const vis = () => { const c = root.cloneNode(true); c.querySelectorAll("style,script").forEach((n) => n.remove()); return (c.textContent || "").replace(/\s+/g, " ").trim(); };
  const FATAL = /ReferenceError|TypeError|is not a function|is not defined|Cannot read|Minified React|onerror|unhandled/i;
  const since = (n) => errs.slice(n).filter((e) => FATAL.test(e));

  /* A LABEL whose entire text is an internal id.

     Scanning prose for id-shaped words does not work: most ids in this app
     are ordinary English - sucker, drum, crappie, braid, mono, release,
     keep, knife, fillet - and species names contain them, so every list
     matched. The bug this looks for was never a word in a sentence. It was
     a pill, chip or row label rendered as its own id because the lookup
     missed, so the whole label read "smb". Exact match on the label text,
     which needs no blocklist and cannot decay. */
  const LABEL_SEL = ".pill, .chip, .encyrow-name, .favtile span, .regionnm, " +
    ".encyhit-name, .favslot-name, .tripname, .nearname, .encytile-name, .listbtn h3";
  const rawIdLabels = (scope) => {
    const hits = [];
    for (const el of (scope || root).querySelectorAll(LABEL_SEL)) {
      const t = (el.textContent || "").replace(/[\u2003\u00a0\s]+/g, " ").replace(/\u203a/g, "").trim();
      if (RAW_IDS.has(t)) hits.push(t);
    }
    return [...new Set(hits)];
  };

  /* Back to the HUB, not just to the Guide tab. Opening a category replaces
     the hub, and clicking the Guide tab again leaves you where you were - so
     the first run of this found Fish and then reported the other eight as
     missing from a screen that was no longer the hub. */
  const toHub = async () => {
    for (let i = 0; i < 4; i++) {
      if (root.querySelector(".encytile")) return true;
      const back = [...root.querySelectorAll("button")]
        .find((b) => /^(Back|All categories|Encyclopedia)$/i.test((b.textContent || "").trim()));
      if (back) { await click(back, 380); continue; }
      await click(tab("Home"), 260);
      await click(tab("Guide"), 380);
    }
    return !!root.querySelector(".encytile");
  };
  /* ---------------- tabs ---------------- */
  for (const t of ["Home", "Map", "Trip", "Guide", "Options"]) {
    const b = errs.length;
    const ok = await click(tab(t), 480);
    const text = vis();
    const bad = since(b);
    chk(`${t} opens`, ok && bad.length === 0, bad[0] ? bad[0].slice(0, 110) : "clean");
    chk(`${t} renders something`, text.length > 120, text.length + " chars");
    const raw = rawIdLabels();
    chk(`${t} shows no label that is a bare id`, raw.length === 0, raw.join(", ") || "none");
  }

  /* ---------------- encyclopedia categories, via See all ---------------- */
  await click(tab("Guide"), 450);
  const CATS = ["Fish", "Baits", "Hooks", "Tactics", "Knots", "Tips", "Gear", "Handling", "Rules"];
  for (const cat of CATS) {
    await toHub();
    const tile = [...root.querySelectorAll(".encytile")].find((t) => t.textContent.includes(cat));
    if (!tile) { chk(`${cat} is on the hub`, false, "not found"); continue; }
    const b = errs.length;
    if (!tile.classList.contains("open")) await click(tile.querySelector(".encytile-head"), 400);
    const t2 = [...root.querySelectorAll(".encytile")].find((t) => t.textContent.includes(cat));
    const seeAll = t2 && t2.querySelector(".encyseeall");
    if (!await click(seeAll, 600)) { chk(`${cat} has a See all`, false, "none"); continue; }
    const text = vis();
    const bad = since(b);
    chk(`${cat} opens`, bad.length === 0, bad[0] ? bad[0].slice(0, 110) : "clean");
    chk(`${cat} is not an empty page`, text.length > 200, text.length + " chars");
    const raw = rawIdLabels();
    chk(`${cat} shows no label that is a bare id`, raw.length === 0, raw.join(", ") || "none");
  }

  /* ---------------- every record sheet in every category ---------------- */
  await click(tab("Guide"), 400);
  for (const cat of ["Fish", "Baits", "Tactics", "Gear"]) {
    await toHub();
    const tile = [...root.querySelectorAll(".encytile")].find((t) => t.textContent.includes(cat));
    if (!tile) continue;
    if (!tile.classList.contains("open")) await click(tile.querySelector(".encytile-head"), 350);
    const t2 = [...root.querySelectorAll(".encytile")].find((t) => t.textContent.includes(cat));
    await click(t2 && t2.querySelector(".encyseeall"), 550);

    /* Open the first few rows in the list. */
    /* Row classes differ per category, and the tactics list uses none of the
       ones guessed first - it reported "0 sheets opened", which is a silent
       skip rather than a pass. Anything that is a button inside the list and
       is not a filter or the nav counts. */
    const rows = [...root.querySelectorAll(
      "button.listbtn, button.encyrow, button.gearcard, button.tacticcard, " +
      "button.tactrow, button.knotrow, button.cardbtn, .stack > button.card")]
      .filter((b) => !b.closest(".tabbar") && !b.closest(".filterrow") &&
        (b.textContent || "").trim().length > 3)
      .slice(0, 4);
    let opened = 0, rawSeen = [];
    for (const row of rows) {
      const b = errs.length;
      await click(row, 420);
      const sheet = root.querySelector('[role="dialog"]') || root.querySelector(".sheet");
      if (!sheet) continue;
      opened++;
      const body = (sheet.textContent || "").replace(/\s+/g, " ");
      const bad = since(b);
      if (bad.length) { chk(`a ${cat} sheet threw`, false, bad[0].slice(0, 120)); }
      rawSeen = rawSeen.concat(rawIdLabels(sheet));
      const closeBtn = [...sheet.querySelectorAll("button")]
        .find((x) => /^close$/i.test((x.textContent || "").trim()) || /close/i.test(x.getAttribute("aria-label") || ""));
      await click(closeBtn, 300);
    }
    chk(`${cat}: opened ${opened} sheets, none threw`, opened > 0, opened + " opened");
    const uniq = [...new Set(rawSeen)];
    chk(`${cat}: no sheet shows a label that is a bare id`, uniq.length === 0, uniq.join(", ") || "none");
  }

  /* ---------------- every settings group ---------------- */
  await click(tab("Options"), 500);
  const groupBtns = [...root.querySelectorAll("button")]
    .filter((b) => /Appearance|Backup|Help|About|Maps|Community|Licence|Drive|Connected/i.test(b.textContent))
    .slice(0, 10);
  let groups = 0;
  for (const g of groupBtns) {
    await click(tab("Options"), 300);
    const again = [...root.querySelectorAll("button")].find((b) => b.textContent === g.textContent);
    if (!again) continue;
    const b = errs.length;
    await click(again, 520);
    const text = vis();
    const bad = since(b);
    groups++;
    const label = (g.textContent || "").trim().slice(0, 22);
    if (bad.length) chk(`Options/${label} threw`, false, bad[0].slice(0, 110));
    else if (text.length < 150) chk(`Options/${label} is not blank`, false, text.length + " chars");
  }
  chk(`walked ${groups} settings groups`, groups > 0, groups);

  console.error = oe;
  const allBad = errs.filter((e) => FATAL.test(e));
  chk(`${region}: nothing threw anywhere`, allBad.length === 0,
      allBad.length ? allBad.slice(0, 2).join(" | ").slice(0, 200) : "clean");
}

console.log(`\n=== MATRIX RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
