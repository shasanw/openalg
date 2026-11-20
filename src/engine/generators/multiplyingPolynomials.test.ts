import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
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
        expectGoodHints(p, 3);
        expectHintsWrongInValue(p);
      }),
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
});
