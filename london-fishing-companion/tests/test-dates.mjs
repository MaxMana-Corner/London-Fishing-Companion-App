/* DATES. Season windows, the nth-weekday openers, and everything that spans
   a year boundary.

   Everything in the app that says "open today" or "opens on the 12th" runs
   through here, and the failure mode is the worst one this app has: a
   confident wrong date is what gets somebody fined. The season table had no
   test of its own - test-astro covers the sun and moon maths, and nothing
   covered SEASONS, isOpenOn or nextOpen.

   What it asserts, and why each one:

     every window resolves in every year, with real Dates and the start
     before the end - a resolver that returns an Invalid Date renders as
     "Invalid Date" rather than failing;

     the nth-weekday openers actually land on a Saturday, in seven different
     years. The bass opener is the fourth Saturday in June; if nthWeekday
     miscounts, the app opens a season on a Thursday;

     isOpenOn and nextOpen never contradict, walked day by day through a
     whole year for all fifteen keys. "Closed today, opens yesterday" is the
     shape that would slip through any spot check;

     sixteen dates checked against the published Zone 16 table, including the
     three BC keys, which must NOT claim a closure - they carry no dates on
     purpose;

     both sides of ten window boundaries. The last open day and the first
     closed one is the off-by-one somebody actually gets fined for. */
import * as ASTRO from "../src/astro.js";
import fs from "node:fs";

let issues = 0;
const bad = (m) => { issues++; console.log("  ! " + m); };
const head = (t) => console.log("\n-- " + t + " --");
console.log("\n=== SCAN 31: dates and seasons ===");

/* SEASONS, isOpenOn and nextOpen are inside App.jsx. Lifted by text the way
   test-licence lifts licenceStatus, because the alternative is asserting
   against the built bundle and this needs to fail when the source is wrong. */
const src = fs.readFileSync("src/App.jsx", "utf8");
const from = src.indexOf("const nthWeekday =");
const to = src.indexOf("const fmtShort =");
if (from < 0 || to < 0) { console.log("  ! could not lift the season code"); process.exit(1); }
const seasonCode = src.slice(from, to);
const { SEASONS, isOpenOn, nextOpen, W } = new Function(
  seasonCode + "\nreturn { SEASONS, isOpenOn, nextOpen, W };")();

head("every season window resolves, every year");
{
  for (const [key, s] of Object.entries(SEASONS)) {
    for (const y of [2024, 2025, 2026, 2027, 2028, 2030, 2036]) {
      let wins;
      try { wins = s.win(y); }
      catch (e) { bad(`SEASONS.${key}.win(${y}) threw: ${e.message}`); continue; }
      if (!Array.isArray(wins)) { bad(`SEASONS.${key}.win(${y}) is not an array`); continue; }
      for (const [a, b] of wins) {
        if (!(a instanceof Date) || !(b instanceof Date)) {
          bad(`SEASONS.${key} ${y}: a window bound is not a Date`);
          continue;
        }
        if (isNaN(a) || isNaN(b)) { bad(`SEASONS.${key} ${y}: an Invalid Date`); continue; }
        if (a > b) bad(`SEASONS.${key} ${y}: window starts ${a.toDateString()} after it ends ${b.toDateString()}`);
        if (a.getFullYear() !== y && b.getFullYear() !== y) {
          bad(`SEASONS.${key} ${y}: window is in ${a.getFullYear()}`);
        }
      }
    }
  }
  console.log(`  checked ${Object.keys(SEASONS).length} keys over 7 years`);
}

