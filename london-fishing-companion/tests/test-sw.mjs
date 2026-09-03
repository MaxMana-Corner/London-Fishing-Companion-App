/* Service worker behaviour, actually executed.

   sw.js is run in a VM with fake caches/fetch/self, and its real handlers are
   invoked. This exists because the fetch handler once intercepted and cached
   EVERY GET, cross-origin included, and served it cache-first forever — which
   froze live weather and river readings, cached token-authenticated Google
   Drive responses past sign-out, and pinned Google's sign-in script. Grepping
   the source would not have caught that; running it does. */
import fs from 'fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
const chk = (n, c, g) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}   got: ${g}`); } };

const ORIGIN = 'https://london-fishing-companion-app.netlify.app';
const SRC = fs.readFileSync('sw.js', 'utf8');

class Res {
  constructor(url, { ok = true, status = 200 } = {}) { this.url = url; this.ok = ok; this.status = status; }
  clone() { return new Res(this.url, { ok: this.ok, status: this.status }); }
}

function boot({ networkThrows = false, netStatus = 200 } = {}) {
  const stores = new Map();                       // cacheName -> Map(url -> Res)
  const handlers = {};
  const netCalls = [];

  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  const caches = {
    async open(name) {
      const m = cacheFor(name);
      return {
        async addAll(urls) { for (const u of urls) m.set(new URL(u, ORIGIN + '/').href, new Res(u)); },
        async put(req, res) { m.set(typeof req === 'string' ? req : req.url, res); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(req) {
      const url = typeof req === 'string' ? new URL(req, ORIGIN + '/').href : req.url;
      for (const m of stores.values()) if (m.has(url)) return m.get(url);
      return undefined;
    },
  };

  const fetchMock = async (req) => {
    const url = typeof req === 'string' ? req : req.url;
    netCalls.push(url);
    if (networkThrows) throw new Error('offline');
    return new Res(url, { ok: netStatus >= 200 && netStatus < 300, status: netStatus });
  };

  const self_ = {
    addEventListener: (t, fn) => { handlers[t] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    location: { origin: ORIGIN },
  };

  const ctx = vm.createContext({ self: self_, caches, fetch: fetchMock, URL, console, setTimeout, Promise });
  vm.runInContext(SRC, ctx);
  return { handlers, stores, netCalls, caches };
}

const req = (url, { method = 'GET', mode = 'cors' } = {}) => ({ method, url, mode });
function evt(request) {
  const e = { request, responded: false, promise: null, waited: [] };
  e.respondWith = (p) => { e.responded = true; e.promise = p; };
  e.waitUntil = (p) => { e.waited.push(p); };
  return e;
}
const CACHE_NAME = (SRC.match(/lfc-v\d+/) || [''])[0];

console.log('\n=== SERVICE WORKER BEHAVIOUR ===\n');
console.log('-- install / activate --');
{
  const { handlers, stores } = boot();
  const e = evt(null);
  await handlers.install(e);
  await Promise.all(e.waited);
  const m = stores.get(CACHE_NAME);
  chk('Install precaches the asset list', !!m && m.size >= 8, m ? m.size : 'no cache');
  chk('index.html precached', !!m && [...m.keys()].some(k => k.endsWith('/index.html')));
  chk('app.js precached', !!m && [...m.keys()].some(k => k.endsWith('/app.js')));
}
{
  const { handlers, stores } = boot();
  stores.set('lfc-vOLD', new Map());
  stores.set(CACHE_NAME, new Map());
  const e = evt(null);
  await handlers.activate(e);
  await Promise.all(e.waited);
  chk('Activate deletes superseded caches', !stores.has('lfc-vOLD'), [...stores.keys()].join(','));
  chk('Activate keeps the current cache', stores.has(CACHE_NAME));
}

console.log('\n-- the regression: cross-origin must pass straight through --');
for (const [label, url] of [
  ['Open-Meteo weather', 'https://api.open-meteo.com/v1/forecast?latitude=42.98&longitude=-81.24'],
  ['Environment Canada gauge', 'https://api.weather.gc.ca/collections/hydrometric-realtime/items?f=json'],
  ['Google Drive API (carries a token)', 'https://www.googleapis.com/drive/v3/files?q=x'],
  ['Google sign-in script', 'https://accounts.google.com/gsi/client'],
]) {
  const { handlers, stores } = boot();
  const e = evt(req(url));
  handlers.fetch(e);
  if (e.promise) await e.promise;
  const cached = [...stores.values()].some(m => m.has(url));
  chk(`${label} is not intercepted`, e.responded === false, 'respondWith was called');
  chk(`${label} is never cached`, !cached, 'found in cache');
}

console.log('\n-- same-origin still works --');
{
  const { handlers, stores } = boot();
  const url = `${ORIGIN}/app.js`;
  const e = evt(req(url));
  handlers.fetch(e);
  const res = await e.promise;
  chk('Same-origin request IS handled', e.responded === true);
  chk('Successful same-origin response is cached', [...stores.values()].some(m => m.has(url)), 'not cached');
  chk('Response is returned to the page', res && res.url === url);
}
{
  const { handlers, stores } = boot({ netStatus: 500 });
  const url = `${ORIGIN}/broken.js`;
  const e = evt(req(url));
  handlers.fetch(e);
  await e.promise;
  chk('A 500 is NOT cached (would stick for the whole cache version)',
      ![...stores.values()].some(m => m.has(url)), 'error response was cached');
}
{
  const { handlers, netCalls } = boot();
  const url = `${ORIGIN}/app.js`;
  const first = evt(req(url)); first.request = req(url);
  handlers.fetch(first); await first.promise;
  const before = netCalls.length;
  const second = evt(req(url));
  handlers.fetch(second); await second.promise;
  chk('Second request served from cache, no second network hit', netCalls.length === before, `${netCalls.length} vs ${before}`);
}

console.log('\n-- offline navigation --');
{
  const { handlers } = boot({ networkThrows: true });
  const install = evt(null);
  await handlers.install(install); await Promise.all(install.waited);
  const e = evt(req(`${ORIGIN}/spots/some-deep-link`, { mode: 'navigate' }));
  handlers.fetch(e);
  const res = await e.promise;
  chk('Offline navigation falls back to index.html', !!res && res.url.endsWith('index.html'), res ? res.url : 'no response');
}
{
  const { handlers } = boot({ networkThrows: true });
  const e = evt(req(`${ORIGIN}/api-ish.json`));
  handlers.fetch(e);
  let threw = false, res = null;
  try { res = await e.promise; } catch { threw = true; }
  chk('A failed non-navigation request does NOT resolve to the HTML page',
      threw || !res || !String(res.url).endsWith('index.html'), res ? res.url : 'rejected');
}

console.log('\n-- non-GET --');
{
  const { handlers } = boot();
  const e = evt(req(`${ORIGIN}/anything`, { method: 'POST' }));
  handlers.fetch(e);
  chk('POST is not intercepted (Sheets sync must reach the network)', e.responded === false);
}

console.log(`\n=== SERVICE WORKER RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
