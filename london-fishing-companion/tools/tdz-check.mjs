/* tdz-check.mjs — a hook that depends on something declared below it.
   ============================================================

   THIS PROJECT HAS SHIPPED THIS BUG TWICE.

   useCallback's and useMemo's BODY does not run at definition time. Their
   DEPENDENCY ARRAY does. So this:

       const locateMe = useCallback(() => { ... }, [allSpots, region]);
       ...500 lines...
       const allSpots = useMemo(() => { ... }, [catalog.spots]);

   throws on the first render, not the first call — "Cannot access 'Ze'
   before initialization" out of a minified bundle, which names neither the
   variable nor the line. The second time it happened it took 143 assertions
   across twelve suites down at once, every one of them reporting the same
   useless thing: nothing rendered.

   WHY scope-check CANNOT SEE IT. That tool asks whether a name is in scope,
   and these names are: `const` is hoisted, it is simply not initialised
   until its line runs. "In scope but not yet readable" is exactly the gap
   between the two tools, and it is why this one exists.

   WHAT IT CHECKS. Inside each function, every identifier named in a hook's
   dependency array must be declared at or above the line of that hook. It
   works on the SOURCE rather than the bundle, because the bundle's minified
   names are the reason the runtime error is unreadable.
   ============================================================ */
import fs from "fs";

const FILES = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const TARGETS = FILES.length ? FILES : ["src/App.jsx"];

let problems = 0, checked = 0, hooks = 0;

for (const file of TARGETS) {
  if (!fs.existsSync(file)) { console.log("  ! no such file: " + file); problems++; continue; }
  const lines = fs.readFileSync(file, "utf8").split("\n");

  /* SEGMENTED BY FUNCTION, which the first version was not - and comparing a
     hook against every declaration in the file gave twenty false positives
     against one real finding. A `here` inside SpotsScreen is not the root
     component's `here`.

     A function starts at a line beginning `function Name(` in column zero and
     runs until the next one. That is exactly how this codebase is written, and
     a nested helper inside one of them is still inside that function's body,
     so the boundaries hold. */
  const funcStart = [];
  lines.forEach((l, i) => { if (/^function [A-Za-z_$][\w$]*\s*\(/.test(l)) funcStart.push(i); });
  const funcOf = (i) => {
    let at = -1;
    for (const f of funcStart) { if (f <= i) at = f; else break; }
    return at;
  };

  /* name -> { line, func } for the FIRST declaration of each name in each
     function. Keyed on both, so two functions may each have a `here`. */
  const declAt = new Map();      /* "func:name" -> line (1-based) */
  const keyFor = (fn, name) => fn + ":" + name;
  const remember = (i, name) => {
    const k = keyFor(funcOf(i), name);
    if (!declAt.has(k)) declAt.set(k, i + 1);
  };
  lines.forEach((l, i) => {
    const m = /^(\s*)(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(l);
    if (m) remember(i, m[2]);
    /* Destructuring: const [a, setA] = useState(...) */
    const d = /^(\s*)(?:const|let|var)\s+\[([^\]]+)\]\s*=/.exec(l);
    if (d) for (const n of d[2].split(",").map((x) => x.trim()).filter(Boolean)) {
      if (/^[A-Za-z_$][\w$]*$/.test(n)) remember(i, n);
    }
    const o = /^(\s*)(?:const|let|var)\s+\{([^}]+)\}\s*=/.exec(l);
    if (o) for (const raw of o[2].split(",")) {
      const n = raw.split(":").pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) remember(i, n);
    }
  });

  /* Every hook dependency array, and the line it sits on. The array is the
     last thing in the call, so it is matched on the closing `}, [ ... ]);`
     which is how every one of them in this codebase is written. */
  lines.forEach((l, i) => {
    const m = /^\s*\}, \[([^\]]*)\]\);?\s*$/.exec(l);
    if (!m) return;
    hooks++;
    const deps = m[1].split(",").map((x) => x.trim()).filter(Boolean);
    for (const dep of deps) {
      /* Only the root identifier matters: `catalog.spots` depends on
         `catalog`, and `JSON.stringify(x)` on `x`. */
      const root = /^([A-Za-z_$][\w$]*)/.exec(dep.replace(/^[^A-Za-z_$]*/, ""));
      if (!root) continue;
      const name = root[1];
      if (["JSON", "Math", "Object", "Array", "String", "Number", "Boolean",
           "Date", "window", "document", "navigator", "true", "false", "null"].includes(name)) continue;
      /* Only a declaration in the SAME function can be a hazard. One from an
         outer scope is already initialised by the time this function runs, and
         one that is not found at all is an import or a prop. */
      const at = declAt.get(keyFor(funcOf(i), name));
      if (at == null) continue;
      checked++;
      if (at > i + 1) {
        problems++;
        console.log(`  ! ${file}:${i + 1} depends on \`${name}\`, which is not declared until line ${at}`);
        console.log(`      the dependency array runs at definition time, so this throws on the first render`);
      }
    }
  });
}

console.log("");
console.log(`  ${hooks} hook dependency arrays, ${checked} local dependencies checked`);
if (problems) {
  console.log(`\n  ${problems} hook${problems === 1 ? "" : "s"} depends on something declared below it.`);
  console.log("  Move the hook below what it needs, or the app will not render at all.\n");
  process.exit(1);
}
console.log("\n  clean — no hook depends on anything declared below it.\n");
