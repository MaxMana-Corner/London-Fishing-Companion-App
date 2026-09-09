/* tiles.js — mostly reconcile(), because that is where the silent bug lives.

   A saved layout outlives the build that saved it. Everything else here is
   arithmetic; reconcile is the part that decides whether somebody who has
   used the app for a year ever sees a category added after they started. */

import {
  SIZES, SPAN, nextSize, defaultLayout, reconcile,
  resizeTile, cycleTile, removeTile, restoreTile, moveTile, indexOfTile,
} from '../src/tiles.js';

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ''}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};
const ids = (l) => l.map((t) => t.id).join(',');

console.log('\n=== TILES ===\n');
console.log('-- sizes --');

chk('Three sizes, no more', SIZES.length === 3, SIZES.join(','));
chk('Small is HALF of wide, not a quarter - a quarter is too narrow for a label',
  SPAN.small.cols === 2 && SPAN.wide.cols === SPAN.small.cols * 2,
  SPAN.small.cols + ' of ' + SPAN.wide.cols);
chk('Wide is full width and short', SPAN.wide.cols === 4 && SPAN.wide.rows === 2);
chk('Large is full width and tall', SPAN.large.cols === 4 && SPAN.large.rows === 4);
chk('Cycling returns to where it started',
  nextSize(nextSize(nextSize('small'))) === 'small',
  [nextSize('small'), nextSize(nextSize('small'))].join(' -> '));

console.log('\n-- reconcile: a saved layout outliving its build --');

const CATS = ['species', 'baits', 'hooks', 'tactics', 'knots', 'tips', 'regs'];

{
  const saved = [{ id: 'species', size: 'large' }, { id: 'baits', size: 'wide' }];
  const out = reconcile(saved, CATS);
  chk('Categories added since you saved still appear',
    out.length === CATS.length, ids(out));
  chk('...appended, so your own arrangement is not reshuffled',
    ids(out).startsWith('species,baits'), ids(out));
  chk('...and your chosen sizes survive',
    out[0].size === 'large' && out[1].size === 'wide',
    out.slice(0, 2).map((t) => t.size).join(','));
}

{
  const saved = [{ id: 'species', size: 'large' }, { id: 'gone-category', size: 'wide' }];
  const out = reconcile(saved, CATS);
  chk('A category that no longer exists is dropped',
    !ids(out).includes('gone-category'), ids(out));
}

{
  /* The distinction that matters: "I hid Rules" and "Rules did not exist when
     I saved this" must not be the same thing, or hiding anything would be
     undone on the next release. */
  const saved = [{ id: 'species', size: 'small' }];
  const out = reconcile(saved, CATS, ['regs']);
  chk('A category you removed stays removed across an update',
    !ids(out).includes('regs'), ids(out));
  chk('...while everything else you never saw is still added',
    out.length === CATS.length - 1, out.length);
}

{
  const out = reconcile([{ id: 'species', size: 'enormous' }], CATS);
  chk('A size the build does not recognise falls back rather than breaking the grid',
    out[0].size === 'small', out[0].size);
  chk('Rubbish in the saved layout is ignored, not thrown',
    reconcile([null, { id: 'baits', size: 'wide' }, 'nonsense'], CATS).length === CATS.length);
}

chk('No saved layout at all gives everyone the default',
  reconcile(undefined, CATS).length === CATS.length);

console.log('\n-- defaults --');

{
  const d = defaultLayout(CATS, { species: 'large', tactics: 'wide' });
  chk('Defaults are honoured', d[0].size === 'large' && d[3].size === 'wide',
    d.map((t) => t.size).join(','));
  chk('...and everything else is small', d[4].size === 'small');
}

console.log('\n-- editing --');

{
  let layout = defaultLayout(CATS);
  layout = resizeTile(layout, 'tactics', 'large');
  chk('Resizing hits only the tile asked for',
    layout.find((t) => t.id === 'tactics').size === 'large' &&
    layout.filter((t) => t.size === 'large').length === 1);

  layout = cycleTile(layout, 'knots');
  chk('Cycling advances one step', layout.find((t) => t.id === 'knots').size === 'wide');
}

{
  const layout = defaultLayout(CATS);
  const r1 = removeTile(layout, [], 'regs');
  chk('Removing takes it off the home page', !ids(r1.layout).includes('regs'), ids(r1.layout));
  chk('...and remembers that you meant it', r1.removed.includes('regs'), r1.removed.join(','));

  const r2 = restoreTile(r1.layout, r1.removed, 'regs');
  chk('Putting it back works', ids(r2.layout).includes('regs'), ids(r2.layout));
  chk('...and clears the removal', !r2.removed.includes('regs'), r2.removed.length);

  const r3 = restoreTile(r2.layout, r2.removed, 'regs');
  chk('Restoring something already there does not duplicate it',
    r3.layout.filter((t) => t.id === 'regs').length === 1);
}

console.log('\n-- moving --');

{
  const layout = defaultLayout(['a', 'b', 'c', 'd']);
  chk('Dragging shifts the others along rather than swapping',
    ids(moveTile(layout, 3, 0)) === 'd,a,b,c', ids(moveTile(layout, 3, 0)));
  chk('...in the other direction too',
    ids(moveTile(layout, 0, 2)) === 'b,c,a,d', ids(moveTile(layout, 0, 2)));
  chk('Dropping past the end clamps instead of losing the tile',
    ids(moveTile(layout, 0, 99)) === 'b,c,d,a', ids(moveTile(layout, 0, 99)));
  chk('Dropping where it already was changes nothing',
    ids(moveTile(layout, 2, 2)) === 'a,b,c,d');
  chk('An index that does not exist is ignored',
    ids(moveTile(layout, 9, 0)) === 'a,b,c,d');
  chk('indexOfTile finds it', indexOfTile(layout, 'c') === 2);
}

console.log(`\n=== TILES RESULT: ${pass} passed, ${fail} failed ===\n`);
if (fail) process.exit(1);
