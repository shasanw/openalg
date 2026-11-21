import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { construct, generator, mistakes, promptLatex, type MultiStepInequality } from "./multiStepInequalities";
import { sideParts } from "../equations/multiStepEquations";
import { rat } from "../shared/equationKit";
import { rayFor, setLatex } from "./inequalityKit";
import { anySeed, solvedTopicSuite } from "./inequalitySuite.testkit";

const anyParams = fc.record({
  distribute: fc.boolean(),
  combineLikeTerms: fc.boolean(),
  bothSides: fc.boolean(),
  specialCases: fc.boolean(),
  solutions: fc.constantFrom("integer", "fraction"),
  allowNegatives: fc.boolean(),
  maxSolution: fc.integer({ min: 2, max: 50 }),
  maxCoefficient: fc.integer({ min: 2, max: 12 }),
  notation: fc.constantFrom("inequality", "interval"),
  showNumberLine: fc.boolean(),
});

solvedTopicSuite(generator, anyParams);

describe("multi-step-inequalities: Topic Options", () => {
  it("includes no-solution and all-real-numbers inequalities only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, specialCases: false }, seed);
        expect(k.solution.kind).toBe("ray");
      }),
    );
    const kinds = new Set(Array.from({ length: 200 }, (_, s) => construct({ specialCases: true }, s).solution.kind));
    expect(kinds).toEqual(new Set(["ray", "all", "none"]));
  });

  it("uses only the ticked features", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, distribute: false, specialCases: false }, seed);
        if (params.combineLikeTerms || params.bothSides) expect(p.prompt).not.toContain("(");
        const k = construct({ ...params, bothSides: false, specialCases: false }, seed);
        if (params.distribute || params.combineLikeTerms) {
          expect(k.eq.eq.right.every((q) => q.kind === "term" && !q.x)).toBe(true);
        }
      }),
    );
  });

  it("asks students to flip the symbol often", () => {
    const flips = Array.from({ length: 200 }, (_, s) => construct({}, s)).filter((k) => {
      const K = sideParts(k.eq.eq.left).xc - sideParts(k.eq.eq.right).xc;
      return K < 0;
    });
    expect(flips.length).toBeGreaterThan(40);
  });
});

describe("multi-step-inequalities: Distractors", () => {
  it("lead with forgetting to flip, then distributing to the first term only", () => {
    // 3(x + 2) < 5x - 4  =>  -2x < -10  =>  x > 5
    const k: MultiStepInequality = {
      eq: {
        template: "DB1",
        outcome: "one",
        v: "x",
        x: rat(5),
        eq: {
          left: [{ kind: "group", mult: 3, p: 1, q: 2 }],
          right: [
            { kind: "term", coef: 5, x: true },
            { kind: "term", coef: -4, x: false },
          ],
        },
      },
      op: "<",
      solution: rayFor(rat(5), "<", -2),
    };
    expect(promptLatex(k)).toBe("3(x + 2) < 5x - 4");
    expect(setLatex(k.solution, "inequality")).toBe("x > 5");
    const m = mistakes(k).filter((s) => s !== null).map((s) => setLatex(s!, "inequality"));
    expect(m.slice(0, 2)).toEqual(["x < 5", "x > 3"]); // 3x + 2 < 5x - 4 => x > 3
  });
});
