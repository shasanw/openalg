import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, TEMPLATES, type MultiStepConstruction } from "./multiStepEquations";
import { ALL_REALS, NO_SOLUTION, rat, ratValue } from "../shared/equationKit";
import { answerValues, close, evalLatex, splitEquation } from "../shared/latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  distribute: fc.boolean(),
  combineLikeTerms: fc.boolean(),
  bothSides: fc.boolean(),
  specialCases: fc.boolean(),
  solutions: fc.constantFrom("integer", "fraction"),
  allowNegatives: fc.boolean(),
  maxSolution: fc.integer({ min: 2, max: 50 }),
  maxCoefficient: fc.integer({ min: 2, max: 12 }),
  varyVariable: fc.boolean(),
});

/** left - right of the printed equation at v = value */
function gap(prompt: string, v: string, value: number): number {
  const [l, r] = splitEquation(prompt);
  return evalLatex(l, { [v]: value }) - evalLatex(r, { [v]: value });
}

describe("multi-step-equations: answers", () => {
  it("the Answer is right for any seed and options, checked on the printed equation", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const k = construct(params, createRng(seed));
        const probes = [-3.5, 0, 1, 2.25, 7];
        if (p.answer === NO_SOLUTION) {
          // the sides differ by the same nonzero amount everywhere
          const gaps = probes.map((t) => gap(p.prompt, k.v, t));
          expect(gaps.every((g) => close(g, gaps[0]))).toBe(true);
          expect(close(gaps[0], 0)).toBe(false);
        } else if (p.answer === ALL_REALS) {
          for (const t of probes) expect(close(gap(p.prompt, k.v, t), 0)).toBe(true);
        } else {
          const { v, values } = answerValues(p.answer);
          expect(values).toHaveLength(1);
          expect(close(gap(p.prompt, v, values[0]), 0)).toBe(true);
          expect(close(gap(p.prompt, v, values[0] + 1), 0)).toBe(false);
        }
      }),
    );
  });

  it("never prints a degenerate equation", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.prompt).not.toMatch(/(^|[^0-9])[01][a-z(]/); // no 0x, 1x, 1(...)
        expect(p.prompt).not.toMatch(/[+-] 0(?!\d)/);
        const [l, r] = splitEquation(p.prompt);
        expect(l).not.toBe(r);
        expect(construct(params, createRng(seed)).template).not.toBe("fallback");
      }),
    );
  });
});

describe("multi-step-equations: Topic Options", () => {
  const features = (params: { distribute: boolean; combineLikeTerms: boolean; bothSides: boolean }) => {
    const f: string[] = [];
    if (params.distribute) f.push("distribute");
    if (params.combineLikeTerms) f.push("combine");
    if (params.bothSides) f.push("bothSides");
    return f.length ? f : ["distribute", "combine", "bothSides"];
  };

  it("uses only the chosen kinds of step", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, specialCases: false }, createRng(seed));
        const t = TEMPLATES.find((x) => x.name === k.template)!;
        for (const f of t.features) expect(features(params)).toContain(f);
        const hasGroup = [...k.eq.left, ...k.eq.right].some((x) => x.kind === "group");
        if (!params.distribute && features(params).length < 3) expect(hasGroup).toBe(false);
        if (!params.bothSides && features(params).length < 3) {
          expect(k.eq.right.every((x) => x.kind === "term" && !x.x)).toBe(true);
        }
      }),
    );
  });

  it("includes special cases only when asked, and then both kinds", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(construct({ ...params, specialCases: false }, createRng(seed)).outcome).toBe("one");
      }),
    );
    for (const only of ["distribute", "combineLikeTerms", "bothSides"]) {
      const params = { distribute: false, combineLikeTerms: false, bothSides: false, [only]: true, specialCases: true };
      const outcomes = new Set(Array.from({ length: 80 }, (_, s) => construct(params, createRng(s)).outcome));
      expect(outcomes, only).toEqual(new Set(["one", "none", "all"]));
    }
  });

  it("gives integer or fraction solutions as asked, within Largest solution", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, specialCases: false }, createRng(seed));
        expect(k.x).not.toBeNull();
        expect(k.x!.d === 1).toBe(params.solutions === "integer");
        expect(k.x!.n).not.toBe(0);
        expect(Math.abs(ratValue(k.x!))).toBeLessThanOrEqual(params.maxSolution);
      }),
    );
  });

  it("prints no negative numbers or negative coefficients when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.prompt).not.toMatch(/(^|= )-/);
        // subtraction of a constant is fine; of an x-term or a group is not
        expect(p.prompt).not.toMatch(/- \d*[a-z(]/);
        expect(p.answer).not.toContain("-");
      }),
    );
  });
});

describe("multi-step-equations: distractors", () => {
  it("are distinct, never the Answer, and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        expect(p.distractorHints).not.toContain(p.answer);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        if (p.answer.startsWith("\\text")) return;
        const answer = answerValues(p.answer).values[0];
        for (const d of p.distractorHints) {
          if (!d.startsWith("\\text")) expect(close(answerValues(d).values[0], answer)).toBe(false);
        }
      }),
    );
  });

  it("model distribution and sign mistakes", () => {
    // 5x - 2(x - 4) = 17, x = 3
    const k: MultiStepConstruction = {
      template: "DC2",
      outcome: "one",
      v: "x",
      x: rat(3),
      eq: {
        left: [
          { kind: "term", coef: 5, x: true },
          { kind: "group", mult: -2, p: 1, q: -4 },
        ],
        right: [{ kind: "term", coef: 17, x: false }],
      },
    };
    const d = distractors(k);
    expect(d[0]).toBe("x = \\frac{25}{3}"); // 5x - 2x - 8 = 17
    expect(d[1]).toBe("x = 7"); // 5x - 2x - 4 = 17: distributed to the first term only
    expect(d).toContain("x = \\frac{9}{7}"); // 5x + 2x + 8 = 17: combined ignoring the minus
  });

  it("offer the other special case for no-solution and all-reals Problems", () => {
    for (let s = 0; s < 200; s++) {
      const p = generator.generate({ specialCases: true }, s);
      if (p.answer === NO_SOLUTION) expect(p.distractorHints[0]).toBe(ALL_REALS);
      if (p.answer === ALL_REALS) expect(p.distractorHints[0]).toBe(NO_SOLUTION);
    }
  });
});

describe("multi-step-equations: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("bakes the recipe", () => {
    const p = generator.generate({ solutions: "fraction" }, 9);
    expect(p.generatorId).toBe("multi-step-equations");
    expect(p.params.solutions).toBe("fraction");
    expect(p.answer).toContain("\\frac");
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(190);
  });
});
