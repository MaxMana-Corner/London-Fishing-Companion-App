import { sunTimes, moonPhase, moonTimes, solunar, pressureTrend, windowScore, activeWindow } from './src/astro.js';

const LAT = 42.9849, LON = -81.2453; // London, Ontario
let pass = 0, fail = 0;
const chk = (name, cond, got) => { if (cond) { pass++; console.log(`  PASS  ${name}${got!==undefined?`  (${got})`:''}`); } else { fail++; console.log(`  FAIL  ${name}  got: ${got}`); } };
const hhmm = d => d ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : 'null';
const mins = d => d ? d.getHours()*60 + d.getMinutes() : null;

console.log('\n=== SCAN 1: astronomy correctness ===\n');
console.log('-- Sunrise/sunset, London ON (expect EDT/EST local wall clock) --');

// Node runs UTC by default; force the real timezone so local-time assertions mean something.
process.env.TZ = 'America/Toronto';

// Summer solstice 2026: London ON sunrise ~05:52 EDT, sunset ~21:07 EDT
let t = sunTimes(new Date(2026,5,21), LAT, LON);
chk('Jun 21 sunrise within 10 min of 05:52', Math.abs(mins(t.sunrise) - (5*60+52)) <= 10, hhmm(t.sunrise));
chk('Jun 21 sunset  within 10 min of 21:07', Math.abs(mins(t.sunset)  - (21*60+7)) <= 10, hhmm(t.sunset));

// Winter solstice 2026: sunrise ~07:56 EST, sunset ~16:59 EST
t = sunTimes(new Date(2026,11,21), LAT, LON);
chk('Dec 21 sunrise within 10 min of 07:56', Math.abs(mins(t.sunrise) - (7*60+56)) <= 10, hhmm(t.sunrise));
chk('Dec 21 sunset  within 10 min of 16:59', Math.abs(mins(t.sunset)  - (16*60+59)) <= 10, hhmm(t.sunset));

// Equinox: day length ~12h
t = sunTimes(new Date(2026,2,20), LAT, LON);
const dayLen = (t.sunset - t.sunrise)/3600000;
chk('Mar 20 day length ~12h (11.8-12.4)', dayLen > 11.8 && dayLen < 12.4, dayLen.toFixed(2)+'h');

// Sanity: summer day longer than winter day
const s = sunTimes(new Date(2026,5,21), LAT, LON), w = sunTimes(new Date(2026,11,21), LAT, LON);
chk('Summer day > winter day', (s.sunset-s.sunrise) > (w.sunset-w.sunrise),
    `${((s.sunset-s.sunrise)/3600000).toFixed(1)}h vs ${((w.sunset-w.sunrise)/3600000).toFixed(1)}h`);

console.log('\n-- Moon phase against known events --');
// Known new moons (UTC): 2026-01-18, 2026-02-17. Known full moons: 2026-01-03, 2026-06-29
const newMoons = ['2026-01-18','2026-02-17'];
const fullMoons = ['2026-01-03','2026-06-29'];
for (const d of newMoons) {
  const p = moonPhase(new Date(d+'T12:00:00Z'));
  chk(`New moon ${d}: illumination < 0.10`, p.illumination < 0.10, p.illumination.toFixed(3)+' '+p.name);
}
for (const d of fullMoons) {
  const p = moonPhase(new Date(d+'T12:00:00Z'));
  chk(`Full moon ${d}: illumination > 0.90`, p.illumination > 0.90, p.illumination.toFixed(3)+' '+p.name);
}
// Cycle length: illumination should return to same state ~29.53 days later
const a = moonPhase(new Date('2026-03-01T00:00:00Z'));
const b = moonPhase(new Date(new Date('2026-03-01T00:00:00Z').getTime()+29.530588853*86400000));
chk('Phase repeats after one synodic month', Math.abs(a.phase-b.phase) < 0.02, `${a.phase.toFixed(3)} vs ${b.phase.toFixed(3)}`);

console.log('\n-- Moon rise/set and solunar --');
const mt = moonTimes(new Date(2026,8,2), LAT, LON);
chk('Moon transit exists', mt.transit instanceof Date, hhmm(mt.transit));
chk('Moon peak altitude plausible (-90..90)', mt.maxAltitude > -90 && mt.maxAltitude < 90, mt.maxAltitude.toFixed(1)+'°');

const sol = solunar(new Date(2026,8,2), LAT, LON);
chk('Two major windows', sol.majors.length === 2, sol.majors.length);
chk('Majors are 2h wide', Math.abs((sol.majors[0].end - sol.majors[0].start)/3600000 - 2) < 0.01,
    ((sol.majors[0].end-sol.majors[0].start)/3600000).toFixed(2)+'h');
