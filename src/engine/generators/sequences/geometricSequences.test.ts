import { expectDistinctDistractors } from "./distinctDistractors.testkit";
import { geometricSequences, readGiven, ruleValue } from "./geometricSequences.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, MAX_PRINTED, MAX_TERM } from "./geometricSequences";
import { rat } from "./sequenceKit";
import { close, evalLatex } from "../shared/latexEval.testkit";
import { askedIndex, expectKatex, expectTidy, printedNumbers, splitAsk } from "./sequences.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  given: fc.constantFrom("terms", "twoTerms", "mixed"),
  find: fc.constantFrom("rule", "term", "mixed"),
  ratios: fc.constantFrom("integer", "fraction", "mixed"),
  negativeRatios: fc.boolean(),
});

describe("geometric-sequences: answers", () => {
  it("the Answer fits the printed givens", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        geometricSequences(p);
      }),
    );
  });

  it("prints whole given terms, tidy and modest, and renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const [given] = splitAsk(p.prompt);
        expect(given).not.toContain("\\frac");
        for (const n of printedNumbers(given)) expect(n).toBeLessThanOrEqual(MAX_PRINTED);
        for (const n of printedNumbers(p.answer)) expect(n).toBeLessThanOrEqual(Math.max(MAX_PRINTED, MAX_TERM));
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(s);
        for (const s of [p.prompt, p.answer]) expectKatex(s);
      }),
    );
  });
});

describe("geometric-sequences: Topic Options", () => {
  it("gives and asks for what was chosen", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const [given, ask] = splitAsk(p.prompt);
        const two = readGiven(given).twoTerms;
        if (params.given === "terms") expect(two).toBe(false);
        if (params.given === "twoTerms") expect(two).toBe(true);
        if (params.find === "rule") expect(askedIndex(ask)).toBeNull();
        if (params.find === "term") expect(askedIndex(ask)).not.toBeNull();
      }),
    );
  });

  it("uses the kind of ratio asked for, negative only when allowed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.ratios === "integer") expect(k.r.d).toBe(1);
        if (params.ratios === "fraction") expect(k.r.d).toBeGreaterThan(1);
        if (!params.negativeRatios) expect(k.r.n).toBeGreaterThan(0);
        expect(Math.abs(k.r.n)).not.toBe(k.r.d); // never r = 1 or -1
      }),
    );
    const negative = Array.from({ length: 60 }, (_, s) => construct({ negativeRatios: true }, createRng(s))).filter((k) => k.r.n < 0);
    expect(negative.length).toBeGreaterThan(15);
  });
});

describe("geometric-sequences: distractors", () => {
  it("are distinct, never the Answer, and at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectDistinctDistractors(p, (a, b) => p.answer.startsWith("a_n")
          ? [1, 2, 3].every((n) => close(ruleValue(a, n), ruleValue(b, n)))
          : close(evalLatex(a), evalLatex(b)));
        if (p.answer.startsWith("a_n")) {
          for (const d of p.distractorHints)
            expect([1, 2, 3].every((n) => close(ruleValue(d, n), ruleValue(p.answer, n), 1e-6))).toBe(false);
        } else {
          for (const d of p.distractorHints) expect(close(evalLatex(d), evalLatex(p.answer), 1e-6)).toBe(false);
        }
      }),
    );
  });

  it("model the exponent and order-of-operations mistakes", () => {
    // 3, 6, 12, 24, ...: a_n = 3 \cdot 2^{n-1}
    const k = { given: "terms" as const, find: "rule" as const, a1: rat(3), r: rat(2), p: 1, q: 4, k: 7 };
    expect(distractors({ ...k, find: "term" })).toContain("36"); // 3 · 2 · (7 - 1)
    expect(distractors(k).slice(0, 3)).toEqual([
      "a_n = 3 \\cdot 2^{n}",
      "a_n = 6^{n-1}",
      "a_n = 3\\left(\\frac{1}{2}\\right)^{n-1}",
    ]);
    expect(distractors({ ...k, find: "term" }).slice(0, 2)).toEqual(["384", "46656"]); // 3 \cdot 2^7, 6^6
  });
});

describe("geometric-sequences: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const ratios of ["integer", "fraction"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ ratios }, s).prompt));
      expect(prompts.size, ratios).toBeGreaterThan(80);
    }
  });
});
