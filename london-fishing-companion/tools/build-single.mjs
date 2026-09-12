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

/* ---------------- the map, carried in the page ----------------

   THIS FILE NEVER HAD A WORKING MAP, WHICH IS MOST OF WHAT IT IS FOR.

   Everything else was inlined - the icons, the manifest, the whole app - and
   the map was still three fetches: the index, the region and the city's
   spots. A file:// document cannot fetch a sibling file, so all three failed
   and the map page said "the install did not finish" about a file with
   nothing to finish. The one build meant to work with no server was the one
   build whose map could not load.

   Only the bundled region goes in. That is the same rule the service worker
   follows for the hosted app: London ships, everything else is a download
   you choose. A download is not a thing this file can offer anyway, so what
   is embedded is exactly what the hosted app would have without a network.

   It costs about 1.7 MB on a 750 KB file. Worth it: the alternative is a
   fishing app with no map, handed over on a memory stick to somebody who
   cannot then get one.

   Written as JSON in a script tag rather than as a JS literal, so nothing
   has to be escaped and a syntax error in half a megabyte of coordinates is
   impossible. The only sequence that could break out of it is a closing
   script tag, which cannot occur in this data - and it is checked for below
   rather than assumed. */
const BUNDLED = "london-on";
const mapIndex = JSON.parse(read("map/index.json"));
const mapRegion = JSON.parse(read(`map/${BUNDLED}.json`));

/* The index lists every region, including ones this file cannot fetch. Left
   whole on purpose: the picker then still says the other cities exist and
   what they would cost, which is true and useful, and choosing one lands on
   the download panel that explains itself. Trimming it to one region would
   hide the rest of the app. */
const embeddedMap = {
  note: "Map data for the bundled region, carried in this file because a file:// page cannot fetch. See tools/build-single.mjs.",
  index: mapIndex,
  regions: { [BUNDLED]: mapRegion },
  spots: {},
};

/* London's spots are in app.js, so there is no pack for it - but a future
   bundled region might have one, and shipping the map without the spots
   would be the same hole one level down. */
const packPath = `map/${BUNDLED}-spots.json`;
if (fs.existsSync(path.join(ROOT, packPath))) {
  embeddedMap.spots[BUNDLED] = JSON.parse(read(packPath));
}

const mapJSON = JSON.stringify(embeddedMap);
if (/<\/script/i.test(mapJSON)) {
  throw new Error("ABORTED: the map data contains a closing script tag and would break out of its block");
}

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
<meta name="color-scheme" content="light dark" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="${manifest.short_name}" />
<meta name="mobile-web-app-capable" content="yes" />
<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,${b64("favicon-32.png")}" />
<link rel="apple-touch-icon" href="data:image/png;base64,${b64("icon-180.png")}" />
<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}" />
<style>
  :root{ --shell-ground:${manifest.background_color} }
  @media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){ --shell-ground:#171A15 } }
  :root[data-theme="dark"]{ --shell-ground:#171A15 }
  html,body{margin:0;padding:0;background:var(--shell-ground);-webkit-text-size-adjust:100%}
  body{overscroll-behavior-y:none}
  #root{min-height:100vh;min-height:100dvh}
  #boot{padding:60px 20px;font:16px system-ui,-apple-system,'Segoe UI',sans-serif;color:#59654F}
</style>
</head>
<body>
<div id="root"><div id="boot">Loading ${manifest.name}…</div></div>
<script type="application/json" id="lfc-map">${mapJSON}</script>
<script>
/* Parsed before the app runs, so the first thing the map page asks for is
   already here. A failure leaves the global unset and the app falls back to
   fetching, which is what the hosted build does anyway - so a bad data block
   costs the map, not the app. */
try {
  window.__LFC_MAP__ = JSON.parse(document.getElementById("lfc-map").textContent);
} catch (e) {
  console.error("the embedded map could not be read", e);
}
</script>
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
/* Three blocks now - the map data, the line that parses it, and the app -
   where it used to be one.

   CLOSERS, not openers, and that was already the right call before I tried
   to improve it. React's own source contains the literal
   `e.innerHTML="<script><\/script>"`, with the opener bare and the closer
   escaped precisely so the HTML parser does not end the block there. So an
   opener count reads 4 and means nothing, while a closer count reads 3 and
   proves the thing actually worth proving: that no script block ends before
   it was meant to. */
const closes = (html.match(/<\/script/g) || []).length;
if (closes !== 3) problems.push(`expected 3 script blocks, found ${closes} closing tags`);
if (!html.includes("apple-touch-icon")) problems.push("no apple-touch-icon");
if (html.length < 200_000) problems.push("suspiciously small - is app.js built?");
/* The map is the reason this file is worth its size. Missing it is not a
   smaller build, it is the build that was broken for months. */
if (!html.includes('id="lfc-map"')) problems.push("the map data block is missing");
if (!html.includes(`"${BUNDLED}"`)) problems.push(`no ${BUNDLED} data in the map block`);
if (html.length < 1_500_000) problems.push("too small to contain a region - is the map data in?");

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
