/* Local static server for development only. Not deployed - netlify.toml
   publishes this folder as static files and never runs this. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8788;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    let rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
    if (rel === "privacy") rel = "privacy.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end("no"); return; }
    fs.readFile(file, (err, buf) => {
      if (err) {
        // SPA-ish fallback, same as the deployed _redirects
        fs.readFile(path.join(ROOT, "index.html"), (e2, idx) => {
          if (e2) { res.writeHead(404).end("not found"); return; }
          res.writeHead(200, { "Content-Type": TYPES[".html"] }).end(idx);
        });
        return;
      }
      const ext = path.extname(file);
      const headers = { "Content-Type": TYPES[ext] || "application/octet-stream" };
      if (rel === "sw.js") headers["Cache-Control"] = "public, max-age=0, must-revalidate";
      res.writeHead(200, headers).end(buf);
    });
  })
  .listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
