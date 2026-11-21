import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { construct, distractors, generator, UNDEFINED } from "./matrixOperations";
import { fromInts } from "./matrixKit";
import { expectClose, expectKatex, expectTidy, matMul, readMatrices, readMatrix } from "../shared/matrices.testkit";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const anyParams = fc.record({
  operation: fc.constantFrom("addSubtract", "scalar", "combination", "multiply", "mixed"),
  maxDimension: fc.integer({ min: 2, max: 3 }),
  allowNegatives: fc.boolean(),
  includeUndefined: fc.boolean(),
});

/** Read "s A op t B" (or "s A", or "A B") from the prompt and evaluate it independently; null when undefined. */
function evaluatePrompt(prompt: string): number[][] | null {
  const [A, B] = readMatrices(prompt);
  const parts = prompt.split(/\\begin\{bmatrix\}.*?\\end\{bmatrix\}/);
  // parts: [s, " op t", ""] or [s, ""]
  const scalar = (s: string) => (s === "" ? 1 : s === "-" ? -1 : Number(s));
  const s1 = scalar(parts[0]);
  if (!B) return A.map((r) => r.map((x) => s1 * x));
  if (parts[1] === "") {
    if (A[0].length !== B.length) return null;
    return matMul(A, B);
  }
  const m = parts[1].match(/^ ([+-]) (-?\d*)$/)!;
  const s2 = (m[1] === "-" ? -1 : 1) * scalar(m[2]);
  if (A.length !== B.length || A[0].length !== B[0].length) return null;
  return A.map((r, i) => r.map((x, j) => s1 * x + s2 * B[i][j]));
}

describe("matrix-operations: answers", () => {
  it("the Answer is the printed expression, evaluated independently (or undefined when the shapes do not fit)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        const want = evaluatePrompt(p.prompt);
        if (want === null) expect(p.answer).toBe(UNDEFINED);
        else expectClose(readMatrix(p.answer), want, p.prompt);
      }),
    );
  });

  it("prints tidy LaTeX that renders in KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const s of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(s);
        expectKatex(p.prompt);
        expectKatex(p.answer);
      }),
    );
  });
});

describe("matrix-operations: Topic Options", () => {
  it("does the operation asked for, within the largest dimension, keeping a product's pair narrow", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const k = construct(params, createRng(seed));
        if (params.operation !== "mixed") expect(k.operation).toBe(params.operation);
        for (const m of [k.a, k.b].filter((m) => m !== undefined)) {
          expect(m.length).toBeLessThanOrEqual(params.maxDimension);
          expect(m[0].length).toBeLessThanOrEqual(params.maxDimension);
          expect(m.length * m[0].length, "no 1 by 1 matrices").toBeGreaterThan(1);
          if (!params.allowNegatives) for (const x of m.flat()) expect(x.n).toBeGreaterThanOrEqual(0);
        }
        if (k.operation === "multiply") expect(k.a[0].length + k.b![0].length).toBeLessThanOrEqual(5);
      }),
    );
  });

  it("is undefined only when allowed, and then now and then", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate({ ...params, includeUndefined: false }, seed);
        expect(p.answer).not.toBe(UNDEFINED);
      }),
    );
    const undefinedOnes = Array.from({ length: 200 }, (_, s) => generator.generate({ includeUndefined: true }, s)).filter(
      (p) => p.answer === UNDEFINED,
    );
    expect(undefinedOnes.length).toBeGreaterThan(10);
    expect(undefinedOnes.length).toBeLessThan(80);
  });
});

describe("matrix-operations: distractors", () => {
  it("are distinct matrices, never the Answer, and at least one", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(1);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        expect(p.distractorHints).not.toContain(p.answer);
        for (const d of p.distractorHints) readMatrix(d);
      }),
    );
  });

  it("model the order of a product and forgetting a scalar", () => {
    const a = fromInts([
      [1, 2],
      [3, 4],
    ]);
    const b = fromInts([
      [0, 1],
      [1, 0],
    ]);
    // AB = [2 1; 4 3]; BA = [3 4; 1 2]
    const product = distractors({ operation: "multiply", a, b, s1: 1, s2: 1 });
    expect(product[0]).toBe("\\begin{bmatrix} 3 & 4 \\\\ 1 & 2 \\end{bmatrix}");
    // 2A - 3B = [2 1; 3 8]; 2A - B = [2 3; 5 8]
    const combo = distractors({ operation: "combination", a, b, s1: 2, s2: -3 });
    expect(combo[0]).toBe("\\begin{bmatrix} 2 & 3 \\\\ 5 & 8 \\end{bmatrix}");
  });
});

describe("matrix-operations: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("has enough variety for a 20-Problem Section without repeats", () => {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => generator.generate({}, s).prompt));
    expect(prompts.size).toBeGreaterThan(190);
  });
});
