import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import * as M from "./multiplyingRationals";
import * as D from "./dividingRationals";
import { isInt, rat, ratValue } from "./equationKit";
import type { RationalStyle } from "./rationalKit";
import { answerNumber, evalArithmetic, expectClose } from "./arithmeticEval.testkit";
import { close } from "./latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const STYLES: RationalStyle[] = ["integer", "fraction", "mixed", "decimal"];
const common = {
  numbers: fc.constantFrom(...STYLES),
  allowNegatives: fc.boolean(),
  maxWhole: fc.integer({ min: 2, max: 20 }),
  answerForm: fc.constantFrom("auto", "improper", "mixed"),
};
const productParams = fc.record({ ...common, factors: fc.integer({ min: 2, max: 3 }) });
const quotientParams = fc.record(common);

const topics = [
  { name: "multiplying-rationals", g: M.generator, params: productParams as fc.Arbitrary<Record<string, unknown>> },
  { name: "dividing-rationals", g: D.generator, params: quotientParams as fc.Arbitrary<Record<string, unknown>> },
];

for (const { name, g, params: anyParams } of topics) {
  describe(`${name}: shared properties`, () => {
    it("the Answer is the value of the printed expression, for any seed and options", () => {
      fc.assert(
        fc.property(anySeed, anyParams, (seed, params) => {
          const p = g.generate(params as never, seed);
          expectClose(answerNumber(p.answer), evalArithmetic(p.prompt), `${p.prompt} = ${p.answer}`);
        }),
      );
    });

    it("prints no negative numbers when negatives are off", () => {
      fc.assert(
        fc.property(anySeed, anyParams, (seed, params) => {
          const p = g.generate({ ...(params as object), allowNegatives: false } as never, seed);
          expect(p.prompt + p.answer).not.toContain("-");
        }),
      );
    });

    it("prints the chosen kind of number", () => {
      fc.assert(
        fc.property(anySeed, anyParams, (seed, params) => {
          const p = g.generate(params as never, seed);
          const numbers = (params as { numbers: RationalStyle }).numbers;
          if (numbers === "integer" || numbers === "decimal") expect(p.prompt + p.answer).not.toContain("\\frac");
          if (numbers === "integer") expect(p.prompt + p.answer).not.toContain(".");
          if (numbers === "integer") expect(Number.isInteger(answerNumber(p.answer))).toBe(true);
          if (numbers === "mixed") expect(p.prompt).toMatch(/\d\\frac/);
        }),
      );
    });

    it("Distractors are distinct in value, never the Answer, and the same kind of number", () => {
      fc.assert(
        fc.property(anySeed, anyParams, (seed, params) => {
          const p = g.generate(params as never, seed);
          const numbers = (params as { numbers: RationalStyle }).numbers;
          const values = p.distractorHints.map(answerNumber);
          for (const v of values) expect(close(v, answerNumber(p.answer))).toBe(false);
          expect(new Set(values.map((v) => v.toFixed(9))).size).toBe(values.length);
          if (numbers === "integer") for (const v of values) expect(Number.isInteger(v)).toBe(true);
          if (numbers === "decimal") for (const d of p.distractorHints) expect(d).not.toContain("\\frac");
          if (numbers === "fraction") for (const v of values) expect(Number.isInteger(v)).toBe(false);
        }),
      );
    });

    it("offers at least two mistakes for every Problem at the default options, for every kind of number", () => {
      for (const numbers of STYLES) {
        for (let s = 0; s < 200; s++) expect(g.generate({ numbers }, s).distractorHints.length, numbers).toBeGreaterThanOrEqual(2);
      }
    });

    it("is deterministic and varied", () => {
      fc.assert(
        fc.property(anySeed, anyParams, (seed, params) => {
          expect(g.generate(params as never, seed)).toEqual(g.generate(params as never, seed));
        }),
      );
      for (const numbers of STYLES) {
        const prompts = new Set(Array.from({ length: 200 }, (_, s) => g.generate({ numbers }, s).prompt));
        expect(prompts.size, numbers).toBeGreaterThan(100);
      }
    });
  });
}

describe("multiplying-rationals", () => {
  it("uses the requested number of factors, each the chosen kind of number", () => {
    fc.assert(
      fc.property(anySeed, productParams, (seed, params) => {
        const k = M.construct(params, createRng(seed));
        expect(k.factors).toHaveLength(params.factors);
        for (const f of k.factors) {
          if (params.numbers === "fraction") expect(Math.abs(ratValue(f))).toBeLessThan(1);
          if (params.numbers === "mixed") expect(Math.abs(ratValue(f))).toBeGreaterThan(1);
          if (params.numbers === "integer") expect(Math.abs(f.n)).toBeGreaterThanOrEqual(2);
        }
      }),
    );
  });

  it("models the real mistakes", () => {
    const k = { style: "fraction" as const, form: "improper" as const, factors: [rat(-2, 3), rat(3, 4)], answer: rat(-1, 2) };
    const hints = M.distractors(k);
    expect(hints[0]).toBe("\\frac{1}{2}");
    // flipped the second fraction (divided instead)
    expect(hints).toContain("-\\frac{8}{9}");
    // no negative numbers on the sheet: no negative choices either
    for (const d of M.distractors({ ...k, factors: [rat(2, 3), rat(3, 4)], answer: rat(1, 2) }, false)) expect(d).not.toContain("-");
    // 2\frac{1}{2} \cdot 1\frac{1}{3}: wholes and parts separately, 2 + \frac{1}{6}
    const mixed = M.distractors({ style: "mixed", form: "mixed", factors: [rat(5, 2), rat(4, 3)], answer: rat(10, 3) });
    expect(mixed[0]).toBe("2\\frac{1}{6}");
  });
});

describe("dividing-rationals", () => {
  it("models the real mistakes: not flipping, flipping the wrong fraction, flipping both", () => {
    // \frac{2}{3} \div \frac{4}{5} = \frac{5}{6}
    const k = { style: "fraction" as const, form: "improper" as const, dividend: rat(2, 3), divisor: rat(4, 5), answer: rat(5, 6) };
    const hints = D.distractors(k);
    expect(hints.slice(0, 2)).toEqual(["\\frac{8}{15}", "\\frac{6}{5}"]);
    expect(hints).toContain("\\frac{15}{8}");
  });

  it("never asks for a quotient of 1 or -1", () => {
    fc.assert(
      fc.property(anySeed, quotientParams, (seed, params) => {
        const k = D.construct(params, createRng(seed));
        expect(Math.abs(ratValue(k.answer))).not.toBe(1);
      }),
    );
  });

  it("integer quotients are whole numbers", () => {
    fc.assert(
      fc.property(anySeed, quotientParams, (seed, params) => {
        const k = D.construct({ ...params, numbers: "integer" }, createRng(seed));
        expect(isInt(k.answer)).toBe(true);
        expect(isInt(k.dividend)).toBe(true);
      }),
    );
  });
});
