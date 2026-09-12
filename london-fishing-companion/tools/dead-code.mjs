/* DEAD CODE: ORPHANED COMPONENTS, DEAD PROPS, UNREACHABLE BRANCHES.
       node tools/dead-code.mjs

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

/* Findings are counted now and the exit code reflects them. Until this run
   the tool printed and always exited 0, so it could only ever help somebody
   who remembered to run it AND read the output - which is not what caught
   the three things it has found. */
let problems = 0;

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
problems += orphans.length;

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
  if (dead.length) { unusedProps.push(`${name}: ${dead.join(", ")}`); problems += dead.length; }
}
console.log("\nprops accepted but never read:");
console.log(unusedProps.length ? unusedProps.map((x) => "  " + x).join("\n") : "  none");

/* ---------------- branches nested inside a branch that excludes them ----------------

   THE APPEARANCE PAGE WAS BLANK FOR THIS REASON.

   AppearancePanel and ShareQR ended up inside {group === "backup" && <>...</>},
   so choosing Appearance from Options rendered precisely nothing. An
   unreachable branch throws no errors, renders no wrong thing, and fails no
   test - the page is just empty - and it was a grouping script of my own that
   put them there.

   The shape is mechanical: a guard comparing some variable to one string,
   with another guard on the SAME variable comparing it to a different string
   somewhere inside its block. Both cannot hold, so the inner one is dead. */
{
  /* Comments out, string VALUES kept - the literal being compared is the
     whole point. An earlier version of this check matched its own comment
     describing the bug. */
  const clean = s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/([^:])\/\/[^\n]*/g, "$1");

  const guards = [...clean.matchAll(/([A-Za-z_$][\w$]*)\s*===\s*"([A-Za-z0-9_-]+)"\s*&&/g)]
    .map((m) => ({ v: m[1], val: m[2], at: m.index, end: m.index + m[0].length }));

  /* A guard nobody can find is a check that passes by doing nothing. */
  if (guards.length < 10) {
    console.log("\nunreachable branches:\n  ABORT: only " + guards.length +
      " guards found - the scanner is broken, not the file.");
    problems++;
  } else {
    const extentOf = (g) => {
      let i = g.end;
      while (i < clean.length && /\s/.test(clean[i])) i++;
      const close = { "(": ")", "{": "}", "[": "]" }[clean[i]];
      if (!close) return null;          /* a bare expression, not a block */
      let depth = 0;
      for (let j = i; j < clean.length; j++) {
        const c = clean[j];
        if (c === "(" || c === "{" || c === "[") depth++;
        else if (c === ")" || c === "}" || c === "]") { depth--; if (depth === 0) return [i, j]; }
      }
      return null;
    };

    const dead = [];
    for (const outer of guards) {
      const ext = extentOf(outer);
      if (!ext) continue;
      for (const inner of guards) {
        if (inner.at <= ext[0] || inner.at >= ext[1]) continue;
        if (inner.v !== outer.v || inner.val === outer.val) continue;
        const line = clean.slice(0, inner.at).split("\n").length;
        const outerLine = clean.slice(0, outer.at).split("\n").length;
        dead.push(`src/App.jsx:${line}  ${inner.v} === "${inner.val}" sits inside ` +
          `${outer.v} === "${outer.val}" from line ${outerLine} - it can never render`);
      }
    }
    problems += dead.length;
    console.log(`\nunreachable branches  (${guards.length} guards checked):`);
    console.log(dead.length ? dead.map((x) => "  " + x).join("\n") : "  none");
  }
}

console.log(problems
  ? `\n${problems} problem${problems === 1 ? "" : "s"}\n`
  : "\nclean\n");
process.exit(problems ? 1 : 0);
