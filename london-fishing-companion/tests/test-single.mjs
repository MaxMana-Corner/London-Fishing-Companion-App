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
/* Three blocks now: the map data, the line that parses it, and the app.
   Counting CLOSERS rather than openers is deliberate and was already right -
   React's source contains `e.innerHTML="<script><\\/script>"`, opener bare and
   closer escaped, so an opener count reads one too many and proves nothing.
   What this asserts is that no block ends before it was meant to. */
chk('Three script blocks, none ended early', (html.match(/<\/script/g)||[]).length===3,
  (html.match(/<\/script/g)||[]).length + ' closing tags');
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
  /* EVERY executable block, in document order.

     This used to take the FIRST script it found and eval that, which was the
     app while there was only one. Embedding the map put a JSON block ahead of
     it, so the test started evaluating half a megabyte of coordinates as
     JavaScript and reported "Unexpected token ':'" - a broken test, not a
     broken build.

     The JSON block is skipped the same way a browser skips it: by its type.
     What runs is the parse line and then the app, in order, which is exactly
     what a browser does with this file. */
  const blocks = [...w.document.querySelectorAll('script:not([src])')]
    .filter((el) => !el.type || el.type === 'text/javascript');
  let threw=null;
  try { for (const b of blocks) w.eval(b.textContent); } catch(e){ threw=e; }
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
chk('Dashboard renders from a local file', /Worth going after|Your catch/.test(r.text));

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

/* ------------------------------------------------------------------
   THE MAP, WHICH IS WHY THIS BUILD IS WORTH ITS SIZE.

   It never worked here and nothing noticed. Every other assertion in this
   file asks whether the build is well-formed or current; none of them opened
   the map. The app inlined its icons, its manifest and itself, and then asked
   the network for three files - the index, the region and the city's spots -
   which a file:// page is not allowed to fetch. So the one build whose entire
   purpose is working with no server was the one build whose map could not
   load, and it said "the install did not finish" about a file with nothing to
   finish.

   The conditions below are the real ones: a file:// origin, a fetch that
   throws on every call, and navigator.onLine false. If the map draws under
   that it draws on a memory stick.
   ------------------------------------------------------------------ */
console.log('\n-- The map, from file://, with nothing to fetch --');
{
  const dom = new JSDOM(html, { url:'file:///C:/Users/x/Downloads/Creel.html', runScripts:'outside-only', pretendToBeVisual:true });
  const w = dom.window;
  global.window=w; global.document=w.document; global.self=w;
  Object.defineProperty(global,'navigator',{value:w.navigator,configurable:true,writable:true});
  global.requestAnimationFrame=cb=>setTimeout(cb,0); global.cancelAnimationFrame=clearTimeout;
  global.MessageChannel=w.MessageChannel;

  const asked = [];
  w.fetch = async (u) => { asked.push(String(u)); throw new TypeError('Failed to fetch'); };
  Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true});

  const errs=[]; const oe=console.error; console.error=(...a)=>errs.push(a.map(String).join(' '));
  const blocks = [...w.document.querySelectorAll('script:not([src])')]
    .filter((el) => !el.type || el.type === 'text/javascript');
  let threw = null;
  try { for (const b of blocks) w.eval(b.textContent); } catch (e) { threw = e; }
  await new Promise(r=>setTimeout(r,1100));

  const root = w.document.getElementById('root');
  const wait = (ms) => new Promise(r=>setTimeout(r,ms));
  const click = async (el, ms=400) => { if (!el) return false; el.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(ms); return true; };
  const vis = () => { const c=root.cloneNode(true); c.querySelectorAll('style,script').forEach(n=>n.remove()); return (c.textContent||'').replace(/\s+/g,' '); };

  chk('Evaluated without throwing', threw===null, threw && threw.message);
  chk('The embedded map parsed', !!w.__LFC_MAP__);
  chk('It carries the region index', !!(w.__LFC_MAP__ && w.__LFC_MAP__.index &&
      Array.isArray(w.__LFC_MAP__.index.regions) && w.__LFC_MAP__.index.regions.length >= 1),
      w.__LFC_MAP__ ? (w.__LFC_MAP__.index.regions||[]).length + ' regions' : 'no map');
  /* The bundled region and nothing else, matching what the service worker
     precaches for the hosted app: London ships, the rest are downloads, and a
     download is not something this file can offer. */
  const held = w.__LFC_MAP__ ? Object.keys(w.__LFC_MAP__.regions||{}) : [];
  chk('It carries the bundled region', held.includes('london-on'), held.join(', ') || 'none');
  chk('...and only that one', held.length===1, held.length + ' embedded');
  const geo = w.__LFC_MAP__ && w.__LFC_MAP__.regions['london-on'];
  chk('...with real geometry in it', !!(geo && geo.layers && Object.keys(geo.layers).length > 5),
      geo ? Object.keys(geo.layers||{}).length + ' layers' : 'none');

  await click([...root.querySelectorAll('.tabbar button')].find(b=>/map/i.test(b.textContent)), 900);
  const t = vis();
  chk('The map page opens', !!root.querySelector('.mapfull'));
  chk('It does NOT claim the map failed to load', !/could not be loaded/.test(t),
      /could not be loaded/.test(t) ? 'STILL FAILING' : 'no failure notice');
  chk('The region names London', /London/.test(t));
  chk('The locations are listed', /Springbank Park/.test(t));

  const pill = [...root.querySelectorAll('button')].find(b=>/Change region/.test(b.getAttribute('aria-label')||''));
  await click(pill, 400);
  const picker = root.querySelector('.regionpick');
  chk('The region picker opens', !!picker);
  if (picker) {
    const rows = [...picker.children].map(c=>c.textContent.trim());
    /* The index is embedded whole, so the picker still tells the truth about
       cities this file cannot fetch - which beats hiding the rest of the app. */
    chk('It still groups by province', rows.some(x=>/British Columbia/.test(x)) && rows.some(x=>/^Ontario$/.test(x)));
    chk('It still lists the other cities', rows.length>=9, rows.length + ' rows');
  }

  chk('NOTHING was fetched to draw the map', !asked.some(u=>/map\//.test(u)),
      asked.length ? asked.slice(0,3).join(', ').slice(0,110) : 'no fetches at all');
  const fatal = errs.filter(e=>/ReferenceError|TypeError|Cannot read|is not a function|Minified React/i.test(e));
  chk('No fatal errors', fatal.length===0, fatal[0] ? fatal[0].slice(0,130) : 'clean');
  console.error=oe;
}

console.log(`\n=== SINGLE-FILE RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
