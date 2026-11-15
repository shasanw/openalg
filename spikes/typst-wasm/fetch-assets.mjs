// Downloads the only runtime assets the spike needs (not committed):
//  - New Computer Modern text (Regular, Bold, Italic) + Math, from typst-assets
//    v0.14.2 (matches Typst 0.14.2 inside typst.ts 0.7.0)
//  - the @preview/mitex 0.2.7 Typst package tarball (and its mitex.wasm plugin)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const out = new URL("./public/vendor/", import.meta.url).pathname;
mkdirSync(out + "fonts", { recursive: true });

const FONTS = ["NewCM10-Regular.otf", "NewCM10-Bold.otf", "NewCM10-Italic.otf", "NewCMMath-Regular.otf"];
const jobs = FONTS.map((f) => [
  `https://cdn.jsdelivr.net/gh/typst/typst-assets@v0.14.2/files/fonts/${f}`,
  `${out}fonts/${f}`,
]);
jobs.push(["https://packages.typst.org/preview/mitex-0.2.7.tar.gz", `${out}mitex-0.2.7.tar.gz`]);

for (const [url, dest] of jobs) {
  if (existsSync(dest)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log("fetched", url);
}
if (!existsSync(out + "mitex.wasm")) {
  execFileSync("tar", ["xzf", out + "mitex-0.2.7.tar.gz", "-C", out, "mitex.wasm"]);
}
