// Tests for the sums-of-surds part of the trig kit (sumLatex, sumDiv,
// twelfthValue, halfAngleValue), used by the identity Topics.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { rat } from "../shared/equationKit";
import { close, evalLatex } from "../shared/latexEval.testkit";
import {
  halfAngleValue,
  halfValueLatex,
  halfValueNumber,
  nestedLatex,
  radiansValue,
  STANDARD_ANGLES,
  sumAdd,
  sumDiv,
  sumLatex,
  sumMul,
  sumNeg,
  surd,
  surdSum,
  sumValue,
  twelfthValue,
  type SurdSum,
} from "./trigKit";

const anySurd = fc
  .tuple(fc.integer({ min: -6, max: 6 }), fc.constantFrom(1, 2, 3, 5, 6, 8, 12), fc.integer({ min: 1, max: 6 }))
  .map(([n, r, d]) => surd(n, r, d));
const anySum: fc.Arbitrary<SurdSum> = fc.array(anySurd, { minLength: 1, maxLength: 3 }).map((p) => surdSum(...p));

describe("sums of surds", () => {
  it("prints canonically", () => {
    expect(sumLatex(surdSum(surd(1, 6, 4), surd(1, 2, 4)))).toBe("\\frac{\\sqrt{6} + \\sqrt{2}}{4}");
    expect(sumLatex(surdSum(surd(1, 2, 4), surd(-1, 6, 4)))).toBe("\\frac{\\sqrt{2} - \\sqrt{6}}{4}");
    expect(sumLatex(surdSum(surd(-1, 2, 4), surd(-1, 6, 4)))).toBe("-\\frac{\\sqrt{6} + \\sqrt{2}}{4}");
    expect(sumLatex(surdSum(surd(2), surd(-1, 3)))).toBe("2 - \\sqrt{3}");
    expect(sumLatex(surdSum(surd(-2), surd(1, 3)))).toBe("\\sqrt{3} - 2");
    expect(sumLatex(surdSum(surd(-2), surd(-1, 3)))).toBe("-2 - \\sqrt{3}");
    expect(sumLatex(surdSum(surd(1, 3, 2)))).toBe("\\frac{\\sqrt{3}}{2}");
    expect(sumLatex(surdSum())).toBe("0");
    expect(sumLatex(surdSum(surd(2, 1, 4), surd(1, 3, 4)))).toBe("\\frac{2 + \\sqrt{3}}{4}");
  });

  it("adds, multiplies and divides exactly, and prints the value", () => {
    fc.assert(
      fc.property(anySum, anySum, (a, b) => {
        expect(close(sumValue(sumAdd(a, b)), sumValue(a) + sumValue(b))).toBe(true);
        expect(close(sumValue(sumMul(a, b)), sumValue(a) * sumValue(b), 1e-9)).toBe(true);
        expect(close(evalLatex(sumLatex(a)), sumValue(a))).toBe(true);
        const q = sumDiv(a, b);
        if (b.terms.length === 0) expect(q).toBeNull();
        else {
          expect(close(sumValue(q!), sumValue(a) / sumValue(b), 1e-7)).toBe(true);
          expect(sumLatex(q!)).not.toMatch(/\}\{[^}]*\\sqrt/);
        }
        expect(close(sumValue(sumNeg(a)), -sumValue(a))).toBe(true);
      }),
    );
  });

  it("rationalizes (√6 + √2)/(√6 - √2) to 2 + √3", () => {
    const q = sumDiv(surdSum(surd(1, 6), surd(1, 2)), surdSum(surd(1, 6), surd(-1, 2)))!;
    expect(sumLatex(q)).toBe("2 + \\sqrt{3}");
  });
});

describe("values at multiples of π/12", () => {
  it("matches the calculator at every multiple of π/12", () => {
    for (let k = -24; k <= 24; k++) {
      const a = rat(k, 12);
      for (const fn of ["sin", "cos", "tan"] as const) {
        const v = twelfthValue(fn, a);
        const x = radiansValue(a);
        const want = fn === "sin" ? Math.sin(x) : fn === "cos" ? Math.cos(x) : Math.tan(x);
        if (v === "undefined") expect(Math.abs(Math.cos(x))).toBeLessThan(1e-12);
        else expect(close(sumValue(v), want, 1e-9)).toBe(true);
      }
    }
  });

  it("gives the textbook forms", () => {
    expect(sumLatex(twelfthValue("sin", rat(5, 12)) as SurdSum)).toBe("\\frac{\\sqrt{6} + \\sqrt{2}}{4}");
    expect(sumLatex(twelfthValue("cos", rat(7, 12)) as SurdSum)).toBe("\\frac{\\sqrt{2} - \\sqrt{6}}{4}");
    expect(sumLatex(twelfthValue("tan", rat(1, 12)) as SurdSum)).toBe("2 - \\sqrt{3}");
    expect(sumLatex(twelfthValue("tan", rat(7, 12)) as SurdSum)).toBe("-2 - \\sqrt{3}");
  });
});

describe("half-angle values", () => {
  it("matches the calculator for every half of a standard angle", () => {
    for (const full of STANDARD_ANGLES) {
      for (const turn of [0, 1]) {
        const h = rat(full.n + 2 * turn * full.d, 2 * full.d);
        const x = radiansValue(h);
        for (const fn of ["sin", "cos", "tan"] as const) {
          if (fn === "tan" && Math.abs(Math.cos(x)) < 1e-12) continue;
          const v = halfAngleValue(fn, h);
          const want = fn === "sin" ? Math.sin(x) : fn === "cos" ? Math.cos(x) : Math.tan(x);
          expect(close(halfValueNumber(v), want, 1e-9), `${fn} ${h.n}/${h.d}`).toBe(true);
          expect(close(evalLatex(halfValueLatex(v)), want, 1e-9)).toBe(true);
        }
      }
    }
  });

  it("prints nested radicals as the formula gives them", () => {
    expect(halfValueLatex(halfAngleValue("sin", rat(1, 12)))).toBe("\\frac{\\sqrt{2 - \\sqrt{3}}}{2}");
    expect(halfValueLatex(halfAngleValue("cos", rat(5, 8)))).toBe("-\\frac{\\sqrt{2 - \\sqrt{2}}}{2}");
    expect(halfValueLatex(halfAngleValue("tan", rat(1, 8)))).toBe("\\sqrt{2} - 1");
    expect(nestedLatex({ s: 1, a: 2, b: 1, r: 2, d: 1 })).toBe("\\sqrt{2 + \\sqrt{2}}");
  });
});
