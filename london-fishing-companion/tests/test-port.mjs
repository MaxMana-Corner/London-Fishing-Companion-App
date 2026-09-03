import { validateImport, planImport, mergeList, buildExport, migrateStore, migrateRecord,
         KIND, SCHEMA_VERSION, APP_ID, exportFilename, summaryLines } from '../src/portability.js';
import { shapeWeather, flowContext, pushPressureReading, describeWeather, compassPoint,
         weatherUrl, stationSearchUrl, hydroReadingUrl, isStale, agoLabel } from '../src/services.js';

let pass=0, fail=0;
const chk=(n,c,g)=>{ if(c){pass++;console.log(`  PASS  ${n}${g!==undefined?`  (${g})`:''}`);} else {fail++;console.log(`  FAIL  ${n}  got: ${g}`);} };

console.log('\n=== SCAN 2: portability, validation, hostile input ===\n');
console.log('-- Rejecting bad files (must never partially merge) --');

const bad = [
  ['empty string', ''],
  ['whitespace', '   '],
  ['not json', '{nope'],
  ['truncated json', '{"app":"london-fishing-companion","schema":2,'],
  ['array at top level', '[1,2,3]'],
  ['null', 'null'],
  ['number', '42'],
  ['wrong app', JSON.stringify({app:'some-other-app',schema:2,kind:'pack'})],
  ['no schema', JSON.stringify({app:APP_ID,kind:'pack'})],
  ['future schema', JSON.stringify({app:APP_ID,schema:99,kind:'pack'})],
];
for (const [name, txt] of bad) {
  const r = validateImport(txt);
  chk(`Rejects ${name}`, r.ok===false && r.data===null && r.errors.length>0, r.errors[0]);
}

console.log('\n-- Accepting good files, skipping junk records --');
const messy = JSON.stringify({
  app: APP_ID, schema: 2, kind: KIND.PACK,
  catalog: {
    spots: [
      {id:'s1', name:'Good Spot', custom:true, updatedAt: 100},
      {id:'s2', name:'', custom:true},            // no name -> dropped
      {id:'', name:'No id'},                       // no id   -> dropped
      null,                                        // junk    -> dropped
      'a string',                                  // junk    -> dropped
      {id:'s1', name:'Duplicate id'},              // dupe    -> dropped
    ],
    knots: [{id:'k1', name:'My Knot', custom:true, updatedAt: 50}],
    tips:  [{id:'t1', title:'A tip', body:'x', custom:true}],
    baits: 'not an array',                         // wrong type -> error
  },
});
let r = validateImport(messy);
chk('Wrong-typed list produces an error', r.ok===false && r.errors.some(e=>e.includes('baits')), r.errors.join('|'));

const clean = JSON.stringify({
  app: APP_ID, schema: 2, kind: KIND.PACK,
  catalog: {
    spots: [{id:'s1',name:'Good Spot',custom:true,updatedAt:100}, {id:'s2',name:'',custom:true}, null],
    knots: [{id:'k1',name:'My Knot',custom:true,updatedAt:50}],
  },
});
r = validateImport(clean);
chk('Valid file accepted', r.ok===true, `errors=${r.errors.length}`);
chk('Junk records skipped, good kept', r.data.catalog.spots.length===1 && r.data.catalog.knots.length===1,
    `spots=${r.data.catalog.spots.length} knots=${r.data.catalog.knots.length}`);
chk('Warns about skipped entries', r.warnings.length>0, r.warnings[0]);

console.log('\n-- Prototype pollution / injection attempts --');
const nasty = JSON.stringify({
  app: APP_ID, schema: 2, kind: KIND.FULL,
  catalog: { spots: [{id:'__proto__', name:'evil', polluted:true}, {id:'x', name:'ok'}] },
  trips: [], catches: [],
});
r = validateImport(nasty);
const plan = planImport({catalog:{spots:[],species:[],baits:[],knots:[],tips:[],photos:{}}, log:{trips:[],catches:[]}}, r.data);
chk('No prototype pollution via id "__proto__"', ({}).polluted === undefined, String(({}).polluted));
chk('Map-based merge handles __proto__ id safely', plan.next.catalog.spots.length===2, plan.next.catalog.spots.length);

