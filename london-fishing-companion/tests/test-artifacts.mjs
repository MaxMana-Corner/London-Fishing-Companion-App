/* SCAN 36 - are the things that ship internally consistent?

   Six committed artifacts are derived from the sources: app.js, Creel.html,
   map/index.json, the spot packs, and the two counts sw.js carries. A derived
   file that has drifted is the failure that shipped a five-day-stale
   standalone build while twenty-three assertions passed against it. */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

let pass = 0, fail = 0;
const chk = (n, c, g) => {
  if (c) { pass++; console.log(`  PASS  ${n}${g !== undefined ? `  (${g})` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}  got: ${g}`); }
};
const head = (t) => console.log("\n-- " + t + " --");

console.log("\n=== SCAN 36: shipped artifacts ===");

const app = fs.readFileSync("app.js", "utf8");
const single = fs.readFileSync("standalone/Creel.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const index = JSON.parse(fs.readFileSync("map/index.json", "utf8"));

head("app.js is what the sources build to");
{
  const out = execFileSync(process.execPath, ["tools/build.mjs", "--check"], { encoding: "utf8" });
  chk("the build check passes", /production/.test(out), out.trim().slice(0, 80));
  /* And nothing from a dev build leaked in. */
  chk("no sourcemap comment", !/sourceMappingURL/.test(app));
  chk("no debugger statement", !/\bdebugger\b/.test(app));
  chk("no localhost reference", !/localhost|127\.0\.0\.1/.test(app));
  chk("no TODO left in shipped code", !/\bTODO\b|\bFIXME\b|\bXXX\b/.test(app),
      (app.match(/\bTODO\b|\bFIXME\b|\bXXX\b/g) || []).slice(0, 3).join(", ") || "none");
}

head("the standalone carries this exact app.js");
{
  chk("app.js is embedded verbatim", single.includes(app),
      single.includes(app) ? "matches" : "STALE - run tools/build-single.mjs");
  chk("nothing is fetched over the network", !/(src|href)="https?:\/\//.test(single));
  chk("three script blocks", (single.match(/<\/script/g) || []).length === 3,
      (single.match(/<\/script/g) || []).length);
  const m = single.match(/<script type="application\/json" id="lfc-map">([\s\S]*?)<\/script>/);
  chk("the map block is there and parses", !!m && (() => { try { JSON.parse(m[1]); return true; } catch { return false; } })());
  if (m) {
    const embedded = JSON.parse(m[1]);
    const bundled = index.regions.find((r) => r.bundled);
    chk("it carries the region the service worker precaches",
        !!(bundled && embedded.regions[bundled.id]), bundled ? bundled.id : "none bundled");
    chk("...and only that one", Object.keys(embedded.regions).length === 1,
        Object.keys(embedded.regions).join(","));
    /* The embedded copy must be the current one, byte for byte. */
    const onDisk = fs.readFileSync(`map/${bundled.id}.json`, "utf8");
    chk("...and it is the current file, not a stale copy",
        JSON.stringify(embedded.regions[bundled.id]) === JSON.stringify(JSON.parse(onDisk)),
        "compared whole");
    chk("...and the index it carries is the current one",
        JSON.stringify(embedded.index) === JSON.stringify(index), "compared whole");
  }
}

head("map/index.json agrees with the files on disk");
{
  const files = fs.readdirSync("map");
  for (const r of index.regions) {
    chk(`${r.id}: its map file exists`, files.includes(r.id + ".json"));
    const raw = fs.statSync(`map/${r.id}.json`).size;
    chk(`${r.id}: the recorded size is the real size`, r.bytes === raw, `${r.bytes} vs ${raw}`);
    if (r.spots) {
      chk(`${r.id}: its pack exists`, files.includes(r.id + "-spots.json"));
      const pack = JSON.parse(fs.readFileSync(`map/${r.id}-spots.json`, "utf8"));
      chk(`${r.id}: the recorded spot count is right`, r.spots === pack.spots.length,
          `${r.spots} vs ${pack.spots.length}`);
    }
    chk(`${r.id}: it has a province and a city`, !!r.province && !!r.city, `${r.province} / ${r.city}`);
  }
  /* Every pack belongs to a region in the index. */
  for (const f of files.filter((x) => x.endsWith("-spots.json"))) {
    const id = f.replace("-spots.json", "");
    chk(`${f} belongs to a region`, index.regions.some((r) => r.id === id));
  }
  /* Exactly one bundled region, and it is the default. */
  const bundled = index.regions.filter((r) => r.bundled);
  chk("exactly one region is bundled", bundled.length === 1, bundled.map((r) => r.id).join(","));
  chk("...and it is the default region", bundled[0] && bundled[0].id === index.defaultRegion,
      `${bundled[0] && bundled[0].id} vs ${index.defaultRegion}`);
}

head("sw.js precaches exactly what exists");
{
  const list = sw.match(/const ASSETS = \[([\s\S]*?)\]/)[1]
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const assets = JSON.parse("[" + list.replace(/,\s*$/, "") + "]");
  for (const a of assets) {
    if (a === "./") continue;
    chk(`precached ${a} exists`, fs.existsSync(a.replace("./", "")));
  }
  chk("the region index is precached", assets.includes("./map/index.json"));
  const bundled = index.regions.find((r) => r.bundled);
  chk("the bundled region is precached", assets.includes(`./map/${bundled.id}.json`));
  /* Nothing else from map/ - the rest are downloads. */
  const mapAssets = assets.filter((a) => a.startsWith("./map/"));
  chk("only the index and one region from map/", mapAssets.length === 2, mapAssets.join(", "));
  /* The cache version has to change whenever anything precached changes, so
     at minimum it must not be the version a previous commit shipped. */
  const v = (sw.match(/const CACHE = "([^"]+)"/) || [])[1];
  chk("the cache has a version", /^lfc-v\d+$/.test(v), v);
}

head("no source file references something that is not there");
{
  const srcFiles = fs.readdirSync("src").map((f) => "src/" + f);
  for (const f of srcFiles) {
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/from\s+"(\.\/[^"]+)"/g)) {
      const target = "src/" + m[1].replace("./", "");
      if (!fs.existsSync(target)) chk(`${f} imports ${m[1]}`, false, "missing");
    }
  }
  pass++;
  console.log(`  PASS  every relative import in src/ resolves  (${srcFiles.length} files)`);
}

console.log(`\n=== ARTIFACTS RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
