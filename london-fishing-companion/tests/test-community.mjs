import fs from 'fs';
import { shapeIndex, shapeStats, scoreFor, withScores, filterEntries, sortEntries,
         describeCounts, tagCommunityRecords, isCommunityRecord, withoutCommunity,
         isoToMs, ENTRY_TYPES, SHARE_FIELDS, pickShareable, buildSubmission,
         describeSubmission, rememberVote, mergeMyVotes, pruneVotes,
         formatScore, VOTE_UP, VOTE_DOWN, makePin, isMyPin, MY_PINS,
         removePin, removePack, pinPacks, hidePin, unhidePin, visiblePins,
         pruneHidden, mergePins, validatePinSet, PIN_KINDS, LOCAL_PIN_KINDS,
         PERSONAL_PIN, isShareablePinType, countPersonal } from '../src/community.js';
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


/* ------------------------------------------------------------------
   The PII guarantee.

   Sharing is the only feature that sends a person's own content off
   their device. These assertions are the promise that nothing else
   goes with it. An allowlist miss should cost a missing field, never
   a leaked one - so every case below throws private data at the
   builder and demands it does not come out the other side.
   ------------------------------------------------------------------ */
console.log('\n-- Sharing: the allowlist --');

/* A spot as it might really exist on a device, with everything the
   log and the app bolt onto it. */
const dirtySpot = {
  id: 'my-spot', name: 'The Bend', area: 'North', water: 'Thames', ll: [42.9, -81.2],
  blurb: 'Good in autumn.', tip: 'Fish the seam.', access: { parking: 4 },
  // none of the following may ever leave the device
  custom: true, _v: 2, updatedAt: 1788652800000,
  source: 'community', sourcePackId: 'someone-elses-pack',
  photoId: 'ph_123', notes: 'my PIN is 4821',
  licence: 'ON-2026-11223344', email: 'dillon@example.com',
  catches: [{ id: 'c1', species: 'carp', notes: 'private' }],
  trips: [{ id: 't1' }], secretSwim: 'do not share',
};

const cleanSpot = pickShareable('spot', dirtySpot);
const leaked = ['custom','_v','updatedAt','source','sourcePackId','photoId','notes',
                'licence','email','catches','trips','secretSwim']
  .filter((k) => k in cleanSpot);
chk('No private field survives pickShareable', leaked.length === 0, leaked.join(',') || 'none');
chk('The shareable fields do survive',
    cleanSpot.name === 'The Bend' && cleanSpot.blurb === 'Good in autumn.' && Array.isArray(cleanSpot.ll));
chk('Every surviving key is on the allowlist',
    Object.keys(cleanSpot).every((k) => SHARE_FIELDS.spot.includes(k)));
chk('A record with no id is dropped', pickShareable('spot', { name: 'no id' }) === null);
chk('An unknown kind shares nothing', pickShareable('nonsense', dirtySpot) === null);
chk('Junk input does not throw',
    pickShareable('spot', null) === null && pickShareable('spot', 'x') === null);

for (const kind of Object.keys(SHARE_FIELDS)) {
  const stuffed = { id: 'x' };
  for (const f of SHARE_FIELDS[kind]) stuffed[f] = 'v';
  stuffed.licence = 'ON-1'; stuffed.notes = 'private'; stuffed.photoId = 'p1';
  const got = pickShareable(kind, stuffed);
  chk(`${kind}: nothing outside the allowlist gets through`,
      Object.keys(got).every((k) => SHARE_FIELDS[kind].includes(k)) &&
      !('licence' in got) && !('notes' in got) && !('photoId' in got));
}

console.log('\n-- Sharing: building a submission --');

const built = buildSubmission('pack', {
  records: {
    spots: [dirtySpot],
    tips: [{ id: 't1', cat: 'X', title: 'T', body: 'B', custom: true, _v: 2 }],
    baits: [], species: [], knots: [],
  },
  note: 'A few spots I know.',
});
chk('Pack builds', built.ok === true, built.error);
chk('Envelope is what the importer expects',
    built.payload.app === APP_ID && built.payload.kind === 'pack' && built.payload.schema === 2);
chk('No meta block - the server stamps that', !('meta' in built.payload));
chk('No photos map - a photo cannot be word-scanned', !('photos' in built.payload.catalog));
chk('No trips or catches anywhere',
    !('trips' in built.payload) && !('catches' in built.payload) && !('catchPhotos' in built.payload));
const flat = JSON.stringify(built.payload);
for (const secret of ['ON-2026-11223344', 'dillon@example.com', 'my PIN is 4821', 'secretSwim', 'sourcePackId'])
  chk(`"${secret.slice(0, 22)}" is absent from the wire format`, !flat.includes(secret));

