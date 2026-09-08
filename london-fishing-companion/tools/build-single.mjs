/* build-single.mjs — the whole app as one HTML file.

   WHY THIS FILE EXISTS AT ALL

   standalone/ held a single-file build that nothing regenerated. It was made
   by hand, and by the time anyone looked it was five days and roughly a dozen
   features stale: no Tactics, no encyclopedia hub, no modular tiles, no
   record links, no QR code, no dashboard. tests/test-single.mjs passed 23
   assertions against it the whole time, because every one of them asked
   whether the file was well-formed and none asked whether it was CURRENT.

   A build artifact with no build script is a copy that drifts. So the build
   script is the fix, and the freshness check in the test is the other half.

   WHAT IT IS FOR

   One file that works from a Downloads folder with no server, no install and
   no connection - handed over by cable, Bluetooth or a memory stick. That is
   why everything is inlined: an external reference is a file that will not be
   there when it matters.

     node tools/build-single.mjs
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "standalone", "Creel.html");

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const b64 = (p) => fs.readFileSync(path.join(ROOT, p)).toString("base64");

const app = read("app.js");
if (!app.length) throw new Error("app.js is empty - run the build first");

/* The manifest goes in as a data URI so Android can still offer to install
   from a file:// page. Its icons have to be data URIs too, or the installed
   app has no icon. */
const manifest = JSON.parse(read("manifest.webmanifest"));
manifest.start_url = ".";
manifest.icons = [
  { src: "data:image/png;base64," + b64("icon-192.png"), sizes: "192x192", type: "image/png" },
  { src: "data:image/png;base64," + b64("icon-512.png"), sizes: "512x512", type: "image/png" },
  { src: "data:image/png;base64," + b64("icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/* No service worker in here. It could not register from file:// anyway, and
   a failed registration in the console is a worry for the user with nothing
   they can do about it. The whole app is already in the file. */
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5" />
<title>${manifest.name}</title>
<meta name="description" content="${manifest.description}" />
<meta name="theme-color" content="${manifest.theme_color}" />
<meta name="color-scheme" content="light" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="${manifest.short_name}" />
<meta name="mobile-web-app-capable" content="yes" />
<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,${b64("favicon-32.png")}" />
<link rel="apple-touch-icon" href="data:image/png;base64,${b64("icon-180.png")}" />
<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}" />
<style>
  html,body{margin:0;padding:0;background:${manifest.background_color};-webkit-text-size-adjust:100%}
  body{overscroll-behavior-y:none}
  #root{min-height:100vh;min-height:100dvh}
  #boot{padding:60px 20px;font:16px system-ui,-apple-system,'Segoe UI',sans-serif;color:#59654F}
</style>
</head>
<body>
<div id="root"><div id="boot">Loading ${manifest.name}…</div></div>
<script>
${app}
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

/* The assertions that matter, run here rather than only in the test, because
   this file is handed to a person directly and there is no server to catch a
   mistake afterwards. */
const problems = [];
if (/(src|href)="https?:\/\//.test(html)) problems.push("it references something over the network");
if ((html.match(/<\/script/g) || []).length !== 1) problems.push("more than one closing script tag");
if (!html.includes("apple-touch-icon")) problems.push("no apple-touch-icon");
if (html.length < 200_000) problems.push("suspiciously small - is app.js built?");

if (problems.length) {
  console.error("ABORTED: " + problems.join("; "));
  process.exit(1);
}

console.log(`standalone/Creel.html  ${(html.length / 1024).toFixed(0)} KB  self-contained`);

/* The old name, left behind on purpose if it is still there: somebody may
   have it bookmarked or sitting in a Downloads folder. Say so rather than
   silently leaving two files that differ. */
const OLD = path.join(ROOT, "standalone", "LondonFishing.html");
if (fs.existsSync(OLD)) {
  console.log("note   standalone/LondonFishing.html is the old name and is now stale.");
  console.log("       Delete it once nobody is relying on the filename.");
}
