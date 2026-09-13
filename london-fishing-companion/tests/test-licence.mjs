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

/* licencesOf and soonestLicence, lifted the same way. Both sit on top of
   licenceStatus, so they are evaluated with it in scope. */
const lift = (name) => {
  const a = src.indexOf("function " + name + "(");
  const b2 = src.indexOf("\n}", a);
  if (a < 0 || b2 < 0) { console.log("  FAIL  " + name + " is not where this test looks for it"); process.exit(1); }
  return src.slice(a, b2 + 2);
};
const [licencesOf, soonestLicence] =
  new Function(body + lift("licencesOf") + lift("soonestLicence") +
               "\nreturn [licencesOf, soonestLicence];")();

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
   Quebec: the same licence year as BC, but a 3-day rather than an 8-day.

   That difference is the whole reason these assertions exist. The branch
   used to test for "1-day" and "8-day" by name - BC's two - so Quebec's
   3-day matched neither and fell through to the licence-year arithmetic,
   which told somebody a three-day licence ran until the following 31 March.
   ------------------------------------------------------------------ */
console.log("");
console.log("-- Quebec --");
chk("annual freshwater bought in June ends the next 31 March",
    expiryOf("QC annual freshwater", "2026-06-15") === "2027-03-31",
    expiryOf("QC annual freshwater", "2026-06-15"));
chk("one bought in February dies that same March",
    expiryOf("QC annual freshwater", "2027-02-10") === "2027-03-31",
    expiryOf("QC annual freshwater", "2027-02-10"));
chk("3-day runs three days, not to the year end",
    expiryOf("QC 3-day freshwater", "2026-06-15") === "2026-06-18",
    expiryOf("QC 3-day freshwater", "2026-06-15"));
chk("1-day runs a day",
    expiryOf("QC 1-day freshwater", "2026-06-15") === "2026-06-16",
    expiryOf("QC 1-day freshwater", "2026-06-15"));
chk("no short-term Quebec licence lands on 31 March",
    !expiryOf("QC 3-day freshwater", "2026-06-15").endsWith("03-31") &&
    !expiryOf("QC 1-day freshwater", "2026-06-15").endsWith("03-31"));

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
  /* LICENCE_KINDS is the one table the pickers are built from, so it is the
     definition of "every type this app can offer". Reading it beats scraping
     the JSX, which was only ever a way of finding this.

     It used to read two <Choice options={[...]}> literals out of the panel.
     Those are gone: the panel walks province, then type, and builds both
     lists from the table. */
  const table = src.slice(src.indexOf("const LICENCE_KINDS"), src.indexOf("const ALL_LICENCE_TYPES"));
  const provinces = [...table.matchAll(/code: "([A-Z]{2})", group: "([^"]+)"/g)].map((m) => m[1]);
  const choices = [];
  for (const key of ["fresh", "salt"]) {
    for (const m of table.matchAll(new RegExp(key + ": \\[([^\\]]*)\\]", "g"))) {
      for (const x of m[1].matchAll(/"([^"]+)"/g)) choices.push(x[1]);
    }
  }
  chk("the licence table was found", choices.length >= 10,
      choices.length + " types across " + provinces.length + " provinces");
  chk("all three provinces are in it", provinces.join() === "ON,BC,QC", provinces.join());

  /* SALT WATER IS ITS OWN LIST, because it is its own licence with its own
     authority: in BC the tidal one is federal and the freshwater one is
     provincial, and holding the wrong one is fishing without a licence
     rather than a technicality. Ontario and Quebec carry no tidal list at
     all rather than an empty heading. */
  const saltLists = [...table.matchAll(/salt: \[([^\]]*)\]/g)];
  chk("salt water is listed separately, and only where it applies",
      saltLists.length === 1, saltLists.length + " province with tidal licences");
  chk("...and it is British Columbia's",
      saltLists.length === 1 && /BC annual tidal waters/.test(saltLists[0][1]),
      saltLists.length ? saltLists[0][1].trim() : "none");
  chk("...with a note saying why it is a separate document", /saltNote:/.test(table),
      "neither licence covers the other, and that is worth one sentence");

  /* WHICH PROVINCE A LICENCE BELONGS TO IS ITS PREFIX, NOT A LIST HERE.

     This block named BC directly, so when Quebec's three options arrived it
     asserted they were dated by the ONTARIO rule and failed two of them for
     being right. A test that has to be edited every time a province is added
     is a test that will be edited to agree with whatever the code does. The
     province is now read off the option itself. */
  const provinceOf = (c) => (/^([A-Z]{2}) /.exec(c) || [, "ON"])[1];
  const YEAR_END = ["BC", "QC"];   /* 1 April - 31 March, whenever bought */

  const bc = choices.filter((c) => provinceOf(c) === "BC");
  chk("the BC picker offers the two annual licences",
      bc.includes("BC annual freshwater") && bc.includes("BC annual tidal waters"),
      bc.join(" / "));
  chk("the Quebec picker is there too",
      choices.filter((c) => provinceOf(c) === "QC").length >= 2,
      choices.filter((c) => provinceOf(c) === "QC").join(" / "));

  for (const c of choices) {
    const p = provinceOf(c);
    const e = expiryOf(c, "2026-06-15");
    if (YEAR_END.includes(p)) {
      /* Either the licence year, or a short term counted in days. Never the
         Ontario default of a year from the day of purchase. */
      chk(`"${c}" is not dated by the Ontario rule`, e !== "2027-06-15", e);
      const term = /([0-9]+)-day/.exec(c);
      if (term) {
        const want = new Date(Date.UTC(2026, 5, 15 + Number(term[1])))
          .toISOString().slice(0, 10);
        chk(`"${c}" runs ${term[1]} day${term[1] === "1" ? "" : "s"}`, e === want, e);
      } else {
        chk(`"${c}" ends on 31 March`, e === "2027-03-31", e);
      }
    } else {
      chk(`"${c}" is dated by an Ontario rule`, !e.endsWith("2027-03-31"), e);
    }
  }
}

