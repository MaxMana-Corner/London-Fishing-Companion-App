/* Licence expiry, which the app computes locally and warns on.

   It had no test at all until a second province arrived and broke the one
   assumption it was built on. Ontario sells a licence for a TERM: a year, or
   three years, from the day you bought it. British Columbia sells a licence
   YEAR: both the provincial freshwater licence and the federal tidal waters
   one run 1 April to 31 March whatever date you bought them on. So a BC
   annual licence bought in February is valid for about six weeks, and the
   Ontario arithmetic would have reported eleven months left on it - in an app
   whose only job here is to warn you before it runs out.

   licenceStatus is plain JavaScript inside a JSX file, so it is lifted out by
   text and evaluated. That is deliberate: the alternative is asserting on the
   built bundle, and this needs to fail when src/App.jsx is wrong rather than
   when somebody last ran esbuild.
*/
import fs from "fs";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 23: licence expiry ===\n");

const src = fs.readFileSync("src/App.jsx", "utf8");
const start = src.indexOf("export function licenceStatus(lic)");
const end = src.indexOf("\n}", start);
if (start < 0 || end < 0) {
  console.log("  FAIL  licenceStatus is not where this test looks for it");
  process.exit(1);
}
const body = src.slice(start, end + 2).replace("export function", "function");
const licenceStatus = new Function(body + "\nreturn licenceStatus;")();

const iso = (d) => d.toISOString().slice(0, 10);
const on = (type, boughtOn) => licenceStatus({ type, boughtOn });
const expiryOf = (type, boughtOn) => {
  const st = on(type, boughtOn);
  return st ? iso(st.expiry) : null;
};

/* ------------------------------------------------------------------
   Nothing entered, nothing claimed.
   ------------------------------------------------------------------ */
console.log("-- no licence --");
chk("no record is no status", licenceStatus(null) === null);
chk("an empty record is no status", licenceStatus({}) === null);
chk("no purchase date is no status", licenceStatus({ type: "1-year sport" }) === null);
chk("an unparseable date is no status",
    licenceStatus({ type: "1-year sport", boughtOn: "not-a-date" }) === null);

/* ------------------------------------------------------------------
   Ontario: a term from the day of purchase.
   ------------------------------------------------------------------ */
console.log("\n-- Ontario --");
chk("1-year sport runs a year", expiryOf("1-year sport", "2026-06-15") === "2027-06-15",
    expiryOf("1-year sport", "2026-06-15"));
chk("1-year conservation runs a year",
    expiryOf("1-year conservation", "2026-06-15") === "2027-06-15");
chk("3-year sport runs three years", expiryOf("3-year sport", "2026-06-15") === "2029-06-15",
    expiryOf("3-year sport", "2026-06-15"));
chk("3-year conservation runs three years",
    expiryOf("3-year conservation", "2026-06-15") === "2029-06-15");
/* The card is not a licence, but it is in the list because you need one and
   it is the thing that expires. Three years, like the licences of that term. */
chk("the Outdoors Card runs three years",
    expiryOf("3-year Outdoors Card", "2026-06-15") === "2029-06-15");
chk("1-day sport runs a day", expiryOf("1-day sport", "2026-06-15") === "2026-06-16",
    expiryOf("1-day sport", "2026-06-15"));
/* An unknown type must not be treated as permanent. A licence whose expiry
   the app cannot work out should read as a year, which is the common case,
   rather than never warning. */
chk("an unknown type falls back to a year",
    expiryOf("something else entirely", "2026-06-15") === "2027-06-15");

/* ------------------------------------------------------------------
   British Columbia: a licence year ending 31 March.
   ------------------------------------------------------------------ */
console.log("\n-- British Columbia --");
chk("annual freshwater bought in June ends the next 31 March",
    expiryOf("BC annual freshwater", "2026-06-15") === "2027-03-31",
    expiryOf("BC annual freshwater", "2026-06-15"));
chk("annual tidal bought in June ends the next 31 March",
    expiryOf("BC annual tidal waters", "2026-06-15") === "2027-03-31",
    expiryOf("BC annual tidal waters", "2026-06-15"));
/* The whole point. A licence bought inside January-to-March belongs to the
   licence year already running and dies at the end of that March, not a year
   later - so this is the case that Ontario arithmetic got wrong by eleven
   months. */
