import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, nameLatex, schema } from "./namingPolynomials";
import { mono } from "./polyKit";
import { anyParams, anySeed, countTerms, expectGoodHints, expectKatex, expectTidy, termDegrees } from "./polynomials.testkit";

const params = anyParams(schema);

describe("naming-polynomials: answers", () => {
  it("names the printed polynomial by its degree and number of terms", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        const k = construct(ps, createRng(seed));
        expect(countTerms(p.prompt)).toBe(k.terms);
        expect(Math.max(...termDegrees(p.prompt))).toBe(k.degree);
        expect(p.answer).toBe(nameLatex(k.degree, k.terms));
      }),
    );
  });

  it("never has like terms to combine first (the count is the printed count)", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        const shapes = k.poly.map((t) => t.e.join(","));
        expect(new Set(shapes).size).toBe(shapes.length);
        expect(k.poly.every((t) => t.c !== 0)).toBe(true);
      }),
    );
  });

  it("honours the highest degree, the most terms and the variables", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        expect(k.degree).toBeLessThanOrEqual(ps.maxDegree as number);
        expect(k.terms).toBeLessThanOrEqual(ps.maxTerms as number);
        if (!ps.twoVariables) expect(k.poly.every((t) => t.e[1] === 0)).toBe(true);
      }),
    );
  });

  it("out of standard form, never prints a highest-degree term first", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct({ ...ps, standardForm: false }, createRng(seed));
        if (k.terms > 1 && k.poly.some((t) => t.e[0] + t.e[1] < k.degree)) {
          expect(k.poly[0].e[0] + k.poly[0].e[1]).toBeLessThan(k.degree);
        }
      }),
    );
  });

  it("is deterministic, tidy, and renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expect(generator.generate(ps, seed)).toEqual(p);
        expectTidy(p.prompt);
        expectKatex(p.prompt);
        expectKatex(p.answer);
      }),
    );
  });
});

describe("naming-polynomials: distractors", () => {
  it("are distinct names, never the Answer, at least four", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expectGoodHints(p, 4);
        for (const h of p.distractorHints) expect(h).toMatch(/^\\text\{[a-z0-9, ]+\}$/);
      }),
    );
  });

  const k = (poly: ReturnType<typeof mono>[], degree: number) => ({
    degree,
    terms: poly.length,
    vars: ["x", "y"] as [string, string],
    poly,
  });

  it("offers the first term's degree when the polynomial is out of order", () => {
    // 3x + 5x^3 - 2: a cubic trinomial, read as linear
    expect(distractors(k([mono(3, 1), mono(5, 3), mono(-2)], 3))[0]).toBe(nameLatex(1, 3));
  });

  it("offers quartic for quadratic (quad- suggests four)", () => {
    expect(distractors(k([mono(1, 2), mono(4)], 2))).toContain(nameLatex(4, 2));
  });

  it("offers the largest single exponent for a two-variable term", () => {
    // x^2y^3: degree 5, not 3
    expect(distractors(k([mono(1, 2, 3), mono(1, 1)], 5))[0]).toBe(nameLatex(3, 2));
  });

  it("offers a count that skips the constant", () => {
    expect(distractors(k([mono(1, 3), mono(2, 1), mono(7)], 3))).toContain(nameLatex(3, 2));
  });
});
