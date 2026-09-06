import fs from 'fs';
import { shapeIndex, shapeStats, scoreFor, withScores, filterEntries, sortEntries,
         describeCounts, tagCommunityRecords, isCommunityRecord, withoutCommunity,
         isoToMs, ENTRY_TYPES } from '../src/community.js';
import { isSafeCommunityPath, communityFileUrl, communityIndexUrl,
         communityStatsUrl } from '../src/services.js';
import { validateImport, planImport, buildExport, KIND, APP_ID } from '../src/portability.js';

let pass=0, fail=0;
const chk=(n,c,g)=>{ if(c){pass++;console.log(`  PASS  ${n}${g!==undefined?`  (${g})`:''}`);} else {fail++;console.log(`  FAIL  ${n}  got: ${g}`);} };

console.log('\n=== SCAN 13: community directory ===\n');

/* index.json is a file strangers open pull requests against, and its
   `path` values build URLs. A hostile entry must not point the app
   anywhere it likes. */
console.log('-- Path guard (the index is untrusted input) --');
const goodPaths = [
  'packs/example-starter-pack.json',
  'locations/river-bend.json',
  'pins/snags-2026.json',
  'locations/river-bend/photo.webp',
];
for (const p of goodPaths) chk(`Accepts ${p}`, isSafeCommunityPath(p) === true);

const badPaths = [
  ['traversal', '../../../etc/passwd'],
  ['traversal inside a good folder', 'packs/../../secret.json'],
  ['absolute url', 'https://evil.example/x.json'],
  ['protocol-relative', '//evil.example/x.json'],
  ['backslash', 'packs\evil.json'],
  ['wrong folder', '.github/workflows/deploy.yml'],
  ['no extension', 'packs/evil'],
  ['wrong extension', 'packs/evil.js'],
  ['empty', ''],
  ['not a string', 42],
  ['null', null],
  ['leading slash', '/packs/x.json'],
  ['leading dot', 'packs/.hidden.json'],
  ['query string', 'packs/x.json?a=1'],
];
for (const [name, p] of badPaths) chk(`Refuses ${name}`, isSafeCommunityPath(p) === false, JSON.stringify(p));

chk('communityFileUrl returns null for a bad path', communityFileUrl('../x.json') === null);
chk('communityFileUrl builds a url for a good path',
    communityFileUrl('packs/a.json').endsWith('/main/packs/a.json'));
chk('Index and stats urls are on the same base',
    communityIndexUrl().endsWith('/index.json') && communityStatsUrl().endsWith('/stats.json'));

/* One broken entry must not take the directory down. */
console.log('\n-- Index shaping (degrade, do not collapse) --');
for (const [name, raw] of [
  ['null', null], ['a string', 'nope'], ['an array', [1,2]],
  ['object with no entries', { schema: 1 }], ['entries not a list', { entries: 'x' }],
]) {
  const r = shapeIndex(raw);
  chk(`Rejects ${name}`, r.ok === false && r.entries.length === 0 && !!r.error, r.error);
}

const messyIndex = {
  schema: 1,
  generatedAt: '2026-09-06T00:00:00Z',
  entries: [
    { id:'a', type:'pack', title:'Good pack', path:'packs/a.json', author:'Ann',
      description:'A real one', updatedAt:'2026-09-01T00:00:00Z', counts:{ spots:2, tips:1 } },
    { id:'b', type:'pins', title:'Good pins', path:'pins/b.json', counts:{ pins:3 } },
    { id:'a', type:'pack', title:'Duplicate id', path:'packs/dupe.json' },
    { id:'', type:'pack', title:'No id', path:'packs/c.json' },
    { id:'d', type:'nonsense', title:'Bad type', path:'packs/d.json' },
    { id:'e', type:'pack', title:'', path:'packs/e.json' },
    { id:'f', type:'pack', title:'No path', path:'' },
    'not an object', null, 42,
  ],
};
const idx = shapeIndex(messyIndex);
chk('Keeps the good entries', idx.ok && idx.entries.length === 2, idx.entries.length);
chk('Counts what it dropped', idx.dropped === 8, idx.dropped);
chk('Duplicate id dropped, first kept', idx.entries.filter(e=>e.id==='a').length === 1);
chk('First-seen wins on duplicate id', idx.entries.find(e=>e.id==='a').title === 'Good pack');
chk('Missing author defaults, not blank', idx.entries.find(e=>e.id==='b').author === 'Anonymous');
chk('ISO dates become epoch ms', typeof idx.entries[0].updatedAt === 'number' && idx.entries[0].updatedAt > 0);
chk('Unparseable date becomes null', isoToMs('not-a-date') === null);
chk('Every entry type is a known type', idx.entries.every(e => ENTRY_TYPES.includes(e.type)));