console.log('\n-- Merge semantics: newest wins, nothing lost --');
let m = mergeList(
  [{id:'a',name:'Mine',updatedAt:200},{id:'b',name:'Only mine',updatedAt:10}],
  [{id:'a',name:'Theirs newer',updatedAt:300},{id:'c',name:'Only theirs',updatedAt:5}]
);
chk('Newer incoming replaces older local', m.list.find(x=>x.id==='a').name==='Theirs newer');
chk('Local-only record survives', !!m.list.find(x=>x.id==='b'));
chk('Incoming-only record added', !!m.list.find(x=>x.id==='c'));
chk('Counts correct (1 added, 1 updated, 0 unchanged)', m.added===1&&m.updated===1&&m.unchanged===0, `+${m.added} ~${m.updated} =${m.unchanged}`);

m = mergeList([{id:'a',name:'Mine newer',updatedAt:900}], [{id:'a',name:'Theirs older',updatedAt:100}]);
chk('Older incoming does NOT clobber newer local', m.list[0].name==='Mine newer' && m.unchanged===1);

m = mergeList([], []);
chk('Empty merge is safe', m.list.length===0);
m = mergeList(undefined, undefined);
chk('Undefined merge is safe', m.list.length===0);

console.log('\n-- Import is idempotent (importing twice changes nothing the 2nd time) --');
const start = {catalog:{spots:[],species:[],baits:[],knots:[],tips:[],photos:{}}, log:{trips:[],catches:[]}};
const pack = validateImport(JSON.stringify({app:APP_ID,schema:2,kind:KIND.PACK,
  catalog:{spots:[{id:'s9',name:'Bend',custom:true,updatedAt:5}],knots:[{id:'k9',name:'Knot',custom:true,updatedAt:5}]}}));
const p1 = planImport(start, pack.data);
const p2 = planImport({catalog:p1.next.catalog, log:p1.next.log}, pack.data);
chk('First import adds 2', p1.totals.added===2, `+${p1.totals.added}`);
chk('Second import adds 0, updates 0', p2.totals.added===0 && p2.totals.updated===0, `+${p2.totals.added} ~${p2.totals.updated}`);
chk('Second import reports all unchanged', p2.totals.unchanged===2, `=${p2.totals.unchanged}`);

console.log('\n-- Pack vs Log separation (the privacy requirement) --');
const catalog = {spots:[{id:'s1',name:'Secret Spot',custom:true},{id:'builtin',name:'Springbank'}],
                 species:[],baits:[],knots:[],tips:[],photos:{smb:'http://x/y.jpg'}};
const log = {trips:[{id:'t1',date:'2026-08-01'}], catches:[{id:'c1',speciesId:'smb',length:14}]};
const packOut = buildExport(KIND.PACK, {catalog, log});
chk('PACK contains no trips', packOut.trips===undefined);
chk('PACK contains no catches', packOut.catches===undefined);
chk('PACK contains custom spots only', packOut.catalog.spots.length===1 && packOut.catalog.spots[0].id==='s1',
    `${packOut.catalog.spots.length} spot(s)`);
chk('PACK excludes built-in spots (no duplicates on import)', !packOut.catalog.spots.find(s=>s.id==='builtin'));
const logOut = buildExport(KIND.LOG, {catalog, log});
chk('LOG contains trips and catches', logOut.trips.length===1 && logOut.catches.length===1);
chk('LOG contains no catalog spots', logOut.catalog===undefined);
const fullOut = buildExport(KIND.FULL, {catalog, log});
chk('FULL contains both', fullOut.trips.length===1 && fullOut.catalog.spots.length===1);
chk('All exports tagged with app+schema', [packOut,logOut,fullOut].every(o=>o.app===APP_ID&&o.schema===SCHEMA_VERSION));
chk('Filenames distinct and dated', new Set([exportFilename(KIND.PACK),exportFilename(KIND.LOG),exportFilename(KIND.FULL)]).size===3,
    exportFilename(KIND.PACK));

console.log('\n-- Round trip: export -> validate -> import --');
const rt = validateImport(JSON.stringify(fullOut));
chk('Own FULL export validates cleanly', rt.ok===true && rt.errors.length===0, `warn=${rt.warnings.length}`);
const rtPlan = planImport(start, rt.data);
chk('Round trip restores trips+catches', rtPlan.next.log.trips.length===1 && rtPlan.next.log.catches.length===1);
chk('Round trip restores photos', rtPlan.next.catalog.photos.smb==='http://x/y.jpg');
chk('Summary lines readable', summaryLines(rtPlan.summary).length>0, summaryLines(rtPlan.summary).join('; '));