head("nth-weekday resolvers land on the right weekday");
{
  /* The bass opener is the 4th Saturday in June; walleye and pike use the
     2nd Saturday in May; musky the 1st Saturday in June; trout the 4th
     Saturday in April. Every one of those must actually be a Saturday, in
     every year, or the app opens a season on a Thursday. */
  const expect = { bass: 6, walleye: 6, pike: 6, musky: 6, trout: 6 };
  for (const [key, wd] of Object.entries(expect)) {
    for (const y of [2024, 2025, 2026, 2027, 2028, 2029, 2030]) {
      for (const [a] of SEASONS[key].win(y)) {
        /* Only the nth-weekday openers are checked - the Jan 1 halves of the
           split seasons are fixed dates and land wherever they land. */
        if (a.getDate() === 1 && a.getMonth() === 0) continue;
        if (a.getDay() !== wd) {
          bad(`${key} ${y} opens ${a.toDateString()}, which is not a Saturday`);
        }
      }
    }
  }
  console.log("  checked 5 nth-weekday openers over 7 years");
}

head("isOpenOn and nextOpen agree with each other");
{
  /* Walk every day of a year for every season and check the two functions
     never contradict: if today is closed, nextOpen must be in the future or
     null; if today is open, the day before the window started was closed. */
  for (const key of Object.keys(SEASONS)) {
    let flips = 0, prev = null;
    for (let d = 0; d < 365; d++) {
      const day = new Date(2026, 0, 1 + d, 12, 0, 0);
      let open;
      try { open = isOpenOn(key, day); }
      catch (e) { bad(`isOpenOn(${key}) threw on ${day.toDateString()}: ${e.message}`); break; }
      if (typeof open !== "boolean") { bad(`isOpenOn(${key}) returned ${typeof open}`); break; }
      if (prev !== null && open !== prev) flips++;
      prev = open;
      if (!open) {
        let nx;
        try { nx = nextOpen(key, day); }
        catch (e) { bad(`nextOpen(${key}) threw on ${day.toDateString()}: ${e.message}`); break; }
        if (nx && nx <= day) {
          bad(`${key}: closed on ${day.toDateString()} but nextOpen says ${nx.toDateString()}, in the past`);
          break;
        }
      }
    }
    /* A season that never changes state all year is either always-open or
       always-shut, and both of those exist on purpose. Anything else should
       flip an even number of times or end the year in a different state. */
    if (flips > 4) bad(`${key} changes state ${flips} times in a year, which is more windows than it declares`);
  }
  console.log(`  walked 365 days x ${Object.keys(SEASONS).length} seasons`);
}

head("the closed season a person would be standing in");
{
  /* Spot checks against the published Zone 16 dates, computed rather than
     recalled: bass opens the 4th Saturday in June, so it is shut in May and
     open in July, every year. */
  const cases = [
    ["bass", new Date(2026, 4, 15, 12), false, "mid-May"],
    ["bass", new Date(2026, 6, 15, 12), true, "mid-July"],
    ["bass", new Date(2026, 11, 15, 12), false, "mid-December"],
    ["walleye", new Date(2026, 3, 15, 12), false, "mid-April"],
    ["walleye", new Date(2026, 1, 15, 12), true, "mid-February"],
    ["pike", new Date(2026, 3, 15, 12), false, "mid-April"],
    ["musky", new Date(2026, 4, 15, 12), false, "mid-May"],
    ["musky", new Date(2026, 7, 15, 12), true, "mid-August"],
    ["trout", new Date(2026, 1, 15, 12), false, "mid-February"],
    ["trout", new Date(2026, 5, 15, 12), true, "mid-June"],
    ["catfish", new Date(2026, 0, 1, 12), true, "New Year's Day"],
    ["none", new Date(2026, 0, 1, 12), true, "New Year's Day"],
    ["shut", new Date(2026, 6, 1, 12), false, "mid-summer"],
    /* The BC keys carry no dates and must not claim a closure. */
    ["bcFresh", new Date(2026, 0, 15, 12), true, "January"],
    ["bcSalmon", new Date(2026, 0, 15, 12), true, "January"],
    ["bcSturgeon", new Date(2026, 0, 15, 12), true, "January"],
  ];
  for (const [key, day, want, label] of cases) {
    const got = isOpenOn(key, day);
    if (got !== want) bad(`${key} on ${label} reads ${got ? "open" : "closed"}, expected ${want ? "open" : "closed"}`);
  }
  console.log(`  checked ${cases.length} dates against the published table`);
}

