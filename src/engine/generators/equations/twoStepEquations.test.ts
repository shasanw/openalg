import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, type Numbers } from "./twoStepEquations";
import { decimalString, isInt, rat, ratValue } from "../shared/equationKit";
import { answerValues, close, evalLatex, splitEquation } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const NUMBERS: Numbers[] = ["integer", "fractionAnswers", "fractions", "decimals"];
const anyParams = fc.record({
  numbers: fc.constantFrom(...NUMBERS),
  divisionForms: fc.boolean(),
  allowNegatives: fc.boolean(),
  maxSolution: fc.integer({ min: 2, max: 100 }),
  maxCoefficient: fc.integer({ min: 2, max: 20 }),
  varyVariable: fc.boolean(),
});

function satisfies(prompt: string, v: string, value: number): boolean {
  const [l, r] = splitEquation(prompt);
  return close(evalLatex(l, { [v]: value }), evalLatex(r, { [v]: value }));
}

describe("two-step-equations: answers", () => {
  it("the Answer makes the printed equation true, and nothing else does", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const { v, values } = answerValues(p.answer);
        expect(values).toHaveLength(1);
        expect(satisfies(p.prompt, v, values[0])).toBe(true);
        expect(satisfies(p.prompt, v, values[0] + 1)).toBe(false);
      }),
    );
  });

  it("is a genuine two-step equation: no 0 or 1 coefficient, no zero constant", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(k.x.n).not.toBe(0);
        expect(k.b.n).not.toBe(0);
        expect(k.c.n).not.toBe(0);
        expect(Math.abs(ratValue(k.a))).not.toBe(1);
        expect(k.a.n).not.toBe(0);
        const p = generator.generate(params, seed);
        expect(p.prompt).not.toMatch(/(^|[^0-9.])1[a-z]/);
        expect(p.prompt).not.toMatch(/[+-] 0(?![.\d])/);
      }),
    );
  });
});

describe("two-step-equations: Topic Options", () => {
  it("keeps the solution within Largest solution", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(Math.abs(ratValue(k.x))).toBeLessThanOrEqual(params.maxSolution);
      }),
    );
  });

  it("honours the kind of numbers", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        switch (params.numbers) {
          case "integer":
            expect(isInt(k.x) && isInt(k.a) && isInt(k.b) && isInt(k.c)).toBe(true);
            break;
          case "fractionAnswers":
            expect(isInt(k.x)).toBe(false);
            expect(isInt(k.a) && isInt(k.b) && isInt(k.c)).toBe(true);
            break;
          case "fractions":
            expect(isInt(k.a)).toBe(false);
            expect(isInt(k.x)).toBe(true);
            break;
          case "decimals":
            for (const r of [k.x, k.a, k.b, k.c]) expect(decimalString(r)).not.toBeNull();
            expect([k.x, k.a, k.b, k.c].some((r) => !isInt(r))).toBe(true);
            break;
        }
      }),
    );
  });

  it("uses division forms only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, divisionForms: false }, createRng(seed));
        expect(["linear", "constantFirst"]).toContain(k.form);
      }),
    );
    const forms = new Set(Array.from({ length: 60 }, (_, s) => construct({}, createRng(s)).form));
    expect(forms).toEqual(new Set(["linear", "constantFirst", "divided", "groupedOver"]));
  });

  it("prints no negative numbers when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.prompt).not.toMatch(/(^|= |\{)-/);
        expect(p.answer).not.toContain("-");
        const k = construct({ ...params, allowNegatives: false }, createRng(seed));
        expect(ratValue(k.a)).toBeGreaterThan(0);
      }),
    );
  });
});

describe("two-step-equations: distractors", () => {
  it("are distinct, never the Answer, never a different value written the same, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        const answer = answerValues(p.answer).values[0];
        for (const d of p.distractorHints) expect(close(answerValues(d).values[0], answer)).toBe(false);
        if (params.numbers === "decimals") for (const d of p.distractorHints) expect(d).not.toContain("\\frac");
      }),
    );
  });

  it("model the order-of-operations and sign mistakes", () => {
    // 3x + 4 = 19, x = 5
    const k = {
      form: "linear" as const,
      v: "x",
      x: rat(5),
      a: rat(3),
      b: rat(4),
      c: rat(19),
      swapSides: false,
      style: "fraction" as const,
    };
    expect(distractors(k).slice(0, 3)).toEqual([
      "x = \\frac{23}{3}", // (19 + 4)/3: moved the 4 with the wrong sign
      "x = \\frac{7}{3}", // 19/3 - 4: divided before subtracting
      "x = -5",
    ]);
    // (x + 4)/3 = 2, x = 2: undid the 4 before the 3
    expect(distractors({ ...k, form: "groupedOver", x: rat(2), c: rat(2) })).toContain("x = -6");
  });
});

describe("two-step-equations: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("bakes the recipe", () => {
    const p = generator.generate({ numbers: "fractions" }, 3);
    expect(p.generatorId).toBe("two-step-equations");
    expect(p.params.numbers).toBe("fractions");
    expect(p.prompt).toContain("\\frac");
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const numbers of NUMBERS) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ numbers }, s).prompt));
      expect(prompts.size, numbers).toBeGreaterThan(150);
    }
  });
});
