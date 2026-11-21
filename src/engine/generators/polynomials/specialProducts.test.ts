import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, schema } from "./specialProducts";
import { mono, mul } from "./polyKit";
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

describe("special-products: answers", () => {
  it("the Answer equals the printed product", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expect(sameValue(p.prompt, p.answer), `${p.prompt} = ${p.answer}`).toBe(true);
      }),
    );
  });

  it("a square has three terms, a sum times a difference two", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const k = construct(ps, createRng(seed));
        expect(k.answer.length).toBe(k.square ? 3 : 2);
        if (ps.product === "square") expect(k.square).toBe(true);
        if (ps.product === "sumDifference") expect(k.square).toBe(false);
        expect(k.a).toBeLessThanOrEqual(ps.maxLeading as number);
        expect(Math.abs(k.b)).toBeLessThanOrEqual(ps.maxConstant as number);
        expect(k.b).not.toBe(0);
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

describe("special-products: distractors", () => {
  it("are distinct, never the Answer, and wrong in value", () => {
    fc.assert(
      fc.property(anySeed, params, (seed, ps) => {
        const p = generator.generate(ps, seed);
        expectGoodHints(p, 4);
        expectHintsWrongInValue(p);
      }),
    );
  });

  const at = (square: boolean, a: number, b: number) => {
    const bin = [mono(a, 1), mono(b)];
    const answer = square ? mul(bin, bin) : mul(bin, [mono(a, 1), mono(-b)]);
    return { square, vars: ["x", "y"] as [string, string], a, b, two: false, answer };
  };

  it("(x - 4)^2: leads with x^2 + 16, then x^2 - 4x + 16 and x^2 - 8x - 16", () => {
    const out = distractors(at(true, 1, -4));
    expect(out[0]).toBe("x^{2} + 16");
    expect(out).toContain("x^{2} - 4x + 16");
    expect(out).toContain("x^{2} - 8x - 16");
  });

  it("(3x + 2)(3x - 2): offers the sum of squares and forgetting to square 3", () => {
    const out = distractors(at(false, 3, 2));
    expect(out[0]).toBe("9x^{2} + 4");
    expect(out).toContain("3x^{2} - 4");
  });
});
