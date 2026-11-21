// Shared pieces for the Precalculus Sequences and Series Topics: exact
// sequence arithmetic (powers of rationals, arithmetic and geometric terms and
// sums), and the LaTeX they print (term lists, series, explicit rules,
// subscripts). Nothing here solves anything: each generator chooses the
// sequence first (its first term and difference or ratio) and only evaluates
// it forwards to print the Problem and its Answer.
//
// LaTeX kept to constructs checked against both KaTeX and mitex 0.2.7:
// subscripts a_{n-1}, \ldots, \cdots, \sum_{k=1}^{n}, \infty, \cdot,
// \left( \right), \frac, \text{}, \quad, \underline{\qquad}. A negative number
// is never printed straight after \text{...} (Typst would space its minus as
// a binary operator; see lines.ts).

import {
  add,
  div,
  isInt,
  linearLatex,
  mul,
  numLatex,
  rat,
  ratValue,
  sub,
  type Rat,
} from "../shared/equationKit";

export {
  add,
  distinctHints,
  div,
  isInt,
  isZero,
  linearLatex,
  mul,
  neg,
  numLatex,
  rat,
  ratEq,
  ratValue,
  sub,
  type Rat,
} from "../shared/equationKit";

// ------------------------------------------------------------------ arithmetic

/** r^e for a whole-number exponent e >= 0. */
export function pow(r: Rat, e: number): Rat {
  let out = rat(1);
  for (let i = 0; i < e; i++) out = mul(out, r);
  return out;
}

/** a_k = a_1 + (k - 1)d */
export const arithmeticTerm = (a1: Rat, d: Rat, k: number): Rat => add(a1, mul(rat(k - 1), d));

/** a_k = a_1 r^(k - 1) */
export const geometricTerm = (a1: Rat, r: Rat, k: number): Rat => mul(a1, pow(r, k - 1));

/** S_n = n(a_1 + a_n)/2 */
export const arithmeticSum = (a1: Rat, d: Rat, n: number): Rat =>
  div(mul(rat(n), add(a1, arithmeticTerm(a1, d, n))), rat(2))!;

/** S_n = a_1 (1 - r^n)/(1 - r), or n a_1 when r = 1. */
export function geometricSum(a1: Rat, r: Rat, n: number): Rat {
  if (r.n === r.d) return mul(rat(n), a1);
  return div(mul(a1, sub(rat(1), pow(r, n))), sub(rat(1), r))!;
}

/** The size of a number for "keep it modest" checks: max(|n|, d). */
export const size = (r: Rat): number => Math.max(Math.abs(r.n), r.d);

/** A fraction with a denominator a student can work with, or an integer. */
export const tidy = (r: Rat, maxSize = 999): boolean => size(r) <= maxSize;

/** Whether r is a whole number when integers are required. */
export const fitsMode = (r: Rat, integersOnly: boolean): boolean => !integersOnly || isInt(r);

// ------------------------------------------------------------------ rendering

/** "a_{12}": the term with a given index, always braced. */
export const termName = (k: number | string, letter = "a"): string => `${letter}_{${k}}`;

/** "5, 8, 11, 14": a list of numbers in order (an Answer or a Distractor). */
export const listLatex = (values: Rat[]): string => values.map((v) => numLatex(v)).join(", ");

/** "5, 8, 11, 14, \ldots": the opening terms of an infinite sequence. */
export const openingTermsLatex = (values: Rat[]): string => `${listLatex(values)}, \\ldots`;

/** A term joined into a sum: " + 3", " - \frac{1}{2}". */
function joined(v: Rat): string {
  const negative = v.n < 0;
  return ` ${negative ? "-" : "+"} ${numLatex(rat(Math.abs(v.n), v.d))}`;
}

/**
 * A series written out: "3 + 7 + 11 + \cdots" (infinite, `last` omitted) or
 * "3 + 7 + 11 + \cdots + 79" (finite). Negative terms print as subtraction:
 * "12 - 6 + 3 - \cdots".
 */
export function seriesLatex(opening: Rat[], last?: Rat): string {
  const [first, ...rest] = opening;
  const s = numLatex(first) + rest.map(joined).join("") + " + \\cdots";
  return last ? s + joined(last) : s;
}

/**
 * The power r^{e} as a factor: "2^{n-1}", "(-2)^{n-1}",
 * "\left(\frac{1}{2}\right)^{n-1}", "\left(-\frac{2}{3}\right)^{n-1}".
 */
export function powerLatex(r: Rat, exponent: string): string {
  const base = numLatex(r);
  if (isInt(r)) return r.n < 0 ? `(${base})^{${exponent}}` : `${base}^{${exponent}}`;
  return `\\left(${base}\\right)^{${exponent}}`;
}

/**
 * c r^{e} as an expression: "3 \cdot 2^{n-1}", "3(-2)^{n-1}",
 * "48\left(\frac{1}{2}\right)^{n-1}", "2^{n-1}" (c = 1), "-2^{n-1}" (c = -1,
 * read as -(2^{n-1})).
 */
export function geometricLatex(c: Rat, r: Rat, exponent: string): string {
  const power = powerLatex(r, exponent);
  if (c.n === c.d) return power;
  if (c.n === -c.d) return `-${power}`;
  const coef = numLatex(c);
  return power.startsWith("(") || power.startsWith("\\left") ? `${coef}${power}` : `${coef} \\cdot ${power}`;
}

/** "a_n = 3n + 2": an arithmetic sequence's explicit rule, simplified. */
export function arithmeticRuleLatex(a1: Rat, d: Rat, v = "n"): string {
  return `a_n = ${linearLatex(
    [
      { coef: d, v },
      { coef: sub(a1, d), v: "" },
    ],
  )}`;
}

/** "a_n = 3 \cdot 2^{n-1}": a geometric sequence's explicit rule. */
export function geometricRuleLatex(a1: Rat, r: Rat): string {
  return `a_n = ${geometricLatex(a1, r, "n-1")}`;
}

/** "\sum_{k=1}^{20}" or "\sum_{k=1}^{\infty}". */
export function sigmaLatex(from: number, to: number | "infinity", index = "k"): string {
  return `\\sum_{${index}=${from}}^{${to === "infinity" ? "\\infty" : to}}`;
}

/** A blank for a missing term, as in "4, \underline{\qquad}, 24". */
export const BLANK = "\\underline{\\qquad}";

/** The decimal value, for comparisons in tests and bounds. */
export const value = ratValue;
