/* tools/build-map-index.mjs, run for real against throwaway map/ directories.

   The index decides what the region dropdown offers. If it lists a region
   whose file is broken, or claims the wrong thing is precached, the app
   offers a map that will not open — so the tool's job is to be picky, and
   this checks that it is. */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ''}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tool = path.join(root, 'tools', 'build-map-index.mjs');

/* The tool reads ./map and ./sw.js from the working directory, so each case
   gets a whole throwaway project rather than a shared one. */
function project(regions, { swAssets = ['./map/london-on.json'] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lfc-idx-'));
  fs.mkdirSync(path.join(dir, 'map'));
  for (const [name, body] of Object.entries(regions)) {
    fs.writeFileSync(path.join(dir, 'map', name),
      typeof body === 'string' ? body : JSON.stringify(body));
  }
  fs.writeFileSync(path.join(dir, 'sw.js'),
    `const CACHE = "lfc-v1";\nconst ASSETS = [${swAssets.map((a) => `"${a}"`).join(', ')}];\n`);
  return dir;
}

const region = (id, extra = {}) => ({
  schema: 1, region: id, name: id, centre: [42.98, -81.24], radiusKm: 50,
  bbox: [-81.9, 42.5, -80.6, 43.4], generatedAt: '2026-09-07T00:00:00Z',
  layers: { river: { scale: 5, lines: [[1, 2, 3, 4]] }, place: [[42.9, -81.2, 'X', 2]] },
  ...extra,
});

const run = (dir) => {
  const r = spawnSync(process.execPath, [tool], { cwd: dir, encoding: 'utf8' });
  return { ok: r.status === 0, out: String(r.stdout || '') + String(r.stderr || '') };
};
const readIndex = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'map', 'index.json'), 'utf8'));

console.log('\n=== MAP INDEX ===\n');
console.log('-- a normal project --');

