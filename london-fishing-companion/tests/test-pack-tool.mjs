/* Round-trip test for tools/make-pack.mjs.

   The tool is run as a real subprocess against the real templates, and its
   output is then put through the app's own validators. That is the whole
   point of the tool: if it writes a file, the app reads it. A test that
   checked its internals instead of its output would not prove that. */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { validateImport } from '../src/portability.js';
import { validatePinSet } from '../src/community.js';

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ''}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tool = path.join(root, 'tools', 'make-pack.mjs');
const template = path.join(root, 'tools', 'pack-template');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lfc-pack-'));

/* Both streams: the tool reports dropped rows on stderr, and a test that
   only read stdout would call that silence. */
const run = (args) => {
  const r = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: String(r.stdout || '') + String(r.stderr || '') };
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

console.log('\n-- the template builds --');

const outA = path.join(tmp, 'a');
const r1 = run([template, '--id', 'test-pack', '--title', 'Test pack',
                '--author', 'Tester', '--out', outA, '--quiet']);
chk('The shipped template builds without complaint', r1.ok, r1.out.trim().slice(0, 200));
chk('It wrote a pack', fs.existsSync(path.join(outA, 'test-pack.json')));
chk('It wrote the pin set separately', fs.existsSync(path.join(outA, 'test-pack-pins.json')));

const pack = readJson(path.join(outA, 'test-pack.json'));
const pinSet = readJson(path.join(outA, 'test-pack-pins.json'));

console.log('\n-- the app would accept it --');

const vPack = validateImport(JSON.stringify(pack));
chk('The pack passes the app\'s own import validator', vPack.ok, (vPack.errors || []).join('; '));
chk('No warnings either — nothing was silently dropped',
    (vPack.warnings || []).length === 0, (vPack.warnings || []).join('; '));
const vPins = validatePinSet(JSON.stringify(pinSet));
chk('The pin set passes the app\'s own pin validator', vPins.ok, (vPins.errors || []).join('; '));
chk('Both pins survived validation', vPins.pins.length === 2, vPins.pins.length);

chk('The envelope says what the app looks for',
    pack.app === 'london-fishing-companion' && pack.kind === 'pack' && pack.schema === 2);
chk('The directory metadata is carried',
    pack.meta && pack.meta.id === 'test-pack' && pack.meta.title === 'Test pack' &&
    pack.meta.author === 'Tester');

console.log('\n-- the awkward columns decode --');

const spot = pack.catalog.spots[0];
chk('lat and lon become one coordinate pair',
    Array.isArray(spot.ll) && spot.ll.length === 2 &&
    Math.abs(spot.ll[0] - 42.9849) < 1e-9 && Math.abs(spot.ll[1] + 81.2453) < 1e-9);
chk('A pipe-separated number list becomes numbers, not strings',
    Array.isArray(spot.depth) && spot.depth.length === 12 &&
    spot.depth.every((n) => typeof n === 'number') && spot.depth[5] === 4.5);
chk('Months come through as numbers', JSON.stringify(spot.best) === '[5,6,7,8,9]');
chk('key:value pairs become an object', spot.density && spot.density.carp === 4 && spot.density.smb === 3);
chk('The access ratings all land', spot.access && spot.access.parking === 4 && spot.access.cost === 5);
chk('index:description becomes the feature shape the app draws',
    Array.isArray(spot.hot) && spot.hot[0].i === 4 && /Undercut bank/.test(spot.hot[0].n));
chk('A comma inside a quoted cell does not split the field',
    /Free lot off Riverside, 200 m/.test(spot.accessNote || ''), spot.accessNote);
chk('An em dash survives the round trip', /—/.test(spot.water || ''), spot.water);
chk('Knot steps stay as separate instructions',
    pack.catalog.knots[0].steps.length === 4 &&
    /^Pass 6 inches/.test(pack.catalog.knots[0].steps[0]));
chk('A semicolon inside prose does not split a list',
    pack.catalog.spots[0].marks.length === 2, JSON.stringify(spot.marks));

console.log('\n-- bookkeeping --');

chk('Catalog records are stamped as custom, so they merge as yours',
    pack.catalog.spots.every((r) => r.custom === true && r._v === 2 && r.updatedAt > 0));
chk('Pins are NOT stamped with catalog bookkeeping',
    pinSet.pins.every((p) => p.custom === undefined && p._v === undefined));
chk('Pins get both a created and an updated time',
    pinSet.pins.every((p) => p.createdAt > 0 && p.updatedAt > 0));
