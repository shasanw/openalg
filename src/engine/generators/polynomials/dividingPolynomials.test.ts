import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { answerLatex, construct, distractors, generator, schema } from "./dividingPolynomials";
import { add, degree, mono, mul, polyEq } from "./polyKit";
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

describe("dividing-polynomials: answers", () => {
  it("the Answer equals the printed quotient", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
      }),
    );
  });

  it("dividend = quotient · divisor + remainder, by construction", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        expect(polyEq(add(mul(k.quotient, k.divisor), [mono(k.remainder)]), k.dividend)).toBe(true);
      }),
    );
  });

  it("honours the divisor, the degree, remainders and leading coefficients", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        if (ps.divisor === "monomial") expect(k.divisor.length).toBe(1);
        if (ps.divisor === "binomial") expect(k.divisor.length).toBe(2);
        expect(degree(k.dividend)).toBeLessThanOrEqual(ps.maxDegree as number);
        expect(degree(k.dividend)).toBeGreaterThanOrEqual(2);
        if (!ps.remainders || k.divisor.length === 1) expect(k.remainder).toBe(0);
        if (k.divisor.length === 2) {
          expect(degree(k.divisor)).toBe(1);
          if (!ps.leadingCoefficients) expect(k.divisor[0].c).toBe(1);
          // no missing terms unless asked for
          if (!ps.missingTerms) expect(k.dividend.length).toBe(degree(k.dividend) + 1);
        }
        expect(k.quotient.length).toBeGreaterThanOrEqual(1);
      }),
    );
  });

  it("missing terms do come up when asked for", () => {
    let seen = 0;
    for (let seed = 0; seed < 200; seed++) {
      const k = construct({ divisor: "binomial", missingTerms: true, maxDegree: 3 }, createRng(seed));
      if (k.dividend.length < degree(k.dividend) + 1) seen++;
    }
    expect(seen).toBeGreaterThan(20);
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

describe("dividing-polynomials: distractors", () => {
  it("are distinct, never the Answer, and wrong in value", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expectGoodHints(p, 3);
        expectHintsWrongInValue(p);
      }),
    );
  });

  it("(x^2 - x - 6) ÷ (x - 3): leads with dividing by the wrong sign", () => {
    const divisor = [mono(1, 1), mono(-3)];
    const quotient = [mono(1, 1), mono(2)];
    const k = { vars: ["x", "y"] as [string, string], divisor, quotient, dividend: mul(quotient, divisor), remainder: 0 };
    expect(answerLatex(k)).toBe("x + 2");
    // x^2 - x - 6 = (x + 3)(x - 4) + 6
    expect(distractors(k)[0]).toBe("x - 4 + \\frac{6}{x - 3}");
    expect(distractors(k)).toContain("x^{2} + 2x");
    expect(distractors(k)).toContain("x - 2");
  });

  it("a remainder: offers dropping it and flipping its sign", () => {
    const divisor = [mono(1, 1), mono(2)];
    const quotient = [mono(1, 1), mono(1)];
    const k = { vars: ["x", "y"] as [string, string], divisor, quotient, dividend: add(mul(quotient, divisor), [mono(5)]), remainder: 5 };
    expect(answerLatex(k)).toBe("x + 1 + \\frac{5}{x + 2}");
    expect(distractors(k)).toContain("x + 1");
    expect(distractors(k)).toContain("x + 1 - \\frac{5}{x + 2}");
  });

  it("by a monomial: offers dividing only the coefficients", () => {
    const divisor = [mono(4, 1)];
    const quotient = [mono(3, 2), mono(-2, 1), mono(1)];
    const k = { vars: ["x", "y"] as [string, string], divisor, quotient, dividend: mul(quotient, divisor), remainder: 0 };
    expect(answerLatex(k)).toBe("3x^{2} - 2x + 1");
    expect(distractors(k)).toContain("3x^{3} - 2x^{2} + x");
    expect(distractors(k)).toContain("3x^{2} - 2x");
  });
});
