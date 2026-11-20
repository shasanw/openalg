import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, distractors, generator } from "./determinants";
import { fromInts } from "./matrixKit";
import { evalLatex } from "./latexEval.testkit";
import { expectKatex, expectTidy, leibnizDet, readMatrices } from "./matrices.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  size: fc.constantFrom("2", "3", "mixed"),
  maxEntry: fc.integer({ min: 3, max: 12 }),
  allowNegatives: fc.boolean(),
});

describe("determinants: answers", () => {
  it("the Answer is the determinant of the printed matrix, by the Leibniz formula", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.prompt).toMatch(/^\\begin\{vmatrix\}.*\\end\{vmatrix\}$/);
        const [m] = readMatrices(p.prompt);
        expect(evalLatex(p.answer)).toBe(leibnizDet(m));
      }),
    );
  });

  it("prints tidy LaTeX that renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(s);
        expectKatex(p.prompt);
      }),
    );
  });
});

describe("determinants: Topic Options", () => {
  it("prints the size asked for, entries up to Largest entry, negatives only when allowed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const { m } = construct(params, createRng(seed));
        if (params.size !== "mixed") expect(m.length).toBe(Number(params.size));
        for (const x of m.flat()) {
          expect(Math.abs(x.n)).toBeLessThanOrEqual(params.maxEntry);
          if (!params.allowNegatives) expect(x.n).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it("rarely has a zero determinant", () => {
    const zeros = Array.from({ length: 200 }, (_, s) => generator.generate({}, s)).filter((p) => p.answer === "0");
    expect(zeros.length).toBeLessThan(20);
  });
});

describe("determinants: distractors", () => {
  it("are distinct whole numbers, never the Answer, and at least one", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(1);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) expect(d).toMatch(/^-?\d+$/);
      }),
    );
  });

  it("model adding the diagonals and dropping the cofactor signs", () => {
    // |3 2; 1 4| = 10; 3*4 + 2*1 = 14; 2*1 - 3*4 = -10
    expect(distractors({ m: fromInts([[3, 2], [1, 4]]) }).slice(0, 2)).toEqual(["14", "-10"]);
    // |1 2 3; 0 1 4; 5 6 0| = 1; without the alternating sign: 1(-24) + 2(-20) + 3(-5) = -79
    const m3 = fromInts([
      [1, 2, 3],
      [0, 1, 4],
      [5, 6, 0],
    ]);
    expect(distractors({ m: m3 })[0]).toBe("-79");
  });
});

describe("determinants: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const size of ["2", "3"]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ size }, s).prompt));
      expect(prompts.size, size).toBeGreaterThan(190);
    }
  });
});