console.log('\n-- Schema migration --');
const old = migrateStore({trips:[{id:'t',_v:1}], catches:[{id:'c'}], catalog:{spots:[{id:'s',name:'x',lat:42.9,lon:-81.2,_v:1}]}});
chk('v1 records upgraded to current schema', old.trips[0]._v===SCHEMA_VERSION && old.catalog.spots[0]._v===SCHEMA_VERSION);
chk('v1 spot lat/lon becomes ll pair', Array.isArray(old.catalog.spots[0].ll), JSON.stringify(old.catalog.spots[0].ll));
chk('v1 spot gains hydroStation default', old.catalog.spots[0].hydroStation==='');
chk('Missing updatedAt defaults to 0', old.catches[0].updatedAt===0);
chk('migrateStore on garbage returns empty shape', (()=>{const g=migrateStore(null);return g.trips.length===0&&g.catalog.spots.length===0;})());
chk('migrateStore drops non-object records', migrateStore({trips:[null,'x',{id:'ok'}]}).trips.length===1);

console.log('\n-- Weather shaping is defensive --');
chk('shapeWeather(null) -> null', shapeWeather(null)===null);
chk('shapeWeather({}) -> object with nulls', shapeWeather({}).temp===null);
chk('Partial payload survives', shapeWeather({current:{temperature_2m:14}}).temp===14);
chk('NaN/Infinity rejected', shapeWeather({current:{temperature_2m:NaN,pressure_msl:Infinity}}).temp===null);
chk('String temp rejected', shapeWeather({current:{temperature_2m:'14'}}).temp===null);
chk('Missing hourly -> empty array', Array.isArray(shapeWeather({}).hourly) && shapeWeather({}).hourly.length===0);
chk('pressure falls back to surface_pressure', shapeWeather({current:{surface_pressure:998}}).pressure===998);
chk('Hourly arrays of mismatched length do not throw',
    (()=>{try{const s=shapeWeather({hourly:{time:['a','b'],temperature_2m:[1]}});return s.hourly.length===2&&s.hourly[1].temp===null;}catch{return false;}})());

console.log('\n-- URLs well formed --');
chk('Weather URL has lat/lon + current params', (()=>{const u=new URL(weatherUrl(42.98,-81.24));
  return u.searchParams.get('latitude')==='42.98' && u.searchParams.get('current').includes('pressure_msl');})(),
  weatherUrl(42.98,-81.24).slice(0,72)+'…');
chk('Station search URL has a bbox', stationSearchUrl(42.98,-81.24).includes('bbox='));
chk('Hydro reading URL filters by station', hydroReadingUrl('02GD003').includes('STATION_NUMBER=02GD003'));

console.log('\n-- Misc helpers --');
chk('WMO code 0 = Clear', describeWeather(0)==='Clear');
chk('Unknown WMO code degrades gracefully', describeWeather(1234)==='Unknown');
chk('Compass N', compassPoint(0)==='N');
chk('Compass W', compassPoint(270)==='W');
chk('Compass handles non-number', compassPoint(null)==='');
chk('flowContext null-safe', flowContext(null)===null);
chk('High flow flagged', flowContext(120,true).level==='high', flowContext(120,true).level);
chk('Low flow flagged', flowContext(2,false).level==='low');
chk('Normal flow', flowContext(16,true).level==='normal');
chk('isStale with no timestamp = true', isStale(null,1000)===true);
chk('agoLabel(null)', agoLabel(null)==='never');
chk('agoLabel recent', agoLabel(Date.now()-30000)==='just now', agoLabel(Date.now()-30000));

console.log('\n-- Pressure reading buffer --');
let buf=[]; const H=3600000;
for(let i=0;i<100;i++) buf = pushPressureReading(buf, 1000+i, Date.now()-(100-i)*H);
chk('Buffer capped at 40', buf.length===40, buf.length);
chk('Keeps most recent', buf[buf.length-1].pressure===1099);
chk('Rejects non-numeric pressure', pushPressureReading([], 'abc').length===0);
chk('Rejects NaN pressure', pushPressureReading([], NaN).length===0);
const dd = pushPressureReading(pushPressureReading([],1010,1000), 1011, 1000+60000);
chk('Collapses readings under 20 min apart', dd.length===1 && dd[0].pressure===1011, dd.length);

console.log(`\n=== SCAN 2 RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
