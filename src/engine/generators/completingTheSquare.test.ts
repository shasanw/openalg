import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { isPerfectSquare, makeRoot, type ExactRoot, type RootType } from "../quadratics";
import {
  construct,
  distractors,
  generator,
  promptToLatex,
  type SquareConstruction,
} from "./completingTheSquare";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const ROOT_TYPES: RootType[] = ["rational", "irrational", "imaginary"];
const anyParams = fc.record({
  rootType: fc.constantFrom(...ROOT_TYPES),
  allowLeadingCoefficient: fc.boolean(),
  allowFractions: fc.boolean(),
  constantOnRight: fc.boolean(),
  maxCoefficient: fc.integer({ min: 4, max: 20 }),
});

/**
 * Exact check that the conjugate pair (p ± q√s)/r solves a x^2 + b x + c = 0.
 * Substituting and clearing r^2 splits into a rational part and a √s-coefficient,
 * BOTH of which must vanish; flipping q's sign (the other root) only flips the
 * radical part, so one check covers both roots. All integer arithmetic.
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

describe("completing-the-square: answer-from-construction", () => {
  it("the exact roots satisfy a x^2 + b x + c = 0 for any params and seed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(Number.isInteger(k.a)).toBe(true);
        expect(Number.isInteger(k.b)).toBe(true);
        expect(Number.isInteger(k.c)).toBe(true);
        expect(k.D).toBe(k.b * k.b - 4 * k.a * k.c);
        expect(rootSatisfies(k.a, k.b, k.c, k.root)).toBe(true);
      }),
    );
  });
});

describe("completing-the-square: the toggle is honored for any seed", () => {
  it("rational => positive perfect-square discriminant", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, rootType: "rational" }, createRng(seed));
        expect(k.D).toBeGreaterThan(0);
        expect(isPerfectSquare(k.D)).toBe(true);
        expect(k.root.s).toBe(1);
      }),
    );
  });

  it("irrational => positive non-square discriminant", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, rootType: "irrational" }, createRng(seed));
        expect(k.D).toBeGreaterThan(0);
        expect(isPerfectSquare(k.D)).toBe(false);
        expect(k.root.s).toBeGreaterThan(1);
      }),
    );
  });

  it("imaginary => negative discriminant", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, rootType: "imaginary" }, createRng(seed));
        expect(k.D).toBeLessThan(0);
        expect(k.root.s).toBeLessThan(0);
      }),
    );
  });
});

describe("completing-the-square: Topic Options", () => {
  it("keeps b nonzero, a multiple of a, and within maxCoefficient", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(k.b).not.toBe(0);
        expect(Math.abs(k.b % k.a)).toBe(0);
        expect(Math.abs(k.b)).toBeLessThanOrEqual(params.maxCoefficient);
      }),
    );
  });

  it("never produces a c = 0 equation", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(construct(params, createRng(seed)).c).not.toBe(0);
      }),
    );
  });

  it("without fractions, b/a is even so the half-coefficient is whole", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct({ ...params, allowFractions: false }, createRng(seed));
        expect(Math.abs((k.b / k.a) % 2)).toBe(0);
      }),
    );
  });

  it("a = 1 unless a leading coefficient is allowed, then 2..3", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const off = construct(
          { ...params, allowLeadingCoefficient: false },
          createRng(seed),
        );
        expect(off.a).toBe(1);
        const on = construct(
          { ...params, allowLeadingCoefficient: true },
          createRng(seed),
        );
        expect(on.a).toBeGreaterThanOrEqual(2);
        expect(on.a).toBeLessThanOrEqual(3);
      }),
    );
  });

  it("places the constant per the constantOnRight option", () => {
    const base: SquareConstruction = {
      a: 1,
      b: 6,
      c: -7,
      D: 64,
      rootType: "rational",
      root: makeRoot(-6, 64, 2),
      constantOnRight: true,
    };
    expect(promptToLatex(base)).toBe("x^2 + 6x = 7");
    expect(promptToLatex({ ...base, constantOnRight: false })).toBe(
      "x^2 + 6x - 7 = 0",
    );
  });
});

describe("completing-the-square: distractors", () => {
  it("are present, distinct, and never equal the answer, for any params", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(2);
        expect(p.distractorHints).not.toContain(p.answer);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
      }),
    );
  });

  it("model the classic mistakes on x^2 + 6x = 7", () => {
    const k: SquareConstruction = {
      a: 1,
      b: 6,
      c: -7,
      D: 64,
      rootType: "rational",
      root: makeRoot(-6, 64, 2),
      constantOnRight: true,
    };
    expect(distractors(k)).toEqual([
      "x = -3 \\pm \\sqrt{7}", // forgot to add 9 to both sides
      "x = -1, 7", // sign error in the square
      "x = 1", // dropped the ±
      "x = -3 \\pm \\sqrt{10}", // added 3 instead of 9
    ]);
  });

  it("render a zero-discriminant mistake as a single repeated root", () => {
    // x^2 + 4x = 0 forgetting to add 4: (x+2)^2 = 0 → x = -2
    const k: SquareConstruction = {
      a: 1,
      b: 4,
      c: 0,
      D: 16,
      rootType: "rational",
      root: makeRoot(-4, 16, 2),
      constantOnRight: true,
    };
    expect(distractors(k)[0]).toBe("x = -2");
    for (const d of distractors(k)) expect(d).not.toMatch(/sqrt\{0\}/);
  });

  it("include the forgot-to-divide-by-a mistake when a > 1", () => {
    // 2x^2 + 8x = 10 → x^2 + 4x = 5 → (x+2)^2 = 9 → x = -5, 1
    const k: SquareConstruction = {
      a: 2,
      b: 8,
      c: -10,
      D: 144,
      rootType: "rational",
      root: makeRoot(-8, 144, 4),
      constantOnRight: true,
    };
    // treating it as x^2 + 8x = 10 → (x+4)^2 = 26
    expect(distractors(k)).toContain("x = -4 \\pm \\sqrt{26}");
  });
});

describe("completing-the-square: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(
          generator.generate(params, seed),
        );
      }),
    );
  });

  it("bakes the recipe and a default Directions line", () => {
    const p = generator.generate({ rootType: "irrational" }, 42);
    expect(p.generatorId).toBe("completing-the-square");
    expect(p.seed).toBe(42);
    expect(p.params.rootType).toBe("irrational");
    expect(p.kind).toBe("generated");
    expect(generator.chapter).toBe("Quadratics");
    expect(generator.defaultDirections).toBe(
      "Solve each equation by completing the square.",
    );
  });

  it("renders a sane prompt and answer for every mode", () => {
    for (const rootType of ROOT_TYPES) {
      for (const constantOnRight of [true, false]) {
        const p = generator.generate({ rootType, constantOnRight }, 7);
        expect(p.prompt).toMatch(/x\^2.* = -?\d+$/);
        expect(p.answer).toMatch(/^x = /);
      }
    }
  });
});
