import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { gcd } from "../../format";
import { answerLatex, construct, distractors, generator, schema } from "./factoringSpecialCases";
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

describe("factoring-special-cases: answers", () => {
  it("the Answer multiplies back out to the Problem", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
      }),
    );
  });

  it("is the case asked for, factored completely", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        const p = generator.generate(ps, seed);
        if (ps.caseType === "differenceOfSquares") expect(k.square).toBe(false);
        if (ps.caseType === "perfectSquare") expect(k.square).toBe(true);
        expect(gcd(k.a, k.b)).toBe(1);
        expect(k.b).not.toBe(0);
        // a difference of squares prints two terms, a perfect square three
        expect(p.prompt.split(/ [+-] /).length).toBe(k.square ? 3 : 2);
        if (k.square) expect(p.answer).toMatch(/\^\{2\}$/);
        if (!ps.commonFactor) expect(k.g).toBe(1);
        expect(k.a).toBeLessThanOrEqual(ps.maxLeading as number);
        expect(Math.abs(k.b)).toBeLessThanOrEqual(ps.maxConstant as number);
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

describe("factoring-special-cases: distractors", () => {
  it("are distinct, never the Answer, and wrong in value", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expectGoodHints(p, 3);
        expectHintsWrongInValue(p);
      }),
    );
  });

  const base = { vars: ["x", "y"] as [string, string], two: false, g: 1 };

  it("9x^2 - 25: offers the squares and the un-rooted numbers", () => {
    const k = { ...base, square: false, a: 3, b: 5 };
    expect(answerLatex(k)).toBe("(3x + 5)(3x - 5)");
    const out = distractors(k);
    expect(out[0]).toBe("(3x - 5)^{2}");
    expect(out).toContain("(3x + 5)^{2}");
    expect(out).toContain("(3x + 25)(3x - 25)");
    expect(out).toContain("(9x + 5)(9x - 5)");
  });

  it("4x^2 - 12x + 9: offers the wrong sign and a difference of squares", () => {
    const k = { ...base, square: true, a: 2, b: -3 };
    expect(answerLatex(k)).toBe("(2x - 3)^{2}");
    const out = distractors(k);
    expect(out[0]).toBe("(2x + 3)^{2}");
    expect(out).toContain("(2x + 3)(2x - 3)");
  });
});
