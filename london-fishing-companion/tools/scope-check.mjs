#!/usr/bin/env node
/* ============================================================
   scope-check.mjs — find identifiers a component reads but never has.

   WHY THIS EXISTS

   SpeciesDetail read `zone` for months. It was not a parameter, there was no
   local by that name, and nothing at module scope declared it - so every tap
   on a fish in the encyclopedia threw a ReferenceError and whited out the
   whole app. It sat in committed code through six waves of work with the test
   suite green the entire time.

   Nothing could see it. esbuild assumes an unknown identifier is a global and
   bundles happily. Twenty-one suites checked the catalogue, the references,
   the bundle, the contrast and the service worker without ever rendering a
   record sheet, and a free variable is invisible to all of that - it only
   throws when somebody opens the thing.

   tests/test-sheets.mjs opens every kind of sheet by clicking now, which
   catches that one. But clicking cannot reach every branch: a warning that
   only renders for a region you have not downloaded, an error state, the
   fourth step of a wizard. This is the static half, and there is no eslint or
   parser in node_modules to run no-undef with.

   HOW IT WORKS

   It scans the esbuild-TRANSFORMED file, not the source, and that is the
   whole trick. Two earlier versions scanned src/App.jsx directly and both
   were useless:

     - scanning every identifier flagged all 74 components, because JSX tag
       names and attribute names are bare words to a text scanner, and JSX
       text is not a string literal so prose survived the stripper - the
       sentence "Anything you add sits alongside the built-in records" read as
       eleven undeclared variables;
     - scanning only JSX interpolation positions was quiet and correct, but
       blind to any read in plain JS. Renaming LocationsList's `region` prop
       left `s.region === region` free and the checker said clean.

   After the JSX transform, a tag name is a string literal and an attribute
   name is an object key. Strings get stripped and keys are excluded by the
   lookahead, so what is left to scan is exactly what should be: identifiers
   in expression position, in JSX and in plain JS alike.

   WHAT IT STILL GETS WRONG, DELIBERATELY

   Text scanning, not parsing, so scope is pooled per component rather than
   per block: every inner function's parameters and every local anywhere in
   the component counts as in scope throughout it. A name that is genuinely
   out of scope in one branch and declared in another is not flagged. That is
   the safe direction - a checker that cries wolf gets switched off - and the
   failure this exists to stop is a white screen, which is loud.

   Line numbers point into the transformed file and are not printed for that
   reason. A component name and an identifier name is enough to find it.

     node tools/scope-check.mjs
   ============================================================ */

/* The JS API, not the CLI. tools/build.mjs already learned this lesson for
   its define values - the shell mangles what it passes - and here the CLI
   route also failed outright with EINVAL on npx.cmd under Windows. The API
   takes the source as a string and hands back the transformed string, with no
   shell and no temp file in between. */
import esbuild from "esbuild";
import fs from "node:fs";

const FILES = ["src/App.jsx"];

/* Everything an identifier is allowed to be without being declared. */
const GLOBALS = new Set([
  /* JS built-ins */
  "undefined", "null", "true", "false", "NaN", "Infinity",
  "Object", "Array", "String", "Number", "Boolean", "Math", "JSON", "Date",
  "RegExp", "Error", "TypeError", "RangeError", "SyntaxError",
  "Map", "Set", "WeakMap", "WeakSet", "Promise", "Symbol", "Proxy", "Reflect",
  "BigInt", "Intl", "globalThis", "Function",
  "parseInt", "parseFloat", "isNaN", "isFinite", "structuredClone",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
  /* keywords and contextual keywords that read as words */
  "new", "typeof", "void", "delete", "await", "yield", "this", "super",
  "return", "if", "else", "for", "while", "switch", "case", "do", "try",
  "catch", "finally", "throw", "function", "class", "const", "let", "var",
  "in", "of", "instanceof", "default", "break", "continue",
  "async", "static", "get", "set", "from", "as", "export", "import",
  /* browser and platform */
  "window", "document", "navigator", "location", "history", "screen",
  "console", "fetch", "Request", "Response", "Headers", "URL",
  "URLSearchParams", "FormData", "Blob", "File", "FileReader", "AbortController",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback",
  "localStorage", "sessionStorage", "indexedDB", "caches", "crypto",
  "matchMedia", "getComputedStyle", "alert", "confirm", "prompt",
  "Notification", "Image", "Audio", "Event", "CustomEvent",
  "MouseEvent", "KeyboardEvent", "PointerEvent", "TouchEvent",
  "MutationObserver", "ResizeObserver", "IntersectionObserver",
  "performance", "atob", "btoa", "TextEncoder", "TextDecoder", "queueMicrotask",
  "Uint8Array", "Uint8ClampedArray", "Int8Array", "Uint16Array", "Int16Array",
  "Uint32Array", "Int32Array", "Float32Array", "Float64Array", "ArrayBuffer",
  "DataView", "HTMLElement", "Element", "Node", "NodeList", "DOMParser",
  "SVGElement", "OffscreenCanvas", "Path2D", "self", "process",
]);

