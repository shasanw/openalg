import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, MAX_PRINTED } from "./arithmeticSequences";
import { rat } from "./sequenceKit";
import { close, evalLatex } from "../shared/latexEval.testkit";
import { askedIndex, expectKatex, expectTidy, parseList, printedNumbers, splitAsk } from "./sequences.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  given: fc.constantFrom("terms", "twoTerms", "mixed"),
  find: fc.constantFrom("rule", "term", "mixed"),
  fractions: fc.boolean(),
  allowNegatives: fc.boolean(),
});

/** a_1 and d, read back from the printed givens alone. */
function readGiven(given: string): { a1: number; d: number; twoTerms: boolean } {
  const two = given.match(/^a_\{(\d+)\} = (.+),\\ a_\{(\d+)\} = (.+)$/);
  if (two) {
    const [p, x, q, y] = [Number(two[1]), evalLatex(two[2]), Number(two[3]), evalLatex(two[4])];
    expect(q - p).toBeGreaterThanOrEqual(2); // not consecutive
    const d = (y - x) / (q - p);
    return { a1: x - (p - 1) * d, d, twoTerms: true };
  }
  const terms = parseList(given.replace(/, \\ldots$/, ""));
  expect(terms).toHaveLength(4);
  const d = terms[1] - terms[0];
  for (let i = 2; i < 4; i++) expect(close(terms[i] - terms[i - 1], d)).toBe(true);
  return { a1: terms[0], d, twoTerms: false };
}

const ruleValue = (answer: string, n: number) => evalLatex(answer.replace(/^a_n = /, ""), { n });

describe("arithmetic-sequences: answers", () => {
  it("the Answer fits the printed givens", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const [given, ask] = splitAsk(p.prompt);
        const { a1, d } = readGiven(given);
        const k = askedIndex(ask);
        if (k !== null) expect(close(evalLatex(p.answer), a1 + (k - 1) * d)).toBe(true);
        else {
          expect(ask).toBe("\\text{find a rule for } a_n");
          expect(p.answer).toMatch(/^a_n = /);
          for (const n of [1, 2, 7]) expect(close(ruleValue(p.answer, n), a1 + (n - 1) * d)).toBe(true);
        }
      }),
    );
  });

  it("prints tidy, modest numbers and renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(s);
        for (const s of [p.prompt, p.answer]) {
          expectKatex(s);
          for (const n of printedNumbers(s)) expect(n).toBeLessThanOrEqual(MAX_PRINTED);
        }
      }),
    );
  });
});

describe("arithmetic-sequences: Topic Options", () => {
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

  it("keeps the difference whole unless fractions are allowed, and uses them when they are", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, fractions: false }, createRng(seed));
        expect(k.d.d).toBe(1);
        const p = generator.generate({ ...params, fractions: false }, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expect(s).not.toContain("\\frac");
      }),
    );
    const fractional = Array.from({ length: 50 }, (_, s) => construct({ fractions: true }, createRng(s))).filter((k) => k.d.d > 1);
    expect(fractional.length).toBeGreaterThan(20);
  });

  it("prints no negative numbers when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, allowNegatives: false }, createRng(seed));
        expect(k.d.n).toBeGreaterThan(0);
        expect(k.a1.n).toBeGreaterThan(0);
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.prompt).not.toMatch(/(^|= |, )-/);
        if (askedIndex(splitAsk(p.prompt)[1]) !== null) expect(p.answer).not.toContain("-");
      }),
    );
  });
});

describe("arithmetic-sequences: distractors", () => {
  it("are distinct, never the Answer, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        if (p.answer.startsWith("a_n")) {
          // a different rule, not the same one written differently
          for (const d of p.distractorHints)
            expect([1, 2].every((n) => close(ruleValue(d, n), ruleValue(p.answer, n)))).toBe(false);
        }
      }),
    );
  });

  it("model forgetting the - 1 and misreading two terms", () => {
    // a_3 = 11, a_7 = 23: d = 3, a_1 = 5, a_n = 3n + 2
    const k = { given: "twoTerms" as const, find: "rule" as const, a1: rat(5), d: rat(3), p: 3, q: 7, k: 20, integers: true };
    expect(distractors(k).slice(0, 2)).toEqual([
      "a_n = 3n + 5", // a_1 + dn
      "a_n = 12n - 25", // 23 - 11 = 12 not divided by 4 (so a_1 = -13)
    ]);
    expect(distractors({ ...k, find: "term" })[0]).toBe("65"); // a_1 + 20d
  });
});

describe("arithmetic-sequences: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const given of ["terms", "twoTerms"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ given }, s).prompt));
      expect(prompts.size, given).toBeGreaterThan(150);
    }
  });
});
