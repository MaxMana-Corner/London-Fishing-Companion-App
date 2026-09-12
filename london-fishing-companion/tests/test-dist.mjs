import { JSDOM } from 'jsdom';
import fs from 'fs';
let pass=0, fail=0;
const chk=(n,c,g)=>{ if(c){pass++;console.log(`  PASS  ${n}${g!==undefined?`  (${g})`:''}`);} else {fail++;console.log(`  FAIL  ${n}  got: ${g}`);} };

console.log('\n=== NETLIFY BUILD VERIFICATION ===\n');

/* The deployable root: the folder that actually gets dragged onto Netlify.
   netlify.toml sets publish = ".", so that folder is the project root itself
   and these tests are run from it (node tests/test-dist.mjs). If the layout
   ever moves back to a separate build folder, change this one line. */
const DIST = '.';

console.log('-- Deployable structure --');
const need = ['index.html','app.js','sw.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png','netlify.toml','_headers','_redirects','README.md'];
for (const f of need) chk(`${f} present`, fs.existsSync(`${DIST}/${f}`));
chk('index.html is at the root (Netlify Drop requirement)', fs.existsSync(`${DIST}/index.html`));

const idx = fs.readFileSync(`${DIST}/index.html`,'utf8');
const sw  = fs.readFileSync(`${DIST}/sw.js`,'utf8');
const man = JSON.parse(fs.readFileSync(`${DIST}/manifest.webmanifest`,'utf8'));
const app = fs.readFileSync(`${DIST}/app.js`,'utf8');

console.log('\n-- References resolve --');
const refs = [...idx.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map(m=>m[1]);
const broken = refs.filter(r=>!fs.existsSync(`${DIST}/${r}`));
chk('Every relative reference in index.html exists', broken.length===0, broken.join(',')||refs.join(', '));
chk('All paths relative (works on a subpath too)', !/(?:src|href)="\/[^/]/.test(idx));
/* Comments stripped before parsing. The list is read as JSON, and a JS
   comment inside it - which is perfectly legal in the file - threw a
   SyntaxError that took this whole suite down rather than failing one check.
   sw.js keeps its notes above the array now, and this tolerates one anyway. */
const precache = JSON.parse('['+sw.match(/const ASSETS = \[([\s\S]*?)\]/)[1]
  .replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'')
  .replace(/,\s*$/,'')+']');
const missingPre = precache.filter(p=>p!=='./' && !fs.existsSync(`${DIST}/${p.replace('./','')}`));
chk('Service worker precaches only real files', missingPre.length===0, missingPre.join(',')||`${precache.length} assets`);
chk('app.js is in the precache list', precache.some(p=>p.includes('app.js')));

console.log('\n-- PWA install requirements --');
chk('Manifest: standalone display', man.display==='standalone');
chk('Manifest: 192 and 512 icons', man.icons.some(i=>i.sizes==='192x192') && man.icons.some(i=>i.sizes==='512x512'));
chk('Manifest: maskable icon for Android', man.icons.some(i=>i.purpose==='maskable'));
chk('Manifest: relative start_url', !man.start_url.startsWith('/') || man.start_url==='./index.html', man.start_url);
chk('iOS apple-touch-icon', idx.includes('rel="apple-touch-icon"'));
chk('iOS standalone meta', idx.includes('apple-mobile-web-app-capable" content="yes"'));
chk('theme-color set', idx.includes('name="theme-color"'));

console.log('\n-- Service worker correctness --');
{ const m = sw.match(/lfc-v(\d+)/);
  chk('Service worker cache is versioned', !!m, m ? m[0] : 'none');
  /* sw.js must be the ONLY place the cache version is written down. A second
     hardcoded copy is what silently goes stale — a test asserting "lfc-v5"
     kept passing long after sw.js moved on. Anything that needs the version
     should read it out of sw.js, as this test does. */
  const others = ['index.html','README.md','netlify.toml','_headers','manifest.webmanifest']
    .filter(f => fs.existsSync(`${DIST}/${f}`) && /lfc-v\d+/.test(fs.readFileSync(`${DIST}/${f}`,'utf8')));
  chk('Cache version is declared only in sw.js', others.length===0, others.join(',')||'sw.js only'); }
chk('Old caches deleted on activate', sw.includes('caches.delete'));
chk('skipWaiting on install', sw.includes('skipWaiting'));
chk('clients.claim on activate', sw.includes('clients.claim'));
/* Don't pin the variable name — tests/test-sw.mjs proves the behaviour by
   actually running the handler. This is just a cheap structural guard. */
chk('Only GET requests intercepted', /\.method !== "GET"/.test(sw));
chk('Cross-origin requests are left alone', /origin !== self\.location\.origin/.test(sw),
    'sw.js must not intercept weather, gauge or Google requests');
chk('Offline navigation falls back to index.html', sw.includes('caches.match("./index.html")'));
chk('sw.js set to revalidate (updates actually land)', fs.readFileSync(`${DIST}/netlify.toml`,'utf8').includes('must-revalidate'));

console.log('\n-- Build freshness: does the bundle contain the new art? --');
chk('Drive + photos compiled in', /drive\.file/.test(app) && /capture/.test(app));
chk('Bait art compiled in', /jointed body|bump it into rock|circle hook/.test(app));
chk('Hook art compiled in', /Z-bend|do not strike|crush the barbs/.test(app));
chk('Hook size explainer compiled in', app.includes('bigger the number, the smaller the hook'));
chk('Three-tier storage compiled in', /indexedDB/.test(app) && /localStorage/.test(app));
chk('Service worker registration compiled in', app.includes('serviceWorker'));

console.log('\n-- Render the hosted build --');
const dom = new JSDOM(idx,{url:'https://site.netlify.app/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window; global.window=w; global.document=w.document; global.self=w;
Object.defineProperty(global,'navigator',{value:w.navigator,configurable:true,writable:true});
global.requestAnimationFrame=cb=>setTimeout(cb,0); global.cancelAnimationFrame=clearTimeout;
const store={};
Object.defineProperty(w,'localStorage',{configurable:true,value:{getItem:k=>k in store?store[k]:null,
  setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]},
  key:i=>Object.keys(store)[i]??null,get length(){return Object.keys(store).length}}});
delete w.indexedDB;
w.fetch=async()=>{throw new Error('offline')};
const errs=[]; const oe=console.error; console.error=(...a)=>errs.push(a.map(String).join(' '));
w.eval(app);
await new Promise(r=>setTimeout(r,800));
console.error=oe;
const text=w.document.getElementById('root').textContent||'';
chk('App renders from the hosted bundle', text.length>2000, `${text.length} chars`);
/* Five, not six - Learn folded into the encyclopedia hub. See test-render.mjs. */
chk('Five tabs present', ['Home','Map','Guide','Log','Options'].every(t=>text.includes(t)),
    ['Home','Map','Guide','Log','Options'].filter(t=>text.includes(t)).join(','));

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
