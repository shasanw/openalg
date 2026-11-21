import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, type Numbers, type Operations } from "./oneStepEquations";
import { rat, ratValue } from "../shared/equationKit";
import { answerValues, close, evalLatex, splitEquation } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  operations: fc.constantFrom<Operations>("all", "addSubtract", "multiplyDivide"),
  numbers: fc.constantFrom<Numbers>("integer", "decimal", "fraction"),
  allowNegatives: fc.boolean(),
  maxSolution: fc.integer({ min: 2, max: 100 }),
  maxCoefficient: fc.integer({ min: 2, max: 50 }),
  varyVariable: fc.boolean(),
});

/** Does the value v make the printed equation true? */
function satisfies(prompt: string, v: string, value: number): boolean {
  const [l, r] = splitEquation(prompt);
  return close(evalLatex(l, { [v]: value }), evalLatex(r, { [v]: value }));
}

describe("one-step-equations: answers", () => {
  it("the Answer makes the printed equation true, for any seed and options", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const { v, values } = answerValues(p.answer);
        expect(values).toHaveLength(1);
        expect(satisfies(p.prompt, v, values[0])).toBe(true);
        // and it is the only solution: a one-step equation is linear in v
        expect(satisfies(p.prompt, v, values[0] + 1)).toBe(false);
      }),
    );
  });

  it("never prints a degenerate equation (0 solution, x + 0, 1x, 0 on the right)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(k.x.n).not.toBe(0);
        expect(k.a.n).not.toBe(0);
        expect(k.b.n).not.toBe(0);
        if (k.op === "multiply" || k.op === "divide") expect(Math.abs(ratValue(k.a))).not.toBe(1);
        const p = generator.generate(params, seed);
        expect(p.prompt).not.toMatch(/(^|[^0-9.])1[a-z]/);
        expect(p.prompt).not.toMatch(/[+-] 0(?![.\d])/);
      }),
    );
  });
});

describe("one-step-equations: Topic Options", () => {
  it("keeps the solution within Largest solution", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(Math.abs(ratValue(k.x))).toBeLessThanOrEqual(params.maxSolution);
      }),
    );
  });

  it("uses only the chosen operations", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const { op } = construct(params, createRng(seed));
        if (params.operations === "addSubtract") expect(["add", "subtract"]).toContain(op);
        if (params.operations === "multiplyDivide") expect(["multiply", "divide"]).toContain(op);
      }),
    );
  });

  it("prints no negative numbers when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        // a minus may only be a subtraction sign, never a leading negative
        expect(p.prompt).not.toMatch(/(^|= |\{)-/);
        expect(p.answer).not.toContain("-");
      }),
    );
  });

  it("prints integers only with Integers, and no fractions with Decimals", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const ints = generator.generate({ ...params, numbers: "integer" }, seed);
        const divides = ints.prompt.match(/\\frac\{[a-z]\}/g)?.length ?? 0;
        expect((ints.prompt.match(/\\frac/g)?.length ?? 0) - divides).toBe(0);
        expect(ints.prompt + ints.answer).not.toContain(".");
        expect(ints.answer).not.toContain("\\frac");
        const decimals = generator.generate({ ...params, numbers: "decimal" }, seed);
        expect(decimals.answer).not.toContain("\\frac");
      }),
    );
  });

  it("actually uses decimals and fractions when asked", () => {
    const sheet = (numbers: Numbers) =>
      Array.from({ length: 40 }, (_, s) => generator.generate({ numbers }, s))
        .map((p) => p.prompt + p.answer)
        .join(" ");
    expect(sheet("decimal")).toMatch(/\d\.\d/);
    expect(sheet("fraction")).toMatch(/\\frac\{\d+\}/);
  });

  it("uses x unless other letters are asked for, and then varies the letter", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        expect(generator.generate({}, seed).answer).toMatch(/^x = /);
      }),
    );
    const letters = new Set(
      Array.from({ length: 40 }, (_, s) => generator.generate({ varyVariable: true }, s).answer[0]),
    );
    expect(letters.size).toBeGreaterThan(3);
  });
});

describe("one-step-equations: distractors", () => {
  it("are distinct, never the Answer, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(p.distractorHints).not.toContain(p.answer);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        for (const d of p.distractorHints) {
          const { values } = answerValues(d);
          expect(close(values[0], answerValues(p.answer).values[0])).toBe(false);
        }
      }),
    );
  });

  it("model the inverse-operation mistakes", () => {
    const base = { v: "x", constantFirst: false, swapSides: false, style: "fraction" as const };
    // x + 5 = 12: added instead of subtracting
    expect(distractors({ ...base, op: "add", x: rat(7), a: rat(5), b: rat(12) })[0]).toBe("x = 17");
    // 3x = 12: subtracted the coefficient, multiplied, divided upside down
    expect(distractors({ ...base, op: "multiply", x: rat(4), a: rat(3), b: rat(12) }).slice(0, 4)).toEqual([
      "x = 9",
      "x = 36",
      "x = \\frac{1}{4}",
      "x = -4",
    ]);
    // x/3 = 6: divided instead of multiplying
    expect(distractors({ ...base, op: "divide", x: rat(18), a: rat(3), b: rat(6) })[0]).toBe("x = 2");
  });
});

describe("one-step-equations: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("bakes the recipe and renders readable examples", () => {
    const p = generator.generate({ maxSolution: 5 }, 42);
    expect(p.generatorId).toBe("one-step-equations");
    expect(p.seed).toBe(42);
    expect(p.params.maxSolution).toBe(5);
    expect(p.answer).toMatch(/^x = -?\d+$/);
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(150);
  });
});
