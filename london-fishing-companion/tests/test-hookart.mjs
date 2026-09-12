import { JSDOM } from 'jsdom';
import fs from 'fs';
let pass=0, fail=0;
const chk=(n,c,g)=>{ if(c){pass++;console.log(`  PASS  ${n}${g!==undefined?`  (${g})`:''}`);} else {fail++;console.log(`  FAIL  ${n}  got: ${g}`);} };

console.log('\n=== HOOKS & RIGS: COVERAGE + LIVE RENDER ===\n');
const A = fs.readFileSync('src/App.jsx','utf8');
const H = fs.readFileSync('src/hookart.jsx','utf8');

console.log('-- Coverage --');
const hookRows = [...A.matchAll(/\{ art: "(\w+)", size:/g)].map(m=>m[1]);
const rigRows  = [...A.matchAll(/\{ rig: "(\w+)", when:/g)].map(m=>m[1]);
chk('Every hook row has a drawing key', hookRows.length===11, `${hookRows.length}/11`);
chk('Every rig entry has a drawing key', rigRows.length===7, `${rigRows.length}/7`);

const hookKeys = new Set([...H.matchAll(/^  (\w+):/gm)].map(m=>m[1]));
const missingH = [...new Set(hookRows)].filter(t=>t!=='finewire' && !hookKeys.has(t));
chk('All hook drawings exist', missingH.length===0, missingH.join(',')||`${new Set(hookRows).size} distinct`);
const rigBlock = H.slice(H.indexOf('const RIGS = {'));
const rigKeys = new Set([...rigBlock.matchAll(/^  (\w+): \(/gm)].map(m=>m[1]));
const missingR = [...new Set(rigRows)].filter(t=>!rigKeys.has(t));
chk('All rig drawings exist', missingR.length===0, missingR.join(',')||`${rigKeys.size} rigs`);
chk('Pure SVG, no external images', !/src="http|url\(http/.test(H));
chk('No network calls', !/fetch\(|XMLHttpRequest/.test(H));
chk('Drawings are labelled', H.includes('role="img"') && H.includes('aria-label'));

console.log('\n-- Live render in the single file --');
const html = fs.readFileSync('./standalone/Creel.html','utf8');
const dom = new JSDOM(html,{url:'https://example.org/',runScripts:'outside-only',pretendToBeVisual:true});
const w = dom.window;
global.window=w; global.document=w.document; global.self=w;
Object.defineProperty(global,'navigator',{value:w.navigator,configurable:true,writable:true});
global.requestAnimationFrame=cb=>setTimeout(cb,0); global.cancelAnimationFrame=clearTimeout;
const store={};
Object.defineProperty(w,'localStorage',{configurable:true,value:{getItem:k=>k in store?store[k]:null,
  setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]},
  key:i=>Object.keys(store)[i]??null,get length(){return Object.keys(store).length}}});
delete w.indexedDB;
w.fetch = async()=>{ throw new Error('offline'); };
const errs=[]; const oe=console.error; console.error=(...a)=>errs.push(a.map(String).join(' '));
/* Every executable block, in document order, skipping the JSON one the way a
   browser does - by its type. This took the FIRST script and evaluated that,
   which was the app while there was only one block; embedding the map put
   half a megabyte of coordinates ahead of it and this suite started
   evaluating JSON as JavaScript. */
for (const b of [...w.document.querySelectorAll('script:not([src])')]
  .filter((el) => !el.type || el.type === 'text/javascript')) {
  w.eval(b.textContent);
}
await new Promise(r=>setTimeout(r,800));
/* Guide lands on the encyclopedia hub now, so reaching a category is two
   steps: open the tile, then See all. The tile expanding rather than
   navigating is deliberate - it previews four entries, which is often what
   you wanted. Same route as test-live-new.mjs.

   This test only started failing once standalone/ was actually regenerated
   from current sources. It had been passing for days against a build that
   predated the hub entirely. */
const tap = (pred) => {
  const b = [...w.document.querySelectorAll('button')].find(pred);
  if (!b) throw new Error('nothing to click for that step');
  b.click();
};
tap(b=>b.textContent.trim()==='Guide');
await new Promise(r=>setTimeout(r,400));
tap(b=>b.className.includes('encytile-head') && b.textContent.includes('Hooks & rigs'));
await new Promise(r=>setTimeout(r,400));
tap(b=>b.className.includes('encyseeall'));
await new Promise(r=>setTimeout(r,600));
console.error=oe;

const root=w.document.getElementById('root');
const text=root.textContent||'';
const svgs=root.querySelectorAll('svg');
const labels=[...svgs].map(s=>s.getAttribute('aria-label')).filter(Boolean);

chk('Hooks page rendered', /Which hook|Offset worm hook/.test(text) || text.includes('Circle hook'), 'content present');
chk('Hook drawings on the page', labels.filter(l=>l.endsWith('hook')).length>=11,
    `${labels.filter(l=>l.endsWith('hook')).length} hook drawings`);
chk('Rig drawings on the page', labels.filter(l=>l.endsWith('rig')).length>=7,
    `${labels.filter(l=>l.endsWith('rig')).length} rig drawings`);
chk('Drawings are distinct shapes', new Set([...svgs].map(s=>s.innerHTML.length)).size>=14,
    `${new Set([...svgs].map(s=>s.innerHTML.length)).size} distinct`);
chk('Size-numbering explainer present', /bigger the number, the smaller the hook/.test(text));
chk('Circle-hook warning present', /do not strike/.test(text));
chk('Barb-crushing advice present', /crush the barbs/i.test(text));
chk('Pike leader warning present', /not optional at Fanshawe/.test(text));
for (const t of ['Offset worm hook','Circle hook','Treble (factory)','Tube jig head (internal)'])
  chk(`"${t}" listed`, text.includes(t));
for (const t of ['Use a slip float','Fish the bottom instead','Add a barrel swivel'])
  chk(`"${t}" listed`, text.includes(t));
const fatal=errs.filter(e=>/Cannot read|is not a function|Minified React error/i.test(e));
chk('No render errors', fatal.length===0, fatal[0]||'clean');

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
