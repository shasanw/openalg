import { geometricSeries, readSeries } from "./geometricSeries.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, DIVERGES, generator, MAX_PRINTED } from "./geometricSeries";
import { rat } from "./sequenceKit";
import { close, evalLatex } from "../shared/latexEval.testkit";
import { expectKatex, expectTidy, printedNumbers } from "./sequences.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  kind: fc.constantFrom("finite", "infinite", "mixed"),
  notation: fc.constantFrom("terms", "sigma", "mixed"),
  maxTerms: fc.integer({ min: 5, max: 10 }),
  negativeRatios: fc.boolean(),
  includeDiverges: fc.boolean(),
});

describe("geometric-series: answers", () => {
  it("the Answer is the printed series' sum, or that it diverges", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        geometricSeries(p);
      }),
    );
  });

  it("prints tidy, modest series and renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(s);
        expectKatex(p.prompt);
        expectKatex(p.answer);
        for (const n of printedNumbers(p.prompt)) expect(n).toBeLessThanOrEqual(MAX_PRINTED);
        // the written-out terms are whole numbers
        if (!p.prompt.startsWith("\\sum")) expect(p.prompt).not.toContain("\\frac");
      }),
    );
  });
});

describe("geometric-series: Topic Options", () => {
  it("is finite or infinite, in the notation asked for, with 5 to Most terms", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const read = readSeries(generator.generate(params, seed).prompt);
        if (params.kind === "finite") expect(read.n).toBeLessThanOrEqual(params.maxTerms);
        if (params.kind === "infinite") expect(read.n).toBe(Infinity);
        if (params.notation !== "mixed") expect(read.notation).toBe(params.notation);
        if (read.n !== Infinity) expect(read.n).toBeGreaterThanOrEqual(5);
      }),
    );
  });

  it("uses negative ratios only when allowed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, negativeRatios: false }, createRng(seed));
        expect(k.r.n).toBeGreaterThan(0);
      }),
    );
    const negative = Array.from({ length: 60 }, (_, s) => construct({ negativeRatios: true }, createRng(s))).filter((k) => k.r.n < 0);
    expect(negative.length).toBeGreaterThan(15);
  });

  it("includes divergent series only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate({ ...params, includeDiverges: false }, seed).answer).not.toBe(DIVERGES);
      }),
    );
    const diverging = Array.from({ length: 100 }, (_, s) =>
      generator.generate({ kind: "infinite", includeDiverges: true }, s),
    ).filter((p) => p.answer === DIVERGES);
    expect(diverging.length).toBeGreaterThan(10);
    expect(diverging.length).toBeLessThan(60);
  });
});

describe("geometric-series: distractors", () => {
  it("are distinct, never the Answer, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        if (p.answer !== DIVERGES)
          for (const d of p.distractorHints) if (d !== DIVERGES) expect(close(evalLatex(d), evalLatex(p.answer))).toBe(false);
      }),
    );
  });

  it("model the sign of r, the starting term, and using the formula on a divergent series", () => {
    // 12 + 6 + 3 + ...: 24
    const k = { kind: "infinite" as const, notation: "terms" as const, a1: rat(12), r: rat(1, 2), n: Infinity };
    expect(distractors(k).slice(0, 3)).toEqual(["8", "12", DIVERGES]);
    // 4 + 8 + 16 + ...: diverges, yet a_1/(1 - r) = -4
    expect(distractors({ ...k, a1: rat(4), r: rat(2) })[0]).toBe("-4");
    // 2 + 6 + ... + 162 (5 terms): 242; one short 80, one more 728
    expect(distractors({ ...k, kind: "finite", a1: rat(2), r: rat(3), n: 5 }).slice(0, 2)).toEqual(["80", "728"]);
  });
});

describe("geometric-series: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const kind of ["finite", "infinite"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ kind }, s).prompt));
      expect(prompts.size, kind).toBeGreaterThan(60);
    }
  });
});
