// Re-downloads the vendored Typst runtime files in
// src/platform/typst/assets/ and verifies them against the SHA-256 hashes in
// that folder's README. Only needed to repair or audit them; the files are
// committed, so builds never touch the network.
//
//   node scripts/fetch-typst-assets.mjs
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../src/platform/typst/assets/", import.meta.url).pathname;
const FONTS = "https://cdn.jsdelivr.net/gh/typst/typst-assets@v0.14.2/files/fonts/";
const FILES = {
  "fonts/NewCM10-Regular.otf": FONTS + "NewCM10-Regular.otf",
  "fonts/NewCM10-Bold.otf": FONTS + "NewCM10-Bold.otf",
  "fonts/NewCM10-Italic.otf": FONTS + "NewCM10-Italic.otf",
  "fonts/NewCMMath-Regular.otf": FONTS + "NewCMMath-Regular.otf",
  "mitex-0.2.7.tar.gz": "https://packages.typst.org/preview/mitex-0.2.7.tar.gz",
};

const readme = readFileSync(dir + "README.md", "utf8");
mkdirSync(dir + "fonts", { recursive: true });
let bad = 0;
for (const [file, url] of Object.entries(FILES)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  const hash = createHash("sha256").update(data).digest("hex");
  const row = readme.split("\n").find((l) => l.includes(`\`${file}\``));
  if (!row?.includes(hash)) {
    console.error(`MISMATCH ${file}: got ${hash}`);
    bad++;
    continue;
  }
  writeFileSync(dir + file, data);
  console.log(`ok ${file}`);
}
if (bad) process.exit(1);
