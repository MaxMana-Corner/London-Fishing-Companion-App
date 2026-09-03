import fs from 'fs';
const A = fs.readFileSync('src/App.jsx','utf8');
const B = fs.readFileSync('src/baitart.jsx','utf8');
let pass=0, fail=0;
const chk=(n,c,g)=>{ if(c){pass++;console.log(`  PASS  ${n}${g!==undefined?`  (${g})`:''}`);} else {fail++;console.log(`  FAIL  ${n}  ${g||''}`);} };

console.log('\n=== BAIT ART COVERAGE ===\n');

// Every bait id declared in BAITS
const ids = [...A.matchAll(/^\s*\{ id: "([a-z]+)", name: "[^"]+", kind:/gm)].map(m=>m[1]);
chk('Found the BAITS list', ids.length>0, `${ids.length} baits`);

// Every id mapped in LURE_ART
const mapBlock = A.match(/const LURE_ART = \{([\s\S]*?)\};/)[1];
const mapped = [...mapBlock.matchAll(/(\w+):\s*"(\w+)"/g)].map(m=>({id:m[1], art:m[2]}));
const mappedIds = new Set(mapped.map(m=>m.id));
const missing = ids.filter(i=>!mappedIds.has(i));
chk('Every bait has an art mapping', missing.length===0, missing.join(', ') || 'all mapped');

// Every art type has a case in baitart.jsx
const artBlock = (()=>{const i=B.indexOf('const ART = {');let d=0,st=B.indexOf('{',i);
  for(let j=st;j<B.length;j++){if(B[j]==='{')d++;else if(B[j]==='}'){d--;if(!d)return B.slice(st,j);}}return '';})();
const cases = new Set(); {let d=0; for(const m of artBlock.matchAll(/[{}]|^\s{2}([A-Za-z_]\w*):/gm)){
  if(m[0]==='{'||m[0]==='}') d+=m[0]==='{'?1:-1; else if(d===1&&m[1]) cases.add(m[1]); }}
const artTypes = [...new Set(mapped.map(m=>m.art))];
const noCase = artTypes.filter(t=>!cases.has(t));
chk('Every art type has a drawing', noCase.length===0, noCase.join(', ') || `${artTypes.length} distinct drawings`);

// Distinctness: no two baits should share a drawing unless intended
const byArt = {};
for (const m of mapped) (byArt[m.art] ||= []).push(m.id);
const shared = Object.entries(byArt).filter(([,v])=>v.length>1);
chk('Each bait has its own distinct drawing', shared.length===0,
    shared.map(([a,v])=>`${a}: ${v.join('+')}`).join('; ') || 'all unique');

// Fallback safety
chk('Unknown bait falls back by kind', A.includes('KIND_FALLBACK[b.kind]'));
chk('Fallback of last resort exists', A.includes('|| "grub"'));

// Wired into the UI everywhere it matters
chk('Shown in the bait list', /<BaitArt b=\{b\} h=\{\d+\} \/>/.test(A), 'height-agnostic');
chk('Shown on the bait detail page', (A.match(/<BaitArt b=\{b\}/g)||[]).length >= 3, `${(A.match(/<BaitArt/g)||[]).length} usages`);
chk('Shown in the species "what it eats" list', /<BaitArt b=\{b\} h=\{40\}/.test(A));
chk('Shown when picking a bait while logging a catch', /<BaitArt b=\{chosenBait\}/.test(A));
chk('User photo overrides the drawing', /photo\s*\n?\s*\?\s*<img[\s\S]{0,200}:\s*<BaitArt/.test(A));

// No external images anywhere
chk('Drawings are pure SVG, no external images', !/<img[^>]+src="http/.test(B) && !/url\(http/.test(B));
chk('baitart.jsx makes no network calls', !/fetch\(|XMLHttpRequest/.test(B));

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
console.log(`\nDrawings: ${artTypes.sort().join(', ')}\n`);
process.exit(fail?1:0);