const locOnly = buildSubmission('locations', {
  records: { spots: [dirtySpot], tips: [{ id: 't', cat: 'c', title: 'x', body: 'y' }] },
});
chk('A locations submission carries spots only',
    locOnly.ok && locOnly.payload.catalog.spots.length === 1 && locOnly.payload.catalog.tips.length === 0);

chk('An empty pack is refused, not sent',
    buildSubmission('pack', { records: { spots: [] } }).ok === false);
chk('An unknown type is refused', buildSubmission('nonsense', {}).ok === false);
chk('note is length-capped',
    buildSubmission('pack', { records: { spots: [dirtySpot] }, note: 'x'.repeat(500) }).payload.note.length === 300);

console.log('\n-- Sharing: pins --');
const pinsOut = buildSubmission('pins', {
  pins: [
    { id: 'p1', type: 'snag', ll: [42.9, -81.2], title: 'Timber', note: 'costs leads', author: 'me', createdAt: 1 },
    { id: 'p2', type: 'nonsense', ll: [42.9, -81.2], title: 'bad type' },
    { id: 'p3', type: 'snag', ll: [999, -81.2], title: 'bad coords' },
    { id: 'p4', type: 'snag', ll: 'nope', title: 'no coords' },
    { type: 'snag', ll: [42.9, -81.2], title: 'no id' },
  ],
});
chk('Only the valid pin survives', pinsOut.ok && pinsOut.payload.pins.length === 1, pinsOut.payload?.pins?.length);
chk('Pin envelope is right', pinsOut.payload.kind === 'pins' && pinsOut.payload.schema === 1);
chk('A pin set with nothing valid is refused',
    buildSubmission('pins', { pins: [{ id: 'x', type: 'nope', ll: [0, 0] }] }).ok === false);

console.log('\n-- Sharing: what we send is what the far side can read --');
const asText = JSON.stringify(built.payload);
const back = validateImport(asText);
chk('Our own submission passes our own importer', back.ok === true, JSON.stringify(back.errors));
chk('It round-trips with no warnings', back.warnings.length === 0, JSON.stringify(back.warnings));
chk('describeSubmission reads as English',
    describeSubmission(built.payload).join(', ') === '1 spot, 1 tip',
    describeSubmission(built.payload).join(', '));
chk('describeSubmission handles pins', describeSubmission(pinsOut.payload)[0] === '1 map pin');
chk('describeSubmission tolerates junk', describeSubmission(null).length === 0);


/* ------------------------------------------------------------------
   Voting.

   The trap this guards: stats.json lags by up to three hours, so a
   vote you just cast is not in it. Adding your own vote to the
   published score locally looks right until the rebuild lands and
   counts it again. These assertions exist to prove the client never
   does that arithmetic at all.
   ------------------------------------------------------------------ */
console.log('\n-- Voting: no double counting --');

const PUBLISHED = Date.parse('2026-09-06T12:00:00Z');
const entryAt = (score) => [{ id: 'a', type: 'pack', title: 'A', path: 'packs/a.json',
                              description: '', author: 'x', up: 0, down: 0, score }];

/* Voted AFTER the last rebuild: the server's tally is fresher, so it wins. */
const fresh = rememberVote({}, 'a', { yourVote: 1, up: 4, down: 1, score: 3 }, PUBLISHED + 60000);
const afterFresh = mergeMyVotes(entryAt(2), fresh, PUBLISHED);
chk('A vote newer than the published tally replaces it',
    afterFresh[0].score === 3 && afterFresh[0].up === 4, afterFresh[0].score);
chk('The button knows which way you voted', afterFresh[0].myVote === 1);

/* Voted BEFORE the last rebuild: stats.json already includes it, so the
   published score stands and nothing is added on top. */
const stale = rememberVote({}, 'a', { yourVote: 1, up: 4, down: 1, score: 3 }, PUBLISHED - 60000);
const afterStale = mergeMyVotes(entryAt(9), stale, PUBLISHED);
chk('A vote older than the rebuild does NOT adjust the score',
    afterStale[0].score === 9, afterStale[0].score);
chk('...but the button still shows your vote', afterStale[0].myVote === 1);

/* Clearing a vote: the server reports yourVote 0 and the true tally. */
const cleared = rememberVote(fresh, 'a', { yourVote: 0, up: 3, down: 1, score: 2 }, PUBLISHED + 120000);
const afterClear = mergeMyVotes(entryAt(2), cleared, PUBLISHED);
chk('Clearing a vote takes the server tally, not a guess',
    afterClear[0].score === 2 && afterClear[0].myVote === 0, afterClear[0].score);

