import { expectDistinctChoices, solutionValues } from "../shared/distractors.testkit";
import { anyParams } from "../polynomials/polynomials.testkit";
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import {
  answerToLatex,
  construct,
  generator,
  type ExactRoot,
  type RootType,
} from "./quadraticFormula";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const ROOT_TYPES: RootType[] = ["rational", "irrational", "imaginary"];

function isPerfectSquare(n: number): boolean {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

/**
 * Exact check that the conjugate pair (p ± q√s)/r solves a x^2 + b x + c = 0.
 * Substituting and clearing r^2 splits into a rational part and a √s-coefficient,
 * BOTH of which must vanish. Flipping q's sign (the other root) only flips the
 * radical part, so a single check covers both roots. All integer arithmetic.
 */
function rootSatisfies(
  a: number,
  b: number,
  c: number,
  { p, q, s, r }: ExactRoot,
): boolean {
  const rationalPart = a * (p * p + q * q * s) + b * p * r + c * r * r;
  const radicalPart = 2 * a * p * q + b * q * r;
  return rationalPart === 0 && radicalPart === 0;
}

describe("quadratic-formula: construction is answer-from-construction", () => {
  for (const rootType of ROOT_TYPES) {
    it(`${rootType}: the exact roots satisfy a x^2 + b x + c = 0 for any seed`, () => {
      fc.assert(
        fc.property(anySeed, (seed) => {
          const k = construct({ rootType }, createRng(seed));
          expect(rootSatisfies(k.a, k.b, k.c, k.root)).toBe(true);
        }),
      );
    });

    it(`${rootType}: D equals b^2 - 4ac and c is an integer for any seed`, () => {
      fc.assert(
        fc.property(anySeed, (seed) => {
          const k = construct({ rootType }, createRng(seed));
          expect(k.D).toBe(k.b * k.b - 4 * k.a * k.c);
          expect(Number.isInteger(k.c)).toBe(true);
          expect(Number.isInteger(k.a)).toBe(true);
          expect(Number.isInteger(k.b)).toBe(true);
        }),
      );
    });
  }
});

describe("quadratic-formula: the toggle is honored for any seed", () => {
  it("rational => discriminant is a non-negative perfect square", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const k = construct({ rootType: "rational" }, createRng(seed));
        expect(k.D).toBeGreaterThan(0);
        expect(isPerfectSquare(k.D)).toBe(true);
        expect(k.root.s).toBe(1);
      }),
    );
  });

  it("irrational => discriminant is positive and not a perfect square", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const k = construct({ rootType: "irrational" }, createRng(seed));
        expect(k.D).toBeGreaterThan(0);
        expect(isPerfectSquare(k.D)).toBe(false);
        expect(k.root.s).toBeGreaterThan(1);
      }),
    );
  });

  it("imaginary => discriminant is negative", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const k = construct({ rootType: "imaginary" }, createRng(seed));
        expect(k.D).toBeLessThan(0);
        expect(k.root.s).toBeLessThan(0);
      }),
    );
  });
});

describe("quadratic-formula: parameter constraints", () => {
  it("respects the maxCoefficient bound on a and b for any seed", () => {
    fc.assert(
      fc.property(
        anySeed,
        fc.constantFrom(...ROOT_TYPES),
        fc.integer({ min: 2, max: 20 }),
        (seed, rootType, maxCoefficient) => {
          const k = construct(
            { rootType, maxCoefficient },
            createRng(seed),
          );
          expect(Math.abs(k.b)).toBeLessThanOrEqual(maxCoefficient);
          expect(k.a).toBeGreaterThanOrEqual(1);
          expect(k.a).toBeLessThanOrEqual(Math.min(4, maxCoefficient));
        },
      ),
    );
  });

  it("forces a = 1 when the leading coefficient is disallowed", () => {
    fc.assert(
      fc.property(anySeed, fc.constantFrom(...ROOT_TYPES), (seed, rootType) => {
        const k = construct(
          { rootType, allowLeadingCoefficient: false },
          createRng(seed),
        );
        expect(k.a).toBe(1);
      }),
    );
  });
});

describe("quadratic-formula: distractors", () => {
  it("are distinct and never equal the correct answer, for every mode", () => {
    fc.assert(
      fc.property(anySeed, anyParams(generator.schema), (seed, opts) => {
        const p = generator.generate(opts, seed);
        expectDistinctChoices(p, solutionValues);
      }),
    );
  });
});

describe("quadratic-formula: generate()", () => {
  it("models taking only the minus branch", () => {
    const p = generator.generate({}, 42);
    expect(p.prompt).toBe("3x^2 - x - 30 = 0");
    expect(p.distractorHints).toContain("x = -3");
  });

  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, fc.constantFrom(...ROOT_TYPES), (seed, rootType) => {
        expect(generator.generate({ rootType }, seed)).toEqual(
          generator.generate({ rootType }, seed),
        );
      }),
    );
  });

  it("bakes the recipe (generatorId, params, seed) onto the problem", () => {
    const p = generator.generate({ rootType: "imaginary" }, 42);
    expect(p.generatorId).toBe("quadratic-formula");
    expect(p.seed).toBe(42);
    expect(p.params.rootType).toBe("imaginary");
    expect(p.kind).toBe("generated");
  });

  it("renders a sane prompt for every mode", () => {
    for (const rootType of ROOT_TYPES) {
      const p = generator.generate({ rootType }, 7);
      expect(p.prompt).toMatch(/x\^2.* = 0$/);
      expect(p.answer).toMatch(/^x = /);
    }
  });
});

describe("quadratic-formula: answer rendering", () => {
  it("renders rational roots as reduced fractions", () => {
    // (p ± q)/r with s === 1
    expect(answerToLatex({ p: -1, q: 5, s: 1, r: 2 })).toBe(
      "x = -3, 2",
    );
  });

  it("renders an irrational conjugate pair over 2a", () => {
    expect(answerToLatex({ p: -3, q: 1, s: 5, r: 2 })).toBe(
      "x = \\frac{-3 \\pm \\sqrt{5}}{2}",
    );
  });

  it("renders an imaginary conjugate pair with i", () => {
    expect(answerToLatex({ p: 0, q: 2, s: -3, r: 4 })).toBe(
      "x = \\frac{\\pm 2i\\sqrt{3}}{4}",
    );
  });
});

describe("quadratic-formula: dropped the ± distractor", () => {
  it("offers only the + branch for surd answers", () => {
    fc.assert(
      fc.property(anySeed, fc.constantFrom<RootType>("irrational", "imaginary"), (seed, rootType) => {
        const p = generator.generate({ rootType }, seed);
        expect(p.answer).toContain("\\pm");
        expect(p.distractorHints.some((d) => !d.includes("\\pm") && !d.includes(","))).toBe(true);
      }),
    );
  });
});

describe("quadratic-formula: zero-discriminant distractors", () => {
  it("never render a degenerate radical like 0\\sqrt{0}", () => {
    for (const rootType of ["rational", "irrational", "imaginary"]) {
      for (const allowLeadingCoefficient of [true, false]) {
        for (let seed = 1; seed <= 3000; seed++) {
          const p = generator.generate({ rootType, allowLeadingCoefficient }, seed);
          for (const d of p.distractorHints) {
            expect(d).not.toMatch(/\\pm 0|\\sqrt\{0\}/);
          }
        }
      }
    }
  });
});
