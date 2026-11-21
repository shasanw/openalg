import { generalSequences, sameList } from "./generalSequences.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, MAX_PRINTED } from "./generalSequences";
import { rat } from "./sequenceKit";
import { askedIndex, expectKatex, expectTidy, parseList, printedNumbers, splitAsk } from "./sequences.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  rule: fc.constantFrom("explicit", "recursive", "mixed"),
  ask: fc.constantFrom("firstTerms", "term", "mixed"),
  allowNegatives: fc.boolean(),
});

describe("general-sequences: answers", () => {
  it("the Answer is what the printed rule gives", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        generalSequences(p);
      }),
    );
  });

  it("prints tidy rules, modest numbers, and renders in KaTeX", () => {
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

describe("general-sequences: Topic Options", () => {
  it("uses the kind of rule asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const recursive = p.prompt.includes("a_{n-1}");
        if (params.rule === "explicit") expect(recursive).toBe(false);
        if (params.rule === "recursive") expect(recursive).toBe(true);
      }),
    );
    const kinds = new Set(Array.from({ length: 40 }, (_, s) => construct({}, createRng(s)).rule));
    expect(kinds).toEqual(new Set(["explicit", "recursive"]));
  });

  it("asks for what was chosen", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const term = askedIndex(splitAsk(p.prompt)[1]) !== null;
        if (params.ask === "term") expect(term).toBe(true);
        if (params.ask === "firstTerms") expect(term).toBe(false);
      }),
    );
  });

  it("prints no negative numbers or alternating signs when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.answer).not.toContain("-");
        const bare = p.prompt.replace(/[_^]\{[^}]*\}/g, "");
        expect(bare, p.prompt).not.toMatch(/(^|=|\(|,)\s*-/);
      }),
    );
  });
});

describe("general-sequences: distractors", () => {
  it("are distinct, never the Answer, and at least two", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(2);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        const answer = parseList(p.answer);
        for (const d of p.distractorHints) expect(sameList(parseList(d), answer)).toBe(false);
      }),
    );
  });

  it("model the order-of-operations and index mistakes", () => {
    // a_n = 3 \cdot 2^{n-1}: (3 \cdot 2)^{n-1} first, then the exponent n
    const k = construct({ rule: "explicit", ask: "firstTerms" }, createRng(0));
    const exp = {
      ...k,
      rule: "explicit" as const,
      form: "exponential",
      ruleLatex: "a_n = 3 \\cdot 2^{n-1}",
      seq: (n: number) => rat(3 * 2 ** (n - 1)),
      mistakes: [(n: number) => rat(6 ** (n - 1)), (n: number) => rat(3 * 2 ** n)],
      ask: "firstTerms" as const,
      count: 4,
    };
    expect(distractors(exp).slice(0, 3)).toEqual(["1, 6, 36, 216", "6, 12, 24, 48", "\\frac{3}{2}, 3, 6, 12"]);
  });
});

describe("general-sequences: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const rule of ["explicit", "recursive"]) {
      for (const allowNegatives of [true, false]) {
        const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ rule, allowNegatives }, s).prompt));
        expect(prompts.size, `${rule} ${allowNegatives}`).toBeGreaterThan(100);
      }
    }
  });
});
