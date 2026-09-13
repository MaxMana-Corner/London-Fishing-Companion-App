/* SCAN 33: the join code, and the handoff bundle.
 *
 * The join code lives against a hard ceiling: qr.js is byte mode, EC level M,
 * versions 1 to 10, and an accented character costs two bytes of it. This app
 * has "Rivière de l'Achigan" and "Lac Maskinongé" as real spot names, so a
 * code budgeted in CHARACTERS would work in London and fail in Rawdon — which
 * is the exact shape of every bug this project has shipped: correct until the
 * data stopped looking like the data it was written against.
 *
 * So the ceiling is asserted against the encoder itself rather than quoted
 * from a table, and every generated code is fed to the real encoder.
 */
import { encode as qrEncode } from "../src/qr.js";
import {
  QR_MAX_BYTES, encodeJoin, decodeJoin, mapAnglers, applyAnglerMap, buildTripBundle,
} from "../src/sharedtrip.js";
import { mergeList } from "../src/portability.js";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};

console.log("\n=== SCAN 33: the join code and the handoff ===\n");

/* ---------- the ceiling is real ---------- */
console.log("-- what a QR can actually hold --");
{
  let measured = 0;
  for (let n = 1; n <= 400; n++) { if (qrEncode("x".repeat(n))) measured = n; else break; }
  chk("QR_MAX_BYTES matches the encoder", QR_MAX_BYTES === measured,
      `module says ${QR_MAX_BYTES}, encoder does ${measured}`);
  chk("one byte over really is refused", qrEncode("x".repeat(measured + 1)) === null);
  /* The reason the budget is in bytes: accents halve it. */
  const acc = (() => { let l = 0; for (let n = 1; n <= 400; n++) { if (qrEncode("é".repeat(n))) l = n; else break; } return l; })();
  chk("an accented string fits far fewer characters", acc < measured / 1.9,
      `${acc} accented vs ${measured} plain — a character budget would be wrong by ${measured - acc}`);
}

