import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, distractors, generator, type Operations } from "./addingSubtractingRationals";
import { isInt, rat, ratValue } from "./equationKit";
import type { RationalStyle } from "./rationalKit";
import { answerNumber, evalArithmetic, expectClose } from "./arithmeticEval.testkit";
import { close } from "./latexEval.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const STYLES: RationalStyle[] = ["integer", "fraction", "mixed", "decimal"];
const anyParams = fc.record({
  numbers: fc.constantFrom(...STYLES),
  operations: fc.constantFrom<Operations>("both", "add", "subtract"),
  terms: fc.integer({ min: 2, max: 4 }),
  allowNegatives: fc.boolean(),
  maxWhole: fc.integer({ min: 2, max: 20 }),
  answerForm: fc.constantFrom("auto", "improper", "mixed"),
});

describe("adding-subtracting-rationals: answers", () => {
  it("the Answer is the value of the printed expression, for any seed and options", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expectClose(answerNumber(p.answer), evalArithmetic(p.prompt), `${p.prompt} = ${p.answer}`);
      }),
    );
  });

  it("prints nothing degenerate: no zero operands, no doubled signs", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        for (const t of k.terms) expect(t.n).not.toBe(0);
        expect(k.answer.n).not.toBe(0);
        const p = generator.generate(params, seed);
        expect(p.prompt).not.toMatch(/[+-] [+-]|--|\+-|-\+/);
      }),
    );
  });
});

describe("adding-subtracting-rationals: Topic Options", () => {
  it("uses the requested number of terms and operations", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        expect(k.terms).toHaveLength(params.terms);
        if (params.operations === "add") expect(k.ops.every((o) => o === "+")).toBe(true);
        if (params.operations === "subtract") expect(k.ops.every((o) => o === "-")).toBe(true);
      }),
    );
  });

  it("prints the chosen kind of number", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        const p = generator.generate(params, seed);
        for (const t of k.terms) {
          const v = Math.abs(ratValue(t));
          if (params.numbers === "integer") expect(isInt(t)).toBe(true);
          if (params.numbers === "fraction") expect(isInt(t)).toBe(false);
          if (params.numbers === "mixed") expect(!isInt(t) && v > 1).toBe(true);
        }
        // fractions are proper, but for (rarely) the one computed number when the options leave little room
        if (params.numbers === "fraction") {
          expect(k.terms.filter((t) => Math.abs(ratValue(t)) > 1).length).toBeLessThanOrEqual(1);
        }
        if (params.numbers === "integer" || params.numbers === "decimal") {
          expect(p.prompt + p.answer).not.toContain("\\frac");
        }
        if (params.numbers === "integer") expect(p.prompt + p.answer).not.toContain(".");
      }),
    );
  });

  it("prints no negative numbers, and never goes below zero, when negatives are off", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, allowNegatives: false }, seed);
        expect(p.prompt).not.toMatch(/(^|\()-/);
        expect(p.answer).not.toContain("-");
      }),
    );
  });

  it("writes fraction Answers in the chosen form", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const mixed = generator.generate({ ...params, numbers: "fraction", answerForm: "mixed" }, seed);
        const improper = generator.generate({ ...params, numbers: "mixed", answerForm: "improper" }, seed);
        if (Math.abs(answerNumber(mixed.answer)) > 1 && !Number.isInteger(answerNumber(mixed.answer))) {
          expect(mixed.answer).toMatch(/\d\\frac/);
        }
        expect(improper.answer).not.toMatch(/\d\\frac/);
        // "auto" follows the numbers: mixed numbers give mixed Answers
        const auto = generator.generate({ ...params, numbers: "mixed", answerForm: "auto" }, seed);
        if (Math.abs(answerNumber(auto.answer)) > 1 && !Number.isInteger(answerNumber(auto.answer))) {
          expect(auto.answer).toMatch(/\d\\frac/);
        }
      }),
    );
  });
});

describe("adding-subtracting-rationals: Distractors", () => {
  it("are distinct in value, never the Answer, and the same kind of number", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const values = p.distractorHints.map(answerNumber);
        for (const v of values) expect(close(v, answerNumber(p.answer))).toBe(false);
        expect(new Set(values.map((v) => v.toFixed(9))).size).toBe(values.length);
        if (params.numbers === "integer") for (const v of values) expect(Number.isInteger(v)).toBe(true);
        if (params.numbers === "decimal") for (const d of p.distractorHints) expect(d).not.toContain("\\frac");
      }),
    );
  });

  it("offer at least two mistakes for every Problem at the default options, for every kind of number", () => {
    // (corner options such as positive whole numbers up to 2 can leave no
    // modelled mistake; multiple choice then tops up with near misses)
    for (const numbers of STYLES) {
      for (let s = 0; s < 200; s++) expect(generator.generate({ numbers }, s).distractorHints.length, numbers).toBeGreaterThanOrEqual(2);
    }
  });

  it("model the real mistakes", () => {
    const base = { style: "fraction" as const, form: "improper" as const };
    // \frac{1}{2} + \frac{1}{3}: across gives \frac{2}{5}, unscaled numerators \frac{2}{6} = \frac{1}{3}
    const sum = distractors({ ...base, terms: [rat(1, 2), rat(1, 3)], ops: ["+"], answer: rat(5, 6) }, false);
    expect(sum).toContain("\\frac{2}{5}");
    // no negative numbers on the sheet: no negative choices either
    for (const d of sum) expect(d).not.toContain("-");
    // 3 - (-4) worked as 3 - 4
    const ints = distractors({ style: "integer", form: "improper", terms: [rat(3), rat(-4)], ops: ["-"], answer: rat(7) });
    expect(ints[0]).toBe("-1");
    // -2\frac{1}{3} + 4\frac{1}{2} read as -2 + \frac{1}{3} + 4\frac{1}{2} = 2\frac{5}{6}
    const mixed = distractors({ style: "mixed", form: "mixed", terms: [rat(-7, 3), rat(9, 2)], ops: ["+"], answer: rat(13, 6) });
    expect(mixed).toContain("2\\frac{5}{6}");
    // 2.35 + 4.1 lined up on the right: 2.35 + 0.41
    const dec = distractors({ style: "decimal", form: "improper", terms: [rat(235, 100), rat(41, 10)], ops: ["+"], answer: rat(645, 100) });
    expect(dec[0]).toBe("2.76");
  });
});

describe("adding-subtracting-rationals: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const numbers of STYLES) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ numbers }, s).prompt));
      expect(prompts.size, numbers).toBeGreaterThan(120);
    }
  });
});
