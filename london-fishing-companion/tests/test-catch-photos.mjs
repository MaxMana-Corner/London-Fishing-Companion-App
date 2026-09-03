/* Behavioural check of the catch-photo export/import path.
   Not a grep test — actually runs the round trip. */
import { buildExport, validateImport, planImport, KIND, APP_ID }
  from '../src/portability.js';

let pass = 0, fail = 0;
const chk = (n, c, g) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}   got: ${g}`); } };

const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const THUMB = 'data:image/jpeg;base64,/9j/thumb==';

const catalog = { spots: [], species: [], baits: [], knots: [], tips: [], photos: {} };
const log = {
  trips: [{ id: 't1', date: '2026-08-01', spotId: 's1', updatedAt: 10 }],
  catches: [
    { id: 'c1', tripId: 't1', speciesId: 'smb', photoId: 'p1', updatedAt: 10 },
    { id: 'c2', tripId: 't1', speciesId: 'smb', photoId: 'p2', updatedAt: 10 },
    { id: 'c3', tripId: 't1', speciesId: 'smb', photoId: '', updatedAt: 10 },
  ],
};
const catchPhotos = [
  { id: 'p1', catchId: 'c1', thumb: THUMB, full: JPG, type: 'image/jpeg', bytes: 1234, takenAt: 5, driveId: null, driveLink: null, archivedAt: null },
  { id: 'p2', catchId: 'c2', thumb: THUMB, full: null, type: 'image/jpeg', bytes: 900, takenAt: 6, driveId: 'gd9', driveLink: 'http://x', archivedAt: 7 },
];

console.log('\n-- Export carries the pictures, not just the ids --');
const full = buildExport(KIND.FULL, { catalog, log, catchPhotos });
chk('FULL export includes catchPhotos', Array.isArray(full.catchPhotos) && full.catchPhotos.length === 2, JSON.stringify(full.catchPhotos?.length));
chk('Local photo travels with full-size bytes', full.catchPhotos[0].full === JPG);
chk('Archived photo travels as thumbnail only', full.catchPhotos[1].full === null && full.catchPhotos[1].thumb === THUMB);
const logOnly = buildExport(KIND.LOG, { catalog, log, catchPhotos });
chk('LOG export includes catchPhotos', logOnly.catchPhotos.length === 2);
const pack = buildExport(KIND.PACK, { catalog, log, catchPhotos });
chk('PACK export carries NO catch photos (privacy)', pack.catchPhotos === undefined, JSON.stringify(pack.catchPhotos));

console.log('\n-- Every catch photoId resolves to a photo in the same file --');
const ids = new Set(full.catchPhotos.map(p => p.id));
const dangling = full.catches.filter(c => c.photoId && !ids.has(c.photoId));
chk('No dangling photoId in the export', dangling.length === 0, JSON.stringify(dangling.map(c => c.photoId)));

console.log('\n-- Validation --');
const v = validateImport(JSON.stringify(full));
chk('Own export validates cleanly', v.ok && v.errors.length === 0, v.errors.join('|'));
chk('Photos survive validation', v.data.catchPhotos.length === 2, v.data.catchPhotos.length);
chk('Link preserved through validation',
  v.data.catches.find(c => c.id === 'c1').photoId === 'p1');

const nasty = validateImport(JSON.stringify({
  app: APP_ID, schema: 2, kind: 'full', catches: [],
  catchPhotos: [
    { id: 'ok', thumb: THUMB },
    { id: 'ok', thumb: THUMB },                       // dupe -> dropped
    { id: 'noimg' },                                  // no image at all -> dropped
    { id: 'evil', thumb: 'javascript:alert(1)' },     // not a data: image -> dropped
    { id: 'x', full: 'data:text/html,<script>' },     // not an image mime -> dropped
    { thumb: THUMB },                                 // no id -> dropped
    null,
  ],
}));
chk('Hostile/malformed photo entries all dropped', nasty.data.catchPhotos.length === 1, JSON.stringify(nasty.data.catchPhotos.map(p => p.id)));
chk('Only the good one survives', nasty.data.catchPhotos[0].id === 'ok');
chk('A non-image data URL is rejected', !nasty.data.catchPhotos.some(p => p.id === 'x'));
chk('catchPhotos wrong type is an error', validateImport(JSON.stringify({ app: APP_ID, schema: 2, kind: 'full', catchPhotos: 'nope' })).ok === false);

console.log('\n-- Merge plan counts photos honestly --');
const p1 = planImport({ catalog, log: { trips: [], catches: [] }, photoIds: new Set() }, v.data);
chk('All photos counted as new on a clean device', p1.summary.catchPhotos.added === 2, JSON.stringify(p1.summary.catchPhotos));
chk('Photos threaded into next for the commit step', p1.next.catchPhotos.length === 2);
const p2 = planImport({ catalog, log: { trips: [], catches: [] }, photoIds: new Set(['p1', 'p2']) }, v.data);
chk('Already-held photos counted as unchanged', p2.summary.catchPhotos.unchanged === 2 && p2.summary.catchPhotos.added === 0, JSON.stringify(p2.summary.catchPhotos));
chk('planImport without photoIds does not throw', (() => {
  try { return planImport({ catalog, log: { trips: [], catches: [] } }, v.data).summary.catchPhotos.added === 2; } catch { return false; }
})());

console.log(`\n=== CATCH PHOTO RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
