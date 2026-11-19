// Test-only: "every Topic compiles", sharded across several test files.
//
// Every Topic, under every single-option variation, in both Response Formats
// and every Answer Key format, must compile without warnings (graph Topics and
// number lines included) through the real compiler: this is what catches
// LaTeX that KaTeX accepts but mitex cannot convert, and markup that only one
// key format emits (the in-context key's circled letters).
//
// One compiler keeps every image it has decoded for the life of its
// WebAssembly memory, and the whole catalogue of Topics outgrows that memory
// (the compiler aborts with "unreachable"). Vitest runs each test file in its
// own process, so each shard file (topicsN.smoke.test.ts) gets a fresh
// compiler for its share of the Topics. Add a shard file when the Topics grow.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { createTypstEngine, type TypstEngine } from "./engine";
import { FONT_FILES, MITEX_PACKAGE_FILE } from "./assetFiles";
import { buildTypstDocument } from "../../engine/typst";
import { ANSWER_KEY_FORMATS, buildWorksheet, setResponseFormat } from "../../engine/worksheet";
import { GENERATORS } from "../../engine/registry";
import type { ParamValues } from "../../engine/types";

/** How many topicsN.smoke.test.ts files share the Topics. */
export const TOPIC_SHARDS = 4;

const require = createRequire(import.meta.url);
const asset = (name: string) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./assets/${name}`, import.meta.url))));
const pkgFile = (spec: string) => new Uint8Array(readFileSync(require.resolve(spec)));

export function createSmokeEngine(): Promise<TypstEngine> {
  return createTypstEngine({
    compilerWasm: async () =>
      pkgFile("@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm"),
    rendererWasm: async () =>
      pkgFile("@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm"),
    fonts: Promise.resolve(FONT_FILES.map((f) => asset(`fonts/${f}`))),
    fontCount: FONT_FILES.length,
    mitexPackage: Promise.resolve(asset(MITEX_PACKAGE_FILE)),
  });
}

/** The Topics shard `shard` (0-based) of TOPIC_SHARDS compiles: every TOPIC_SHARDS-th one. */
export function topicsOfShard(shard: number) {
  return GENERATORS.filter((_, i) => i % TOPIC_SHARDS === shard);
}

export function everyTopicCompiles(shard: number): void {
  let engine: TypstEngine;
  beforeAll(async () => {
    engine = await createSmokeEngine();
  }, 60_000);

  describe(`every Topic compiles (shard ${shard + 1} of ${TOPIC_SHARDS})`, () => {
    for (const g of topicsOfShard(shard)) {
      const variants: ParamValues[] = [{}];
      for (const f of g.schema) {
        if (f.type === "enum") for (const o of f.options) variants.push({ [f.key]: o.value });
        if (f.type === "boolean") variants.push({ [f.key]: !f.default });
        if (f.type === "int") variants.push({ [f.key]: f.min }, { [f.key]: f.max });
      }
      it(`${g.id}: ${variants.length} option variants, free response and multiple choice, every Answer Key format`, async () => {
        for (const [i, params] of variants.entries()) {
          const fr = buildWorksheet({ generatorId: g.id, params, baseSeed: 1000 + i, count: 20 });
          const mc = setResponseFormat(fr, { mode: "multiple-choice", choices: 5 });
          for (const ws of [fr, mc]) {
            const pages: Record<string, number> = {};
            for (const keyFormat of ANSWER_KEY_FORMATS) {
              pages[keyFormat] = (await engine.svgPages(buildTypstDocument(ws, { keyFormat }))).length;
              expect(engine.warnings).toEqual([]);
            }
            expect(pages.none).toBeGreaterThan(0);
            // Every key starts on its own page; in context repeats the whole sheet.
            expect(pages.full).toBeGreaterThan(pages.none);
            expect(pages.odds).toBeGreaterThan(pages.none);
            expect(pages.odds).toBeLessThanOrEqual(pages.full);
            expect(pages["in-context"]).toBeGreaterThanOrEqual(2 * pages.none);
          }
        }
      }, 120_000);
    }
  });
}