const proto = shapeIndex({ entries: [
  { id:'__proto__', type:'pack', title:'Nasty', path:'packs/x.json' },
  { id:'constructor', type:'pack', title:'Also nasty', path:'packs/y.json' },
]});
chk('__proto__ as an id does not pollute', ({}).polluted === undefined && proto.entries.length === 2);
chk('Object prototype untouched after shaping', Object.keys({}).length === 0);

console.log('\n-- Vote tallies --');
const st = shapeStats({ generatedAt:'2026-09-06T00:00:00Z', scores:{
  a:{ up:10, down:3 }, b:{ up:1, down:9 }, c:{ up:-5, down:'x' }, d:'nope',
}});
chk('Score derived when absent', scoreFor(st,'a').score === 7, scoreFor(st,'a').score);
chk('Negative vote counts clamped to zero', scoreFor(st,'c').up === 0 && scoreFor(st,'c').down === 0);
chk('Non-object entry ignored', scoreFor(st,'d').score === 0);
chk('Unknown id is zero, not undefined', scoreFor(st,'zzz').score === 0);
chk('generatedAt parsed', typeof st.generatedAt === 'number');
for (const [name, raw] of [['null', null], ['missing scores', {}], ['garbage', 'x']]) {
  const s = shapeStats(raw);
  chk(`Missing stats survive (${name})`, s && typeof s.scores === 'object' && s.generatedAt === null);
}

const scored = withScores(idx.entries, st);
chk('Scores joined onto entries', scored.find(e=>e.id==='a').score === 7);
chk('Entry with a losing tally scores negative', scored.find(e=>e.id==='b').score === -8, scored.find(e=>e.id==='b').score);

console.log('\n-- Filter and sort --');
chk('Filter by type', filterEntries(scored,{type:'pins'}).length === 1);
chk('Filter all', filterEntries(scored,{type:'all'}).length === 2);
chk('Query matches title', filterEntries(scored,{query:'good pack'}).length === 1);
chk('Query matches author', filterEntries(scored,{query:'ann'}).length === 1);
chk('Query matches description', filterEntries(scored,{query:'a real one'}).length === 1);
chk('Query is case-insensitive', filterEntries(scored,{query:'GOOD'}).length === 2);
chk('No match is empty, not everything', filterEntries(scored,{query:'zzzz'}).length === 0);
chk('minScore hides below threshold', filterEntries(scored,{minScore:0}).length === 1);

const ties = withScores(shapeIndex({ entries:[
  { id:'x', type:'pack', title:'Bravo', path:'packs/x.json', updatedAt:'2026-01-01T00:00:00Z' },
  { id:'y', type:'pack', title:'Alpha', path:'packs/y.json', updatedAt:'2026-01-01T00:00:00Z' },
  { id:'z', type:'pack', title:'Charlie', path:'packs/z.json', updatedAt:'2026-06-01T00:00:00Z' },
]}).entries, shapeStats(null));
chk('Sort by score is stable on ties (newest, then title)',
    sortEntries(ties,'score').map(e=>e.id).join('') === 'zyx',
    sortEntries(ties,'score').map(e=>e.id).join(''));
chk('Sort by newest', sortEntries(ties,'newest')[0].id === 'z');
chk('Sort by title', sortEntries(ties,'title').map(e=>e.title).join(',') === 'Alpha,Bravo,Charlie');
chk('Sort does not mutate the input', ties.map(e=>e.id).join('') === 'xyz');

