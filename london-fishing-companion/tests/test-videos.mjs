/* SCAN 38: the video library, in an app that works with no signal.
 *
 * The whole design tension is here: Creel sends nothing anywhere and works
 * with the radios off; YouTube is neither. The rule chosen was that the
 * LIBRARY works offline and PLAYING does not — so the details are fetched
 * once, on add, and kept forever.
 *
 * That makes two things worth testing hard. First, that the one network call
 * this module makes is allowed to fail without losing the video: somebody
 * pasting a link on a riverbank has no wifi, and refusing the addition would
 * be the app failing at exactly the moment it claims to work. Second, that a
 * mistyped link is refused rather than stored as a video that will never
 * load.
 */
import {
  SHELVES, SHELF_FOR_KIND, videoId, watchUrl, thumbUrl,
  makeVideo, addVideo, removeVideo, shelved, fetchDetails, fetchThumb,
} from "../src/videos.js";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 38: the video library ===\n");

const ID = "dQw4w9WgXcQ";

console.log("-- the shelves --");
{
  chk("there are shelves", SHELVES.length >= 6, SHELVES.map((s) => s.name).join(", "));
  chk("Beginner Guides is one of them", SHELVES.some((s) => s.id === "beginner"),
      "the owner asked for it specifically");
  chk("every shelf says what it is for", SHELVES.every((s) => s.blurb && s.blurb.length > 25));
  const ids = SHELVES.map((s) => s.id);
  chk("shelf ids are unique", new Set(ids).size === ids.length);
  chk("every kind of record files somewhere real",
      Object.values(SHELF_FOR_KIND).every((v) => ids.includes(v)),
      Object.keys(SHELF_FOR_KIND).length + " kinds");
}

console.log("");
console.log("-- what people actually paste --");
for (const [what, text] of [
  ["a normal watch link", "https://www.youtube.com/watch?v=" + ID],
  ["...with a timestamp", "https://www.youtube.com/watch?v=" + ID + "&t=42s"],
  ["...with a playlist in front of it", "https://www.youtube.com/watch?list=PLabc&v=" + ID],
  ["a youtu.be short link", "https://youtu.be/" + ID],
  ["...with a query on it", "https://youtu.be/" + ID + "?t=90"],
  ["an embed url", "https://www.youtube.com/embed/" + ID],
  ["a Shorts url", "https://www.youtube.com/shorts/" + ID],
  ["a live url", "https://www.youtube.com/live/" + ID],
  ["the bare id", ID],
  ["a link with spaces round it", "  https://youtu.be/" + ID + "  "],
]) {
  chk(`${what} is read`, videoId(text) === ID, videoId(text));
}

console.log("");
console.log("-- and what must be refused --");
for (const [what, text] of [
  ["nothing", ""],
  ["whitespace", "   "],
  ["a sentence", "have a look at this video"],
  ["a different site", "https://vimeo.com/123456789"],
  ["a channel rather than a video", "https://www.youtube.com/@somechannel"],
  ["an id that is too short", "https://youtu.be/abc123"],
  ["null", null],
  ["a number", 12345],
]) {
  chk(`${what} is refused`, videoId(text) === null,
      "a mistyped link stored is a video that will never load");
}

console.log("");
console.log("-- adding, merging and removing --");
{
  let list = [];
  list = addVideo(list, makeVideo({ id: ID, title: "Reading a river", channel: "Someone", shelf: "water" }));
  chk("a video is added", list.length === 1 && list[0].id === ID);
  chk("...on the shelf it was given", list[0].shelf === "water", list[0].shelf);

  /* THE POINT OF THE LIBRARY BEING A VIEW rather than a second list. */
  list = addVideo(list, makeVideo({ id: ID, ref: { kind: "species", id: "smb", name: "Smallmouth bass" } }));
  chk("adding it again does not duplicate it", list.length === 1, list.length);
  chk("...it gains the reference instead", list[0].refs.length === 1 && list[0].refs[0].id === "smb",
      JSON.stringify(list[0].refs));
  chk("...and keeps the better title somebody typed", list[0].title === "Reading a river",
      "a later add fills gaps, it does not overwrite");

  list = addVideo(list, makeVideo({ id: ID, ref: { kind: "species", id: "smb", name: "Smallmouth bass" } }));
  chk("the same reference twice is still one reference", list[0].refs.length === 1);

  list = addVideo(list, makeVideo({ id: ID, ref: { kind: "baits", id: "tube", name: "Tube jig" } }));
  chk("a second, different reference is kept", list[0].refs.length === 2,
      list[0].refs.map((r) => r.id).join(", "));

  list = removeVideo(list, ID);
  chk("it can be removed", list.length === 0);
  chk("removing something absent is not a crash", removeVideo(list, "nope").length === 0);
  chk("removing from nothing is not a crash", removeVideo(null, ID).length === 0);
}

