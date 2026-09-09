import { JSDOM } from 'jsdom';
import fs from 'fs';
let pass=0, fail=0;
const chk=(n,c,g)=>{ if(c){pass++;console.log(`  PASS  ${n}${g!==undefined?`  (${g})`:''}`);} else {fail++;console.log(`  FAIL  ${n}  got: ${g}`);} };

const FILE = './standalone/Creel.html';
const html = fs.readFileSync(FILE,'utf8');

console.log('\n=== SINGLE-FILE VERIFICATION ===\n');
console.log('-- Static integrity --');
chk('One file, self-contained', fs.existsSync(FILE), `${(fs.statSync(FILE).size/1024).toFixed(0)} KB`);

/* THE ONE THAT WAS MISSING.

   Every other assertion in this file asks whether the standalone build is
   well-formed. None of them asked whether it was CURRENT, and for five days
   they all passed against a copy that predated Tactics, the encyclopedia
   hub, modular tiles, record links, the QR code and the whole dashboard.
   A build artifact with no build script is a copy that drifts, and a test
   that only checks its shape will keep saying it is fine.

   app.js is embedded verbatim, so this is exact rather than a heuristic. */
const currentApp = fs.readFileSync('./app.js','utf8');
chk('The standalone build is CURRENT, not a stale copy', html.includes(currentApp),
  html.includes(currentApp) ? 'matches app.js' : 'STALE - run node tools/build-single.mjs');
chk('No external stylesheet/script/img refs', !/(src|href)="https?:\/\//.test(html));
chk('No Google Fonts fetch', !html.includes('fonts.googleapis'));
chk('Exactly one closing script tag', (html.match(/<\/script/g)||[]).length===1);
chk('apple-touch-icon inlined as data URI', /rel="apple-touch-icon" href="data:image\/png;base64,/.test(html));
chk('apple-mobile-web-app-capable set (iOS standalone)', html.includes('apple-mobile-web-app-capable" content="yes"'));
chk('Manifest inlined as data URI (Android install)', html.includes('rel="manifest" href="data:application/manifest+json,'));
chk('Manifest declares standalone display', decodeURIComponent(html.match(/manifest\+json,([^"]+)/)[1]).includes('"display":"standalone"'));
chk('Manifest has 192 + 512 icons', (()=>{const m=JSON.parse(decodeURIComponent(html.match(/manifest\+json,([^"]+)/)[1]));return m.icons.length>=2 && m.icons.every(i=>i.src.startsWith('data:image/png'));})());
chk('Boot placeholder before JS runs', html.includes('Loading Creel'));
chk('viewport-fit=cover for iPhone notch', html.includes('viewport-fit=cover'));

async function render(label, setup) {
  const dom = new JSDOM(html, { url: setup.url || 'https://example.org/', runScripts:'outside-only', pretendToBeVisual:true });
  const w = dom.window;
  global.window=w; global.document=w.document; global.self=w;
  Object.defineProperty(global,'navigator',{value:w.navigator,configurable:true,writable:true});
  global.requestAnimationFrame=cb=>setTimeout(cb,0); global.cancelAnimationFrame=clearTimeout;
  setup.apply(w);
  const errs=[]; const oe=console.error; console.error=(...a)=>errs.push(a.map(String).join(' '));
  const script = w.document.querySelector('script:not([src])').textContent;
  let threw=null;
  try { w.eval(script); } catch(e){ threw=e; }
  await new Promise(r=>setTimeout(r,900));
  console.error=oe;
  return { text: w.document.getElementById('root').textContent||'', errs, threw, w };
}

console.log('\n-- Cold start, no storage APIs at all, no network --');
let r = await render('bare', { apply(w){
  delete w.indexedDB;
  Object.defineProperty(w,'localStorage',{get(){throw new Error('blocked');},configurable:true});
  w.fetch = async()=>{ throw new Error('offline'); };
  Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true});
  delete w.Notification;
}});
chk('Did not throw on eval', r.threw===null, r.threw && r.threw.message);
chk('Rendered the app', r.text.length>2000, `${r.text.length} chars`);
/* Season is one card with the full table behind an expand, and the navbar
   is five buttons with Learn folded into the encyclopedia. Same contract as
   test-render.mjs - see the notes there. */
chk('Season card present', /Worth going after/.test(r.text) && /open today/.test(r.text));
chk('All five tabs present', ['Home','Map','Guide','Log','Options'].every(t=>r.text.includes(t)));
chk('Warns that nothing can be saved', /vanish when you close it|isn't letting the app save/.test(r.text), 'warning shown');
const fatal = r.errs.filter(e=>/Cannot read|is not a function|Minified React error|Maximum update/i.test(e));
chk('No fatal errors', fatal.length===0, fatal[0]||'clean');

console.log('\n-- file:// origin (opened straight from Files/Downloads) --');
r = await render('file', { url:'file:///storage/emulated/0/Download/Creel.html', apply(w){
  const store={};
  Object.defineProperty(w,'localStorage',{configurable:true,value:{ getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=String(v)},
    removeItem:k=>{delete store[k]}, key:i=>Object.keys(store)[i]??null, get length(){return Object.keys(store).length} }});
  delete w.indexedDB;
  w.fetch = async()=>{ throw new Error('offline'); };
}});
chk('Renders from a local file', r.text.length>2000, `${r.text.length} chars`);
chk('Falls back to localStorage and says so', /Opened directly from a file|export a backup/i.test(r.text), 'file-origin notice');
chk('Spot list intact', /Springbank Park/.test(r.text));

console.log('\n-- Normal hosted case, storage working --');
r = await render('good', { apply(w){
  const store={};
  Object.defineProperty(w,'localStorage',{configurable:true,value:{ getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=String(v)},
    removeItem:k=>{delete store[k]}, key:i=>Object.keys(store)[i]??null, get length(){return Object.keys(store).length} }});
  delete w.indexedDB;
  w.fetch = async()=>{ throw new Error('no net'); };
  w.navigator.storage = { persist: async()=>true, persisted: async()=>false };
}});
chk('No storage warning when storage works', !/vanish when you close it/.test(r.text));
chk('Requested persistent storage without crashing', r.threw===null);
chk('Content renders', r.text.length>2000, `${r.text.length} chars`);

console.log(`\n=== SINGLE-FILE RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
