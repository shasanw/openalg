// Shared pieces of the Matrices and Systems Topics: exact rational matrices,
// their arithmetic, determinants by cofactor expansion, and how they print.
//
// Matrices print as LaTeX `bmatrix` (determinants as `vmatrix`). The Typst
// layout sets any equation holding one at display size and on a line tall
// enough for it (see mathRun in ../typst), and KaTeX draws them natively.
// Topics keep their matrices small (at most 3 by 3, short entries) so a
// Problem fits in its column.

import type { Rng } from "../rng";
import { add, mul, numLatex, rat, ratEq, sub, type Rat } from "./equationKit";

export type Matrix = Rat[][];

/** A matrix of whole numbers. */
export const fromInts = (rows: readonly (readonly number[])[]): Matrix => rows.map((r) => r.map((v) => rat(v)));

export const rows = (m: Matrix): number => m.length;
export const cols = (m: Matrix): number => m[0].length;
export const sameShape = (a: Matrix, b: Matrix): boolean => rows(a) === rows(b) && cols(a) === cols(b);

export const mapEntries = (m: Matrix, f: (x: Rat, i: number, j: number) => Rat): Matrix =>
  m.map((r, i) => r.map((x, j) => f(x, i, j)));

export const madd = (a: Matrix, b: Matrix): Matrix => mapEntries(a, (x, i, j) => add(x, b[i][j]));
export const msub = (a: Matrix, b: Matrix): Matrix => mapEntries(a, (x, i, j) => sub(x, b[i][j]));
export const mscale = (k: Rat, m: Matrix): Matrix => mapEntries(m, (x) => mul(k, x));
export const transpose = (m: Matrix): Matrix => m[0].map((_, j) => m.map((r) => r[j]));
/** Entry-by-entry product (a classic slip for the matrix product). */
export const hadamard = (a: Matrix, b: Matrix): Matrix => mapEntries(a, (x, i, j) => mul(x, b[i][j]));

/** The matrix product AB, or null when A's columns do not match B's rows. */
export function mmul(a: Matrix, b: Matrix): Matrix | null {
  if (cols(a) !== rows(b)) return null;
  return a.map((r) => b[0].map((_, j) => r.reduce((s, x, k) => add(s, mul(x, b[k][j])), rat(0))));
}

export const identity = (n: number): Matrix =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => rat(i === j ? 1 : 0)));

export const matrixEq = (a: Matrix, b: Matrix): boolean =>
  sameShape(a, b) && a.every((r, i) => r.every((x, j) => ratEq(x, b[i][j])));

/** The matrix with row i and column j removed. */
export const minorMatrix = (m: Matrix, i: number, j: number): Matrix =>
  m.filter((_, r) => r !== i).map((row) => row.filter((_, c) => c !== j));

/** The determinant of a square matrix, by cofactor expansion along the first row. */
export function det(m: Matrix): Rat {
  if (m.length === 1) return m[0][0];
  return m[0].reduce((s, x, j) => {
    const term = mul(x, det(minorMatrix(m, 0, j)));
    return j % 2 === 0 ? add(s, term) : sub(s, term);
  }, rat(0));
}

/** The matrix of minors (each entry's minor determinant, no signs). */
export const minors = (m: Matrix): Matrix => mapEntries(m, (_, i, j) => det(minorMatrix(m, i, j)));

/** The cofactor matrix: minors with the checkerboard of signs. */
export const cofactors = (m: Matrix): Matrix =>
  mapEntries(minors(m), (x, i, j) => ((i + j) % 2 === 0 ? x : mul(rat(-1), x)));

/** The adjugate: the transposed cofactor matrix. */
export const adjugate = (m: Matrix): Matrix => transpose(cofactors(m));

/** adj(A) / det(A), or null when A is singular. Used to model slips and check Answers. */
export function inverse(m: Matrix): Matrix | null {
  const d = det(m);
  if (d.n === 0) return null;
  return mscale(rat(d.d, d.n), adjugate(m));
}

/** The largest |numerator| or denominator among the entries. */
export const maxEntrySize = (m: Matrix): number =>
  Math.max(...m.flat().map((x) => Math.max(Math.abs(x.n), x.d)));

export const isIntMatrix = (m: Matrix): boolean => m.flat().every((x) => x.d === 1);

// ------------------------------------------------------------------ printing

/**
 * A matrix in LaTeX: "\begin{bmatrix} 1 & -2 \\ 3 & 4 \end{bmatrix}", or with
 * `bars` a determinant's vertical bars (vmatrix). Fraction entries are
 * \dfrac, full size as in print (a matrix's cells otherwise shrink them).
 */
export function matrixLatex(m: Matrix, { bars = false }: { bars?: boolean } = {}): string {
  const env = bars ? "vmatrix" : "bmatrix";
  const body = m.map((r) => r.map((x) => numLatex(x).replace("\\frac", "\\dfrac")).join(" & ")).join(" \\\\ ");
  return `\\begin{${env}} ${body} \\end{${env}}`;
}

/** A scalar written in front of a matrix: "2", "-3", "" for 1, "-" for -1. */
export function scalarLatex(k: number): string {
  if (k === 1) return "";
  if (k === -1) return "-";
  return String(k);
}

// ------------------------------------------------------------------ choosing

/** A whole number in [-max, max] (or [0, max] without negatives), mostly nonzero. */
export function entry(rng: Rng, max: number, allowNegative: boolean): number {
  const v = rng.int(rng.bool(0.85) ? 1 : 0, max);
  return allowNegative && rng.bool() ? -v + 0 : v;
}

/** An r-by-c matrix of whole-number entries. */
export const randomMatrix = (rng: Rng, r: number, c: number, max: number, allowNegative: boolean): Matrix =>
  Array.from({ length: r }, () => Array.from({ length: c }, () => rat(entry(rng, max, allowNegative))));