chk('Minors are 1h wide', sol.minors.length===0 || Math.abs((sol.minors[0].end - sol.minors[0].start)/3600000 - 1) < 0.01,
    sol.minors.length ? ((sol.minors[0].end-sol.minors[0].start)/3600000).toFixed(2)+'h' : 'none today');
chk('Rating in 1..4', sol.rating>=1 && sol.rating<=4, sol.rating);
// transit and anti-transit should be ~12h25m apart (mod 24h)
const gap = Math.abs(sol.majors[0].centre - sol.majors[1].centre)/3600000;
chk('Transit/anti-transit separated 5-19h', gap>5 && gap<19, gap.toFixed(1)+'h');
chk('activeWindow returns null|major|minor', [null,'major','minor'].includes(activeWindow(sol, new Date(2026,8,2,12))), String(activeWindow(sol,new Date(2026,8,2,12))));

console.log('\n-- Rating peaks at new/full moon --');
let ratings = {};
for (const d of ['2026-01-18','2026-01-26','2026-01-03']) {
  ratings[d] = solunar(new Date(d+'T12:00:00'), LAT, LON).rating;
}
chk('New moon rating >= quarter moon rating', ratings['2026-01-18'] >= ratings['2026-01-26'],
    `new=${ratings['2026-01-18']} quarter=${ratings['2026-01-26']} full=${ratings['2026-01-03']}`);

console.log('\n-- Pressure trend --');
const H = 3600000, now = Date.now();
chk('No readings -> unknown', pressureTrend([]).trend === 'unknown');
chk('One reading -> unknown', pressureTrend([{pressure:1013, at:now}]).trend === 'unknown');
chk('Drop 4 hPa over 12h -> falling',
    pressureTrend([{pressure:1017,at:now-12*H},{pressure:1013,at:now}]).trend === 'falling');
chk('Rise 4 hPa over 12h -> rising',
    pressureTrend([{pressure:1009,at:now-12*H},{pressure:1013,at:now}]).trend === 'rising');
chk('Drift 0.4 hPa -> steady',
    pressureTrend([{pressure:1012.6,at:now-12*H},{pressure:1013,at:now}]).trend === 'steady');
chk('Garbage entries ignored',
    pressureTrend([null,{pressure:'x',at:now},{pressure:1017,at:now-12*H},{pressure:1013,at:now}]).trend === 'falling');
chk('Readings under 1h apart -> unknown',
    pressureTrend([{pressure:1017,at:now-1000},{pressure:1013,at:now}]).trend === 'unknown');

console.log('\n-- Window score --');
let sc = windowScore({solunarState:'major', hour:6, sunrise:new Date(2026,8,2,6,50), sunset:new Date(2026,8,2,20,3), weather:{cloud:80,wind:12,pressureTrend:'falling'}});
chk('Great conditions score >= 75', sc.score >= 75, `${sc.score} ${sc.label}`);
sc = windowScore({solunarState:null, hour:13, sunrise:new Date(2026,8,2,6,50), sunset:new Date(2026,8,2,20,3), weather:{cloud:0,wind:40,pressureTrend:'rising'}});
chk('Poor conditions score <= 35', sc.score <= 35, `${sc.score} ${sc.label}`);
sc = windowScore({solunarState:'minor', hour:9, sunrise:new Date(2026,8,2,6,50), sunset:new Date(2026,8,2,20,3), weather:null});
chk('Works with NO weather (offline path)', typeof sc.score==='number' && sc.score>=0 && sc.score<=100, `${sc.score} ${sc.label}`);
chk('Score always clamped 0..100', [0,6,13,23].every(h=>{const r=windowScore({solunarState:'major',hour:h,sunrise:new Date(2026,8,2,6,50),sunset:new Date(2026,8,2,20,3),weather:{cloud:100,wind:0,pressureTrend:'falling',precipProb:0}});return r.score>=0&&r.score<=100;}));

console.log('\n-- Edge cases: extreme latitudes must not throw or lie --');
try {
  const arctic = sunTimes(new Date(2026,5,21), 78.2, 15.6); // Svalbard, midnight sun
  chk('Polar day returns null sunrise rather than a fake time', arctic.sunrise === null && arctic.sunset === null,
      `rise=${hhmm(arctic.sunrise)} set=${hhmm(arctic.sunset)}`);
  const eq = sunTimes(new Date(2026,5,21), 0, 0);
  chk('Equator works', eq.sunrise instanceof Date, hhmm(eq.sunrise));
  const sol2 = solunar(new Date(2026,5,21), 78.2, 15.6);
  chk('Solunar at extreme latitude does not throw', Array.isArray(sol2.majors), `${sol2.majors.length} majors`);
} catch (err) { chk('Extreme latitude no-throw', false, err.message); }

console.log(`\n=== SCAN 1 RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