chk('The commented instruction rows in the template are not imported',
    pack.catalog.spots.length === 1 && pack.catalog.tips.length === 1,
    `${pack.catalog.spots.length} spots, ${pack.catalog.tips.length} tips`);

console.log('\n-- bad rows are refused, not smuggled --');

const bad = path.join(tmp, 'bad-src');
fs.mkdirSync(bad, { recursive: true });
fs.writeFileSync(path.join(bad, 'spots.csv'),
  'id,name,lat,lon\n' +
  'good,Good Spot,42.98,-81.25\n' +
  ',No Id Here,42.98,-81.25\n' +
  'good,Duplicate Id,42.98,-81.25\n' +
  'bad-coord,Bad Coord,999,-81.25\n');
const outB = path.join(tmp, 'b');
const r2 = run([bad, '--id', 'bad-rows', '--title', 'Bad rows', '--out', outB]);
chk('A file with some bad rows still builds', r2.ok, r2.out.trim().slice(0, 160));
const badPack = r2.ok ? readJson(path.join(outB, 'bad-rows.json')) : { catalog: { spots: [] } };
chk('Only the good row survives', badPack.catalog.spots.length === 1, badPack.catalog.spots.length);
chk('It says which rows it dropped and why',
    /no id/i.test(r2.out) && /duplicate id/i.test(r2.out) && /coordinate/i.test(r2.out));

const empty = path.join(tmp, 'empty-src');
fs.mkdirSync(empty, { recursive: true });
fs.writeFileSync(path.join(empty, 'spots.csv'), 'id,name,lat,lon\n');
const r3 = run([empty, '--id', 'empty', '--title', 'Empty', '--out', path.join(tmp, 'c')]);
chk('A spreadsheet with nothing in it is an error, not an empty pack', !r3.ok);

const r4 = run([template, '--title', 'No id', '--out', path.join(tmp, 'd')]);
chk('It refuses to build without an id', !r4.ok && /--id is required/.test(r4.out));
const r5 = run([template, '--id', 'Not A Slug', '--title', 'x', '--out', path.join(tmp, 'e')]);
chk('It refuses an id that would not work as a file name', !r5.ok && /lower case/.test(r5.out));

console.log('\n-- curating from other packs --');

/* Two packs sharing an id: the newer updatedAt must win, which is the same
   rule the app merges by. */
const older = path.join(tmp, 'older.json');
const newer = path.join(tmp, 'newer.json');
const mk = (name, at) => JSON.stringify({
  app: 'london-fishing-companion', schema: 2, kind: 'pack',
  exportedAt: '2026-01-01T00:00:00Z',
  catalog: { spots: [{ id: 'shared', name, custom: true, _v: 2, updatedAt: at }] },
});
fs.writeFileSync(older, mk('Older name', 1000));
fs.writeFileSync(newer, mk('Newer name', 9999999999999));

const outC = path.join(tmp, 'f');
const r6 = run(['--id', 'merged', '--title', 'Merged', '--out', outC,
                '--merge', older, '--merge', newer]);
chk('It builds from merges alone, with no spreadsheet', r6.ok, r6.out.trim().slice(0, 160));
const merged = r6.ok ? readJson(path.join(outC, 'merged.json')) : { catalog: { spots: [] } };
chk('Two records sharing an id collapse to one', merged.catalog.spots.length === 1);
chk('The newer record wins, as it does in the app',
    merged.catalog.spots[0] && merged.catalog.spots[0].name === 'Newer name',
    merged.catalog.spots[0] && merged.catalog.spots[0].name);

const brokenFile = path.join(tmp, 'broken.json');
fs.writeFileSync(brokenFile, JSON.stringify({ app: 'some-other-app' }));
const r7 = run(['--id', 'from-broken', '--title', 'x', '--merge', brokenFile, '--out', path.join(tmp, 'g')]);
chk('A contribution the app would reject stops the build rather than half-merging',
    !r7.ok && /not a pack this app would accept/i.test(r7.out));

console.log('\n-- checking a file on its own --');

const r8 = run(['--check', path.join(outA, 'test-pack.json')]);
chk('--check accepts a good pack and lists what is in it',
    r8.ok && /OK/.test(r8.out) && /spots:1/.test(r8.out), r8.out.trim().slice(0, 120));
const r9 = run(['--check', brokenFile]);
chk('--check exits non-zero on a file the app would refuse', !r9.ok);

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n=== PACK TOOL RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
