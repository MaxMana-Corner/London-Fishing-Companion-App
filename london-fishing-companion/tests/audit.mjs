import fs from 'fs';
const A = fs.readFileSync('src/App.jsx','utf8');
const S = fs.readFileSync('src/services.js','utf8');
const P = fs.readFileSync('src/portability.js','utf8');
const T = fs.readFileSync('src/astro.js','utf8');
const C = fs.readFileSync('src/community.js','utf8');
const M = fs.readFileSync('src/map.js','utf8');
const ALL = A+S+P+T+C;
let pass=0, fail=0, warn=0;
const chk=(n,c,g)=>{ if(c){pass++;console.log(`  PASS  ${n}`);} else {fail++;console.log(`  FAIL  ${n}  ${g||''}`);} };
const note=(n)=>{warn++;console.log(`  NOTE  ${n}`);};

console.log('\n=== SCAN 3b: spec compliance audit ===\n');

console.log('-- Requirement: keep everything already built --');
for (const [n,tok] of [['Five tabs','"home", "Home"'],['Season engine','isOpenOn'],
  ['Depth cross-sections','DepthChart'],['Species encyclopedia','const SPECIES'],['Baits encyclopedia','const BAITS'],
  ['Hook guide','HOOK_GUIDE'],['Trip logging','TripForm'],['Catch logging','CatchForm'],
  ['Stats screen','StatsScreen'],['Knot tutorials','KnotCard'],['Sheets sync retained','SyncPanel']])
  chk(n, A.includes(tok));

