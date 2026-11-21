import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { gcd } from "../../format";
import { answerLatex, construct, distractors, fourTerms, generator, schema } from "./factoringByGrouping";
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

describe("factoring-by-grouping: answers", () => {
  it("finishes a difference of squares exposed by grouping", () => {
    const p = generator.generate({ form: "cubic" }, 51);
    expect(p.prompt).toBe("x^{3} - 3x^{2} - 4x + 12");
    expect(p.answer).toBe("(x + 2)(x - 2)(x - 3)");
  });

  it("the Answer multiplies back out to the Problem", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
      }),
    );
  });

  it("prints four terms in grouping order, the form asked for, factored completely", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        const p = generator.generate(ps, seed);
        expect(countTerms(p.prompt)).toBe(4);
        expect(fourTerms(k).every((t) => t.c !== 0)).toBe(true);
        if (ps.form !== "mixed") expect(k.form).toBe(ps.form);
        expect(gcd(k.p, k.q)).toBe(1);
        expect(gcd(k.r, k.s)).toBe(1);
        if (!ps.commonFactor) expect(k.g).toBe(1);
        expect(Math.max(k.p, k.r)).toBeLessThanOrEqual(ps.maxLeading as number);
        expect(Math.max(Math.abs(k.q), Math.abs(k.s))).toBeLessThanOrEqual(ps.maxConstant as number);
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

describe("factoring-by-grouping: distractors", () => {
  it("are distinct, never the Answer, and wrong in value", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expectGoodHints(p, 4);
        expectHintsWrongInValue(p);
      }),
    );
  });

  it("2x^3 + 6x^2 - 5x - 15 = (2x^2 - 5)(x + 3): leads with the sign slip in the second pair", () => {
    const k = { form: "cubic" as const, vars: ["x", "y"] as [string, string], g: 1, p: 2, q: -5, r: 1, s: 3 };
    expect(generator.generate({ form: "cubic" }, 0).prompt).toMatch(/x\^\{3\}/);
    expect(answerLatex(k)).toBe("(2x^{2} - 5)(x + 3)");
    const out = distractors(k);
    expect(out).toContain("x + 3"); // shared binomial alone
    expect(out[0]).toBe("(2x^{2} + 5)(x + 3)");
    expect(out).toContain("(2x^{2} - 5)(x - 3)");
    expect(out).toContain("(x^{2} + 3)(2x - 5)");
  });
});
