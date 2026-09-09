import { JSDOM } from 'jsdom';
import fs from 'fs';

let pass=0, fail=0;
const chk=(n,c,g)=>{ if(c){pass++;console.log(`  PASS  ${n}${g!==undefined?`  (${g})`:''}`);} else {fail++;console.log(`  FAIL  ${n}  got: ${g}`);} };

console.log('\n=== SCAN 3a: headless render + failure injection ===\n');

const html = `<!doctype html><html><body><div id="root"></div></body></html>`;
const dom = new JSDOM(html, { url:'https://example.org/', runScripts:'outside-only', pretendToBeVisual:true });
const { window } = dom;
global.window = window; global.document = window.document;
Object.defineProperty(global,'navigator',{value:window.navigator,configurable:true,writable:true});
global.HTMLElement = window.HTMLElement; global.Element = window.Element; global.Node = window.Node;
global.self = window; global.location = window.location;
global.requestAnimationFrame = cb => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.MessageChannel = window.MessageChannel;

// --- Hostile environment: every external dependency is broken on purpose ---
let fetchCalls = 0;
global.fetch = window.fetch = async () => { fetchCalls++; throw new Error('network down'); };
window.AbortController = global.AbortController;
// storage completely unavailable
const store = {};
window.storage = {
  async get(k){ if(!(k in store)) throw new Error('not found'); return {key:k, value:store[k]}; },
  async set(k,v){ store[k]=v; return {key:k,value:v}; },
  async delete(k){ delete store[k]; return {key:k,deleted:true}; },
  async list(){ return {keys:Object.keys(store)}; },
};
Object.defineProperty(window.navigator, 'onLine', { value:false, configurable:true });
// Notification API entirely absent — must not crash
delete window.Notification;

const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

const code = fs.readFileSync('./app.js','utf8');
try {
  window.eval(code);
  chk('Bundle evaluates without throwing', true);
} catch (e) {
  chk('Bundle evaluates without throwing', false, e.message);
}

await new Promise(r => setTimeout(r, 700));
console.error = origErr;

const root = window.document.getElementById('root');
const text = root.textContent || '';
chk('App mounted content into #root', root.children.length > 0, `${root.children.length} child node(s)`);
chk('Renders while OFFLINE with empty storage', text.length > 200, `${text.length} chars`);
/* The season used to be an eight-badge grid under its own heading, which
   told you everything and therefore nothing. It is now one card that leads
   with what is worth going after today and keeps the full table one tap
   away, so the assertion is about the card, not the old heading. */
chk('Season card renders with something worth going after',
  /Worth going after/.test(text) && /open today/.test(text));
chk('The full season is available rather than gone',
  /See the full season/.test(text));
chk('Spot list rendered', /Springbank Park/.test(text), 'Springbank found');
chk('The place line no longer hard-codes London for everyone',
  !/London, Ontario · Thames River watershed/.test(text));
/* FIVE, not six, and the count is the assertion rather than an incidental
   detail: the owner specified five buttons as the end state. "Learn" was a
   whole half of the encyclopedia hiding behind its own button, with nothing
   on the Guide tab to say it existed - it is now a set of categories inside
   the encyclopedia hub. If a sixth ever reappears, that is a decision to
   argue for, not a thing to slip in. */
const TABS = ['Home','Map','Guide','Log','Options'];
chk('Five tabs present', TABS.every(t=>text.includes(t)), TABS.filter(t=>text.includes(t)).join(','));
chk('Learn is no longer a top-level tab', !/>Learn</.test(root.innerHTML));
chk('No fetch fired on first render (offline-first)', fetchCalls===0, `${fetchCalls} calls`);

const fatal = errors.filter(e=>/is not a function|undefined is not|Cannot read|Maximum update|Minified React error/i.test(e));
chk('No fatal React/JS errors during mount', fatal.length===0, fatal.slice(0,2).join(' | ') || 'clean');

// --- Now with storage totally broken ---
const dom2 = new JSDOM(html, { url:'https://example.org/', runScripts:'outside-only', pretendToBeVisual:true });
global.window = dom2.window; global.document = dom2.window.document;
Object.defineProperty(global,'navigator',{value:dom2.window.navigator,configurable:true,writable:true});
global.self = dom2.window;
dom2.window.storage = {
  async get(){ throw new Error('storage exploded'); },
  async set(){ throw new Error('storage exploded'); },
  async delete(){ throw new Error('storage exploded'); },
  async list(){ throw new Error('storage exploded'); },
};
dom2.window.fetch = async () => { throw new Error('down'); };
const errors2 = []; const oe2 = console.error; console.error = (...a)=>errors2.push(a.map(String).join(' '));
try { dom2.window.eval(code); } catch(e) { /* captured below */ }
await new Promise(r=>setTimeout(r,600));
console.error = oe2;
const t2 = dom2.window.document.getElementById('root').textContent || '';
chk('Renders even when storage throws on every call', t2.length > 200, `${t2.length} chars`);
chk('Still shows the guide with broken storage', /Springbank|Open right now/.test(t2));

console.log(`\n=== SCAN 3a RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
