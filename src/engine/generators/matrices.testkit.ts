// Test-only helpers for the Counting and Matrices Topics: read the BAKED
// prompt and Answer strings back into numbers and matrices, so property tests
// check what prints, with arithmetic of their own (not the generators').

import katex from "katex";
import { expect } from "vitest";
import { proseSegments } from "../format";
import { evalLatex } from "./latexEval.testkit";

/** "30\mathord{,}240" -> 30240 */
export function readCount(latex: string): number {
  expect(latex).toMatch(/^-?\d{1,3}(\\mathord\{,\}\d{3})*$|^-?\d+$/);
  return Number(latex.replace(/\\mathord\{,\}/g, ""));
}

/** One matrix entry: "-3", "\dfrac{1}{2}", "-\dfrac{5}{4}". */
const readEntry = (s: string): number => evalLatex(s.replace(/\\dfrac/g, "\\frac"));

/** Every matrix in the LaTeX, in order, as rows of numbers. */
export function readMatrices(latex: string): number[][][] {
  const out: number[][][] = [];
  for (const m of latex.matchAll(/\\begin\{([bv])matrix\} (.*?) \\end\{\1matrix\}/g)) {
    out.push(m[2].split(" \\\\ ").map((row) => row.split(" & ").map(readEntry)));
  }
  return out;
}

/** The one matrix in the LaTeX, and that it is all there is. */
export function readMatrix(latex: string): number[][] {
  const ms = readMatrices(latex);
  expect(ms, latex).toHaveLength(1);
  return ms[0];
}

export function matMul(a: number[][], b: number[][]): number[][] {
  return a.map((r) => b[0].map((_, j) => r.reduce((s, x, k) => s + x * b[k][j], 0)));
}

/** Leibniz determinant (every permutation), independent of matrixKit's cofactors. */
export function leibnizDet(m: number[][]): number {
  const n = m.length;
  const perms = (xs: number[]): number[][] =>
    xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
  let total = 0;
  for (const p of perms([...Array(n).keys()])) {
    let inversions = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (p[i] > p[j]) inversions++;
    total += (inversions % 2 ? -1 : 1) * p.reduce((prod, c, r) => prod * m[r][c], 1);
  }
  return total + 0;
}

export function expectClose(a: number[][], b: number[][], latex = ""): void {
  expect(a.length, latex).toBe(b.length);
  a.forEach((r, i) => {
    expect(r.length, latex).toBe(b[i].length);
    r.forEach((x, j) => expect(Math.abs(x - b[i][j]), latex).toBeLessThan(1e-9));
  });
}

/** The prompt's prose, joined. */
export const proseOf = (latex: string): string =>
  proseSegments(latex)
    .filter((s) => s.kind === "prose")
    .map((s) => (s as { text: string }).text)
    .join(" ");

/** Every whole number written in the prompt's prose. */
export const proseNumbers = (latex: string): number[] => [...proseOf(latex).matchAll(/\d+/g)].map((m) => Number(m[0]));

/** It renders in KaTeX without errors. */
export function expectKatex(latex: string): void {
  expect(() => katex.renderToString(latex, { throwOnError: true }), latex).not.toThrow();
}

/** No degenerate spellings: "1x", "+ -", "^{1}", "-0", "+ 0". */
export function expectTidy(latex: string): void {
  expect(latex, latex).not.toMatch(/(^|[^0-9.{])1[xyz](?![0-9])/);
  expect(latex, latex).not.toMatch(/[+-] -/);
  expect(latex, latex).not.toMatch(/\^\{1\}/);
  expect(latex, latex).not.toMatch(/(^|[^0-9])-0(?![.\d])/);
  expect(latex, latex).not.toMatch(/[+-] 0(?![.\d])/);
}