console.log('\n-- Tier 1: zero-network features --');
chk('Sunrise/sunset computed locally', T.includes('export function sunTimes'));
chk('Moon phase computed locally', T.includes('export function moonPhase'));
chk('Solunar windows computed locally', T.includes('export function solunar'));
chk('Pressure trend computed locally', T.includes('export function pressureTrend'));
chk('Licence expiry computed locally', A.includes('export function licenceStatus'));
chk('astro.js makes NO network calls', !/fetch\s*\(|XMLHttpRequest|import\(/.test(T), 'found a call');
chk('Astronomy surfaced on spot detail', A.includes('<ConditionsPanel'));

console.log('\n-- Tier 2: fetch-cache-label --');
chk('Open-Meteo used', S.includes('api.open-meteo.com/v1/forecast'));
chk('Hourly + daily forecast requested', S.includes('precipitation_probability') && S.includes('uv_index'));
chk('Pressure requested (feeds the offline trend)', S.includes('pressure_msl'));
chk('ECCC hydrometric used', S.includes('api.weather.gc.ca/collections'));
chk('Station finder present', S.includes('export async function findStations'));
chk('Best-window score combines offline+online', T.includes('export function windowScore'));
chk('Cached readings shown with a timestamp', A.includes('agoLabel(w.at)') && A.includes('agoLabel(h.at)'));
chk('TTL-based staleness', S.includes('weatherStale') && S.includes('hydroStale'));

console.log('\n-- Excluded by instruction (Tier 3 must be absent) --');
chk('No UTRCA advisory scraping', !/advisor|flood.?watch|scrape/i.test(ALL));
// The community layer was Tier 3 until 2026-09-06, when the owner reversed that
// decision. The assertion that used to sit here failed the build if the string
// "community" appeared anywhere in source, so it WAS the exclusion, mechanically.
// It is replaced by the rules the community feature actually has to obey.

console.log('\n-- Community directory (v6): read-only, and it stays in its lane --');
chk('community.js makes NO network calls', !/fetch\s*\(|XMLHttpRequest|import\(/.test(C), 'found a call');
chk('Community fetching lives in services.js', S.includes('fetchCommunityIndex') && S.includes('COMMUNITY_BASE'));
chk('Community paths are guarded before use', S.includes('isSafeCommunityPath') && S.includes('COMMUNITY_PATH_OK'));
chk('A bad community path yields no URL', S.includes('isSafeCommunityPath(path) ?'));
chk('Community packs reuse the file-import validator', S.includes('parse: "text"') && P.includes('export function validateImport'));
chk('Imported community records are tagged', C.includes('COMMUNITY_SOURCE') && C.includes('sourcePackId'));
chk('Community records are kept out of Sheets sync', C.includes('withoutCommunity'));
chk('map.js makes NO network calls',
    !M.includes('fetch(') && !M.includes('XMLHttpRequest') && !M.includes('import('),
    'found a call');
chk('Map region loading goes through services.js', S.includes('fetchMapRegion') && S.includes('mapRegionUrl'));
chk('map.js takes a palette rather than hardcoding colours', !/#[0-9a-fA-F]{6}/.test(M.replace(/pinEdge[^,]*/g,'')) || M.includes('palette.'));
// loadKey() spreads into a default object, so a bare string comes back as a
// character-indexed object and an array comes back with numeric keys. That
// silently made getDeviceId() mint a new id on every call, which broke vote
// toggling because every vote looked like a different device.
chk('Non-object stored values use loadValue, not loadKey',
    A.includes('async function loadValue') &&
    !A.includes('loadKey(K_DEVICE') &&
    !A.includes('loadKey(K_SUBMISSIONS') &&
    !A.includes('loadKey(K_VOTES'),
    'a bare string or array is going through loadKey');

console.log('\n-- Forms: every content type is user-extensible --');
for (const w of ['AddSpotWizard','AddSpeciesWizard','AddBaitWizard','AddKnotWizard','AddTipWizard'])
  chk(`${w} exists`, A.includes(`function ${w}`));
chk('Knots are data, not hardcoded-only', A.includes('knots: [...(catalog.knots || [])]') || A.includes('allKnots'));
chk('Spot wizard captures coordinates', A.includes('"coords"'));

console.log('\n-- Export / import --');
chk('Pack export kind', P.includes('PACK: "pack"'));
chk('Log export kind', P.includes('LOG: "log"'));
chk('Full export kind', P.includes('FULL: "full"'));
chk('Pack excludes trips & catches', P.includes('if (kind === KIND.PACK)') && !/KIND.PACK[\s\S]{0,300}trips:/.test(P));
chk('Import validates before merging', P.includes('export function validateImport'));
chk('Merge by id, newest wins', P.includes('Number(r.updatedAt || 0)'));
// The preview used to be inline in DataScreen; it is now one shared component so a
// file import and a community pack cannot drift into showing different things.
chk('Summary shown before committing', A.includes('function ImportPreview') && A.includes('summaryLines(plan.summary)'));
chk('Both import paths use the one preview', (A.match(/<ImportPreview/g)||[]).length >= 2, (A.match(/<ImportPreview/g)||[]).length);
chk('Import is user-confirmed, not automatic', A.includes('setPending({ plan'));
chk('Works offline (Blob/share, FileReader)', P.includes('URL.createObjectURL') && P.includes('FileReader'));

console.log('\n-- Robustness --');
chk('Single network choke point (services.js only)',
    !/\bfetch\s*\(/.test(P) && !/\bfetch\s*\(/.test(T) &&
    (A.match(/\bfetch\s*\(/g)||[]).length <= 1, 'fetch found outside services.js');
chk('All fetches have a timeout', S.includes('AbortController') && S.includes('TIMEOUT_MS'));
chk('Fetch never throws to caller', S.includes('return { ok: false, error'));
chk('Offline short-circuit', S.includes('navigator.onLine === false'));
chk('Storage writes are checked', A.includes('const ok = await saveKey') || A.includes('if (!ok) setErr'));
chk('Load failure surfaced, not silent', A.includes('Could not read your saved data'));
chk('Schema version on records', P.includes('SCHEMA_VERSION') && A.includes('_v: SCHEMA_VERSION'));
chk('Migration on load', A.includes('migrateStore({ trips'));
chk('Notification denial handled', A.includes('perm === "denied"'));
chk('Notification API absence handled', A.includes('"unsupported"'));
chk('Missing coordinates handled', A.includes('has no coordinates saved'));
chk('Error banner is non-blocking', A.includes('Dismiss'));
chk('Import size guard', P.includes('MAX_IMPORT_BYTES') && /MAX_IMPORT_BYTES = \d+ \* 1024 \* 1024/.test(P));
chk('Merge uses Map (no prototype pollution)', P.includes('new Map()'));

console.log('\n-- Offline-first invariants --');
chk('No fetch at module top level', !/^\s*(await\s+)?fetch\(/m.test(ALL));
chk('No blocking await before first render', !A.includes('await fetchWeather') || A.includes('refreshEnv'));
chk('Conditions panel renders without weather', A.includes('Scored from sun and moon only'));
chk('Service worker registered', fs.readFileSync('src/main.jsx','utf8').includes('serviceWorker'));

console.log('\n-- Hygiene --');
/* Strip comments before the hygiene scan. The rule is about code, not
   prose: a comment explaining that App.jsx deliberately does NOT touch
   localStorage should not trip the check that App.jsx does not touch
   localStorage. A real call still does. */
const A_CODE = A.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const badPatterns = [['localStorage in App.jsx (should go through storage shim)', /localStorage\s*[.[]/.test(A_CODE)],
  ['TODO/FIXME left behind', /TODO|FIXME|XXX/.test(ALL)],
  ['console.log left in shipped source', /console\.log/.test(ALL)],
  ['Hardcoded unverified station id', /02G[DE]\d{3}/.test(S) && !S.includes('placeholder')]];
for (const [n,bad] of badPatterns) chk(`No ${n}`, !bad);
if (/02G[DE]\d{3}/.test(A)) note('A station id appears in App.jsx as placeholder text only — check it is not load-bearing.');

console.log(`\n=== SCAN 3b RESULT: ${pass} passed, ${fail} failed, ${warn} notes ===\n`);
process.exit(fail?1:0);
