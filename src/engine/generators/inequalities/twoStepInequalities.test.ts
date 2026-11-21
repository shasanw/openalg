import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, generator, mistakes, type Numbers } from "./twoStepInequalities";
import { isInt, rat, ratValue } from "../shared/equationKit";
import { rayFor, setLatex } from "./inequalityKit";
import { anySeed, solvedTopicSuite } from "./inequalitySuite.testkit";

const anyParams = fc.record({
  numbers: fc.constantFrom<Numbers>("integer", "fractionAnswers"),
  divisionForms: fc.boolean(),
  allowNegatives: fc.boolean(),
  maxSolution: fc.integer({ min: 2, max: 50 }),
  maxCoefficient: fc.integer({ min: 2, max: 20 }),
  notation: fc.constantFrom("inequality", "interval"),
  showNumberLine: fc.boolean(),
});

solvedTopicSuite(generator, anyParams);

describe("two-step-inequalities: Topic Options", () => {
  it("is a genuine two-step inequality within Largest boundary value", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(Math.abs(k.a.n)).toBeGreaterThanOrEqual(2);
        expect(k.b.n).not.toBe(0);
        expect(k.c.n).not.toBe(0);
        expect(Math.abs(ratValue(k.s))).toBeLessThanOrEqual(params.maxSolution);
      }),
    );
  });

  it("honours the kind of boundary values", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(isInt(k.s)).toBe(params.numbers === "integer");
        expect(isInt(k.c)).toBe(true);
      }),
    );
  });

  it("uses division forms only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, divisionForms: false }, createRng(seed));
        expect(k.form).not.toBe("divided");
      }),
    );
    const forms = new Set(Array.from({ length: 60 }, (_, s) => construct({}, createRng(s)).form));
    expect(forms).toEqual(new Set(["linear", "constantFirst", "divided"]));
  });

  it("prints no negative numbers when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.prompt).not.toMatch(/(^|[<>e] |\{)-/);
        expect(p.answer.replace("-\\infty", "")).not.toContain("-");
      }),
    );
  });
});

describe("two-step-inequalities: Distractors", () => {
  it("lead with forgetting to flip, then moving the constant with the wrong sign", () => {
    // -2x + 3 > 11  =>  x < -4
    const k = {
      form: "linear" as const,
      s: rat(-4),
      op: ">" as const,
      a: rat(-2),
      b: rat(3),
      c: rat(11),
      swapSides: false,
      solution: rayFor(rat(-4), ">", -2),
    };
    expect(setLatex(k.solution, "inequality")).toBe("x < -4");
    expect(mistakes(k).slice(0, 3).map((m) => setLatex(m!, "inequality"))).toEqual([
      "x > -4", // forgot to flip
      "x < -7", // (11 + 3)/-2
      "x \\le -4",
    ]);
  });
});
