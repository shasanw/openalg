import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, generator, mistakes, type Operations } from "./oneStepInequalities";
import { rat, ratValue } from "./equationKit";
import { setLatex } from "./inequalityKit";
import { anySeed, solvedTopicSuite } from "./inequalitySuite.testkit";

const anyParams = fc.record({
  operations: fc.constantFrom<Operations>("addSub", "mulDiv", "all"),
  allowNegatives: fc.boolean(),
  maxSolution: fc.integer({ min: 2, max: 50 }),
  maxCoefficient: fc.integer({ min: 2, max: 20 }),
  notation: fc.constantFrom("inequality", "interval"),
  showNumberLine: fc.boolean(),
});

solvedTopicSuite(generator, anyParams);

describe("one-step-inequalities: Topic Options", () => {
  it("uses only the chosen operations", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.operations === "addSub") expect(k.form).toBe("add");
        if (params.operations === "mulDiv") expect(k.form).not.toBe("add");
      }),
    );
    const forms = new Set(Array.from({ length: 60 }, (_, s) => construct({}, createRng(s)).form));
    expect(forms).toEqual(new Set(["add", "mul", "div"]));
  });

  it("keeps the boundary within Largest boundary value, and genuine one-step", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(Math.abs(ratValue(k.s))).toBeLessThanOrEqual(params.maxSolution);
        expect(k.s.d).toBe(1);
        expect(k.a.n).not.toBe(0);
        if (k.form !== "add") expect(Math.abs(k.a.n)).toBeGreaterThanOrEqual(2);
      }),
    );
  });

  it("prints no negative numbers when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.prompt).not.toMatch(/(^|[<>=e] |\{)-/);
        expect(p.answer.replace("-\\infty", "")).not.toContain("-");
      }),
    );
  });

  it("asks students to flip the symbol often when negatives are on", () => {
    const flips = Array.from({ length: 200 }, (_, s) => construct({ operations: "mulDiv" }, createRng(s))).filter(
      (k) => k.a.n < 0,
    );
    expect(flips.length).toBeGreaterThan(60);
  });
});

describe("one-step-inequalities: Distractors", () => {
  it("lead with forgetting to flip after dividing by a negative", () => {
    // -3x < 12  =>  x > -4; the slip is x < -4
    const k = {
      form: "mul" as const,
      s: rat(-4),
      op: "<" as const,
      a: rat(-3),
      c: rat(12),
      swapSides: false,
      solution: { kind: "ray" as const, at: rat(-4), dir: "above" as const, closed: false },
    };
    expect(setLatex(mistakes(k)[0]!, "inequality")).toBe("x < -4");
  });

  it("lead with a sign error moving the constant", () => {
    // x + 3 >= 5  =>  x >= 2; the slip is x >= 8
    const k = {
      form: "add" as const,
      s: rat(2),
      op: ">=" as const,
      a: rat(3),
      c: rat(5),
      swapSides: false,
      solution: { kind: "ray" as const, at: rat(2), dir: "above" as const, closed: true },
    };
    expect(setLatex(mistakes(k)[0]!, "inequality")).toBe("x \\ge 8");
  });
});
