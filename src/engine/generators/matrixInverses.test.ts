import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { construct, distractors, generator, MAX_ENTRY, NO_INVERSE } from "./matrixInverses";
import { fromInts } from "./matrixKit";
import { expectClose, expectKatex, expectTidy, leibnizDet, matMul, readMatrix } from "./matrices.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  size: fc.constantFrom("2", "3", "mixed"),
  entries: fc.constantFrom("integer", "fractions", "mixed"),
  includeSingular: fc.boolean(),
});

const identity = (n: number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

describe("matrix-inverses: answers", () => {
  it("the printed matrix times the Answer is the identity, both ways; no inverse exactly when the determinant is 0", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const a = readMatrix(p.prompt);
        if (p.answer === NO_INVERSE) {
          expect(leibnizDet(a)).toBe(0);
          return;
        }
        const inv = readMatrix(p.answer);
        expectClose(matMul(a, inv), identity(a.length), p.prompt);
        expectClose(matMul(inv, a), identity(a.length), p.prompt);
      }),
    );
  });

  it("prints tidy LaTeX that renders in KaTeX, with full-size fractions", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) {
          expectTidy(s);
          expect(s).not.toMatch(/\\frac/);
        }
        expectKatex(p.prompt);
        expectKatex(p.answer);
      }),
    );
  });
});

describe("matrix-inverses: Topic Options", () => {
  it("gives the size asked for, small entries, whole-number or fraction inverses as asked", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.size !== "mixed") expect(k.m.length).toBe(Number(params.size));
        for (const x of k.m.flat()) expect(Math.abs(x.n)).toBeLessThanOrEqual(MAX_ENTRY);
        if (!params.includeSingular) expect(k.inv).not.toBeNull();
        if (!k.inv) return;
        for (const x of k.inv.flat()) expect(Math.max(Math.abs(x.n), x.d)).toBeLessThanOrEqual(MAX_ENTRY);
        const whole = k.inv.flat().every((x) => x.d === 1);
        if (k.m.length === 3 || params.entries === "integer") expect(whole).toBe(true);
        if (k.m.length === 2 && params.entries === "fractions") expect(whole).toBe(false);
      }),
    );
  });

  it("includes matrices with no inverse now and then, when allowed", () => {
    const singular = Array.from({ length: 200 }, (_, s) => generator.generate({ includeSingular: true }, s)).filter(
      (p) => p.answer === NO_INVERSE,
    );
    expect(singular.length).toBeGreaterThan(15);
    expect(singular.length).toBeLessThan(70);
  });
});

describe("matrix-inverses: distractors", () => {
  it("are distinct matrices, never the Answer, and at least two", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(2);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) readMatrix(d);
      }),
    );
  });

  it("model forgetting to divide by the determinant and swapping the wrong pair", () => {
    // [4 7; 2 6]: D = 10, inverse (1/10)[6 -7; -2 4]
    const m = fromInts([
      [4, 7],
      [2, 6],
    ]);
    const [undivided, wrongSwap] = distractors({ m, inv: null });
    expect(undivided).toBe("\\begin{bmatrix} 6 & -7 \\\\ -2 & 4 \\end{bmatrix}");
    expect(wrongSwap).toBe("\\begin{bmatrix} \\dfrac{2}{5} & -\\dfrac{7}{10} \\\\ -\\dfrac{1}{5} & \\dfrac{3}{5} \\end{bmatrix}");
  });
});

describe("matrix-inverses: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    for (const [size, entries] of [
      ["2", "integer"],
      ["2", "fractions"],
      ["3", "mixed"],
    ]) {
      const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({ size, entries }, s).prompt));
      expect(prompts.size, `${size} ${entries}`).toBeGreaterThan(100);
    }
  });
});
