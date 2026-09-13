/* WHAT THIS SUITE IS FOR: every bait in the app has a picture, and no two
   baits have the SAME picture.

   It used to read `LURE_ART` out of App.jsx — a table that had been dead since
   src/baitart.jsx took over the drawing, so the suite was proving a property
   of a map nothing rendered from. It passed for months while eight flies had
   no drawing at all, and then reported the eight as missing from the dead map
   rather than from the live one. The dead module is gone; this now reads the
   dispatch that actually runs:

       const draw = ART[b.id] || BY_KIND[b.kind] || BY_KIND["Soft plastic"];

   Keep it reading baitart.jsx. If a second art table ever appears, the answer
   is to delete one of them, not to test both. */
import fs from 'fs';
const A = fs.readFileSync('src/App.jsx', 'utf8');
const B = fs.readFileSync('src/baitart.jsx', 'utf8');
let pass = 0, fail = 0;
const chk = (n, c, g) => { if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ''}`); } else { fail++; console.log(`  FAIL  ${n}  ${g || ''}`); } };

console.log('\n=== BAIT ART COVERAGE ===\n');

/* Pull the top-level keys, and the body of each, out of an object literal. */
function entries(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  const st = src.indexOf('{', i);
  let d = 0, en = -1;
  for (let j = st; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) { en = j; break; } }
  }
  const block = src.slice(st, en);
  const out = new Map();
  d = 0;
  let key = null, from = 0;
  for (const m of block.matchAll(/[{}]|^\s{2}"?([A-Za-z_][\w ]*)"?:/gm)) {
    if (m[0] === '{' || m[0] === '}') { d += m[0] === '{' ? 1 : -1; continue; }
    if (d !== 1 || !m[1]) continue;
    if (key) out.set(key, block.slice(from, m.index));
    key = m[1].trim(); from = m.index + m[0].length;
  }
  if (key) out.set(key, block.slice(from));
  return out;
}

const ids = [...A.matchAll(/^\s*\{ id: "([a-z]+)", name: "[^"]+", kind:/gm)].map(m => m[1]);
const kinds = [...new Set([...A.matchAll(/^\s*\{ id: "[a-z]+", name: "[^"]+", kind: "([^"]+)"/gm)].map(m => m[1]))];
chk('Found the BAITS list', ids.length > 0, `${ids.length} baits, ${kinds.length} kinds`);

const ART = entries(B, 'const ART = {');
const BY_KIND = entries(B, 'const BY_KIND = {');
chk('Found both art tables', !!ART && !!BY_KIND, ART && BY_KIND ? `${ART.size} drawings, ${BY_KIND.size} fallbacks` : 'missing');

/* THE POINT OF THE SUITE. A bait with no entry here is not blank — it falls
   through to its kind's generic drawing, which is worse than blank, because
   a Parachute Adams and a Clouser Minnow then look like the same object. */
const undrawn = ids.filter(i => !ART.has(i));
chk('Every bait has its own drawing', undrawn.length === 0, undrawn.join(', ') || 'all drawn');

/* Copy-paste check: two keys, one picture. Whitespace-normalised so that
   reformatting does not read as a duplicate, and vice versa. */
const norm = s => s.replace(/\s+/g, ' ').trim();
const seen = new Map(), dupes = [];
for (const [k, v] of ART) {
  const n = norm(v);
  if (seen.has(n)) dupes.push(`${seen.get(n)}+${k}`); else seen.set(n, k);
}
chk('No two drawings are identical', dupes.length === 0, dupes.join('; ') || 'all distinct');

/* Every drawing should say something under it. The caption is where the one
   thing worth knowing about that lure lives. */
const uncaptioned = [...ART].filter(([, v]) => !/<text /.test(v)).map(([k]) => k);
chk('Every drawing is captioned', uncaptioned.length === 0, uncaptioned.join(', ') || `${ART.size} captions`);

/* Fallbacks are for baits the USER adds, which have a kind but no id we know. */
const noFallback = kinds.filter(k => !BY_KIND.has(k));
chk('Every kind has a fallback drawing', noFallback.length === 0, noFallback.join(', ') || `${kinds.length} kinds covered`);
chk('Fallback of last resort exists', /BY_KIND\["Soft plastic"\]/.test(B));
chk('The dispatch is id, then kind, then last resort',
    /ART\[b\.id\]\s*\|\|\s*BY_KIND\[b\.kind\]\s*\|\|\s*BY_KIND\[/.test(B));

/* The superseded App.jsx module must not come back. */
chk('Only one art module', !/const LURE_ART|lureArtType/.test(A));

/* Wired into the UI everywhere it matters. */
chk('Shown in the bait list', /<BaitArt b=\{b\} h=\{\d+\} \/>/.test(A), 'height-agnostic');
chk('Shown on the bait detail page', (A.match(/<BaitArt b=\{b\}/g) || []).length >= 3, `${(A.match(/<BaitArt/g) || []).length} usages`);
chk('Shown in the species "what it eats" list', /<BaitArt b=\{b\} h=\{40\}/.test(A));
chk('Shown when picking a bait while logging a catch', /<BaitArt b=\{chosenBait\}/.test(A));
chk('User photo overrides the drawing', /photo\s*\n?\s*\?\s*<img[\s\S]{0,200}:\s*<BaitArt/.test(A));

/* Offline-first: a drawing that needs the network is not a drawing. */
chk('Drawings are pure SVG, no external images', !/<img[^>]+src="http/.test(B) && !/url\(http/.test(B));
chk('baitart.jsx makes no network calls', !/fetch\(|XMLHttpRequest/.test(B));

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
console.log(`\nDrawings: ${[...ART.keys()].sort().join(', ')}\n`);
process.exit(fail ? 1 : 0);