let problems = 0;

/* ---------------- collectors ----------------

   Literal regexes only, never built from strings. A backslash inside a
   string-built regex gets eaten somewhere in this project's pipeline, and the
   first version of tools/dead-code.mjs matched NOTHING for exactly that
   reason and reported all 74 components as orphans. */

const names = (src, re, group = 1) =>
  new Set([...src.matchAll(re)].map((m) => m[group]).filter(Boolean));

/* `const x`, `let x`, `var x`. The trailing class admits ` of` and ` in` too,
   or every `for (const g of groups)` reads as an undeclared g. */
const SIMPLE_DECL = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?:[=;,)\n]|\bof\b|\bin\b)/g;
/* `const { a, b: c }` and `const [a, b]`. */
const PATTERN_DECL = /\b(?:const|let|var)\s*[[{]([^}\]]*)[}\]]/g;
/* And every LATER destructuring in the same declaration:
   `const [ah, am] = x, [bh, bm] = y` binds four names and the pattern above
   reaches only the first two. Not anchored to const, so it also picks up
   patterns this tool has no business reading - which is the safe direction,
   since a name wrongly believed to be in scope is a missed warning and not a
   false alarm. */
const ANY_PATTERN = /[[{]([^}\][{]*)[}\]]\s*=[^=]/g;
const FN_DECL = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
const CLASS_DECL = /\bclass\s+([A-Za-z_$][\w$]*)/g;
const CATCH_BINDING = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
const LABEL = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:for|while)\b/gm;
/* Parameter lists, pooled per component - see the note at the top. */
const ARROW_PARENS = /\(([^()]*)\)\s*=>/g;
const ARROW_BARE = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g;
const FN_EXPR_PARAMS = /\bfunction\s*[A-Za-z_$][\w$]*\s*\(([^()]*)\)|\bfunction\s*\(([^()]*)\)/g;

/* ---------------- strip strings and comments, keep ${...} ----------------

   A character scanner rather than regexes, because regexes cannot do this.
   The third version of this tool reported 304 free identifiers and every one
   was a word inside a TEMPLATE literal: `${n} trip${n === 1 ? "" : "s"} so
   far` scanned as `trip`, `so` and `far`. Regex-replacing "..." and '...'
   left every backtick string untouched, and after the JSX transform almost
   all of the app's prose lives in one.

   Template literals cannot be matched with a regex at all - `a ${`b ${c}`} d`
   nests - so this walks the file once, tracking what it is inside, and blanks
   every run of literal text while leaving the ${ } holes as live code. Escape
   sequences go with the text they are in, which is what stopped \xB7 from
   surviving as an identifier called xB7. */
