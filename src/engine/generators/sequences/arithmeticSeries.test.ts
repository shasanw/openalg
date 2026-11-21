import { expectDistinctDistractors } from "./distinctDistractors.testkit";
import { arithmeticSeries, readSeries } from "./arithmeticSeries.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, MAX_PRINTED } from "./arithmeticSeries";
import { rat } from "./sequenceKit";
import { expectKatex, expectTidy, printedNumbers } from "./sequences.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  given: fc.constantFrom("firstN", "lastTerm", "sigma", "mixed"),
  maxTerms: fc.integer({ min: 5, max: 60 }),
  allowNegatives: fc.boolean(),
});

describe("arithmetic-series: answers", () => {
  it("the Answer is the sum of the printed series, term by term", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        arithmeticSeries(p);
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
      }),
    );
  });
});

describe("arithmetic-series: Topic Options", () => {
  it("gives the series the way asked for, with 5 to Most terms", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const read = readSeries(p.prompt);
        if (params.given !== "mixed") expect(read.kind).toBe(params.given);
        expect(read.terms.length).toBeGreaterThanOrEqual(5);
        expect(read.terms.length).toBeLessThanOrEqual(params.maxTerms);
      }),
    );
    const kinds = new Set(Array.from({ length: 40 }, (_, s) => construct({}, createRng(s)).given));
    expect(kinds).toEqual(new Set(["firstN", "lastTerm", "sigma"]));
  });

  it("has no negative terms when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(Math.min(...readSeries(p.prompt).terms)).toBeGreaterThan(0);
        expect(p.answer).not.toContain("-");
      }),
    );
  });
});

describe("arithmetic-series: distractors", () => {
  it("are distinct whole numbers, never the Answer, and at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectDistinctDistractors(p, (a, b) => Number(a) === Number(b));
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) expect(d).toMatch(/^-?\d+$/);
      }),
    );
  });

  it("model forgetting to halve and miscounting the terms", () => {
    // 3 + 7 + 11 + ... + 79: 20 terms, sum 820
    const k = { given: "lastTerm" as const, a1: rat(3), d: rat(4), n: 20, from: 1 };
    expect(distractors(k)).toContain("82"); // add just the endpoints
    expect(distractors(k).slice(0, 2)).toEqual(["1640", "779"]); // not halved; 19 terms
    // \sum_{k=1}^{10} (2k + 3): 140; the 3 added once: 113
    expect(distractors({ given: "sigma", a1: rat(5), d: rat(2), n: 10, from: 1 })).toContain("113");
  });
});

describe("arithmetic-series: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const given of ["firstN", "lastTerm", "sigma"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ given }, s).prompt));
      expect(prompts.size, given).toBeGreaterThan(150);
    }
  });
});
