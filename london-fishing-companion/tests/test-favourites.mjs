/* favourites.js — the ordering rules, which are the part with judgement in
   them and therefore the part worth pinning down.

   The rules came from specific instructions, and each test says which, so a
   later change that "tidies" one of them has to argue with the reason rather
   than just the code. */

import {
  refOf, isFavourite, toggleFavourite, resolveFavourites, pruneFavourites,
  recordUse, useCount, lastUsed, orderRecords, searchAll,
} from '../src/favourites.js';

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ''}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log('\n=== FAVOURITES ===\n');
console.log('-- starring --');

{
  let favs = [];
  favs = toggleFavourite(favs, 'species', 'smb');
  chk('Starring adds it', isFavourite(favs, 'species', 'smb'), JSON.stringify(favs));
  favs = toggleFavourite(favs, 'species', 'smb');
  chk('Starring again removes it', !isFavourite(favs, 'species', 'smb'), JSON.stringify(favs));

  favs = toggleFavourite(toggleFavourite([], 'species', 'a'), 'species', 'b');
  chk('Newest star goes to the front, so the five home slots stay current',
    favs[0] === refOf('species', 'b'), JSON.stringify(favs));
}

{
  /* A favourited custom bait that was later deleted must not render as a
     blank tile, and must not silently cost you one of your five slots. */
  const world = { 'species:smb': { id: 'smb', name: 'Smallmouth' } };
  const lookup = (k, i) => world[`${k}:${i}`] || null;
  const favs = ['species:smb', 'bait:deleted-one', 'nonsense'];

  const got = resolveFavourites(favs, lookup);
  chk('A star pointing at a deleted record is dropped, not rendered blank',
    got.length === 1 && got[0].rec.name === 'Smallmouth', got.length);

  chk('Pruning drops the dead ones for good',
    JSON.stringify(pruneFavourites(favs, lookup)) === JSON.stringify(['species:smb']),
    JSON.stringify(pruneFavourites(favs, lookup)));

  chk('The limit is honoured', resolveFavourites(['species:smb', 'species:smb'], lookup, 1).length === 1);
}

console.log('\n-- usage --');

{
  let usage = {};
  usage = recordUse(usage, 'bait', 'tube', 1000);
  usage = recordUse(usage, 'bait', 'tube', 2000);
  usage = recordUse(usage, 'bait', 'grub', 1500);
  chk('Counts accumulate', useCount(usage, 'bait', 'tube') === 2, useCount(usage, 'bait', 'tube'));
  chk('Last used is the latest', lastUsed(usage, 'bait', 'tube') === 2000, lastUsed(usage, 'bait', 'tube'));
  chk('An untouched record is zero, not undefined', useCount(usage, 'bait', 'never') === 0);
}

console.log('\n-- ordering --');

const recs = [
  { id: 'b1', name: 'Zeta built-in' },
  { id: 'b2', name: 'Alpha built-in' },
  { id: 'm1', name: 'Mine one', custom: true, updatedAt: 100 },
  { id: 'm2', name: 'Mine two', custom: true, updatedAt: 200 },
];

{
  const o = orderRecords(recs, { kind: 'bait' });
  chk('Your own records pin to the top by default',
    o.pinned.map((r) => r.id).join(',') === 'm2,m1', o.pinned.map((r) => r.id).join(','));
  chk('...newest of yours first', o.pinned[0].id === 'm2');
  chk('...and built-ins keep their own order, not alphabetical',
    o.rest.map((r) => r.id).join(',') === 'b1,b2', o.rest.map((r) => r.id).join(','));
}

{
  /* "Pin lists might get too long to scroll through and bury the rest." */
  const many = Array.from({ length: 10 }, (_, i) => ({ id: 'c' + i, name: 'C' + i, custom: true, updatedAt: i }));
  const o = orderRecords([...many, ...recs.filter((r) => !r.custom)], { kind: 'bait', pinnedCap: 6 });
  chk('A long list of your own is capped so it cannot bury the encyclopedia',
    o.pinned.length === 6, o.pinned.length);
  chk('...and the overflow is counted, not silently dropped',
    o.hiddenPinned === 4, o.hiddenPinned);
  chk('...while built-ins still appear', o.rest.length === 2, o.rest.length);
}

{
  let usage = {};
  usage = recordUse(usage, 'bait', 'b1', 500);
  usage = recordUse(usage, 'bait', 'b1', 600);
  usage = recordUse(usage, 'bait', 'm1', 900);

  const most = orderRecords(recs, { kind: 'bait', sort: 'most', usage });
  chk('Most used ranks by real count, across yours and built-in alike',
    most.rest[0].id === 'b1', most.rest.map((r) => r.id).join(','));
  chk('...and stops pinning your own, because you asked about usage not ownership',
    most.pinned.length === 0, most.pinned.length);

  const last = orderRecords(recs, { kind: 'bait', sort: 'last', usage });
  chk('Last used ranks by recency', last.rest[0].id === 'm1', last.rest.map((r) => r.id).join(','));

  const az = orderRecords(recs, { kind: 'bait', sort: 'az' });
  chk('A-Z is alphabetical across everything',
    az.rest[0].name === 'Alpha built-in', az.rest.map((r) => r.name).join(' | '));
}

{
  const favs = toggleFavourite([], 'bait', 'b2');
  const o = orderRecords(recs, { kind: 'bait', favsOnly: true, favs });
  const all = [...o.pinned, ...o.rest];
  chk('Filter by favourites returns only starred records',
    all.length === 1 && all[0].id === 'b2', all.map((r) => r.id).join(','));
}

console.log('\n-- search --');

{
  const groups = [
    { kind: 'species', label: 'Fish', records: [{ id: 'wall', name: 'Walleye' }, { id: 'smb', name: 'Smallmouth bass' }] },
    { kind: 'tactic', label: 'Tactics', records: [{ id: 'bb', name: 'Bottom bouncing', gist: 'dragging a spinner for walleye' }] },
    { kind: 'bait', label: 'Baits', records: [{ id: 'crawler', name: 'Nightcrawler', kind: 'Live bait' }] },
  ];

  const r = searchAll(groups, 'walleye');
  chk('One box searches every category', r.length === 2, r.map((x) => x.rec.name).join(', '));
  chk('...and a name match beats a match buried in a description',
    r[0].rec.name === 'Walleye', r[0].rec.name);

  chk('A single letter does not return the whole encyclopedia',
    searchAll(groups, 'w').length === 0, searchAll(groups, 'w').length);

  const starts = searchAll(groups, 'small');
  chk('Starts-with beats contains', starts[0].rec.id === 'smb', starts.map((x) => x.rec.id).join(','));

  chk('It says which category each hit came from',
    searchAll(groups, 'nightcrawler')[0].label === 'Baits');
}

console.log(`\n=== FAVOURITES RESULT: ${pass} passed, ${fail} failed ===\n`);
if (fail) process.exit(1);