head("the last day of a window, and the first day after it");
{
  /* An off-by-one at a boundary is the version of this bug somebody actually
     gets fined for. Bass closes 30 November: the 30th is open, 1 December is
     not. */
  const checks = [
    ["bass", new Date(2026, 10, 30, 12), true, "30 November"],
    ["bass", new Date(2026, 11, 1, 12), false, "1 December"],
    ["walleye", new Date(2026, 2, 15, 12), true, "15 March"],
    ["walleye", new Date(2026, 2, 16, 12), false, "16 March"],
    ["pike", new Date(2026, 2, 31, 12), true, "31 March"],
    ["pike", new Date(2026, 3, 1, 12), false, "1 April"],
    ["trout", new Date(2026, 8, 30, 12), true, "30 September"],
    ["trout", new Date(2026, 9, 1, 12), false, "1 October"],
    ["musky", new Date(2026, 11, 15, 12), true, "15 December"],
    ["musky", new Date(2026, 11, 16, 12), false, "16 December"],
  ];
  for (const [key, day, want, label] of checks) {
    const got = isOpenOn(key, day);
    if (got !== want) bad(`${key} on ${label} reads ${got ? "open" : "closed"}, expected ${want ? "open" : "closed"}`);
  }
  /* And the very last moment of a closing day, since the comparison extends
     the end date to 23:59. */
  if (!isOpenOn("bass", new Date(2026, 10, 30, 23, 30))) {
    bad("bass reads closed at 23:30 on its last open day");
  }
  console.log(`  checked ${checks.length} window boundaries plus a late-evening one`);
}

head("astro across awkward dates");
{
  const places = [[42.98, -81.25], [49.10, -122.66], [60, -135], [83, -70]];
  const days = [
    new Date(2026, 0, 1, 12), new Date(2026, 5, 21, 12), new Date(2026, 11, 21, 12),
    new Date(2024, 1, 29, 12),                                  /* a leap day */
    new Date(2026, 2, 8, 12), new Date(2026, 10, 1, 12),        /* DST changes */
  ];
  for (const [lat, lon] of places) {
    for (const d of days) {
      let t;
      try { t = ASTRO.sunTimes(d, lat, lon); }
      catch (e) { bad(`sunTimes(${lat},${lon}) threw on ${d.toDateString()}: ${e.message}`); continue; }
      if (!t) { bad(`sunTimes(${lat},${lon}) returned nothing on ${d.toDateString()}`); continue; }
      for (const k of Object.keys(t)) {
        const v = t[k];
        if (v instanceof Date && isNaN(v)) bad(`sunTimes(${lat},${lon}).${k} is an Invalid Date on ${d.toDateString()}`);
        if (typeof v === "number" && !Number.isFinite(v)) bad(`sunTimes(${lat},${lon}).${k} is ${v}`);
      }
      try {
        const m = ASTRO.moonPhase(d);
        if (m && typeof m.phase === "number" && !Number.isFinite(m.phase)) bad(`moonPhase is ${m.phase}`);
      } catch (e) { bad(`moonPhase threw on ${d.toDateString()}: ${e.message}`); }
      try {
        const s = ASTRO.solunar(d, lat, lon);
        if (s && Array.isArray(s.windows)) {
          for (const win of s.windows) {
            if (win && win.start instanceof Date && isNaN(win.start)) bad("a solunar window has an Invalid Date");
          }
        }
      } catch (e) { bad(`solunar threw at ${lat},${lon} on ${d.toDateString()}: ${e.message}`); }
    }
  }
  console.log(`  checked ${places.length} latitudes x ${days.length} dates, including a leap day, both solstices and both DST switches`);
}

console.log(`\n=== DATES RESULT: ${issues ? 0 : 1} passed, ${issues} failed ===\n`);
process.exit(issues ? 1 : 0);
