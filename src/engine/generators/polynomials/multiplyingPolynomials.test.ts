import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, schema } from "./multiplyingPolynomials";
import { mono, mul, polyEq } from "./polyKit";
import {
  anyParams,
  anySeed,
  expectGoodHints,
  expectHintsWrongInValue,
  expectKatex,
  expectTidy,
  sameValue,
} from "./polynomials.testkit";

const params = anyParams(schema);

describe("multiplying-polynomials: answers", () => {
  it("the Answer equals the printed product", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
      }),
    );
  });

  it("honours the kind of factors, leading coefficients and variables", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        if (ps.factors !== "mixed") expect(k.kind).toBe(ps.factors);
        const sizes = { monomial: 1, binomials: 2, binomialTrinomial: 2 }[k.kind];
        expect(k.left.length).toBe(sizes);
        if (k.kind === "binomials") expect(k.right.length).toBe(2);
        if (k.kind === "binomialTrinomial") expect(k.right.length).toBe(3);
        if (!ps.leadingCoefficients) {
          if (k.kind !== "monomial") expect(k.left[0].c).toBe(1);
          expect(k.right[0].c).toBe(1);
        }
        if (!ps.twoVariables) expect([...k.left, ...k.right].every((t) => t.e[1] === 0)).toBe(true);
        expect(polyEq(mul(k.left, k.right), k.answer)).toBe(true);
      }),
    );
  });

  it("two binomials always give a middle term (sums times differences are Special Products)", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct({ ...ps, factors: "binomials" }, createRng(seed));
        expect(k.answer.length).toBe(3);
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

describe("multiplying-polynomials: distractors", () => {
  it("are distinct, never the Answer, and wrong in value", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expectGoodHints(p, 4);
        expectHintsWrongInValue(p);
      }),
      { numRuns: 1500 },
    );
  });

  it("offers four value-distinct Distractors for a monomial times a binomial in two variables (seed 12)", () => {
    const p = generator.generate(
      { factors: "monomial", maxCoefficient: 12, leadingCoefficients: true, twoVariables: true, varyVariable: false },
      12,
    );
    expectGoodHints(p, 4);
    expectHintsWrongInValue(p);
  });

  it("offers four Distractors for every option combination, with a lone variable factor too", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        for (const factors of ["monomial", "binomials", "binomialTrinomial"] as const) {
          const p = generator.generate({ ...ps, factors }, seed);
          expectGoodHints(p, 4);
          expectHintsWrongInValue(p);
        }
      }),
      { numRuns: 500 },
    );
  });

  // (x - 3)(2x + 5) = 2x^2 - x - 15
  const left = [mono(1, 1), mono(-3)];
  const right = [mono(2, 1), mono(5)];
  const k = { kind: "binomials" as const, vars: ["x", "y"] as [string, string], left, right, answer: mul(left, right) };

  it("leads with first-times-first and last-times-last only", () => {
    expect(distractors(k)[0]).toBe("2x^{2} - 15");
  });

  it("offers the sign slip on the last product and the flipped middle", () => {
    expect(distractors(k)).toContain("2x^{2} - x + 15");
    expect(distractors(k)).toContain("2x^{2} + x - 15");
  });

  it("offers the numbers multiplied with the second factor's variables copied", () => {
    // (x - 3)(2x + 5): 2x + 5 - 6x - 15
    expect(distractors(k)).toContain("-4x - 10");
  });

  it("offers a binomial's second term distributed with the first copied down", () => {
    // x + (-3)(2x + 5)
    expect(distractors(k)).toContain("-5x - 15");
  });

  it("offers a monomial distributed to the last term only", () => {
    // 3x(x + 2) = 3x^2 + 6x, with only the last term multiplied: x + 6x
    const m = { kind: "monomial" as const, vars: ["x", "y"] as [string, string], left: [mono(3, 1)], right: [mono(1, 1), mono(2)], answer: mul([mono(3, 1)], [mono(1, 1), mono(2)]) };
    expect(distractors(m)).toContain("7x");
  });
});
