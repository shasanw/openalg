import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, generator, mistakes, promptLatex, type CompoundConstruction, type Types } from "./compoundInequalities";
import { rat } from "./equationKit";
import { combine, setLatex, type Ray } from "./inequalityKit";
import { anySeed, solvedTopicSuite } from "./inequalitySuite.testkit";

const anyParams = fc.record({
  types: fc.constantFrom<Types>("and", "or", "mixed"),
  threePart: fc.boolean(),
  allowNegatives: fc.boolean(),
  specialCases: fc.boolean(),
  maxSolution: fc.integer({ min: 2, max: 20 }),
  maxCoefficient: fc.integer({ min: 2, max: 12 }),
  notation: fc.constantFrom("inequality", "interval"),
  showNumberLine: fc.boolean(),
});

solvedTopicSuite(generator, anyParams);

describe("compound-inequalities: Topic Options", () => {
  it("joins with the chosen word, and shades between for and, outside for or", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, specialCases: false }, createRng(seed));
        if (params.types !== "mixed") expect(k.join).toBe(params.types);
        expect(k.solution.kind).toBe(k.join === "and" ? "between" : "outside");
        const p = generator.generate({ ...params, specialCases: false }, seed);
        if (k.join === "or") expect(p.prompt).toContain("\\text{ or }");
      }),
    );
  });

  it("writes three-part inequalities only when asked, and often when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, threePart: false }, createRng(seed));
        expect(k.form).toBe("two");
      }),
    );
    const three = Array.from({ length: 100 }, (_, s) => construct({ types: "and" }, createRng(s))).filter(
      (k) => k.form === "threePart",
    );
    expect(three.length).toBeGreaterThan(40);
  });

  it("includes no-solution and all-real-numbers cases only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, specialCases: false }, createRng(seed));
        expect(["between", "outside"]).toContain(k.solution.kind);
      }),
    );
    const kinds = new Set(
      Array.from({ length: 200 }, (_, s) => construct({ specialCases: true }, createRng(s)).solution.kind),
    );
    expect(kinds).toEqual(new Set(["between", "outside", "none", "all"]));
  });

  it("prints no negative numbers when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.prompt).not.toMatch(/(^|[<>e] |\{)-/);
        expect(p.answer.replace(/-\\infty/g, "")).not.toContain("-");
      }),
    );
  });
});

describe("compound-inequalities: Distractors", () => {
  const lo: Ray = { at: rat(-1), dir: "above", closed: false };
  const hi: Ray = { at: rat(3), dir: "below", closed: true };

  it("lead with mixing up and and or", () => {
    // -5 < 2x - 3 <= 3  =>  -1 < x <= 3
    const k: CompoundConstruction = {
      form: "threePart",
      join: "and",
      lo,
      hi,
      expr: { a: 2, b: -3 },
      solution: combine(lo, hi, "and"),
    };
    expect(promptLatex(k)).toBe("-5 < 2x - 3 \\le 3");
    expect(setLatex(k.solution, "inequality")).toBe("-1 < x \\le 3");
    expect(setLatex(mistakes(k)[0]!, "inequality")).toBe("x < -1 \\text{ or } x \\ge 3");
  });

  it("model swapping the ends of a three-part inequality without their inclusion", () => {
    // -5 <= -2x + 1 < 3  =>  -1 < x <= 3: dividing by -2 swaps the ends
    const k: CompoundConstruction = {
      form: "threePart",
      join: "and",
      lo,
      hi,
      expr: { a: -2, b: 1 },
      solution: combine(lo, hi, "and"),
    };
    expect(promptLatex(k)).toBe("-5 \\le -2x + 1 < 3");
    expect(mistakes(k).map((m) => m && setLatex(m, "inequality"))).toContain("-1 \\le x < 3");
  });

  it("model forgetting to flip one part", () => {
    // -2x > 2 or x - 1 > 2  =>  x < -1 or x > 3
    const k: CompoundConstruction = {
      form: "two",
      join: "or",
      parts: [
        { ray: { at: rat(-1), dir: "below", closed: false }, expr: { a: -2, b: 0 } },
        { ray: { at: rat(3), dir: "above", closed: false }, expr: { a: 1, b: -1 } },
      ],
      solution: { kind: "outside", lo: rat(-1), hi: rat(3), loClosed: false, hiClosed: false },
    };
    expect(promptLatex(k)).toBe("-2x > 2 \\text{ or } x - 1 > 2");
    const m = mistakes(k).map((s) => s && setLatex(s, "inequality"));
    expect(m[0]).toBe("-1 < x < 3"); // shaded between
    expect(m[1]).toBe("\\text{no solution}"); // joined with "and"
    expect(m[2]).toBe("x > -1"); // x > -1 or x > 3
  });
});