{
  const dir = project({
    'london-on.json': region('london-on'),
    'windsor-on.json': region('windsor-on'),
  });
  const r = run(dir);
  chk('It builds', r.ok, r.out.trim().slice(0, 160));
  const idx = readIndex(dir);
  chk('Both regions are listed', idx.regions.length === 2);
  chk('The precached one is flagged from sw.js, not guessed',
      idx.regions.find((x) => x.id === 'london-on').bundled === true &&
      idx.regions.find((x) => x.id === 'windsor-on').bundled === false);
  chk('The default is the one that ships with the app', idx.defaultRegion === 'london-on');
  chk('Each region carries a real byte size', idx.regions.every((x) => x.bytes > 0));
  chk('and a brotli size, which is what the browser actually downloads',
      idx.regions.every((x) => x.brotli > 0 && x.brotli < x.bytes));
  chk('It says it is derived, so nobody hand-edits it', /[Dd]erived/.test(idx.note || ''));
  chk('Layer counts are carried for the dropdown to describe a region',
      idx.regions[0].counts && idx.regions[0].counts.river === 1);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n-- it refuses to list what it cannot vouch for --');

{
  const dir = project({
    'london-on.json': region('london-on'),
    'broken.json': '{ not json at all',
  });
  const r = run(dir);
  chk('A region file that is not JSON is skipped, not fatal', r.ok);
  chk('and it says which one', /broken/.test(r.out));
  chk('and it is not in the index', readIndex(dir).regions.length === 1);
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  /* A file whose internal id disagrees with its name would be fetched under
     one name and answer to another. */
  const dir = project({
    'london-on.json': region('london-on'),
    'windsor-on.json': region('some-other-place'),
  });
  const r = run(dir);
  chk('A file that calls itself something else is skipped',
      r.ok && readIndex(dir).regions.length === 1);
  chk('and it says why', /calls itself/.test(r.out));
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = project({
    'london-on.json': region('london-on'),
    'notaregion.json': { hello: 'world' },
  });
  run(dir);
  chk('A JSON file that is not a region file is skipped',
      readIndex(dir).regions.length === 1);
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = project({ 'london-on.json': region('london-on') });
  run(dir);
  const idx = readIndex(dir);
  chk('index.json does not list itself', !idx.regions.some((x) => x.id === 'index'));
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n-- the precache claim has to be true --');

{
  /* Exactly one region belongs in the service worker's ASSETS: it is what the
     app opens with no connection and having none, or two, is a mistake worth
     hearing about. */
  const dir = project({
    'london-on.json': region('london-on'),
    'windsor-on.json': region('windsor-on'),
  }, { swAssets: ['./map/london-on.json', './map/windsor-on.json'] });
  const r = run(dir);
  chk('Two precached regions is complained about', /expected exactly 1/.test(r.out));
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = project({ 'london-on.json': region('london-on') }, { swAssets: [] });
  const r = run(dir);
  chk('No precached region is complained about', /expected exactly 1/.test(r.out));
  chk('but it still names a default, rather than leaving the app with none',
      readIndex(dir).defaultRegion === 'london-on');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n-- nothing to index --');

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lfc-idx-'));
  fs.writeFileSync(path.join(dir, 'sw.js'), 'const ASSETS = [];');
  const r = run(dir);
  chk('No map directory is an error, not an empty index', !r.ok && /map\//.test(r.out));
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = project({});
  const r = run(dir);
  chk('An empty map directory is an error too', !r.ok);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------------- experimental status ----------------

   Every one of these shapes actually shipped or nearly shipped. The point of
   the flag is that the app can say so instead of quietly handing somebody a
   map with holes in it, so the rules need to stay exactly this literal. */
console.log('\n-- experimental status --');

const healthy = (id, extra = {}) => region(id, {
  layers: {
    river: { scale: 5, lines: [[1, 2, 3, 4]] },
    water: { scale: 5, lines: [[1, 2, 3, 4]] },
    street: { scale: 5, lines: Array.from({ length: 30 }, () => [1, 2, 3, 4]) },
    place: Array.from({ length: 12 }, (_, i) => [42.9 + i / 100, -81.2, 'T' + i, 2]),
    poi: Array.from({ length: 20 }, (_, i) => [42.9, -81.2, 'pier', 'P' + i]),
  },
  ...extra,
});

{
  const dir = project({ 'london-on.json': healthy('london-on') });
  run(dir);
  const r = readIndex(dir).regions[0];
  chk('A complete region is not flagged', r.status === undefined, r.status || 'no status');
}

{
  /* grand-bend-on, exactly: one named place across a 50 km radius, because
     the area-clipped half of the place query came back empty. */
  const dir = project({
    'london-on.json': healthy('london-on'),
    'grand-bend-on.json': healthy('grand-bend-on', {
      layers: {
        river: { scale: 5, lines: [[1, 2, 3, 4]] },
        water: { scale: 5, lines: [[1, 2, 3, 4]] },
        street: { scale: 5, lines: Array.from({ length: 30 }, () => [1, 2, 3, 4]) },
        poi: [[42.9, -81.2, 'pier', 'P1']],
        place: [[42.9, -81.2, 'London', 3]],
      },
    }),
  });
  run(dir);
  const gb = readIndex(dir).regions.find((x) => x.id === 'grand-bend-on');
  chk('One place across 50 km is flagged', gb.status === 'experimental', gb.status);
  chk('...and says why', /only 1 named place/.test(gb.statusReason || ''), gb.statusReason);
}

{
  /* goderich-on, exactly: everything healthy except no points of interest. */
  const dir = project({
    'london-on.json': healthy('london-on'),
    'goderich-on.json': healthy('goderich-on', {
      layers: {
        river: { scale: 5, lines: [[1, 2, 3, 4]] },
        water: { scale: 5, lines: [[1, 2, 3, 4]] },
        street: { scale: 5, lines: Array.from({ length: 30 }, () => [1, 2, 3, 4]) },
        place: Array.from({ length: 28 }, (_, i) => [42.9, -81.2, 'T' + i, 2]),
      },
    }),
  });
  run(dir);
  const g = readIndex(dir).regions.find((x) => x.id === 'goderich-on');
  chk('A region with no POIs is flagged', g.status === 'experimental', g.status);
  chk('...and says why', /no points of interest/.test(g.statusReason || ''), g.statusReason);
}

{
  /* The escape hatch has to travel in the region file, or a declared-remote
     region gets flagged again every time the index is rebuilt. */
  const dir = project({
    'london-on.json': healthy('london-on'),
    'remote-on.json': healthy('remote-on', {
      sparsePlaces: true,
      layers: {
        river: { scale: 5, lines: [[1, 2, 3, 4]] },
        water: { scale: 5, lines: [[1, 2, 3, 4]] },
        street: { scale: 5, lines: Array.from({ length: 30 }, () => [1, 2, 3, 4]) },
        poi: [[42.9, -81.2, 'pier', 'P1']],
        place: [[42.9, -81.2, 'Nowhere', 2]],
      },
    }),
  });
  run(dir);
  const rm = readIndex(dir).regions.find((x) => x.id === 'remote-on');
  chk('sparsePlaces travels into the index', rm.sparsePlaces === true, rm.sparsePlaces);
  chk('...and excuses a short place layer', rm.status === undefined, rm.status || 'no status');
}

console.log(`\n=== MAP INDEX RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
