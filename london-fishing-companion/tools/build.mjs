/* Builds app.js. Exists because the command line could not be trusted.

   The build used to be an esbuild invocation in package.json carrying
   --define:process.env.NODE_ENV="production". Those inner quotes have to
   survive the shell to reach esbuild as a STRING; if they do not, esbuild
   receives the bare identifier `production` and warns, but still builds - and
   what it builds is React in DEVELOPMENT mode.

   Run from cmd.exe the quotes survived. Run from Git Bash on the same machine
   they did not, and app.js came out at 772 KB instead of 463 KB: a third of a
   megabyte of extra download, the slow development reconciler, and dev-only
   warnings, shipped to every user. Nothing failed. The only visible symptom
   was a file size nobody was looking at, and a warning in a wall of output.

   The esbuild JS API takes the value as an actual JavaScript string, so there
   is no shell in the path to get it wrong. That is the whole point of this
   file.

   Usage:  node tools/build.mjs [--check]
           --check builds and verifies, but writes nothing.
*/

import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "app.js");
const check = process.argv.includes("--check");

const result = await esbuild.build({
  entryPoints: [path.join(ROOT, "src/main.jsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2019",
  loader: { ".jsx": "jsx" },
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: OUT,
  write: !check,
  logLevel: "warning",
});

const code = check
  ? result.outputFiles[0].text
  : fs.readFileSync(OUT, "utf8");

/* Assert the define actually took. A production React bundle does not carry
   its development warning strings; a development one does. This is the check
   that would have caught the shell-quoting bug immediately, so it runs on
   every build rather than living in a test somebody might not run. */
const devTells = [
  "Warning: ReactDOM.render",
  "react-dom.development",
  "This is not supported in production",
];
const found = devTells.filter((t) => code.includes(t));
const kb = (Buffer.byteLength(code) / 1024).toFixed(1);

if (found.length) {
  console.error(`ABORTED: this is a DEVELOPMENT React bundle (${kb} KB).`);
  console.error(`  found: ${found.join(", ")}`);
  console.error("  process.env.NODE_ENV did not reach esbuild as the string \"production\".");
  process.exit(1);
}

/* A production bundle that suddenly gains 200 KB is the same bug wearing a
   different hat, so put a ceiling on it too.

   Secondary to the string check above, and deliberately so. The dev bundles
   this is meant to catch have run from 633 KB to 772 KB, which overlaps what
   a legitimately grown production bundle can reach - so size alone cannot
   separate them, and the strings can. The ceiling is here to make a sudden
   jump visible, not to cap the app.

   Raised from 600 KB, which the app grew into honestly: it was ~465 KB when
   that number was written and is ~600 KB now, so the guard had stopped
   meaning "something is wrong" and started meaning "the app got bigger". If
   this fires, check the reported size against the last build before assuming
   a bug. */
if (Buffer.byteLength(code) > 700 * 1024) {
  console.error(`ABORTED: app.js is ${kb} KB, well past the ~600 KB a production build currently runs to.`);
  console.error("  Either a large dependency arrived, or NODE_ENV is not being applied.");
  process.exit(1);
}

console.log(`app.js  ${kb} KB  production${check ? "  (checked, not written)" : ""}`);
