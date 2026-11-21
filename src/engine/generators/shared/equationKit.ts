// Shared pieces for the Algebra 1 Equations Topics (one-step, two-step,
// multi-step, absolute value): exact rational arithmetic, number and linear
// expression rendering in fraction or decimal style, the variable letter, and
// tidy Distractor lists. Nothing here solves an equation: generators pick the
// Answer first and use these helpers to build and print the Problem around it.

import { fractionToLatex, gcd } from "../../format";
import { choiceKey } from "../../mc";
import type { ParamField } from "../../types";
import type { Rng } from "../../rng";

// ------------------------------------------------------------------ rationals

/** An exact rational n/d in lowest terms with d > 0. */
export interface Rat {
  n: number;
  d: number;
}

export function rat(n: number, d = 1): Rat {
  if (d === 0) throw new Error("rat: zero denominator");
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  // `+ 0` turns -0 into 0 so baked strings never read "-0".
  return { n: n / g + 0, d: d / g };
}

export const add = (a: Rat, b: Rat) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rat, b: Rat) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rat, b: Rat) => rat(a.n * b.n, a.d * b.d);
export const neg = (a: Rat) => rat(-a.n, a.d);
/** a / b, or null when b is zero (a mis-solved equation can divide by zero). */
export const div = (a: Rat, b: Rat): Rat | null => (b.n === 0 ? null : rat(a.n * b.d, a.d * b.n));
export const isInt = (a: Rat) => a.d === 1;
export const isZero = (a: Rat) => a.n === 0;
export const ratEq = (a: Rat, b: Rat) => a.n === b.n && a.d === b.d;
export const ratValue = (a: Rat) => a.n / a.d;
export const abs = (a: Rat) => rat(Math.abs(a.n), a.d);

// ------------------------------------------------------------------ rendering

/** How non-integers print: as fractions, or as terminating decimals. */
export type NumberStyle = "fraction" | "decimal";

/** The decimal digits of r when it terminates within 4 places, else null. */
export function decimalString(r: Rat): string | null {
  for (let places = 0; places <= 4; places++) {
    const scale = 10 ** places;
    if (scale % r.d !== 0) continue;
    const scaled = Math.abs(r.n) * (scale / r.d);
    const whole = Math.floor(scaled / scale);
    const frac = String(scaled % scale).padStart(places, "0");
    const body = places === 0 ? String(whole) : `${whole}.${frac}`;
    return (r.n < 0 ? "-" : "") + body;
  }
  return null;
}

/** A number in LaTeX: an integer, a reduced \frac, or a decimal. */
export function numLatex(r: Rat, style: NumberStyle = "fraction"): string {
  if (r.d === 1) return String(r.n);
  if (style === "decimal") {
    const dec = decimalString(r);
    if (dec !== null) return dec;
  }
  return fractionToLatex(r.n, r.d);
}

/** One term of a linear expression: coef * v, or a constant when v is "". */
export interface Term {
  coef: Rat;
  v: string;
}

/** Render a sum of terms, hiding unit coefficients and zero terms and joining
 * with proper +/- signs, e.g. "\frac{2}{3}x - 4" or "0.5x + 1.2". */
export function linearLatex(terms: Term[], style: NumberStyle = "fraction"): string {
  const nonzero = terms.filter((t) => !isZero(t.coef));
  if (nonzero.length === 0) return "0";
  return nonzero
    .map((t, i) => {
      const mag = abs(t.coef);
      const body = t.v === "" ? numLatex(mag, style) : (ratEq(mag, rat(1)) ? "" : numLatex(mag, style)) + t.v;
      const negative = t.coef.n < 0;
      if (i === 0) return (negative ? "-" : "") + body;
      return ` ${negative ? "-" : "+"} ${body}`;
    })
    .join("");
}

/** "x = 4", "x = -\frac{3}{4}", "n = 2.5". */
export function solutionLatex(v: string, x: Rat, style: NumberStyle = "fraction"): string {
  return `${v} = ${numLatex(x, style)}`;
}

/**
 * A one-value Distractor "x = r", or null when r is missing (a mis-solved
 * equation divided by zero) or, in decimal style, would not print as a
 * terminating decimal: a fraction among decimal choices gives itself away.
 */
export function solutionHint(v: string, r: Rat | null, style: NumberStyle = "fraction"): string | null {
  if (!r) return null;
  if (style === "decimal" && decimalString(r) === null) return null;
  return solutionLatex(v, r, style);
}

/** "x = -7, 3": several solutions, ascending and de-duplicated. */
export function solutionsLatex(v: string, xs: Rat[], style: NumberStyle = "fraction"): string {
  const sorted = [...xs].sort((a, b) => ratValue(a) - ratValue(b));
  const uniq = sorted.filter((x, i) => i === 0 || !ratEq(x, sorted[i - 1]));
  return `${v} = ${uniq.map((x) => numLatex(x, style)).join(", ")}`;
}

export const NO_SOLUTION = "\\text{no solution}";
export const ALL_REALS = "\\text{all real numbers}";

/**
 * Keep the Distractor candidates that are well formed, distinct (as the
 * multiple-choice assembler compares them) and not the Answer, in order.
 */
export function distinctHints(answer: string, candidates: (string | null | undefined)[]): string[] {
  const seen = new Set<string>([choiceKey(answer)]);
  const out: string[] = [];
  for (const c of candidates) {
    if (!c) continue;
    const key = choiceKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ------------------------------------------------------------------ choosing

/** A nonzero integer with |n| in [lo, hi], negative only when allowed. */
export function nonzeroInt(rng: Rng, lo: number, hi: number, allowNegative: boolean): number {
  const m = rng.int(Math.max(1, lo), Math.max(1, lo, hi));
  return allowNegative && rng.bool() ? -m : m;
}

/** Letters a solved-for variable may use: no i, e, l or o (they read as numbers). */
export const VARIABLE_LETTERS = ["x", "n", "a", "k", "m", "p", "r", "t", "w", "y"] as const;

export const varyVariableField = {
  type: "boolean",
  key: "varyVariable",
  label: "Use letters other than x",
  default: false,
} as const satisfies ParamField;

export function pickVariable(rng: Rng, vary: boolean): string {
  return vary ? rng.pick(VARIABLE_LETTERS) : "x";
}
