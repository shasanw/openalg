import { cramersRule, readTuple } from "./cramersRule.answer.testkit";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator } from "./cramersRule";
import { rat } from "../shared/equationKit";
import { expectKatex, expectTidy } from "../shared/matrices.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  variables: fc.constantFrom("2", "3", "mixed"),
  fractions: fc.boolean(),
});

describe("cramers-rule: answers", () => {
  it("the Answer satisfies every printed equation", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        cramersRule(p);
      }),
    );
  });

  it("prints tidy LaTeX that renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(s);
        expectKatex(p.prompt);
        expectKatex(p.answer);
      }),
    );
  });
});

describe("cramers-rule: Topic Options", () => {
  it("solves for the variables asked for, with fractions only when allowed, and a single solution", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.variables !== "mixed") expect(k.solution).toHaveLength(Number(params.variables));
        if (!params.fractions) for (const v of k.solution) expect(v.d).toBe(1);
        // distinct coordinates, so swapping them is a real slip
        expect(new Set(k.solution.map((v) => v.n / v.d)).size).toBe(k.solution.length);
        for (const b of k.b) expect(Math.abs(b)).toBeLessThanOrEqual(60);
      }),
    );
    const withFractions = Array.from({ length: 100 }, (_, s) => construct({ fractions: true }, createRng(s))).filter((k) =>
      k.solution.some((v) => v.d !== 1),
    );
    expect(withFractions.length).toBeGreaterThan(30);
  });
});

describe("cramers-rule: distractors", () => {
  it("are distinct points, never the Answer, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) expect(readTuple(d)).toHaveLength(readTuple(p.answer).length);
      }),
    );
  });

  it("keep three when the Answer has a zero coordinate and D = ±1", () => {
    // x - y = -5, -7x + 6y = 30: (0, 5); D = -1, D_x = 0
    const k = { a: [[1, -1], [-7, 6]], b: [-5, 30], solution: [rat(0), rat(5)] };
    // D found as ad + bc = 6 + 7 = 13, then the swapped, negated point
    expect(distractors(k)).toEqual(["(5, 0)", "(0, -5)", "\\left(0, -\\frac{5}{13}\\right)", "(-5, 0)"]);
  });

  it("model swapped coordinates, an upside-down quotient and undivided determinants", () => {
    // 2x + y = 5, x - y = 1: (2, 1); D = -3, D_x = -6, D_y = -3
    const k = { a: [[2, 1], [1, -1]], b: [5, 1], solution: [rat(2), rat(1)] };
    expect(distractors(k).slice(0, 3)).toEqual(["(1, 2)", "\\left(\\frac{1}{2}, 1\\right)", "(-6, -3)"]);
  });
});

describe("cramers-rule: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(190);
  });
});
