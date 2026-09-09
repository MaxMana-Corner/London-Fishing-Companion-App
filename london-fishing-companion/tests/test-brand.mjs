/* The app's mark against the approved brand masters.

   brand/README documents a two-cut rule: the full mark at 48px and up, the
   small one below, because the weave and line guides fill into a blob at
   favicon size. Only the small cut was ever ported into App.jsx, so every mark
   on every screen was the reduced one and nothing said so. Next to the
   installed home-screen icon - rasterised from the FULL cut - it read as a
   different logo, which is exactly how it was reported.

   Nothing here re-checks the artwork's shape. It checks that App.jsx is still
   drawing what brand/ says it should, and that the shipped PNGs are still the
   ones the rasteriser produced. Both are copies, and a copy with no test is a
   copy that drifts. */
import fs from 'fs';

let pass = 0, fail = 0;
const chk = (n, c, g) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}   got: ${g}`); } };

const APP = fs.readFileSync('src/App.jsx', 'utf8');

/* Path data, normalised: JSX writes the same geometry with different
   whitespace than the SVG file does, and the comparison is about the shape,
   not the formatting. */
const dsOf = (svg) => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
const appHas = (d) => APP.replace(/\s+/g, ' ').includes(d);

/* ---------- both cuts are actually in the app ---------- */
for (const [file, label] of [
  ['brand/creel-mark.svg', 'creel full'], ['brand/creel-mark-small.svg', 'creel small'],
  ['brand/fish-mark.svg', 'fish full'], ['brand/fish-mark-small.svg', 'fish small'],
]) {
  const ds = dsOf(fs.readFileSync(file, 'utf8'));
  chk(`${label} cut: master has paths to check`, ds.length > 0, ds.length);
  const missing = ds.filter((d) => !appHas(d));
  chk(`${label} cut: every path from ${file} is drawn by App.jsx`,
      missing.length === 0, missing.join(' | ') || 'none missing');
}

/* The rule itself, not just the presence of the paths. A build that shipped
   both cuts but never chose the full one would pass the check above. */
chk('App.jsx switches cuts on a size threshold',
    /MARK_FULL_AT\s*=\s*(\d+)/.test(APP), 'no MARK_FULL_AT');
const threshold = Number((APP.match(/MARK_FULL_AT\s*=\s*(\d+)/) || [])[1]);
chk('the threshold is the 48px the brand README specifies', threshold === 48, threshold);

/* The full cut is worth nothing if nothing ever asks for a mark that big. */
const sizes = [...APP.matchAll(/<(?:CreelMark|AppMark)[^>]*?\ssize=\{(\d+)\}/g)].map((m) => Number(m[1]));
chk('at least one mark is drawn at or above the threshold',
    sizes.some((n) => n >= threshold), sizes.join(', ') || 'no sized mark');

/* ---------- the shipped icons are the rasterised ones ---------- */
for (const f of ['favicon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
  const a = fs.readFileSync(f), b = fs.readFileSync('brand/' + f);
  chk(`${f} is byte-identical to brand/${f}`, a.equals(b), `${a.length} vs ${b.length} bytes`);
}

/* ---------- the colourways have not drifted from the source of truth ---------- */
const brand = JSON.parse(fs.readFileSync('brand/colourways.json', 'utf8'));

/* App.jsx keeps its own copy so the bundle has no runtime fetch. A second copy
   of a fact is a second thing that can be wrong. */
const block = (APP.match(/const COLOURWAYS = \[([\s\S]*?)\n\];/) || [])[1] || '';
const inApp = [...block.matchAll(/id:\s*"([^"]+)"[\s\S]*?ground:\s*"([^"]+)",\s*ink:\s*"([^"]+)"/g)]
  .map((m) => ({ id: m[1], ground: m[2], ink: m[3] }));

chk('App.jsx lists the same number of colourways as brand/',
    inApp.length === brand.colourways.length, `${inApp.length} vs ${brand.colourways.length}`);

for (const want of brand.colourways) {
  const got = inApp.find((c) => c.id === want.id);
  chk(`colourway ${want.id} is present in App.jsx`, !!got, 'missing');
  if (got) {
    chk(`colourway ${want.id} ground matches brand/`,
        got.ground.toUpperCase() === want.ground.toUpperCase(), `${got.ground} vs ${want.ground}`);
    chk(`colourway ${want.id} ink matches brand/`,
        got.ink.toUpperCase() === want.ink.toUpperCase(), `${got.ink} vs ${want.ink}`);
  }
}

/* The one the app falls back to when nothing is saved, which is what a new
   install gets and what the icon in the store listing has to match. */
const fallback = (APP.match(/loadValue\(K_COLOURWAY,\s*"([^"]+)"\)/) || [])[1];
chk('the stored-value fallback is brand/colourways.json\'s default',
    fallback === brand.default, `${fallback} vs ${brand.default}`);

const initial = (APP.match(/useState\("([^"]+)"\);\s*\n?[^\n]*\/\/[^\n]*colourway|const \[colourway, setColourwayState\] = useState\("([^"]+)"\)/) || [])
  .filter(Boolean).pop();
chk('the initial React state is that same default',
    initial === brand.default, `${initial} vs ${brand.default}`);

/* The first entry is what every "|| COLOURWAYS[0]" in the app resolves to. */
chk('COLOURWAYS[0] is the default, since the app falls back to it by index',
    inApp[0] && inApp[0].id === brand.default, inApp[0] ? inApp[0].id : 'empty');

/* ---------- both marks are offered, and both stay colourless ---------- */

/* Two marks, three colourways, independent of each other. A mark that exists
   in brand/ but is not offered in the app is the silent-omission bug wearing
   another hat - the same shape as CATALOG_KEYS counting five of six lists. */
for (const id of ['creel', 'fish']) {
  chk('MARKS offers ' + id, APP.includes('["' + id + '", "'), 'not listed in MARKS');
}
chk('the tab icon branches on which mark is chosen',
    APP.includes('mark === "fish"'), 'favicon does not look at the mark');
chk('the saved mark falls back to the creel',
    APP.includes('loadValue(K_MARK, "creel")'), 'no K_MARK fallback');

for (const f of ['brand/creel-mark.svg', 'brand/creel-mark-small.svg',
                 'brand/fish-mark.svg', 'brand/fish-mark-small.svg']) {
  const svg = fs.readFileSync(f, 'utf8');
  const body = svg.replace(/<!--[\s\S]*?-->/g, '');
  chk(`${f} hard-codes no colour`, !/#[0-9a-fA-F]{3,6}\b/.test(body),
      (body.match(/#[0-9a-fA-F]{3,6}\b/g) || []).join(', '));
  chk(`${f} paints with currentColor`, body.includes('currentColor'), 'none');
}

console.log(`\n=== BRAND RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
