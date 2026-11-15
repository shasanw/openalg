// @vitest-environment node
// Smoke test for the real Typst-WASM compiler: the same engine the Web Worker
// hosts, fed the bundled fonts and mitex package straight from disk.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { createTypstEngine, fillMath, typstString, type TypstEngine } from "./engine";
import { FONT_FILES, MITEX_PACKAGE_FILE } from "./assetFiles";
import { buildTypstDocument } from "../../engine/typst";
import { WARM_UP_DOCUMENT } from "./warmUp";
import {
  ANSWER_KEY_FORMATS,
  buildWorksheet,
  buildSection,
  setResponseFormat,
  setVersionSettings,
  type ScrambleMode,
} from "../../engine/worksheet";
import { GENERATORS } from "../../engine/registry";
import type { ParamValues } from "../../engine/types";
import { QUADRATIC_FORMULA_ID } from "../../engine/generators/quadraticFormula";
import { QUADRATIC_FACTORING_ID } from "../../engine/generators/quadraticFactoring";

const require = createRequire(import.meta.url);
const asset = (name: string) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./assets/${name}`, import.meta.url))));
const pkgFile = (spec: string) => new Uint8Array(readFileSync(require.resolve(spec)));

let engine: TypstEngine;
/** URLs the compiler tried to fetch (it must fetch none: no CDN fonts). */
const fetched: string[] = [];

beforeAll(async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetched.push(String(input instanceof Request ? input.url : input));
    throw new Error("no network in the Typst smoke test");
  }) as typeof fetch;
  try {
    engine = await createEngine();
  } finally {
    globalThis.fetch = realFetch;
  }
}, 60_000);

function createEngine(mitexPackage = asset(MITEX_PACKAGE_FILE)) {
  return createTypstEngine({
    compilerWasm: async () =>
      pkgFile("@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm"),
    rendererWasm: async () =>
      pkgFile("@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm"),
    fonts: Promise.resolve(FONT_FILES.map((f) => asset(`fonts/${f}`))),
    fontCount: FONT_FILES.length,
    mitexPackage: Promise.resolve(mitexPackage),
  });
}

const small = {
  source: '#set page(width: 300pt, height: 300pt)\n#set text(font: "New Computer Modern")\nProblem: @@M0@@\n#pagebreak()\nKey: @@M1@@',
  math: ["x^2 - 5x + 6 = 0", "x = \\frac{-3 \\pm \\sqrt{17}}{2}"],
};

describe("Typst engine (WASM)", () => {
  it("compiles the warm-up document cleanly to one page", async () => {
    const pages = await engine.svgPages(WARM_UP_DOCUMENT);
    expect(pages).toHaveLength(1);
    expect(engine.warnings).toEqual([]);
  });

  it("loads only the bundled files, fetching nothing (no CDN fonts)", () => {
    expect(fetched).toEqual([]);
  });

  it("still loads mitex when a server already un-gzipped the package", async () => {
    const plainTar = new Uint8Array(gunzipSync(asset(MITEX_PACKAGE_FILE)));
    const other = await createEngine(plainTar);
    expect(await other.svgPages(small)).toHaveLength(2);
  });

  it("compiles a small document to a non-empty PDF", async () => {
    const pdf = await engine.pdf(small);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });

  it("compiles to one self-contained SVG per page", async () => {
    const pages = await engine.svgPages(small);
    expect(pages).toHaveLength(2);
    const ids = (svg: string) => new Set([...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    const defined = new Set(pages.flatMap((svg) => [...ids(svg)]));
    for (const svg of pages) {
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain('viewBox="0 0 300 300"');
      expect(svg).not.toContain("<script");
      // Every glyph the page uses is defined in the same SVG (blank glyphs
      // such as spaces are referenced but never defined by the renderer).
      const own = ids(svg);
      for (const [, id] of svg.matchAll(/href="#([^"]+)"/g)) {
        if (defined.has(id)) expect(own.has(id)).toBe(true);
      }
    }
  });

  it("compiles a real quadratic-formula Worksheet with radicals and imaginary roots", async () => {
    for (const rootType of ["irrational", "imaginary"]) {
      const ws = buildWorksheet({
        generatorId: QUADRATIC_FORMULA_ID,
        params: { rootType },
        baseSeed: 7,
        count: 12,
      });
      const pages = await engine.svgPages(buildTypstDocument(ws, { keyFormat: "full" }));
      expect(pages.length).toBeGreaterThanOrEqual(2); // Problems + Answer Key
      // No "unknown font" or fallback warnings: the bundled fonts cover it.
      expect(engine.warnings).toEqual([]);
      expect(pages.join("")).toContain("√"); // radicals typeset (text layer)
    }
  });

  it("reports Typst errors instead of returning output", async () => {
    await expect(engine.pdf({ source: "#let x = (", math: [] })).rejects.toThrow(
      /unclosed delimiter/,
    );
  });
});

describe("fillMath", () => {
  it("imports mitex and replaces each placeholder with an escaped #mi call", () => {
    const main = fillMath({ source: "A @@M0@@ B @@M1@@", math: ["\\sqrt{2}", 'a"b'] });
    expect(main).toBe(
      '#import "@preview/mitex:0.2.7": mi\nA #mi("\\\\sqrt{2}") B #mi("a\\"b")',
    );
  });

  it("escapes newlines in Typst strings", () => {
    expect(typstString("a\nb")).toBe('"a\\nb"');
  });

});

// Every Topic, under every single-option variation, in both Response Formats
// and every Answer Key format, must compile through the real compiler: this is
// what catches LaTeX that KaTeX accepts but mitex cannot convert, and markup
// that only one key format emits (the in-context key's circled letters).
describe("every Topic compiles", () => {
  for (const g of GENERATORS) {
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

// Versions (#11): Print and Export PDF emit every Version's student pages, then
// every Version's Answer Key. A two-Section sheet in three Versions, under each
// Scramble Mode, in both Response Formats and every key format, must compile,
// and each Version must take as many pages as the sheet does on its own.
describe("multi-Version documents compile", () => {
  const modes: ScrambleMode[] = ["scramble-choices", "scramble-order", "new-questions"];
  for (const mode of modes) {
    it(`${mode}: 3 Versions, free response and multiple choice, every Answer Key format`, async () => {
      const first = buildWorksheet({ generatorId: QUADRATIC_FACTORING_ID, baseSeed: 31, count: 8 });
      const second = buildSection({
        generatorId: QUADRATIC_FORMULA_ID,
        params: { rootType: "imaginary" },
        baseSeed: 32,
        count: 6,
      });
      const fr = setVersionSettings(
        { ...first, sections: [...first.sections, second] },
        { count: 3, mode },
      );
      const mc = setResponseFormat(fr, { mode: "multiple-choice", choices: 4 });
      for (const ws of [fr, mc]) {
        for (const keyFormat of ANSWER_KEY_FORMATS) {
          const all = await engine.svgPages(buildTypstDocument(ws, { version: "all", keyFormat }));
          expect(engine.warnings).toEqual([]);
          let perVersion = 0;
          for (const version of [0, 1, 2]) {
            const one = await engine.svgPages(buildTypstDocument(ws, { version, keyFormat }));
            expect(one.join("")).toContain(`Version ${"ABC"[version]}`);
            perVersion += one.length;
          }
          expect(all.length).toBe(perVersion);
        }
      }
    }, 120_000);
  }
});
