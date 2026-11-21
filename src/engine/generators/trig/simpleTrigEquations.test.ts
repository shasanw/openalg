import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { NO_SOLUTION } from "../shared/equationKit";
import { construct, generator } from "./simpleTrigEquations";
import { anySeed, expectLowestTerms, expectRenders } from "./trig.testkit";
import { hintSolutions, parsePrompt, sameNumbers, statedSolutions, optionCombinations } from "./trigEquation.testkit";
import { simpleTrigEquations } from "./simpleTrigEquations.answer.testkit";

const anyParams = fc.record({
  unit: fc.constantFrom("radians", "degrees"),
  solutions: fc.constantFrom("interval", "general"),
  squared: fc.boolean(),
  multiple: fc.boolean(),
  reciprocal: fc.boolean(),
  noSolution: fc.boolean(),
});

describe("simple-trig-equations: answers", () => {
  it("the Answer is exactly the printed equation's solution set", () => {
    for (const params of optionCombinations(generator.schema)) {
      fc.assert(fc.property(anySeed, (seed) => {
        const p = generator.generate(params, seed);
        simpleTrigEquations(p);
      }), { numRuns: 10 });
    }
  }, 60_000);

  it("prints fractions of π in lowest terms and no 1x, + 0 or double signs", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectLowestTerms(p.answer);
        expect(p.prompt).not.toMatch(/(^|[^0-9.])1\\(sin|cos|tan)/);
        expect(p.prompt).not.toMatch(/[+-] 0(?![.\d])/);
        expect(p.prompt).not.toMatch(/[+-] [+-]|--/);
      }),
    );
  });
});

describe("simple-trig-equations: Topic Options", () => {
  it("states the interval, and uses x in radians and θ in degrees", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const q = parsePrompt(p.prompt);
        expect(q.general).toBe(params.solutions === "general");
        expect(q.v).toBe(params.unit === "degrees" ? "theta" : "x");
        if (p.answer !== NO_SOLUTION) {
          if (params.unit === "degrees") expect(p.answer).toMatch(/\^\{\\circ\}/);
          else expect(p.answer).not.toMatch(/circ/);
        }
      }),
    );
  });

  it("squares, multiples of the angle, reciprocals and no-solution equations only when asked, and all of them sometimes", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (!params.squared) expect(k.squared).toBe(false);
        if (!params.multiple) expect(k.coef).toBe(1);
        if (!params.reciprocal) expect(["sin", "cos", "tan"]).toContain(k.fn);
        if (!params.noSolution) expect(k.solutions.length).toBeGreaterThan(0);
      }),
    );
    const all = { squared: true, multiple: true, reciprocal: true, noSolution: true };
    const ks = Array.from({ length: 300 }, (_, s) => construct(all, createRng(s)));
    expect(ks.some((k) => k.squared)).toBe(true);
    expect(new Set(ks.map((k) => k.coef))).toEqual(new Set([1, 2, 3]));
    expect(new Set(ks.map((k) => k.fn))).toEqual(new Set(["sin", "cos", "tan", "csc", "sec", "cot"]));
    expect(ks.some((k) => k.solutions.length === 0)).toBe(true);
  });
});

describe("simple-trig-equations: distractors", () => {
  it("are at least three, distinct, and never the Answer's solution set", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        const q = parsePrompt(p.prompt);
        const answer = statedSolutions(q, p.answer).sort((a, b) => a - b);
        const seen: number[][] = [];
        for (const d of p.distractorHints) {
          const v = hintSolutions(p.prompt, d);
          expect(v, d).not.toBeNull();
          expect(sameNumbers(v!, answer), `${d} vs ${p.answer}`).toBe(false);
          expect(seen.some((s) => sameNumbers(s, v!)), d).toBe(false);
          seen.push(v!);
        }
      }),
    );
  });

  it("lead with dropping the period's division for a multiple of the angle", () => {
    for (let s = 0; s < 100; s++) {
      const k = construct({ multiple: true, squared: false }, createRng(s));
      if (k.coef === 1) continue;
      const p = generator.generate({ multiple: true, squared: false }, s);
      expect(p.distractorHints[0].split(",").length).toBe(p.answer.split(",").length / k.coef);
      return;
    }
    throw new Error("no multiple-angle Problem");
  });
});

describe("simple-trig-equations: generate()", () => {
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
        for (const tex of [p.prompt, p.answer, ...p.distractorHints]) expectRenders(tex);
      }),
      { numRuns: 100 },
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(60);
  });
});
