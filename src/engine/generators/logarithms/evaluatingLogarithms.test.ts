import { expectDistinctDistractors } from "../sequences/distinctDistractors.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import katex from "katex";
import { createRng } from "../../rng";
import { construct, distractors, generator, type Answers } from "./evaluatingLogarithms";
import { rat } from "../shared/equationKit";
import { numberBase } from "./logKit";
import { close, evalLatex } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const ANSWERS: Answers[] = ["whole", "integers", "rational"];
const anyParams = fc.record({
  answers: fc.constantFrom(...ANSWERS),
  fractionBases: fc.boolean(),
  commonNatural: fc.boolean(),
});

const value = (tex: string) => evalLatex(tex, { e: Math.E });

describe("evaluating-logarithms: answers", () => {
  it("the printed logarithm equals the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(close(value(p.prompt), value(p.answer), 1e-9)).toBe(true);
      }),
    );
  });

  it("never asks for log_b b or log_b 1, and keeps numbers small", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(["0", "1"]).not.toContain(p.answer);
        for (const n of p.prompt.match(/\d+/g) ?? []) expect(Number(n)).toBeLessThanOrEqual(10000);
      }),
    );
  });
});

describe("evaluating-logarithms: Topic Options", () => {
  it("gives the kind of Answer asked for", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.answers !== "rational") expect(k.q.d).toBe(1);
        if (params.answers === "whole") expect(k.q.n).toBeGreaterThanOrEqual(2);
      }),
    );
    const qs = Array.from({ length: 80 }, (_, s) => construct({}, createRng(s)).q);
    expect(qs.some((q) => q.d > 1)).toBe(true);
    expect(qs.some((q) => q.n < 0)).toBe(true);
  });

  it("uses fraction bases only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, fractionBases: false }, seed);
        expect(p.prompt).not.toContain("\\log_{\\frac");
      }),
    );
    const some = Array.from({ length: 60 }, (_, s) => generator.generate({ fractionBases: true }, s).prompt);
    expect(some.some((s) => s.includes("\\log_{\\frac"))).toBe(true);
  });

  it("uses common and natural logarithms only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, commonNatural: false }, seed);
        expect(p.prompt).toMatch(/^\\log_\{/);
      }),
    );
    const kinds = new Set(Array.from({ length: 80 }, (_, s) => construct({}, createRng(s)).base.kind));
    expect(kinds).toEqual(new Set(["number", "common", "natural"]));
  });
});

describe("evaluating-logarithms: distractors", () => {
  it("are distinct, never the Answer's value, and at least four", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectDistinctDistractors(p, (a, b) => close(value(a), value(b)));
        for (const d of p.distractorHints) expect(close(value(d), value(p.answer))).toBe(false);
      }),
    );
  });

  it("model the reciprocal, sign and division mistakes", () => {
    // log_8 2 = 1/3
    const k = { base: numberBase(rat(8)), arg: "2", q: rat(1, 3), argInt: 2, m: 3, n: rat(1) };
    expect(distractors(k).slice(0, 3)).toEqual(["3", "-\\frac{1}{3}", "\\frac{1}{4}"]);
    // log_2 8 = 3: divided 8 by 2
    const d = { base: numberBase(rat(2)), arg: "8", q: rat(3), argInt: 8, m: 1, n: rat(3) };
    expect(distractors(d)).toContain("2"); // report the base instead of the exponent
    expect(distractors(d)).toContain("4");
  });
});

describe("evaluating-logarithms: generate()", () => {
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
    for (const answers of ANSWERS) {
      const prompts = new Set(Array.from({ length: 100 }, (_, s) => generator.generate({ answers }, s).prompt));
      expect(prompts.size, answers).toBeGreaterThan(30);
    }
  });
});
