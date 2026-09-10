/* DEAD-CODE AND DEAD-PROP CHECK.   node tools/dead-code.mjs

   Run it after any restructuring. The no-scroll dashboard rebuild left four
   components declared and rendered nowhere - and one of them, StatsCard, was
   the ONLY route to the stats screen, so the whole thing became unreachable
   without anything failing.

   Which declared components are never rendered.

   Written with no string-built regexes: a backslash inside a shell-passed
   string gets eaten somewhere in this pipeline, and the first version of this
   check silently matched NOTHING and reported every component as an orphan.
   Literal regex only, and indexOf for the scan. */
import fs from "fs";
const s = fs.readFileSync("src/App.jsx", "utf8");

const WORD = /[A-Za-z0-9]/;
const rendered = (name) => {
  const tag = "<" + name;
  let at = 0;
  while ((at = s.indexOf(tag, at)) !== -1) {
    const next = s[at + tag.length];
    if (next === undefined || !WORD.test(next)) return true;
    at += 1;
  }
  return false;
};

const declared = [...s.matchAll(/^function ([A-Z][A-Za-z0-9]*)\(/gm)].map((m) => m[1]);
const orphans = [...new Set(declared)].filter((c) => !rendered(c));

console.log(`${new Set(declared).size} function components declared`);
console.log("never rendered:", orphans.length ? orphans.join(", ") : "none");

/* Also: props destructured but never read in the body. */
const unusedProps = [];
const re = /^function ([A-Z][A-Za-z0-9]*)\(\{([^)]*)\}\)\s*\{/gm;
let m;
while ((m = re.exec(s)) !== null) {
  const name = m[1];
  const props = [...m[2].matchAll(/([a-zA-Z][a-zA-Z0-9]*)\s*(?:=[^,]*)?/g)]
    .map((x) => x[1])
    .filter((p) => p && !["true", "false", "null", "undefined"].includes(p));
  const start = m.index;
  const nextFn = s.indexOf("\nfunction ", start + 10);
  const body = s.slice(start, nextFn < 0 ? undefined : nextFn);
  const dead = props.filter((p) => {
    const pr = new RegExp("\\b" + p + "\\b", "g");
    return (body.match(pr) || []).length <= 1;
  });
  if (dead.length) unusedProps.push(`${name}: ${dead.join(", ")}`);
}
console.log("\nprops accepted but never read:");
console.log(unusedProps.length ? unusedProps.map((x) => "  " + x).join("\n") : "  none");