chk('An item you never voted on is untouched',
    mergeMyVotes(entryAt(5), {}, PUBLISHED)[0].score === 5);
chk('myVote defaults to 0, not undefined',
    mergeMyVotes(entryAt(5), {}, PUBLISHED)[0].myVote === 0);
chk('No stats timestamp means a stored vote is treated as newer',
    mergeMyVotes(entryAt(1), fresh, null)[0].score === 3);
chk('Junk in the vote store does not throw',
    mergeMyVotes(entryAt(1), { a: 'nonsense' }, PUBLISHED)[0].score === 1);
chk('mergeMyVotes tolerates junk entries', mergeMyVotes(null, fresh, PUBLISHED).length === 0);

console.log('\n-- Voting: housekeeping --');
chk('Negative tallies from a bad reply are clamped',
    rememberVote({}, 'a', { yourVote: 1, up: -5, down: -2, score: 3 }, 1).a.up === 0);
const many = { a: { dir: 1, at: 1 }, gone: { dir: -1, at: 1 }, b: { dir: 1, at: 1 } };
const pruned = pruneVotes(many, [{ id: 'a' }, { id: 'b' }]);
chk('Votes for items no longer listed are dropped',
    Object.keys(pruned).sort().join(',') === 'a,b', Object.keys(pruned).join(','));
chk('pruneVotes tolerates junk', Object.keys(pruneVotes(null, null)).length === 0);

chk('Score reads with a sign', formatScore(3) === '+3' && formatScore(-2) === '-2' && formatScore(0) === '0');
chk('formatScore tolerates junk', formatScore(null) === '0' && formatScore('x') === '0');
chk('Vote directions are the two we send', VOTE_UP === 1 && VOTE_DOWN === -1);


/* ------------------------------------------------------------------
   Owning pins. Three different meanings of "remove", and the one that
   matters most is removing a single imported pin without losing the
   pack - which cannot work by deleting the record, because re-importing
   would bring it straight back.
   ------------------------------------------------------------------ */
console.log('\n-- Making and removing pins --');

const mine1 = makePin({ type: 'snag', ll: [42.98, -81.25], title: 'My snag', note: 'Lost two leads here.' });
chk('A pin can be made', !!mine1 && mine1.id.startsWith('p_'));
chk('It is marked as yours', isMyPin(mine1) && mine1.source === MY_PINS);
chk('It has no pack', mine1.sourcePackId === '');
chk('A blank title gets a sensible default', makePin({ type: 'hazard', ll: [42.9, -81.2] }).title === 'Hazard');
chk('A bad type makes nothing', makePin({ type: 'nope', ll: [42.9, -81.2] }) === null);
chk('Bad coordinates make nothing', makePin({ type: 'snag', ll: [999, 0] }) === null);
chk('Junk makes nothing, not a crash', makePin({}) === null && makePin({ type: 'snag' }) === null);
chk('Notes are length-capped', makePin({ type: 'snag', ll: [42.9,-81.2], note: 'x'.repeat(900) }).note.length === 600);

const packA = mergePins([], [
  { id: 'a1', type: 'snag', ll: [42.9, -81.2], title: 'A one', updatedAt: 1 },
  { id: 'a2', type: 'hazard', ll: [42.91, -81.21], title: 'A two', updatedAt: 1 },
], 'pack-a').pins;
const packB = mergePins(packA, [
  { id: 'b1', type: 'good-spot', ll: [42.92, -81.22], title: 'B one', updatedAt: 1 },
], 'pack-b').pins;
const all = [...packB, mine1];
chk('Two packs and one of yours coexist', all.length === 4);

const summary = pinPacks(all);
chk('Your own pins are counted separately', summary.mine === 1, summary.mine);
chk('Each pack is listed with its size',
    summary.packs.length === 2 && summary.packs[0].count === 2, JSON.stringify(summary.packs.map(p=>p.id+':'+p.count)));

chk('Removing a pack takes only its pins',
    removePack(all, 'pack-a').length === 2 &&
    !removePack(all, 'pack-a').some((p) => p.sourcePackId === 'pack-a'));
chk('Removing a pack leaves your own pins alone',
    removePack(all, 'pack-a').some(isMyPin));
chk('Removing an unknown pack changes nothing', removePack(all, 'nope').length === 4);

chk('Deleting your own pin really deletes it', removePin(all, mine1.id).length === 3);
chk('removePin tolerates junk', removePin(null, 'x').length === 0);

console.log('\n-- Hiding a pin you do not trust --');
let hidden = hidePin([], 'a1');
chk('A pin can be hidden', hidden.includes('a1'));
chk('Hiding twice does not duplicate', hidePin(hidden, 'a1').length === 1);
chk('Hidden pins are filtered out of what is drawn',
    visiblePins(all, hidden).length === 3 && !visiblePins(all, hidden).some((p) => p.id === 'a1'));