/* ------------------------------------------------------------------
   More than one licence.

   British Columbia runs two - a provincial freshwater one and a federal
   tidal one, neither valid for the other, with the boundary running through
   the middle of the Langley map - and the app held exactly one until now.
   The failure mode is silent and specific: a valid freshwater licence beside
   an expired tidal one reported that everything was fine, because every
   reader looked at the first record only.
   ------------------------------------------------------------------ */
console.log("");
console.log("-- more than one licence --");
{
  const main = { boughtOn: "2026-06-15", type: "1-year sport", notified: 0, extra: [] };
  chk("a phone with one licence lists one", licencesOf(main).length === 1);
  chk("an empty record is not a licence",
      licencesOf({ boughtOn: "", type: "1-year sport", extra: [] }).length === 0);
  chk("an extra with no date is not a licence either",
      licencesOf({ ...main, extra: [{ id: "x", type: "BC annual tidal waters", boughtOn: "" }] }).length === 1);

  const two = { ...main, extra: [{ id: "x", type: "BC annual tidal waters", boughtOn: "2026-06-15" }] };
  chk("two dated licences are both counted", licencesOf(two).length === 2);

  /* Ontario 1-year from 15 June 2026 runs to 2027-06-15; the BC one dies
     2027-03-31. The BC one is the warning worth giving. */
  const soon = soonestLicence(two);
  chk("the soonest is the one that actually runs out first",
      soon && soon.rec.type === "BC annual tidal waters",
      soon && soon.rec.type + " " + soon.st.expiry.toISOString().slice(0, 10));

  /* The whole point: an expired second licence must not be hidden by a valid
     first one. */
  const stale = { boughtOn: "2026-06-15", type: "1-year sport", notified: 0,
                  extra: [{ id: "x", type: "BC 1-day freshwater", boughtOn: "2020-06-15" }] };
  const st2 = soonestLicence(stale);
  chk("an expired extra is what gets reported, not the valid main one",
      st2 && st2.st.expired && st2.rec.id === "x",
      st2 && (st2.rec.type + ", expired " + st2.st.expired));

  /* And the reverse, so this is not just "always picks the extra". */
  const staleMain = { boughtOn: "2020-06-15", type: "1-year sport", notified: 0,
                      extra: [{ id: "x", type: "BC annual freshwater", boughtOn: "2026-06-15" }] };
  const st3 = soonestLicence(staleMain);
  chk("an expired main is reported when the extra is the good one",
      st3 && st3.st.expired && st3.rec.id === "main",
      st3 && st3.rec.type);

  chk("no licences at all is no status", soonestLicence({ boughtOn: "", type: "1-year sport" }) === null);
  chk("a record from before extras existed still works",
      licencesOf({ boughtOn: "2026-06-15", type: "1-year sport", notified: 0 }).length === 1,
      "no extra key at all");

  /* Every type the second-licence picker offers has to be one the arithmetic
     recognises, the same rule the single picker is held to. */
  /* The same properly-parsed list the block above built. This used to pull
     every quoted string out of the table and filter the province names back
     out by hand, which worked while the table held nothing else - it now also
     holds a card-number label per province and a sentence about the tidal
     licence, and those were being handed to the expiry arithmetic as if they
     were licence types. */
  const kindTable = src.slice(src.indexOf("const LICENCE_KINDS"), src.indexOf("const ALL_LICENCE_TYPES"));
  const offered = [
    ...[...kindTable.matchAll(/fresh: \[([^\]]*)\]/g)],
    ...[...kindTable.matchAll(/salt: \[([^\]]*)\]/g)],
  ].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  chk("the second-licence picker was found", offered.length >= 12, offered.length + " types");
  const unknown = offered.filter((t) => {
    const e = licenceStatus({ type: t, boughtOn: "2026-06-15" });
    /* An unrecognised type silently falls through to "one year from
       purchase", which is the Ontario default and wrong for nine of these. */
    const looksDefault = e && e.expiry.toISOString().slice(0, 10) === "2027-06-15";
    return looksDefault && !/^1-year|^3-year Outdoors|conservation/.test(t);
  });
  chk("every type it offers is one the arithmetic knows",
      unknown.length === 0, unknown.length ? unknown.join(", ") : "all " + offered.length);
}

console.log(`\n=== LICENCE RESULT: ${pass} passed, ${fail} failed ===\n`);
if (fail) process.exit(1);
