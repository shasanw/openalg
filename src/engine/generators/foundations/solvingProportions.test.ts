import { choiceKey } from "../../mc";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, trivial, type Form, type ProportionConstruction, type Solutions } from "./solvingProportions";
import { isInt, rat } from "../shared/equationKit";
import { answerValues, close, evalLatex, splitEquation } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  form: fc.constantFrom<Form>("simple", "expression", "bothSides"),
  solutions: fc.constantFrom<Solutions>("integer", "fraction", "decimal"),
  allowNegatives: fc.boolean(),
  maxNumber: fc.integer({ min: 6, max: 50 }),
  varyVariable: fc.boolean(),
});

function satisfies(prompt: string, v: string, value: number): boolean {
  const [l, r] = splitEquation(prompt);
  const a = evalLatex(l, { [v]: value });
  const b = evalLatex(r, { [v]: value });
  return Number.isFinite(a) && Number.isFinite(b) && close(a, b);
}

describe("solving-proportions: answers", () => {
  it("the Answer makes the printed proportion true, and a nearby value does not", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const { v, values } = answerValues(p.answer);
        expect(values).toHaveLength(1);
        expect(satisfies(p.prompt, v, values[0]), `${p.prompt} at ${p.answer}`).toBe(true);
        expect(satisfies(p.prompt, v, values[0] + 1)).toBe(false);
      }),
    );
  });

  it("never prints a proportion that reads off without working, or a zero denominator at the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(trivial(k.slots)).toBe(false);
        const p = generator.generate(params, seed);
        expect(p.prompt).not.toMatch(/(^|[^0-9.])1[a-z]/);
        expect(p.prompt).not.toMatch(/[+-] 0(?![.\d])/);
        expect(p.prompt).not.toMatch(/\\frac\{[^}]*\}\{-/); // no negative denominators
      }),
    );
  });
});

describe("solving-proportions: Topic Options", () => {
  it("puts the variable where the form says", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const exprs = k.slots.filter((s) => "expr" in s) as { expr: { m: number; q: number } }[];
        if (params.form === "bothSides") expect(exprs).toHaveLength(2);
        else expect(exprs).toHaveLength(1);
        if (params.form === "simple") expect(exprs[0].expr).toEqual({ m: 1, q: 0 });
        if (params.form === "expression") expect(exprs[0].expr.q).not.toBe(0);
      }),
    );
  });

  it("gives the chosen kind of solution", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        if (params.solutions === "integer") expect(isInt(k.x)).toBe(true);
        if (params.solutions === "fraction") expect(p.answer).toContain("\\frac");
        if (params.solutions === "decimal") expect(p.answer).toMatch(/\d\.\d/);
      }),
    );
  });

  it("prints no negative numbers or solutions when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.prompt).not.toMatch(/\{-/);
        expect(p.answer).not.toContain("-");
      }),
    );
  });

  it("keeps the given numbers within Largest given number", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        for (const s of k.slots) if ("given" in s) expect(Math.abs(s.given)).toBeLessThanOrEqual(params.maxNumber);
      }),
    );
  });
});

describe("solving-proportions: Distractors", () => {
  it("at the default options, offer at least two mistakes for every Problem, in every form", () => {
    for (const form of ["simple", "expression", "bothSides"] as Form[]) {
      for (let s = 0; s < 200; s++) expect(generator.generate({ form }, s).distractorHints.length, form).toBeGreaterThanOrEqual(2);
    }
  });

  it("are distinct and never the Answer", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(new Set(p.distractorHints.map(choiceKey)).size).toBe(p.distractorHints.length);
        const values = p.distractorHints.map((d) => answerValues(d).values[0]);
        expect(new Set(values).size).toBeGreaterThanOrEqual(4);
        expect(new Set(values).size).toBe(values.length);
        const answer = answerValues(p.answer).values[0];
        for (const d of p.distractorHints) expect(close(answerValues(d).values[0], answer)).toBe(false);
      }),
    );
  });

  it("model the real mistakes", () => {
    // \frac{x}{6} = \frac{4}{3}: x = 8. Straight across gives \frac{9}{2}... (x \cdot 4 = 6 \cdot 3);
    // additive thinking gives 7 (6 - 3 = 3 more, so 4 + 3)
    const k: ProportionConstruction = {
      v: "x",
      slots: [{ expr: { m: 1, q: 0 } }, { given: 6 }, { given: 4 }, { given: 3 }],
      x: rat(8),
      style: "fraction",
    };
    const hints = distractors(k);
    expect(hints).toContain("x = 24"); // stopped at 3x = 24
    expect(hints[0]).toBe("x = \\frac{9}{2}");
    expect(hints).toContain("x = 7");
    // \frac{x + 2}{5} = \frac{6}{3}: x = 8; stopped at x + 2 = 10, or moved the 2 with its sign (12)
    const e: ProportionConstruction = {
      v: "x",
      slots: [{ expr: { m: 1, q: 2 } }, { given: 5 }, { given: 6 }, { given: 3 }],
      x: rat(8),
      style: "fraction",
    };
    expect(distractors(e)).toEqual(expect.arrayContaining(["x = 10", "x = 12"]));
  });
});

describe("solving-proportions: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const form of ["simple", "expression", "bothSides"] as Form[]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ form }, s).prompt));
      expect(prompts.size, form).toBeGreaterThan(100);
    }
  });
});
