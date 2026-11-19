import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import {
  absSet,
  construct,
  generator,
  mistakes,
  promptLatex,
  type AbsConstruction,
  type Isolate,
  type Types,
} from "./absoluteValueInequalities";
import { setLatex } from "./inequalityKit";
import { anySeed, solvedTopicSuite } from "./inequalitySuite.testkit";

const anyParams = fc.record({
  types: fc.constantFrom<Types>("less", "greater", "mixed"),
  coefficient: fc.boolean(),
  isolate: fc.constantFrom<Isolate>("no", "yes", "withNegative"),
  specialCases: fc.boolean(),
  maxSolution: fc.integer({ min: 2, max: 20 }),
  notation: fc.constantFrom("inequality", "interval"),
  showNumberLine: fc.boolean(),
});

solvedTopicSuite(generator, anyParams);

describe("absolute-value-inequalities: Topic Options", () => {
  it("shades between for less than and outside for greater than", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, specialCases: false }, createRng(seed));
        expect(k.solution.kind).toBe(k.op === "<" || k.op === "<=" ? "between" : "outside");
        if (params.types === "less") expect(k.solution.kind).toBe("between");
        if (params.types === "greater") expect(k.solution.kind).toBe("outside");
      }),
    );
  });

  it("keeps the boundaries within Largest boundary value", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(Math.abs(k.m) + k.h).toBeLessThanOrEqual(params.maxSolution);
        expect(k.b).not.toBe(0);
      }),
    );
  });

  it("uses a coefficient inside the bars only when allowed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(construct({ ...params, coefficient: false }, createRng(seed)).a).toBe(1);
      }),
    );
    const as = new Set(Array.from({ length: 60 }, (_, s) => construct({}, createRng(s)).a));
    expect(as.size).toBeGreaterThan(2);
  });

  it("isolates only when asked, and uses negative multipliers only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.isolate === "no") expect([k.k, k.d]).toEqual([1, 0]);
        else expect(Math.abs(k.k)).toBeGreaterThanOrEqual(2);
        if (params.isolate !== "withNegative") expect(k.k).toBeGreaterThan(0);
      }),
    );
    const ks = Array.from({ length: 100 }, (_, s) => construct({ isolate: "withNegative" }, createRng(s)).k);
    expect(ks.some((k) => k < 0)).toBe(true);
  });

  it("includes the c <= 0 special cases only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, specialCases: false }, createRng(seed));
        expect(k.c).toBeGreaterThan(0);
      }),
    );
    const kinds = new Set(
      Array.from({ length: 400 }, (_, s) => construct({ specialCases: true }, createRng(s)).solution.kind),
    );
    expect(kinds).toEqual(new Set(["between", "outside", "all", "none", "point", "allBut"]));
  });
});

describe("absolute-value-inequalities: Distractors", () => {
  it("absSet reads |x - m| op h by sign logic", () => {
    expect(setLatex(absSet(2, "<", 3), "inequality")).toBe("-1 < x < 5");
    expect(setLatex(absSet(2, ">=", 3), "interval")).toBe("(-\\infty, -1] \\cup [5, \\infty)");
    expect(setLatex(absSet(2, "<=", 0), "inequality")).toBe("x = 2");
    expect(setLatex(absSet(2, ">", 0), "inequality")).toBe("x \\ne 2");
    expect(setLatex(absSet(2, "<", -1), "inequality")).toBe("\\text{no solution}");
  });

  it("lead with and/or confusion, then solving only one case", () => {
    // |2x - 4| < 6  =>  -1 < x < 5
    const k: AbsConstruction = {
      a: 2,
      b: -4,
      op: "<",
      c: 6,
      m: 2,
      h: 3,
      constantFirst: false,
      k: 1,
      d: 0,
      solution: absSet(2, "<", 3),
    };
    expect(promptLatex(k)).toBe("|2x - 4| < 6");
    expect(mistakes(k).slice(0, 3).map((m) => setLatex(m!, "inequality"))).toEqual([
      "x < -1 \\text{ or } x > 5",
      "x < 5",
      "x < -1",
    ]);
  });

  it("prints a negative multiplier with the symbol flipped", () => {
    // -2|x - 1| + 3 > -5  =>  |x - 1| < 4
    const k: AbsConstruction = {
      a: 1,
      b: -1,
      op: "<",
      c: 4,
      m: 1,
      h: 4,
      constantFirst: false,
      k: -2,
      d: 3,
      solution: absSet(1, "<", 4),
    };
    expect(promptLatex(k)).toBe("-2|x - 1| + 3 > -5");
  });
});