console.log("");
console.log("-- auto-filing --");
{
  for (const [kind, shelf] of [
    ["species", "species"], ["baits", "presentation"], ["knots", "knots"],
    ["tactics", "water"], ["handling", "handling"], ["regs", "rules"],
  ]) {
    const v = makeVideo({ id: ID, ref: { kind, id: "x", name: "X" } });
    chk(`a video on a ${kind} record files itself under ${shelf}`, v.shelf === shelf, v.shelf);
  }
  chk("an explicit shelf beats the record it came from",
      makeVideo({ id: ID, shelf: "beginner", ref: { kind: "species", id: "x" } }).shelf === "beginner");
  chk("a standalone video with no shelf lands somewhere sensible",
      makeVideo({ id: ID }).shelf === "beginner",
      "where somebody browsing with no idea what they want should be sent");
}

console.log("");
console.log("-- the shelf view --");
{
  const list = [
    makeVideo({ id: "aaaaaaaaaaa", title: "Casting for beginners", shelf: "beginner" }),
    makeVideo({ id: "bbbbbbbbbbb", title: "Seams and slots", shelf: "water", channel: "River School" }),
  ].map((v) => ({ ...v, refs: [] }));

  const all = shelved(list);
  chk("every shelf is returned, including the empty ones", all.length === SHELVES.length,
      "a library that hides its empty shelves never says what it is for");
  chk("videos land on the right shelf",
      all.find((s) => s.id === "water").videos.length === 1 &&
      all.find((s) => s.id === "beginner").videos.length === 1);

  const q = shelved(list, "seams");
  chk("a search filters by title",
      q.reduce((n, s) => n + s.videos.length, 0) === 1, "seams");
  const byChannel = shelved(list, "river school");
  chk("...and by channel", byChannel.reduce((n, s) => n + s.videos.length, 0) === 1);
  const none = shelved(list, "zzzz");
  chk("a search with no hits returns empty shelves, not nothing",
      none.length === SHELVES.length && none.every((s) => s.videos.length === 0));

  const withRef = [{ ...makeVideo({ id: "ccccccccccc", title: "x" }), refs: [{ kind: "species", id: "smb", name: "Smallmouth bass" }] }];
  chk("a search finds a video by what it is attached to",
      shelved(withRef, "smallmouth").reduce((n, s) => n + s.videos.length, 0) === 1);
}

console.log("");
console.log("-- the one network call, and its failure --");
{
  /* Adding a video on a riverbank with no signal must not lose the video. */
  const offline = async () => { throw new Error("network down"); };
  const d = await fetchDetails(ID, { fetcher: offline });
  chk("a lookup with no connection fails softly", d.ok === false && typeof d.error === "string", d.error);

  const notFound = async () => ({ ok: false, status: 404 });
  const nf = await fetchDetails(ID, { fetcher: notFound });
  chk("a 404 is a refusal, not a throw", nf.ok === false, nf.error);

  const good = async (url) => {
    if (!/oembed/.test(url)) throw new Error("wrong url");
    if (!url.includes(encodeURIComponent(watchUrl(ID)))) throw new Error("wrong video");
    return { ok: true, json: async () => ({ title: "How to read a river", author_name: "River School" }) };
  };
  const g = await fetchDetails(ID, { fetcher: good });
  chk("a good lookup returns the title and channel",
      g.ok && g.title === "How to read a river" && g.channel === "River School",
      JSON.stringify(g));

  const huge = async () => ({ ok: true, json: async () => ({ title: "x".repeat(500), author_name: "y".repeat(300) }) });
  const h = await fetchDetails(ID, { fetcher: huge });
  chk("a hostile title is capped", h.title.length <= 140 && h.channel.length <= 80,
      `${h.title.length} / ${h.channel.length}`);

  chk("a thumbnail fetch with no connection is null, not a throw",
      (await fetchThumb(ID, { fetcher: offline })) === null);
  chk("an enormous thumbnail is refused",
      (await fetchThumb(ID, { fetcher: async () => ({ ok: true, blob: async () => ({ size: 900000 }) }) })) === null,
      "a redirect to something enormous must not reach storage");
}

console.log("");
console.log("-- a stored record is safe to render --");
{
  const v = makeVideo({ id: ID, thumb: "javascript:alert(1)" });
  chk("a thumbnail that is not a data image is dropped", v.thumb === null,
      "these are written into an <img src>");
  chk("a real data uri is kept",
      makeVideo({ id: ID, thumb: "data:image/jpeg;base64,AAAA" }).thumb !== null);
  chk("the watch url is built, never stored from input",
      watchUrl(ID) === "https://www.youtube.com/watch?v=" + ID);
  chk("the thumbnail url too", /^https:\/\/img\.youtube\.com\/vi\/dQw4w9WgXcQ\//.test(thumbUrl(ID)));
  chk("a video with no title still has one", makeVideo({ id: ID }).title === "Untitled video");
}

console.log(`\n=== VIDEOS RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
