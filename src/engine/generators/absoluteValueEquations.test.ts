import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, distractors, generator, type AbsConstruction } from "./absoluteValueEquations";
import { NO_SOLUTION, ratValue } from "./equationKit";
import { choiceKey } from "../mc";
import { answerValues, close, evalLatex, splitEquation } from "./latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  form: fc.constantFrom("mixed", "isolated", "notIsolated"),
  innerCoefficient: fc.boolean(),
  solutions: fc.constantFrom("integer", "fraction"),
  oneSolution: fc.boolean(),
  noSolution: fc.boolean(),
  negativeOutside: fc.boolean(),
  maxSolution: fc.integer({ min: 2, max: 30 }),
  varyVariable: fc.boolean(),
});

/** left - right of the printed equation at v = value */
function gap(prompt: string, v: string, value: number): number {
  const [l, r] = splitEquation(prompt);
  return evalLatex(l, { [v]: value }) - evalLatex(r, { [v]: value });
}

describe("absolute-value-equations: answers", () => {
  it("every stated solution makes the printed equation true, and there are no others", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const k = construct(params, createRng(seed));
        // The left side is a V (or upside-down V) with its corner at -c/b, so
        // the equation has 2, 1 or 0 solutions as the gap at the corner and
        // far away have opposite signs, the corner gap is 0, or the same sign.
        const corner = -k.c / k.b;
        const atCorner = gap(p.prompt, k.v, corner);
        const far = gap(p.prompt, k.v, corner + 1e4);
        if (p.answer === NO_SOLUTION) {
          expect(k.outcome).toBe("none");
          expect(Math.sign(atCorner)).toBe(Math.sign(far));
          expect(close(atCorner, 0)).toBe(false);
          return;
        }
        const { v, values } = answerValues(p.answer);
        for (const x of values) expect(close(gap(p.prompt, v, x), 0)).toBe(true);
        if (values.length === 1) expect(close(atCorner, 0)).toBe(true);
        else {
          expect(values).toHaveLength(2);
          expect(Math.sign(atCorner)).toBe(-Math.sign(far));
          expect(values[0]).toBeLessThan(values[1]);
        }
      }),
    );
  });

  it("isolates to a whole number, and never prints |x| = k (opposite solutions)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(k.a).not.toBe(0);
        expect(k.b).toBeGreaterThanOrEqual(1);
        expect(k.a * k.k + k.d).toBe(k.e);
        if (k.outcome === "two") expect(k.c).not.toBe(0);
        const p = generator.generate(params, seed);
        expect(p.prompt).not.toMatch(/(^|[^0-9])1[a-z]/); // no 1x
        expect(p.prompt).not.toMatch(/^-?1\\lvert/); // no 1|...|
        expect(p.prompt).not.toMatch(/[+-] 0(?!\d)/);
      }),
    );
  });
});

describe("absolute-value-equations: Topic Options", () => {
  it("isolates the absolute value or not, as asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const iso = construct({ ...params, form: "isolated" }, createRng(seed));
        expect([iso.a, iso.d]).toEqual([1, 0]);
        const not = construct({ ...params, form: "notIsolated" }, createRng(seed));
        expect(not.a === 1 && not.d === 0).toBe(false);
      }),
    );
  });

  it("includes one-solution and no-solution cases only when asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (!params.oneSolution) expect(k.outcome).not.toBe("one");
        if (!params.noSolution) expect(k.outcome).not.toBe("none");
      }),
    );
    const outcomes = new Set(
      Array.from({ length: 60 }, (_, s) => construct({ oneSolution: true, noSolution: true }, createRng(s)).outcome),
    );
    expect(outcomes).toEqual(new Set(["two", "one", "none"]));
  });

  it("gives integer or fraction solutions as asked, within Largest solution", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        for (const x of k.solutions) expect(Math.abs(ratValue(x))).toBeLessThanOrEqual(params.maxSolution);
        if (params.solutions === "integer") expect(k.solutions.every((x) => x.d === 1)).toBe(true);
        else if (k.outcome !== "none") expect(k.solutions.some((x) => x.d !== 1)).toBe(true);
      }),
    );
  });

  it("puts a coefficient inside the bars only when allowed (or needed for fractions)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, innerCoefficient: false, solutions: "integer" }, createRng(seed));
        expect(k.b).toBe(1);
      }),
    );
  });

  it("puts a negative in front of the bars only when allowed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, negativeOutside: false }, createRng(seed));
        expect(k.a).toBeGreaterThan(0);
      }),
    );
  });
});

describe("absolute-value-equations: distractors", () => {
  it("are distinct, never the Answer (in any order), and at least three", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(3);
        const keys = p.distractorHints.map(choiceKey);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).not.toContain(choiceKey(p.answer));
      }),
    );
  });

  it("model the classic mistakes", () => {
    // |x + 3| = 5: x = -8, 2
    const k: AbsConstruction = {
      outcome: "two",
      v: "x",
      a: 1,
      b: 1,
      c: 3,
      d: 0,
      e: 5,
      k: 5,
      solutions: [
        { n: -8, d: 1 },
        { n: 2, d: 1 },
      ],
    };
    const d = distractors(k);
    expect(d[0]).toBe("x = 2, 8"); // x + 3 = 5 or x - 3 = 5
    expect(d).toContain("x = 2"); // only the positive case
    // 2|x + 3| - 4 = 6: split before isolating gives 2(x + 3) - 4 = ±6
    const notIso = distractors({ ...k, a: 2, d: -4, e: 6 });
    expect(notIso[0]).toBe("x = -4, 2");
    // |x + 3| = -5 solved as if it were 5
    expect(distractors({ ...k, outcome: "none", k: -5, e: -5, solutions: [] })[0]).toBe("x = -8, 2");
  });
});

describe("absolute-value-equations: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("bakes the recipe", () => {
    const p = generator.generate({ form: "isolated" }, 5);
    expect(p.generatorId).toBe("absolute-value-equations");
    expect(p.prompt).toMatch(/^\\lvert .+ \\rvert = -?\d+$/);
    expect(p.answer).toMatch(/^x = -?\d+, -?\d+$/);
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(180);
  });
});
