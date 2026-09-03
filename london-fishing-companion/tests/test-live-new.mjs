import { JSDOM } from 'jsdom';
import fs from 'fs';
let pass=0, fail=0;
const chk=(n,c,g)=>{ if(c){pass++;console.log(`  PASS  ${n}${g!==undefined?`  (${g})`:''}`);} else {fail++;console.log(`  FAIL  ${n}  got: ${g}`);} };

console.log('\n=== LIVE RENDER: new features, hostile environment ===\n');
/* Deployable root — see the note in test-dist.mjs. */
const DIST = '.';
const idx=fs.readFileSync(`${DIST}/index.html`,'utf8'), app=fs.readFileSync(`${DIST}/app.js`,'utf8');
const dom=new JSDOM(idx,{url:'https://london-fishing-companion-app.netlify.app/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window; global.window=w; global.document=w.document; global.self=w;
Object.defineProperty(global,'navigator',{value:w.navigator,configurable:true,writable:true});
global.requestAnimationFrame=cb=>setTimeout(cb,0); global.cancelAnimationFrame=clearTimeout;
const store={};
Object.defineProperty(w,'localStorage',{configurable:true,value:{getItem:k=>k in store?store[k]:null,
  setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]},
  key:i=>Object.keys(store)[i]??null,get length(){return Object.keys(store).length}}});
delete w.indexedDB;                       // no photo store at all
w.fetch=async()=>{throw new Error('offline')};
Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true});
w.navigator.storage = { estimate: async()=>({usage: 900*1024*1024, quota: 1000*1024*1024}), persisted: async()=>false, persist: async()=>false };
w.LFC_GOOGLE_CLIENT_ID = "";              // deployer has not configured it yet
const errs=[]; const oe=console.error, ow=console.warn;
console.error=(...a)=>errs.push('ERR '+a.map(String).join(' ')); console.warn=()=>{};
w.eval(app);
await new Promise(r=>setTimeout(r,900));

const click=async(pred)=>{const b=[...w.document.querySelectorAll('button')].find(pred); if(b){b.click(); await new Promise(r=>setTimeout(r,400)); return true;} return false;};
const root=w.document.getElementById('root');

chk('App boots with no IndexedDB, no network, no client ID', (root.textContent||'').length>2000, `${(root.textContent||'').length} chars`);
chk('Storage-full warning shown at 90% usage', /nearly full/i.test(root.textContent||''), 'pressure banner');

chk('Data tab reachable', await click(b=>b.textContent.trim()==='Data'));
let t=root.textContent||'';
chk('Drive entry present on Data tab', /Back up to your Google Drive/.test(t));
chk('Shows Not connected', /Not connected/.test(t));
chk('Storage usage displayed', /used of/.test(t), 'usage line');

chk('Drive panel opens', await click(b=>b.textContent.includes('Back up to your Google Drive')));
t=root.textContent||'';
chk('Explains it is the user\'s own Drive', /your own<\/strong>|your own Google/i.test(w.document.getElementById('root').innerHTML));
chk('Reports missing client ID honestly', /No Google client ID is configured/.test(t));
chk('No Connect button inside the Drive panel when unconfigured',
    !/Connect Google Drive<\/button>|>Connect Google Drive</.test(w.document.getElementById('root').innerHTML), 'button hidden');
chk('Storage advice does not dead-end at an unavailable Drive',
    !/Connect Google Drive in the Data tab/.test(root.textContent||''), 'advice adapts');
chk('Archive controls present', /archive/i.test(t));
chk('Storage bar present', /of 1000 MB|of 1.0 GB|of 1000\.0 MB/.test(t) || /%/.test(t));

// Hooks page still renders with the redesign
await click(b=>b.textContent.includes('Close'));
await click(b=>b.textContent.trim()==='Guide');
await click(b=>b.textContent.includes('Hooks & rigs'));
t=root.textContent||'';
const svgs=[...root.querySelectorAll('svg')].filter(s=>(s.getAttribute('aria-label')||'').match(/hook|rig/));
chk('Hook + rig drawings render', svgs.length>=17, `${svgs.length} drawings`);
chk('Callout labels visible', /shank barbs|Z-bend|wide gape|point turns in|three points/.test(t), 'callouts present');
chk('Scale references visible', /size 1\/0|size 8|size 6/.test(t), 'scale bars');
const shapes=svgs.map(s=>s.querySelectorAll('path,circle,ellipse,rect,text,line,polygon').length);
chk('No empty drawings', Math.min(...shapes)>=4, `min ${Math.min(...shapes)} shapes`);

console.error=oe; console.warn=ow;
const fatal=errs.filter(e=>/Cannot read|is not a function|Minified React error|Maximum update/i.test(e));
chk('No fatal errors anywhere', fatal.length===0, fatal[0]||'clean');

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