/* ---------- round trip ---------- */
console.log("");
console.log("-- a code survives the journey --");
const ORIGIN = "https://maxmana-corner.github.io/London-Fishing-Companion-App/";
const TRIP = {
  tripId: "k7f2q9ab", date: "2026-06-15", hostId: "me001xyz",
  hostName: "Dillon", spotId: "springbank", spotName: "Springbank Park",
};
{
  const out = encodeJoin(TRIP, { origin: ORIGIN });
  chk("it produces a URL", /^https:\/\/.+#j=/.test(out.url), out.url.length + " chars");
  chk("it fits in a QR", out.fits);
  chk("and the real encoder takes it", !!qrEncode(out.url));

  const back = decodeJoin(out.url);
  chk("it decodes", back.ok, back.error);
  if (back.ok) {
    for (const k of Object.keys(TRIP)) {
      chk(`  ${k} survives`, back.data[k] === TRIP[k], JSON.stringify(back.data[k]));
    }
  }
}

/* ---------- the three things people actually paste ---------- */
console.log("");
console.log("-- whatever somebody pastes --");
{
  const out = encodeJoin(TRIP, { origin: ORIGIN });
  for (const [what, text] of [
    ["the whole URL", out.url],
    ["just the fragment", "#j=" + out.code],
    ["the bare code", out.code],
  ]) {
    const r = decodeJoin(text);
    chk(`${what} works`, r.ok && r.data.tripId === TRIP.tripId, r.error || r.data.tripId);
  }
}

/* ---------- the Quebec case, which is why the budget is in bytes ---------- */
console.log("");
console.log("-- accented names, long names, long origins --");
for (const [what, t, origin] of [
  ["a Quebec river", { ...TRIP, spotName: "Rivière de l'Achigan", hostName: "Stéphane" }, ORIGIN],
  ["the longest real spot name", { ...TRIP, spotName: "Fort Langley & Bedford Channel" }, ORIGIN],
  ["Lac Maskinongé", { ...TRIP, spotName: "Lac Maskinongé", hostName: "Geneviève" }, ORIGIN],
  ["a name and a spot both overlong",
   { ...TRIP, hostName: "Bartholomew Fotherington-Thomas",
     spotName: "The very long name of somewhere nobody would really call this" }, ORIGIN],
  ["a deep origin path", TRIP, "https://example.org/some/rather/deep/path/to/the/app/index.html"],
]) {
  const out = encodeJoin(t, { origin });
  const bytes = new TextEncoder().encode(out.url).length;
  chk(`${what}: fits`, out.fits && bytes <= QR_MAX_BYTES, `${bytes} bytes`);
  chk(`${what}: the encoder agrees`, !!qrEncode(out.url));
  const back = decodeJoin(out.url);
  /* Truncation is allowed to shorten the names. It is NOT allowed to touch
     the ids or the date — those are what the code is for. */
  chk(`${what}: the trip is still identified`,
      back.ok && back.data.tripId === t.tripId && back.data.hostId === t.hostId
        && back.data.date === t.date,
      back.ok ? "intact" : back.error);
}

/* ---------- refusals ---------- */
console.log("");
console.log("-- bad input is refused, never guessed at --");
for (const [what, text] of [
  ["nothing", ""],
  ["whitespace", "   "],
  ["a sentence", "come fishing on saturday"],
  ["a truncated code", encodeJoin(TRIP, { origin: ORIGIN }).code.slice(0, 12)],
  ["a code with a space in it", "abc def"],
  ["an unrelated URL", "https://example.org/"],
]) {
  const r = decodeJoin(text);
  chk(`${what} is refused with a reason`, !r.ok && typeof r.error === "string" && r.error.length > 10,
      r.ok ? "ACCEPTED" : r.error.slice(0, 60));
}
{
  /* A future version's code must say so rather than being half-read. */
  const bad = Buffer.from("9|a|2026-06-15|b|c|d|e").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const r = decodeJoin(bad);
  chk("a code from another version says so", !r.ok && /version/i.test(r.error), r.error);
}
{
  const bad = Buffer.from("1|a|not-a-date|b|c|d|e").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const r = decodeJoin(bad);
  chk("an unreadable date is refused", !r.ok && /date/i.test(r.error), r.error);
}
{
  /* A pipe in somebody's name would shift every field after it. */
  const out = encodeJoin({ ...TRIP, hostName: "Dave|Smith" }, { origin: ORIGIN });
  const back = decodeJoin(out.url);
  chk("a pipe in a name cannot shift the fields",
      back.ok && back.data.spotId === TRIP.spotId && back.data.spotName === TRIP.spotName,
      back.ok ? back.data.hostName + " / " + back.data.spotId : back.error);
}

/* ---------- matching people across two phones ---------- */
console.log("");
console.log("-- who is who, on the other phone --");
{
  const local = [
    { id: "L-me", name: "Dillon", self: true },
    { id: "L-dave", name: "Dave" },
  ];
  const incoming = [
    { id: "R-dave", name: "dave", self: true, updatedAt: 5 },   /* self on THEIR phone */
    { id: "R-sam", name: "Sam", updatedAt: 6 },
  ];
  const { map, adopt } = mapAnglers(incoming, local);

  chk("a name that matches maps onto the person you already have",
      map.get("R-dave") === "L-dave", map.get("R-dave"));
  chk("...case and spacing folded", map.get("R-dave") === "L-dave", '"dave" matched "Dave"');
  chk("somebody new is adopted with their own id", map.get("R-sam") === "R-sam");
  chk("and only they are added", adopt.length === 1 && adopt[0].name === "Sam",
      adopt.map((a) => a.name).join(", "));

  /* THE ONE THAT MATTERS. Their "me" is not my "me". */
  chk("their self flag never travels",
      adopt.every((a) => !("self" in a)) && !adopt.some((a) => a.self),
      "two selves on one phone makes every attribution a coin toss");

  const bundle = {
    trips: [{ id: "t1", hostBy: "R-dave", party: ["R-dave", "R-sam"] }],
    catches: [{ id: "c1", by: "R-dave" }, { id: "c2", by: "R-sam" }, { id: "c3" }],
  };
  const mapped = applyAnglerMap(bundle, map);
  chk("the trip's host is rewritten", mapped.trips[0].hostBy === "L-dave");
  chk("the party is rewritten", mapped.trips[0].party.join() === "L-dave,R-sam",
      mapped.trips[0].party.join());
  chk("every catch is rewritten", mapped.catches[0].by === "L-dave" && mapped.catches[1].by === "R-sam");
  chk("a catch with no angler is left alone", !("by" in mapped.catches[2]));

  /* If both incoming ids mapped to the same local person the party would
     hold a duplicate, and the trip would read as three people. */
  const dup = applyAnglerMap(
    { trips: [{ id: "t", party: ["R-a", "R-b"] }], catches: [] },
    new Map([["R-a", "L-dave"], ["R-b", "L-dave"]]));
  chk("two incoming ids for one person do not double the party",
      dup.trips[0].party.length === 1, dup.trips[0].party.join());
}

/* ---------- the bundle carries one trip and nothing else ---------- */
console.log("");
console.log("-- what is in the envelope --");
{
  const anglers = [
    { id: "me", name: "Dillon", self: true },
    { id: "dv", name: "Dave" },
    { id: "zz", name: "Somebody I fished with in 2019" },
  ];
  const trip = { id: "t1", date: "2026-06-15", spotId: "springbank", party: ["me", "dv"],
                 hostBy: "me", waterTemp: "17", updatedAt: 99 };
  const catches = [
    { id: "c1", tripId: "t1", speciesId: "smb", by: "me" },
    { id: "c2", tripId: "t1", speciesId: "pike", by: "dv" },
    { id: "c3", tripId: "OTHER", speciesId: "carp", by: "me" },
    { id: "c4", tripId: "t1", speciesId: "rock" },            /* no by — implicitly mine */
  ];
  const b = buildTripBundle({ trip, catches, anglers, by: "me" });
  const text = JSON.stringify(b);

  chk("it carries the one trip", b.trips === undefined && b.trip.id === "t1");
  chk("only my fish on it", b.catches.map((c) => c.id).sort().join() === "c1,c4",
      b.catches.map((c) => c.id).join());
  chk("a fish from another trip is not in it", !/OTHER/.test(text));
  chk("Dave's fish is not in it — it is his to send", !b.catches.some((c) => c.id === "c2"));
  chk("only the people it references", b.anglers.map((a) => a.id).sort().join() === "dv,me",
      b.anglers.map((a) => a.name).join(", "));
  chk("not the rest of the address book", !/2019/.test(text));
  chk("no self flag leaves the phone", !b.anglers.some((a) => a.self));
  chk("no photos", !/photo/i.test(text), "the largest and most personal thing in a log");
  chk("no catalog, no favourites, no other trips",
      !/catalog|favourite|usefulLinks/i.test(text));
  chk("a trip with no id produces nothing at all", buildTripBundle({ trip: null }) === null,
      "a typo must produce nothing, not everything");
}

/* ---------- two phones, one day ---------- */
console.log("");
console.log("-- the whole handshake, end to end --");
{
  /* This is the scenario the feature exists for, run as arithmetic rather
     than as a click-through: Dillon starts a trip and adds Dave, Dave joins
     off the code, both log fish, Dave sends his over, and Dillon ends the
     day with the right fish against the right names.

     The identity trick is the part worth asserting. Dave ADOPTS the host id
     from the code, so the host needs no matching at all on Dave's phone.
     Dave's own id stays local and is matched BY NAME when it travels back.
     Get that backwards and everybody ends up duplicated. */

  /* --- phone A: Dillon --- */
  const A = {
    anglers: [{ id: "A-me", name: "Dillon", self: true },
              { id: "A-dave", name: "Dave" }],
    trip: { id: "trip1", date: "2026-06-15", spotId: "springbank",
            party: ["A-me", "A-dave"], hostBy: "A-me", waterTemp: "17", updatedAt: 100 },
    catches: [{ id: "A-c1", tripId: "trip1", speciesId: "smb", by: "A-me", updatedAt: 101 }],
  };

  const out = encodeJoin({
    tripId: A.trip.id, date: A.trip.date, hostId: "A-me",
    hostName: "Dillon", spotId: A.trip.spotId, spotName: "Springbank Park",
  }, { origin: ORIGIN });
  chk("the host's code is scannable", out.fits && !!qrEncode(out.url));

  /* --- phone B: Dave scans it --- */
  const join = decodeJoin(out.url);
  chk("Dave reads it", join.ok, join.error);

  /* What App.jsx joinTrip() does, in the same order. */
  const B = { anglers: [{ id: "B-me", name: "Dave", self: true }] };
  B.anglers = [...B.anglers, { id: join.data.hostId, name: join.data.hostName }];
  B.trip = {
    id: join.data.tripId, date: join.data.date, spotId: join.data.spotId,
    party: [join.data.hostId, "B-me"], hostBy: join.data.hostId, updatedAt: 200,
  };
  chk("both phones now call the trip the same thing", B.trip.id === A.trip.id);
  chk("both phones now call the HOST the same thing",
      B.trip.hostBy === A.trip.hostBy,
      "adopting the host id is what makes the return journey need no matching");
  chk("Dave is the guest, so the conditions are not his",
      B.trip.hostBy !== "B-me");

  /* --- Dave fishes --- */
  B.catches = [
    { id: "B-c1", tripId: "trip1", speciesId: "pike", by: "B-me", updatedAt: 201 },
    { id: "B-c2", tripId: "trip1", speciesId: "rock", by: "B-me", updatedAt: 202 },
    { id: "B-c3", tripId: "other", speciesId: "carp", by: "B-me", updatedAt: 203 },
  ];

  /* --- Dave sends his catches --- */
  const bundle = buildTripBundle({
    trip: B.trip, catches: B.catches, anglers: B.anglers, by: "B-me",
  });
  chk("the bundle holds Dave's two fish from this trip only",
      bundle.catches.map((c) => c.id).join() === "B-c1,B-c2",
      bundle.catches.map((c) => c.id).join());
  chk("and his fish from another day stays on his phone",
      !JSON.stringify(bundle).includes("B-c3"));

  /* --- Dillon receives it --- */
  const m = mapAnglers(bundle.anglers, A.anglers);
  const mapped = applyAnglerMap({ trips: [bundle.trip], catches: bundle.catches }, m.map);

  chk("Dave is recognised, not duplicated",
      m.adopt.length === 0, m.adopt.map((a) => a.name).join(", ") || "nobody new");
  chk("his fish arrive under the Dave that Dillon already had",
      mapped.catches.every((c) => c.by === "A-dave"),
      mapped.catches.map((c) => c.by).join());
  chk("the trip that arrives is the same trip",
      mapped.trips[0].id === A.trip.id);
  chk("and the party still names two people, not four",
      mapped.trips[0].party.length === 2, mapped.trips[0].party.join());
  chk("Dillon is still the host after the round trip",
      mapped.trips[0].hostBy === "A-me", mapped.trips[0].hostBy);

  /* --- the merged day --- */
  const all = [...A.catches, ...mapped.catches];
  chk("the day is three fish", all.length === 3);
  chk("one of them is Dillon's", all.filter((c) => c.by === "A-me").length === 1);
  chk("two of them are Dave's", all.filter((c) => c.by === "A-dave").length === 2);

  /* THE CONDITIONS MUST NOT COME BACK CHANGED. Dave's copy of the trip is
     read-only for conditions on his phone, but the bundle still carries the
     trip record and mergeById is last-write-wins on updatedAt - so if his
     copy ever carried a different water temperature with a newer stamp, it
     would silently replace the host's reading. His copy has none, and that
     is what makes the read-only rule hold across the handoff rather than
     only on screen. */
  chk("the guest's copy carries no conditions of its own",
      !mapped.trips[0].waterTemp && !mapped.trips[0].sky,
      "otherwise a guest silently overwrites the host's readings on merge");

  /* --- and the reverse journey --- */
  const back = buildTripBundle({ trip: A.trip, catches: A.catches, anglers: A.anglers, by: "A-me" });
  const m2 = mapAnglers(back.anglers, B.anglers);
  const mapped2 = applyAnglerMap({ trips: [back.trip], catches: back.catches }, m2.map);
  chk("Dillon's fish lands on Dave's phone under the right name",
      mapped2.catches.every((c) => c.by === join.data.hostId),
      mapped2.catches.map((c) => c.by).join());
  chk("nobody new is created going that way either", m2.adopt.length === 0,
      m2.adopt.map((a) => a.name).join(", ") || "nobody new");
}

/* ---------- the same person, spelled differently ---------- */
console.log("");
console.log("-- when the names do not quite agree --");
{
  /* The one failure the design note flagged and the preview has to surface
     rather than silently resolve: two people who are the same person under
     two spellings cannot be matched, so a second record is created. That is
     the correct behaviour - guessing that "Sam" is "Samantha" would be far
     worse - but it has to be VISIBLE, which is why the import warns by name
     rather than by count. */
  const local = [{ id: "L-me", name: "Dillon", self: true }, { id: "L-sam", name: "Samantha" }];
  const incoming = [{ id: "R-sam", name: "Sam" }];
  const { map, adopt } = mapAnglers(incoming, local);
  chk("a different spelling is not silently merged", map.get("R-sam") === "R-sam");
  chk("it creates somebody new, visibly", adopt.length === 1 && adopt[0].name === "Sam",
      "the import preview names them so it can be cancelled");

  /* Whitespace and case ARE folded, because that is typing rather than a
     different person. */
  const { map: m2, adopt: a2 } = mapAnglers(
    [{ id: "R-d", name: "  dAvE  " }], [{ id: "L-d", name: "Dave" }]);
  chk("case and stray spaces are not a different person",
      m2.get("R-d") === "L-d" && a2.length === 0);
}

/* ---------- who owns the trip record ---------- */
console.log("");
console.log("-- the conditions belong to the host, through the merge --");
{
  /* THE BUG THIS BLOCK EXISTS FOR, and it was live until it was measured.

     The owner decided the host owns a shared trip's conditions, and TripForm
     duly disables them for a guest. That is only the screen. The handoff
     bundle carries the trip record too, mergeById is last-write-wins on the
     WHOLE record, and a guest's copy was both newer (they joined after the
     host created it) and emptier (the join code carries no readings). So the
     host imported their friend's catches and silently lost their own water
     temperature, sky, clarity and level.

     Measured with mergeList itself rather than reasoned about, because the
     reasoning is what was wrong the first time:

       host had waterTemp "17" sky "Part cloud"
       after the guest bundle:  waterTemp undefined sky undefined

     Both directions are asserted, because fixing one broke the other - the
     first fix stopped the guest overwriting the host and thereby stopped the
     host's readings ever reaching the guest. */

  const hostTrip = { id: "t1", date: "2026-06-15", spotId: "springbank",
    sky: "Part cloud", clarity: "Slight stain", waterTemp: "17", airTemp: "21",
    party: ["A-me", "A-dave"], hostBy: "A-me", updatedAt: 100 };
  /* What App.jsx joinTrip() writes: identity, and updatedAt 0, because a
     guest does not own the trip record on their own phone either. */
  const guestTrip = { id: "t1", date: "2026-06-15", spotId: "springbank",
    party: ["A-me", "B-me"], hostBy: "A-me", updatedAt: 0 };

  const fromGuest = buildTripBundle({ trip: guestTrip, catches: [], anglers: [], by: "B-me" });
  chk("a guest sends no readings at all",
      !("waterTemp" in fromGuest.trip) && !("sky" in fromGuest.trip),
      Object.keys(fromGuest.trip).join(", "));
  chk("...and stamps it so it can never win a merge", fromGuest.trip.updatedAt === 0,
      String(fromGuest.trip.updatedAt));

  const onHost = mergeList([hostTrip], [fromGuest.trip]).list[0];
  chk("the host keeps their water temperature", onHost.waterTemp === "17", String(onHost.waterTemp));
  chk("the host keeps their sky", onHost.sky === "Part cloud", String(onHost.sky));
  chk("the host keeps their clarity", onHost.clarity === "Slight stain", String(onHost.clarity));

  const fromHost = buildTripBundle({ trip: hostTrip, catches: [], anglers: [], by: "A-me" });
  chk("the host DOES send their readings", fromHost.trip.waterTemp === "17",
      "they are the host's to give");
  const onGuest = mergeList([guestTrip], [fromHost.trip]).list[0];
  chk("and they arrive on the guest's phone", onGuest.waterTemp === "17" && onGuest.sky === "Part cloud",
      `waterTemp ${onGuest.waterTemp}, sky ${onGuest.sky}`);

  /* A guest whose bundle arrives at a phone that has no such trip - the host
     deleted it, say - should still land the identity rather than nothing. */
  const fresh = mergeList([], [fromGuest.trip]);
  chk("a guest's trip still lands where there is nothing to lose",
      fresh.added === 1 && fresh.list[0].id === "t1");

  /* And the host sending twice must not undo itself. */
  const twice = mergeList([onHost], [fromGuest.trip]).list[0];
  chk("receiving the same guest bundle again changes nothing",
      twice.waterTemp === "17", String(twice.waterTemp));
}

console.log(`\n=== SHARED TRIP RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