chk('The rest of the pack survives',
    visiblePins(all, hidden).some((p) => p.id === 'a2'));

/* The point of hiding by id: re-importing must not resurrect it. */
const reimported = mergePins(all, [
  { id: 'a1', type: 'snag', ll: [42.9, -81.2], title: 'A one', updatedAt: 99 },
], 'pack-a').pins;
chk('Re-importing the pack does NOT bring a hidden pin back',
    !visiblePins(reimported, hidden).some((p) => p.id === 'a1'));

chk('A pin can be unhidden', !hidePin([], 'a1').filter((h) => h !== 'a1').length && unhidePin(hidden, 'a1').length === 0);
chk('Hidden ids for pins that are gone get pruned',
    pruneHidden(['a1', 'ghost'], all).join(',') === 'a1');
chk('visiblePins tolerates junk', visiblePins(null, null).length === 0);


/* ---------------------------------------------------------------
   Personal pins. The catch-all for the thing worth marking that is
   none of the five - and the one kind that never leaves the device.

   The privacy here is structural, not a rule somebody remembers to
   apply, and these assertions are what say so.
   --------------------------------------------------------------- */
console.log('\n-- personal pins stay put --');

const ll = [42.9853, -81.2567];

chk('A personal pin can be made', !!makePin({ type: PERSONAL_PIN, ll, title: 'Gate code' }));
chk('Its default title says what it is when you leave it blank',
    makePin({ type: PERSONAL_PIN, ll }).title === 'Note');
chk('A type that is neither shareable nor personal is still refused',
    makePin({ type: 'invented', ll }) === null);
chk('personal is NOT in the shareable set', !PIN_KINDS.includes(PERSONAL_PIN));
chk('but it IS in the set you can create locally', LOCAL_PIN_KINDS.includes(PERSONAL_PIN));
chk('isShareablePinType agrees',
    !isShareablePinType(PERSONAL_PIN) && isShareablePinType('snag'));

{
  /* The two guards that make it structural rather than aspirational. */
  const incoming = JSON.stringify({
    app: 'london-fishing-companion', kind: 'pins', schema: 1,
    pins: [
      { id: 'a', type: 'snag', ll, title: 'A snag' },
      { id: 'b', type: PERSONAL_PIN, ll, title: 'Somebody else\'s private note' },
    ],
  });
  const v = validatePinSet(incoming);
  chk('An incoming pack cannot smuggle a personal pin in',
      v.ok && v.pins.length === 1 && v.pins[0].type === 'snag',
      v.pins.map((p) => p.type).join(','));
  chk('and it says one was skipped rather than doing it silently',
      v.warnings.some((w) => /skipped/i.test(w)));

  const mine = [
    makePin({ type: 'snag', ll, title: 'Shareable' }),
    makePin({ type: PERSONAL_PIN, ll, title: 'Where I left the car' }),
  ];
  const sub = buildSubmission('pins', { pins: mine });
  chk('Sharing your pins does not carry the personal one out',
      sub.ok && sub.payload.pins.length === 1 && sub.payload.pins[0].type === 'snag',
      sub.ok ? sub.payload.pins.map((p) => p.type).join(',') : sub.error);
  chk('A set of nothing but personal pins has nothing to share',
      buildSubmission('pins', { pins: [mine[1]] }).ok === false);
  chk('countPersonal counts them', countPersonal(mine) === 1);
  chk('countPersonal tolerates junk', countPersonal(null) === 0 && countPersonal([null]) === 0);
}

/* ---------------------------------------------------------------
   A location is the park; a good spot is the gravel bar inside it.
   --------------------------------------------------------------- */
console.log('\n-- a pin can belong to a location --');

chk('A pin remembers the location it sits in',
    makePin({ type: 'good-spot', ll, spotId: 'forks' }).spotId === 'forks');
chk('Unattached is a real answer, stored as null not left undefined',
    makePin({ type: 'good-spot', ll }).spotId === null);
chk('A junk spotId does not become an object or a crash',
    makePin({ type: 'good-spot', ll, spotId: { nope: 1 } }).spotId === null);
chk('spotId is on the sharing allowlist, so an attachment survives sharing',
    SHARE_FIELDS.pin.includes('spotId'));
chk('A shared pin carries its attachment',
    (buildSubmission('pins', { pins: [makePin({ type: 'good-spot', ll, spotId: 'forks' })] })
      .payload.pins[0] || {}).spotId === 'forks');

console.log(`\n=== SCAN 13 RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail?1:0);
