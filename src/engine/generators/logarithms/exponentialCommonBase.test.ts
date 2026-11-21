import { expectDistinctDistractors } from "../sequences/distinctDistractors.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import katex from "katex";
import { createRng } from "../../rng";
import { construct, distractors, generator, type FormMode } from "./exponentialCommonBase";
import { isInt, rat } from "../shared/equationKit";
import { answerValues, close, evalLatex, splitEquation } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const FORMS: FormMode[] = ["mixed", "oneSide", "bothSides"];
const anyParams = fc.record({
  form: fc.constantFrom(...FORMS),
  reciprocals: fc.boolean(),
  fractionAnswers: fc.boolean(),
});

/** Compare the two sides by their logarithms, so large powers stay exact enough. */
function satisfies(prompt: string, x: number): boolean {
  const [l, r] = splitEquation(prompt);
  return close(Math.log(evalLatex(l, { x })), Math.log(evalLatex(r, { x })), 1e-9);
}

describe("exponential-common-base: answers", () => {
  it("the Answer makes the printed equation true, and nothing nearby does", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const { v, values } = answerValues(p.answer);
        expect(v).toBe("x");
        expect(values).toHaveLength(1);
        expect(satisfies(p.prompt, values[0])).toBe(true);
        expect(satisfies(p.prompt, values[0] + 0.5)).toBe(false);
      }),
    );
  });

  it("writes every base and value as a power of one common base, never 1", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(k.left.p).not.toBe(0);
        expect(k.left.a).not.toBe(0);
        if (k.right) {
          expect(k.right.p).not.toBe(k.left.p);
          expect(k.right.a).not.toBe(0);
          expect(k.left.p * k.left.a).not.toBe(k.right.p * k.right.a);
        } else expect(k.k).not.toBe(0);
        const p = generator.generate(params, seed);
        expect(p.prompt).not.toMatch(/(^|[^0-9.])1x/);
        expect(p.prompt).not.toMatch(/[+-] 0(?![.\d])/);
        expect(p.prompt).not.toMatch(/(^|[^0-9])1\^/);
      }),
    );
  });
});

describe("exponential-common-base: Topic Options", () => {
  it("honours the equation form", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.form !== "mixed") expect(k.form).toBe(params.form);
        expect(k.right === null).toBe(k.form === "oneSide");
      }),
    );
    const forms = new Set(Array.from({ length: 40 }, (_, s) => construct({}, createRng(s)).form));
    expect(forms).toEqual(new Set(["oneSide", "bothSides"]));
  });

  it("prints reciprocals only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, reciprocals: false }, seed);
        expect(p.prompt).not.toContain("\\frac");
      }),
    );
    const some = Array.from({ length: 60 }, (_, s) => generator.generate({ reciprocals: true }, s).prompt);
    expect(some.some((s) => s.includes("\\frac{1}"))).toBe(true);
  });

  it("gives whole-number answers unless fraction answers are allowed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, fractionAnswers: false }, createRng(seed));
        expect(isInt(k.x)).toBe(true);
      }),
    );
    const xs = Array.from({ length: 60 }, (_, s) => construct({ fractionAnswers: true }, createRng(s)).x);
    expect(xs.some((x) => !isInt(x))).toBe(true);
  });
});

describe("exponential-common-base: distractors", () => {
  it("are distinct, never the Answer's value, and at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectDistinctDistractors(p, (a, b) => close(answerValues(a).values[0], answerValues(b).values[0]));
        const answer = answerValues(p.answer).values[0];
        for (const d of p.distractorHints) expect(close(answerValues(d).values[0], answer)).toBe(false);
      }),
    );
  });

  it("model forgetting to rewrite the bases", () => {
    // 4^{2x - 1} = 8^{x + 2}: 2(2x - 1) = 3(x + 2), x = 8
    const k = {
      form: "bothSides" as const,
      c: 2,
      left: { p: 2, a: 2, b: -1 },
      right: { p: 3, a: 1, b: 2 },
      k: 0,
      x: rat(8),
    };
    expect(distractors(k)).toContain("x = 30"); // report the common exponent 2(2·8 - 1)
    expect(distractors(k)[0]).toBe("x = 3"); // 2x - 1 = x + 2
    // 8^{x} = 32: 3x = 5; forgot to rewrite: x = 5
    const one = { form: "oneSide" as const, c: 2, left: { p: 3, a: 1, b: 0 }, right: null, k: 5, x: rat(5, 3) };
    expect(distractors(one)[0]).toBe("x = 5");
  });
});

describe("exponential-common-base: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("prompt, answer and distractors all render with KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const tex of [p.prompt, p.answer, ...p.distractorHints]) {
          expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const form of FORMS) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ form }, s).prompt));
      expect(prompts.size, form).toBeGreaterThan(150);
    }
  });
});
