// A production-like static server for dist/, for local checks and timings
// (`pnpm build && pnpm serve:dist`). It serves the precompressed .br / .gz
// siblings the build writes, `application/wasm`, immutable caching for the
// content-hashed /assets/ files, and no-cache for index.html and sw.js, which
// is how a real static host should be set up for the Typst-WASM files.
//
//   PORT=4173 node scripts/serve-dist.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { networkInterfaces } from "node:os";

const root = new URL("../dist/", import.meta.url).pathname;
const port = Number(process.env.PORT || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".otf": "font/otf",
  ".woff2": "font/woff2",
  ".gz": "application/gzip",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  let file = join(root, path);
  if (!file.startsWith(root)) return void res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");

  const ext = extname(file);
  const headers = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    Vary: "Accept-Encoding",
  };
  const accept = String(req.headers["accept-encoding"] ?? "");
  let body = file;
  if (ext !== ".gz") {
    if (/\bbr\b/.test(accept) && existsSync(`${file}.br`)) {
      body = `${file}.br`;
      headers["Content-Encoding"] = "br";
    } else if (/\bgzip\b/.test(accept) && existsSync(`${file}.gz`)) {
      body = `${file}.gz`;
      headers["Content-Encoding"] = "gzip";
    }
  }
  const data = readFileSync(body);
  headers["Content-Length"] = data.length;
  res.writeHead(200, headers).end(req.method === "HEAD" ? undefined : data);
}).listen(port, "0.0.0.0", () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i.address}:${port}/`);
  console.log(`serving dist/ on http://localhost:${port}/  (LAN: ${lan.join(" ") || "none"})`);
});
