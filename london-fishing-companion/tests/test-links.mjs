/* links.js — the structural gate on reference links.

   These links travel between strangers in community packs, so the interesting
   cases are the hostile ones and the ones that arrive already broken. */

import {
  MAX_LINKS, normaliseUrl, hostOf, isShortener, checkLink,
  labelFor, addLink, removeLink, sanitiseLinks,
} from '../src/links.js';

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ''}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log('\n=== LINKS ===\n');
console.log('-- what counts as an address --');

chk('A bare host is assumed https, because that is what people type',
  normaliseUrl('example.com/page') === 'https://example.com/page', normaliseUrl('example.com/page'));
chk('http is left alone', normaliseUrl('http://example.com/') === 'http://example.com/');
chk('Whitespace is trimmed', normaliseUrl('  https://example.com  ') === 'https://example.com/');

chk('javascript: is refused', normaliseUrl('javascript:alert(1)') === null);
chk('...and cannot be rescued by the https assumption',
  normaliseUrl('javascript:alert(1)') === null, String(normaliseUrl('javascript:alert(1)')));
chk('data: is refused', normaliseUrl('data:text/html,<script>x</script>') === null);
chk('file: is refused', normaliseUrl('file:///etc/passwd') === null);
chk('Something with no dot in it is not a host', normaliseUrl('localhost/thing') === null);
chk('Empty is nothing', normaliseUrl('   ') === null);

console.log('\n-- shorteners --');

chk('bit.ly is a shortener', isShortener('https://bit.ly/abc'));
chk('...with or without www', isShortener('https://www.bit.ly/abc'));
chk('...and on a subdomain', isShortener('https://x.t.co/abc'));
chk('A real site is not', !isShortener('https://ontario.ca/fishing'));
{
  const v = checkLink('bit.ly/xyz');
  chk('A shortener is refused with a reason a person can act on',
    !v.ok && /where they go/.test(v.reason), v.reason);
}

console.log('\n-- labels --');

chk('A given label is used', labelFor('https://a.com/x', 'Jig fishing the Thames') === 'Jig fishing the Thames');
chk('...trimmed', labelFor('https://a.com/x', '  Spaced  ') === 'Spaced');
chk('An absurd label is cut to something a card can hold',
  labelFor('https://a.com', 'x'.repeat(200)).length === 60);
chk('No label falls back to the site, not the raw url',
  labelFor('https://www.youtube.com/watch?v=abc') === 'youtube.com',
  labelFor('https://www.youtube.com/watch?v=abc'));
chk('hostOf drops www', hostOf('https://www.ontario.ca/page') === 'ontario.ca');

console.log('\n-- adding and removing --');

{
  let r = addLink([], 'ontario.ca/fishing', 'Regulations');
  chk('Adding works', r.links.length === 1 && !r.error, JSON.stringify(r.links[0]));

  r = addLink(r.links, 'https://ontario.ca/fishing', 'Again');
  chk('The same address twice is refused', r.links.length === 1 && /already/.test(r.error), r.error);

  r = addLink(r.links, 'a.com', 'A');
  r = addLink(r.links, 'b.com', 'B');
  chk('Three is fine', r.links.length === 3, r.links.length);

  r = addLink(r.links, 'c.com', 'C');
  chk('A fourth is refused, and says so',
    r.links.length === 3 && /limit/.test(r.error), r.error);
  chk('The limit is three', MAX_LINKS === 3);

  const gone = removeLink(r.links, 'https://a.com/');
  chk('Removing takes the right one', gone.length === 2 && !gone.some(l => l.url.includes('a.com')),
    gone.map(l => l.url).join(' '));
}

{
  const r = addLink([], 'javascript:alert(1)');
  chk('A hostile address is refused and the list is untouched',
    r.links.length === 0 && !!r.error, r.error);
}

console.log('\n-- what arrives from a stranger --');

{
  const incoming = [
    { url: 'https://ontario.ca/fishing', label: 'Regs' },
    { url: 'javascript:alert(1)', label: 'Innocent looking' },
    { url: 'https://bit.ly/xyz', label: 'Great video' },
    { url: 'https://ontario.ca/fishing', label: 'Duplicate' },
    null,
    'not an object',
    { url: 'https://example.com/a' },
    { url: 'https://example.com/b' },
    { url: 'https://example.com/c' },
  ];
  const clean = sanitiseLinks(incoming);
  chk('Hostile schemes are dropped from an incoming pack',
    !clean.some(l => l.url.startsWith('javascript')), JSON.stringify(clean.map(l => l.url)));
  chk('Shorteners are dropped too', !clean.some(l => l.url.includes('bit.ly')));
  chk('Duplicates collapse', clean.filter(l => l.url.includes('ontario.ca')).length === 1);
  chk('Rubbish entries are skipped, not thrown', Array.isArray(clean));
  chk('A pack cannot exceed the limit by sending more',
    clean.length <= MAX_LINKS, clean.length);
  chk('An unlabelled incoming link still gets a readable label',
    clean.every(l => l.label && l.label.length > 0), clean.map(l => l.label).join(', '));
}

chk('Nothing in gives nothing out', sanitiseLinks(undefined).length === 0);

console.log(`\n=== LINKS RESULT: ${pass} passed, ${fail} failed ===\n`);
if (fail) process.exit(1);
