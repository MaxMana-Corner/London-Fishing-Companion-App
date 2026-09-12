#!/usr/bin/env node
/* ============================================================
   props-check.mjs — the props handshake, in both directions.

   WHAT IT ADDS TO tools/dead-code.mjs

   That one finds a prop a component ACCEPTS and never reads. This finds the
   two mismatches it cannot see:

     passed but not accepted   The caller believes it is configuring
                               something and the component never receives it.
                               LicenceCard took a `compact` it ignored, so the
                               dashboard asked for a small card and rendered
                               the full one inside a no-scroll budget. And
                               GuideScreen was still being handed
                               onOpenRecord after the parameter was removed.

     accepted but never passed  A parameter whose default is the only value it
                               ever takes. Either the prop is noise, or a call
                               site was meant to pass it and does not - which
                               is exactly how `regs` would fall back to Zone
                               16 in silence.

   HOW

   It reads the esbuild-TRANSFORMED file, same as tools/scope-check.mjs, and
   for the same reason. Scanning JSX source directly cannot tell an attribute
   of the element from an attribute of a nested element inside a prop value:
   `<LegendRow swatch={<span style={{...}} />} />` reported LegendRow as being
   passed `style`. After the transform each element is its own
   createElement(Name, { ... }) call and the props are just that call's object
   keys, which is unambiguous.

   Boolean shorthand is handled for free - `<MapPanel asTab ... />` becomes
   `{ asTab: true, ... }` - and the earlier source-scanning version missed it
   and claimed nobody passed it.

     node tools/props-check.mjs
   ============================================================ */

import esbuild from "esbuild";
import fs from "node:fs";

const FILES = ["src/App.jsx"];

/* React reads these off the element itself; a component never destructures
   them and being passed one is not a mismatch. */
const RESERVED = new Set(["key", "ref", "children", "dangerouslySetInnerHTML"]);

let problems = 0;
const bad = (m) => { problems++; console.log("  ! " + m); };

for (const file of FILES) {
  const source = fs.readFileSync(file, "utf8");
  let code;
  try {
    code = esbuild.transformSync(source, { loader: "jsx", format: "esm" }).code;
  } catch (e) {
    console.log(`  ${file}: esbuild could not transform it — ${e.message || e}`);
    problems++;
    continue;
  }

  /* ---------------- what each component accepts ----------------

     From the SOURCE, not the transform, because a destructured parameter
     list survives the transform unchanged and the source is where a human
     will go to look. Multi-line signatures included. */
  const accepts = new Map();
  for (const m of source.matchAll(/^(?:export\s+)?function\s+([A-Z][\w$]*)\s*\(\{([\s\S]*?)\}\)\s*\{/gm)) {
    const set = new Set();
    /* Drop default values before splitting, or `photos = {}` contributes a
       phantom prop from inside the braces. */
    for (const part of m[2].replace(/=\s*\{[^{}]*\}/g, "").replace(/=\s*\[[^[\]]*\]/g, "").split(",")) {
      const hit = part.trim().match(/^([A-Za-z_$][\w$]*)/);
      if (hit) set.add(hit[1]);
    }
    accepts.set(m[1], set);
  }
  if (accepts.size < 20) {
    console.log(`  ABORT: only ${accepts.size} destructured signatures parsed — ` +
      "the parser is broken, not the file.");
    problems++;
    continue;
  }

  /* ---------------- what each call site passes ----------------

     createElement(Name, { a: 1, b: 2 }, ...children). Only the top level of
     that object literal counts, so a brace depth counter walks it. */
  const passes = new Map();     /* name -> Map(prop -> count) */
  const callCount = new Map();
  const CALL = /createElement\(\s*([A-Z][\w$]*)\s*,\s*/g;
  for (const m of code.matchAll(CALL)) {
    const name = m[1];
    if (!accepts.has(name)) continue;     /* not one of ours */
    callCount.set(name, (callCount.get(name) || 0) + 1);
    let i = m.index + m[0].length;
    if (code[i] !== "{") continue;        /* null props, or a spread */
    /* Collect keys at depth 1 only. */
    let depth = 0;
    const keys = new Set();
    let expectKey = false;
    for (; i < code.length; i++) {
      const c = code[i];
      if (c === "{" || c === "[" || c === "(") { depth++; if (depth === 1) expectKey = true; continue; }
      if (c === "}" || c === "]" || c === ")") { depth--; if (depth === 0) break; continue; }
      if (depth !== 1) continue;
      if (c === ",") { expectKey = true; continue; }
      if (/\s/.test(c)) continue;
      if (expectKey) {
        const rest = code.slice(i);
        /* SHORTHAND IS THE COMMON CASE, NOT THE EXCEPTION.

           esbuild emits `{ catalog, log, lic }` wherever the prop name and
           the variable name agree, which in this file is most of them.
           Requiring a colon found 139 "mismatches", almost all of them props
           that were being passed perfectly well in shorthand form. So a key
           is a name followed by a colon, a comma, or the closing brace. */
        const k = rest.match(/^(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*(?::|,|\})/);
        if (k) keys.add(k[1] || k[2]);
        /* Either way, stop looking until the next comma: an identifier inside
           a value must not be read as a key. */
        expectKey = false;
      }
    }
    if (!passes.has(name)) passes.set(name, new Map());
    const seen = passes.get(name);
    for (const k of keys) seen.set(k, (seen.get(k) || 0) + 1);
  }

  console.log(`\n  ${file}: ${accepts.size} components, ` +
    `${[...callCount.values()].reduce((a, b) => a + b, 0)} call sites\n`);

  for (const [name, accepted] of accepts) {
    const calls = callCount.get(name) || 0;
    if (!calls) continue;                 /* dead-code.mjs owns that case */
    const passed = passes.get(name) || new Map();

    for (const [p, n] of passed) {
      if (RESERVED.has(p)) continue;
      if (!accepted.has(p)) {
        bad(`${name} is passed \`${p}\` at ${n} of ${calls} call site${calls === 1 ? "" : "s"} ` +
          "and does not accept it — the caller thinks it is configuring something that never arrives");
      }
    }
    for (const a of accepted) {
      /* children is the third argument to createElement, never a key in
         the props object, so it is never "passed" by this measure. */
      if (RESERVED.has(a)) continue;
      if (!passed.has(a)) {
        bad(`${name} accepts \`${a}\` and no call site passes it — ` +
          "either the prop is noise or a call site was meant to and does not");
      }
    }
  }
}

console.log(problems
  ? `\n  ${problems} mismatch${problems === 1 ? "" : "es"}\n`
  : "\n  clean — every prop passed is accepted, and every prop accepted is passed.\n");
process.exit(problems ? 1 : 0);
