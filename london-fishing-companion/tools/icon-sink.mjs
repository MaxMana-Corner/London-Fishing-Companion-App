/* A one-purpose local server that lets brand/rasterise.html write its PNGs
   straight to disk.

   The rasteriser draws the SVG masters onto a canvas and hands back data URIs.
   Those are the deliverable, but a browser page cannot write to the repo, and
   carrying 500 KB of base64 back through a chat transcript to save it is absurd.
   So: run this, open the rasteriser, press Save, and the files land in brand/.

   Deliberately boring and deliberately local:
     - binds 127.0.0.1 only
     - accepts one route, POST /icon
     - writes only into brand/, only names matching a strict pattern, only .png
     - refuses anything with a slash or a dot-dot in the name

   Usage:  node tools/icon-sink.mjs         (Ctrl-C when done)
*/

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "brand");
const PORT = 8791;

/* Icon names are a closed set. A wildcard here would turn a debug helper into
   an arbitrary file write, which is not a trade worth making to save typing. */
const ALLOWED = new Set([
  "icon-180",
  "icon-192",
  "icon-512",
  "icon-maskable-512",
  "favicon-32",
]);

const server = http.createServer((req, res) => {
  /* The page is served from :8788, so this is cross-origin. */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");

  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method !== "POST" || req.url !== "/icon") {
    return res.writeHead(404).end("icon sink: POST /icon only");
  }

  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 8e6) req.destroy(); // no unbounded buffering
  });

  req.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return res.writeHead(400).end("bad json");
    }

    const { name, dataUri } = payload;
    if (!ALLOWED.has(name)) return res.writeHead(400).end("unknown icon: " + name);
    if (typeof dataUri !== "string" || !dataUri.startsWith("data:image/png;base64,")) {
      return res.writeHead(400).end("expected a png data uri");
    }

    const buf = Buffer.from(dataUri.slice(dataUri.indexOf(",") + 1), "base64");

    /* A PNG that does not start with the PNG signature is a canvas that failed
       silently, and writing it would ship a broken icon that looks fine in a
       directory listing. Check the magic bytes rather than trusting the tag. */
    const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) {
      return res.writeHead(400).end("not a png");
    }

    fs.mkdirSync(OUT, { recursive: true });
    const dest = path.join(OUT, name + ".png");
    fs.writeFileSync(dest, buf);
    console.log(`wrote ${name}.png  ${(buf.length / 1024).toFixed(1)} KB`);
    res.writeHead(200).end("ok");
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`icon sink listening on http://127.0.0.1:${PORT}  ->  ${OUT}`);
});
