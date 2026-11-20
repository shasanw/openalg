import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, distractors, generator, schema } from "./addingPolynomials";
import { degree, mono } from "./polyKit";
import {
  anyParams,
  anySeed,
  countTerms,
  expectGoodHints,
  expectHintsWrongInValue,
  expectKatex,
  expectTidy,
  sameValue,
} from "./polynomials.testkit";

const params = anyParams(schema);

describe("adding-subtracting-polynomials: answers", () => {
  it("the Answer equals the printed sum or difference", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
      }),
    );
  });

  it("honours the operation, degree, term count and coefficient size", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        if (ps.operation === "add") expect(k.subtract).toBe(false);
        if (ps.operation === "subtract") expect(k.subtract).toBe(true);
        for (const poly of [k.p, k.q]) {
          expect(degree(poly)).toBeLessThanOrEqual(ps.maxDegree as number);
          expect(poly.length).toBeGreaterThanOrEqual(2);
          expect(poly.length).toBeLessThanOrEqual(ps.terms as number);
          expect(poly.every((t) => Math.abs(t.c) <= (ps.maxCoefficient as number))).toBe(true);
          if (!ps.twoVariables) expect(poly.every((t) => t.e[1] === 0)).toBe(true);
        }
      }),
    );
  });

  it("always has like terms to combine and a nonzero Answer", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        expect(k.p.some((t) => k.q.some((u) => u.e[0] === t.e[0] && u.e[1] === t.e[1]))).toBe(true);
        expect(k.answer.length).toBeGreaterThan(0);
        const p = generator.generate(ps, seed);
        expect(countTerms(p.answer)).toBe(k.answer.length);
      }),
    );
  });

  it("is deterministic, tidy, and renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expect(generator.generate(ps, seed)).toEqual(p);
        for (const t of [p.prompt, p.answer]) {
          expectTidy(t);
          expectKatex(t);
        }
      }),
    );
  });
});

describe("adding-subtracting-polynomials: distractors", () => {
  it("are distinct, never the Answer, and wrong in value", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expectGoodHints(p, 3);
        expectHintsWrongInValue(p);
      }),
    );
  });

  // (3x^2 - 5x + 2) - (x^2 + 4x - 7) = 2x^2 - 9x + 9
  const k = {
    subtract: true,
    vars: ["x", "y"] as [string, string],
    p: [mono(3, 2), mono(-5, 1), mono(2)],
    q: [mono(1, 2), mono(4, 1), mono(-7)],
    answer: [mono(2, 2), mono(-9, 1), mono(9)],
  };

  it("leads with changing the sign of only the first term", () => {
    expect(distractors(k)[0]).toBe("2x^{2} - x - 5");
  });

  it("offers adding instead of subtracting, and doubled exponents", () => {
    expect(distractors(k)).toContain("4x^{2} - x - 5");
    expect(distractors(k)).toContain("2x^{4} - 9x^{2} + 9");
  });
});
