import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, distractors, generator, MAX_PRINTED } from "./arithmeticSeries";
import { rat } from "./sequenceKit";
import { evalLatex } from "./latexEval.testkit";
import { expectKatex, expectTidy, parseSeries, parseSigma, printedNumbers, splitAsk } from "./sequences.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  given: fc.constantFrom("firstN", "lastTerm", "sigma", "mixed"),
  maxTerms: fc.integer({ min: 5, max: 60 }),
  allowNegatives: fc.boolean(),
});

type Read = { kind: "firstN" | "lastTerm" | "sigma"; terms: number[] };

/** Every term of the printed series, read from the prompt alone. */
function readSeries(prompt: string): Read {
  const sigma = parseSigma(prompt);
  if (sigma) {
    const terms: number[] = [];
    for (let k = sigma.from; k <= sigma.to; k++) terms.push(evalLatex(sigma.body, { k }));
    return { kind: "sigma", terms };
  }
  const asksN = prompt.includes(";\\quad ");
  const [series, ask] = asksN ? splitAsk(prompt) : [prompt, ""];
  const { opening, last } = parseSeries(series);
  const d = opening[1] - opening[0];
  expect(opening[2] - opening[1]).toBe(d);
  let n: number;
  if (asksN) {
    expect(last).toBeNull();
    n = Number(ask.match(/^\\text\{find \} S_\{(\d+)\}$/)![1]);
  } else {
    n = (last! - opening[0]) / d + 1;
    expect(Number.isInteger(n)).toBe(true);
  }
  return { kind: asksN ? "firstN" : "lastTerm", terms: Array.from({ length: n }, (_, i) => opening[0] + i * d) };
}

const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("arithmetic-series: answers", () => {
  it("the Answer is the sum of the printed series, term by term", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(evalLatex(p.answer)).toBe(total(readSeries(p.prompt).terms));
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
  it("are distinct whole numbers, never the Answer, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) expect(d).toMatch(/^-?\d+$/);
      }),
    );
  });

  it("model forgetting to halve and miscounting the terms", () => {
    // 3 + 7 + 11 + ... + 79: 20 terms, sum 820
    const k = { given: "lastTerm" as const, a1: rat(3), d: rat(4), n: 20, from: 1 };
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
