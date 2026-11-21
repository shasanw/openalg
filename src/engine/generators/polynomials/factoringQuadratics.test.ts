import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { gcd } from "../../format";
import { construct, distractors, generator, PRIME, schema, wrongPairs } from "./factoringQuadratics";
import { isPerfectSquare } from "../../quadratics";
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

describe("factoring-quadratics: answers", () => {
  it("the Answer multiplies back out to the Problem", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        if (p.answer === PRIME) return;
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
      }),
    );
  });

  it("factors completely: no factor has a common factor left in it", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        if (!k.factors) return;
        const [p, q, r, s] = k.factors;
        expect(gcd(p, q)).toBe(1);
        expect(gcd(r, s)).toBe(1);
        expect(p * s + q * r).not.toBe(0);
      }),
    );
  });

  it("a prime trinomial really is prime: no common factor, discriminant not a square", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct({ ...ps, prime: true }, createRng(seed));
        if (k.factors) return;
        expect(k.g).toBe(1);
        expect(gcd(gcd(k.a, k.b), k.c)).toBe(1);
        expect(isPerfectSquare(k.b * k.b - 4 * k.a * k.c)).toBe(false);
        // every way of splitting a and c misses the middle term
        expect(wrongPairs(k.a, k.b, k.c).length).toBeGreaterThan(0);
      }),
    );
  });

  it("honours the leading coefficient, prime and common factor options", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        if (!ps.prime) expect(k.factors).not.toBeNull();
        if (!ps.commonFactor) expect(k.g).toBe(1);
        if (k.factors) {
          const [p, q, r, s] = k.factors;
          if (ps.leading === "one") expect(p * r).toBe(1);
          if (ps.leading === "other") expect(p * r).toBeGreaterThan(1);
          expect(Math.max(p, r)).toBeLessThanOrEqual(ps.maxLeading as number);
          expect(Math.max(Math.abs(q), Math.abs(s))).toBeLessThanOrEqual(ps.maxConstant as number);
        }
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

describe("factoring-quadratics: distractors", () => {
  it("are distinct, never the Answer, and wrong in value", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expectGoodHints(p, 3);
        expectHintsWrongInValue(p);
        if (!ps.prime) expect(p.distractorHints).not.toContain(PRIME);
      }),
    );
  });

  const k = (factors: [number, number, number, number], g = 1) => {
    const [p, q, r, s] = factors;
    return { vars: ["x", "y"] as [string, string], two: false, g, factors, a: g * p * r, b: g * (p * s + q * r), c: g * q * s };
  };

  it("x^2 - x - 12 = (x + 3)(x - 4): leads with both signs wrong, then a wrong factor pair", () => {
    const out = distractors(k([1, 3, 1, -4]), false);
    expect(out[0]).toBe("(x + 4)(x - 3)");
    expect(out[1]).toBe("(x + 2)(x - 6)");
    expect(out).toContain("(x + 4)(x + 3)");
  });

  it("6x^2 + x - 2 = (2x - 1)(3x + 2): offers the constants in the wrong factors", () => {
    expect(distractors(k([2, -1, 3, 2]), false)).toContain("(2x + 2)(3x - 1)");
  });

  it("with a common factor, offers forgetting it", () => {
    expect(distractors(k([1, 2, 1, 3], 2), false)).toContain("(x + 3)(x + 2)");
  });
});
