import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  closeTo,
  combine,
  fractionLatex,
  fractionValue,
  isSimplified,
  mono,
  mulSums,
  rationalizeBinomial,
  rationalizeMonomial,
  simplifyMistakes,
  simplifyTerm,
  sumLatex,
  sumValue,
  term,
  termLatex,
  termValue,
  type RootIndex,
} from "./radicalKit";
import { expectSimplest, sameValue } from "./radicals.testkit";

const anyIndex = fc.constantFrom<RootIndex>(2, 3);
const termOf = (index: RootIndex) =>
  fc
    .record({
      c: fc.integer({ min: -9, max: 9 }).filter((c) => c !== 0),
      r: fc.integer({ min: 1, max: 500 }),
      e: fc.integer({ min: 0, max: 7 }),
      neg: fc.boolean(),
    })
    .map(({ c, r, e, neg }) => term(c, index, mono(index === 3 && neg ? -r : r, e ? [["x", e]] : [])));
const anyTerm = anyIndex.chain(termOf);
/** Terms sharing one root index. */
const sameIndex = (k: number) =>
  anyIndex.chain((n) =>
    fc.tuple(...Array.from({ length: k }, () => fc.array(termOf(n), { minLength: 1, maxLength: 3 }))),
  );

describe("radicalKit", () => {
  it("simplifying keeps the value and leaves the simplest form", () => {
    fc.assert(
      fc.property(anyTerm, (t) => {
        const s = simplifyTerm(t);
        expect(closeTo(termValue(s), termValue(t))).toBe(true);
        expect(isSimplified(s)).toBe(true);
        expectSimplest(termLatex(s));
        expect(sameValue(termLatex(s), termLatex(t))).toBe(true);
      }),
    );
  });

  it("prints known forms", () => {
    expect(termLatex(simplifyTerm(term(1, 2, 72)))).toBe("6\\sqrt{2}");
    expect(termLatex(simplifyTerm(term(1, 3, -54)))).toBe("-3\\sqrt[3]{2}");
    expect(termLatex(simplifyTerm(term(1, 2, mono(18, [["x", 5], ["y", 2]]))))).toBe("3x^{2}y\\sqrt{2x}");
    expect(sumLatex(mulSums([term(2), term(1, 2, 3)], [term(1), term(-1, 2, 3)]))).toBe("-1 - \\sqrt{3}");
    expect(fractionLatex(rationalizeMonomial([term(6)], term(1, 2, 8)))).toBe("\\frac{3\\sqrt{2}}{2}");
    expect(fractionLatex(rationalizeMonomial([term(5)], term(1, 3, 2)))).toBe("\\frac{5\\sqrt[3]{4}}{2}");
    expect(fractionLatex(rationalizeBinomial([term(4)], 3, -1, 5))).toBe("3 + \\sqrt{5}");
  });

  it("combining and multiplying keep the value", () => {
    fc.assert(
      fc.property(sameIndex(2), ([A, B]) => {
        const c = combine(A);
        expect(closeTo(sumValue(c), sumValue(A))).toBe(true);
        const keys = c.map((t) => `${t.index}${t.rad.n}${JSON.stringify(t.rad.vars)}${JSON.stringify(t.coef.vars)}`);
        expect(new Set(keys).size).toBe(keys.length);
        expect(closeTo(sumValue(mulSums(A, B)), sumValue(A) * sumValue(B))).toBe(true);
      }),
    );
  });

  it("rationalizing keeps the value and clears the denominator", () => {
    fc.assert(
      fc.property(sameIndex(2), ([num, [den]]) => {
        const f = rationalizeMonomial(num, den);
        if (f.num.length === 0) return;
        expect(closeTo(fractionValue(f), sumValue(num) / termValue(den))).toBe(true);
        expect(f.den.n).toBeGreaterThan(0);
        expectSimplest(fractionLatex(f));
      }),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: -4, max: 4 }).filter((b) => b !== 0),
        fc.constantFrom(2, 3, 5, 6, 7, 10),
        fc.integer({ min: -12, max: 12 }).filter((k) => k !== 0),
        (a, b, r, k) => {
          const f = rationalizeBinomial([term(k)], a, b, r);
          expect(closeTo(fractionValue(f), k / (a + b * Math.sqrt(r)))).toBe(true);
          expectSimplest(fractionLatex(f));
        },
      ),
    );
  });

  it("simplifying mistakes are wrong ways to simplify", () => {
    const wrong = simplifyMistakes(term(1, 2, 72)).map(termLatex);
    expect(wrong).toEqual(["36\\sqrt{2}", "18\\sqrt{2}", "6"]);
  });
});