console.log('\n-- Describing an entry --');
chk('Counts read as English', describeCounts({spots:2,tips:1}) === '2 spots, 1 tip', describeCounts({spots:2,tips:1}));
chk('Singular is singular', describeCounts({spots:1}) === '1 spot');
chk('Species does not gain an s', describeCounts({species:3}) === '3 species');
chk('Zero counts omitted', describeCounts({spots:0,pins:2}) === '2 pins');
chk('Nothing listed is stated, not blank', describeCounts({}) === 'nothing listed');
chk('Garbage counts do not throw', describeCounts(null) === 'nothing listed');

/* A community record must stay identifiable forever — it is what stops
   someone re-exporting another angler's work as their own. */
console.log('\n-- Community tagging --');
const tagged = tagCommunityRecords({
  spots:[{id:'s1',name:'A'},{id:'s2',name:'B'}],
  tips:[{id:'t1',title:'T'}],
  photos:{ s1:'data:image/png;base64,x' },
}, 'pack-42');
chk('Every record tagged', tagged.spots.every(isCommunityRecord) && tagged.tips.every(isCommunityRecord));
chk('Pack id recorded', tagged.spots[0].sourcePackId === 'pack-42');
chk('Marked custom so it exports and merges', tagged.spots[0].custom === true);
chk('Non-list values passed through untouched', tagged.photos.s1.startsWith('data:image/'));
chk('A user record is not a community record', isCommunityRecord({id:'x'}) === false);
chk('isCommunityRecord tolerates junk', isCommunityRecord(null) === false && isCommunityRecord('x') === false);

console.log('\n-- Community records stay out of Sheets sync --');
const mixed = [{id:'mine'}, tagged.spots[0], {id:'also-mine'}];
chk('Community records filtered out', withoutCommunity(mixed).length === 2);
chk('The user own records survive', withoutCommunity(mixed).map(r=>r.id).join(',') === 'mine,also-mine');
chk('withoutCommunity tolerates junk', withoutCommunity(null).length === 0);

/* The whole point: a community pack gets exactly the same validation
   as a file someone was handed on a memory stick. */
console.log('\n-- A real pack through the real import path --');
const packText = fs.readFileSync('tests/fixtures/community-example-pack.json', 'utf8');
const v = validateImport(packText);
chk('Directory pack validates', v.ok === true, JSON.stringify(v.errors));
chk('No warnings on a well-formed pack', v.warnings.length === 0, JSON.stringify(v.warnings));

const empty = { catalog:{spots:[],species:[],baits:[],knots:[],tips:[],photos:{}}, log:{trips:[],catches:[]} };
const tag = tagCommunityRecords(v.data.catalog, 'example-starter-pack');
const plan = planImport(empty, { ...v.data, catalog: tag });
chk('Merge plan reports what would arrive',
    plan.summary.spots.added === 1 && plan.summary.baits.added === 1 && plan.summary.tips.added === 1,
    JSON.stringify(plan.summary.spots));
chk('Nothing is updated on a first import',
    plan.summary.spots.updated === 0 && plan.summary.tips.updated === 0);

const nextCat = plan.next && plan.next.catalog;
chk('Plan carries the merged catalog', !!nextCat);
if (nextCat) {
  const again = planImport({ catalog: nextCat, log:{trips:[],catches:[]} }, { ...v.data, catalog: tag });
  chk('Re-importing the same pack changes nothing',
      again.summary.spots.added === 0 && again.summary.spots.updated === 0,
      JSON.stringify(again.summary.spots));
  chk('The community tag survives the merge',
      (nextCat.spots || []).filter(r => r.sourcePackId === 'example-starter-pack').length === 1);
}

const exported = buildExport(KIND.PACK, { catalog: tag, log:{}, note:'' });
chk('Tag survives a re-export (no passing it off as your own)',
    exported.catalog.spots.every(isCommunityRecord) && exported.app === APP_ID);

console.log(`\n=== SCAN 13 RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