function stripLiterals(src) {
  const out = Array.from(src);
  const blank = (i) => { if (out[i] !== "\n") out[i] = " "; };

  /* A stack, so a template inside a template's ${} hole is handled. */
  const stack = [];
  const top = () => stack[stack.length - 1];
  let i = 0;
  while (i < src.length) {
    const c = src[i], next = src[i + 1];
    const mode = top();

    if (mode === "line") {
      if (c === "\n") stack.pop(); else blank(i);
      i++; continue;
    }
    if (mode === "block") {
      if (c === "*" && next === "/") { blank(i); blank(i + 1); stack.pop(); i += 2; continue; }
      blank(i); i++; continue;
    }
    if (mode === '"' || mode === "'") {
      if (c === "\\") { blank(i); blank(i + 1); i += 2; continue; }
      if (c === mode) { blank(i); stack.pop(); i++; continue; }
      blank(i); i++; continue;
    }
    if (mode === "`") {
      if (c === "\\") { blank(i); blank(i + 1); i += 2; continue; }
      /* A hole: leave ${ and its contents alone, and push a brace context so
         the matching } pops back into the template. */
      if (c === "$" && next === "{") { stack.push("hole"); i += 2; continue; }
      if (c === "`") { blank(i); stack.pop(); i++; continue; }
      blank(i); i++; continue;
    }
    if (mode === "regex") {
      if (c === "\\") { blank(i); blank(i + 1); i += 2; continue; }
      if (c === "[") { stack.push("class"); blank(i); i++; continue; }
      if (c === "/") {
        blank(i); stack.pop(); i++;
        /* The FLAGS are part of the literal. Stopping at the closing slash
           left the i of /river|creek/i standing as an identifier called i. */
        while (i < src.length && /[dgimsuvy]/.test(src[i])) { blank(i); i++; }
        continue;
      }
      blank(i); i++; continue;
    }
    if (mode === "class") {
      if (c === "\\") { blank(i); blank(i + 1); i += 2; continue; }
      if (c === "]") { blank(i); stack.pop(); i++; continue; }
      blank(i); i++; continue;
    }

    /* Live code, including inside a ${} hole. */
    if (c === "/" && next === "/") { stack.push("line"); blank(i); blank(i + 1); i += 2; continue; }
    if (c === "/" && next === "*") { stack.push("block"); blank(i); blank(i + 1); i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") { stack.push(c); blank(i); i++; continue; }
    if (mode === "hole" && c === "}") { stack.pop(); i++; continue; }
    if (mode === "hole" && c === "{") { stack.push("hole"); i++; continue; }

    /* A regex literal, which has to be told apart from division. A slash
       starts a regex only where an operand cannot be - after an operator, an
       opening bracket, a comma, or the start of a statement. Getting this
       wrong the other way would blank half a line of real code, so it is
       deliberately conservative. */
    if (c === "/") {
      let j = i - 1;
      while (j >= 0 && /\s/.test(src[j])) j--;
      const prev = j >= 0 ? src[j] : "\n";
      if ("([{,;:=!&|?+-*%~^<>".includes(prev) || prev === "\n" ||
          /\b(?:return|typeof|case|in|of|new|delete|void|throw)$/.test(src.slice(Math.max(0, j - 9), j + 1))) {
        stack.push("regex"); blank(i); i++; continue;
      }
    }
    i++;
  }
  return out.join("");
}

function bindingsIn(list) {
  const out = new Set();
  const cleaned = String(list == null ? "" : list).replace(/=\s*[^,]*/g, "");
  for (const part of cleaned.split(",")) {
    const p = part.trim().replace(/^\.\.\./, "");
    if (!p) continue;
    const colon = p.indexOf(":");
    const chunk = colon >= 0 ? p.slice(colon + 1) : p;
    for (const m of chunk.matchAll(/[A-Za-z_$][\w$]*/g)) out.add(m[0]);
    /* A nested pattern - `{ a: { b } }` - keeps every word in the part. */
    if (/[[{]/.test(p)) for (const m of p.matchAll(/[A-Za-z_$][\w$]*/g)) out.add(m[0]);
  }
  return out;
}

/* ---------------- transform, then scan ---------------- */

for (const file of FILES) {
  let raw;
  try {
    raw = esbuild.transformSync(fs.readFileSync(file, "utf8"), {
      loader: "jsx",
      format: "esm",
      /* Nothing is minified or renamed: the identifiers ARE the subject. */
    }).code;
  } catch (e) {
    console.log(`\n  ${file}: esbuild could not transform it.\n  ${String(e.message || e)}`);
    problems++;
    continue;
  }
  console.log(`\n  ${file}  ->  ${(raw.length / 1024).toFixed(0)} KB transformed, ` +
    `${(raw.match(/createElement/g) || []).length} elements`);

  /* Strip comments and string literals. Template literals keep their ${...}
     holes, which are real code. */
  const src = stripLiterals(raw);

  /* The stripper doing nothing is indistinguishable from a file with no
     strings in it, and would make every word of prose read as code. */
  const litChars = raw.length - src.replace(/ /g, "").length -
    (raw.length - raw.replace(/ /g, "").length);
  if (litChars < raw.length * 0.1) {
    console.log(`  ABORT: the literal stripper blanked only ${litChars} characters of ` +
      `${raw.length} — it is broken, and every string in the file would scan as code.`);
    problems++;
    continue;
  }

  /* ---------------- module scope ---------------- */
  const moduleScope = new Set([
    ...names(src, /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm),
    ...names(src, /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm),
    ...names(src, /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm),
  ]);
  for (const m of src.matchAll(/^(?:export\s+)?(?:const|let|var)\s*[[{]([^}\]]*)[}\]]/gm)) {
    for (const n of bindingsIn(m[1])) moduleScope.add(n);
  }
  for (const m of src.matchAll(/^import\s+([^;]+?)\s+from/gm)) {
    for (const n of bindingsIn(m[1].replace(/[{}]/g, "").replace(/\*\s+as\s+/g, ""))) {
      moduleScope.add(n);
    }
  }

  /* A collector that has broken reports everything as broken. This tool's
     predecessor did exactly that. */
  if (moduleScope.size < 50) {
    console.log(`  ABORT: only ${moduleScope.size} module-scope names found — ` +
      "the collector is broken, not the file.");
    problems++;
    continue;
  }

  const starts = [...src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)];
  if (starts.length < 20) {
    console.log(`  ABORT: only ${starts.length} functions found — the splitter is broken.`);
    problems++;
    continue;
  }
  console.log(`  ${moduleScope.size} names at module scope, ${starts.length} functions\n`);

  let flagged = 0;
  for (let i = 0; i < starts.length; i++) {
    const name = starts[i][1];
    const from = starts[i].index;
    const to = i + 1 < starts.length ? starts[i + 1].index : src.length;
    const body = src.slice(from, to);

    const sigEnd = body.indexOf(") {");
    const sig = sigEnd < 0 ? "" : body.slice(body.indexOf("(") + 1, sigEnd);

    const inScope = new Set([
      ...GLOBALS, ...moduleScope, name,
      ...bindingsIn(sig.replace(/[{}[\]]/g, "")),
      ...names(body, SIMPLE_DECL),
      ...names(body, FN_DECL),
      ...names(body, CLASS_DECL),
      ...names(body, CATCH_BINDING),
      ...names(body, ARROW_BARE),
      ...names(body, LABEL),
    ]);
    for (const re of [PATTERN_DECL, ANY_PATTERN, ARROW_PARENS]) {
      for (const m of body.matchAll(re)) for (const n of bindingsIn(m[1])) inScope.add(n);
    }
    for (const m of body.matchAll(FN_EXPR_PARAMS)) {
      for (const n of bindingsIn(m[1] ?? m[2])) inScope.add(n);
    }
    /* Whole declaration lines, comma-split: `let a = 1, b = 2, c = 3` binds
       all three, and collecting only the first is why an earlier run flagged
       H, bestD and failed. */
    for (const m of body.matchAll(/\b(?:const|let|var)\s+([^;\n]*)/g)) {
      for (const part of m[1].split(",")) {
        const hit = part.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:=|$)/);
        if (hit) inScope.add(hit[1]);
      }
    }

    /* Every identifier in expression position: not after a dot (property
       access), not before a colon (object key or label). */
    const used = new Set();
    for (const m of body.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\b(?!\s*:)/gm)) {
      used.add(m[1]);
    }

    const free = [...used].filter((u) => !inScope.has(u)).sort();
    if (free.length) {
      flagged++;
      problems += free.length;
      console.log(`  ${name}: reads ${free.map((f) => "`" + f + "`").join(", ")} ` +
        "with nothing in scope by that name");
    }
  }
  console.log(`\n  ${starts.length} functions checked, ${flagged} with a free identifier`);
}


console.log(problems
  ? `\n  ${problems} free identifier${problems === 1 ? "" : "s"}. Each one throws a ` +
    "ReferenceError the moment something renders that line.\n"
  : "\n  clean — every identifier read in expression position has something in scope.\n");
process.exit(problems ? 1 : 0);