chk("one bought in February dies that same March, not a year later",
    expiryOf("BC annual freshwater", "2027-02-10") === "2027-03-31",
    expiryOf("BC annual freshwater", "2027-02-10"));
chk("one bought on 1 April runs the full year",
    expiryOf("BC annual freshwater", "2026-04-01") === "2027-03-31",
    expiryOf("BC annual freshwater", "2026-04-01"));
chk("one bought on 31 March expires that day",
    expiryOf("BC annual freshwater", "2027-03-31") === "2027-03-31",
    expiryOf("BC annual freshwater", "2027-03-31"));
chk("8-day freshwater runs eight days",
    expiryOf("BC 8-day freshwater", "2026-06-15") === "2026-06-23",
    expiryOf("BC 8-day freshwater", "2026-06-15"));
chk("1-day freshwater runs a day",
    expiryOf("BC 1-day freshwater", "2026-06-15") === "2026-06-16",
    expiryOf("BC 1-day freshwater", "2026-06-15"));
/* A short-term licence must not fall through to the licence-year branch, or
   a one-day licence bought in June would read as valid until March. */
chk("a short-term BC licence never lands on 31 March",
    !expiryOf("BC 1-day freshwater", "2026-06-15").endsWith("03-31"));

/* ------------------------------------------------------------------
   The warning bands, which is what any of this is for.
   ------------------------------------------------------------------ */
console.log("\n-- expired, expiring, valid --");
{
  const day = 86400000;
  const ago = (n) => iso(new Date(Date.now() - n * day));
  /* A 1-day licence bought two days ago has run out. */
  let st = on("1-day sport", ago(2));
  chk("a run-out licence reads expired", st.expired === true && st.soon === false,
      `expired ${st.expired}, soon ${st.soon}, days ${st.days}`);
  chk("...and says how long ago", st.days < 0, st.days);

  /* A 1-year licence bought 350 days ago has 15 days left. */
  st = on("1-year sport", ago(350));
  chk("a licence with a fortnight left reads expiring soon",
      st.expired === false && st.soon === true, `days ${st.days}`);

  /* A 1-year licence bought a month ago is simply valid. */
  st = on("1-year sport", ago(30));
  chk("a fresh licence reads valid", st.expired === false && st.soon === false, `days ${st.days}`);

  /* The band is 30 days, and the boundary matters because it is what the
     notification fires on. */
  st = on("1-year sport", ago(365 - 30));
  chk("thirty days out is still 'soon'", st.soon === true, `days ${st.days}`);
  st = on("1-year sport", ago(365 - 40));
  chk("forty days out is not", st.soon === false, `days ${st.days}`);
}

/* ------------------------------------------------------------------
   The panel offers a list that matches the arithmetic.

   Every option in the picker has to be a string the branch above recognises,
   or the app quietly dates it as a one-year Ontario licence. Both directions:
   an option with no branch, and a BC branch with no option.
   ------------------------------------------------------------------ */
console.log("\n-- the picker and the arithmetic agree --");
{
  const panel = src.slice(src.indexOf("function LicencePanel"));
  const choices = [...panel.slice(0, 4000).matchAll(/<Choice options=\{\[([\s\S]*?)\]\}/g)]
    .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  chk("both pickers were found", choices.length >= 10, choices.length + " options");

  const bc = choices.filter((c) => c.startsWith("BC "));
  chk("the BC picker offers the two annual licences",
      bc.includes("BC annual freshwater") && bc.includes("BC annual tidal waters"),
      bc.join(" / "));
  /* Every BC option dates to something other than the Ontario default. */
  for (const c of bc) {
    const e = expiryOf(c, "2026-06-15");
    chk(`"${c}" is dated by a BC rule`, e !== "2027-06-15", e);
  }
  /* And no Ontario option accidentally reads as BC. */
  for (const c of choices.filter((x) => !x.startsWith("BC "))) {
    const e = expiryOf(c, "2026-06-15");
    chk(`"${c}" is dated by an Ontario rule`, !e.endsWith("2027-03-31"), e);
  }
}

console.log(`\n=== LICENCE RESULT: ${pass} passed, ${fail} failed ===\n`);
if (fail) process.exit(1);
