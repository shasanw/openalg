// Shared pieces for the Polynomials and Factoring Topics: integer polynomials
// in one or two variables, exact arithmetic on them (add, multiply), printing
// in standard form or a given order, and factored forms printed in one
// canonical spelling so equal factorizations always print alike.
//
// Nothing here factors or solves anything. Generators choose the Answer (the
// factors, the quotient, the sum) and build the Problem from it with these
// helpers; multiplying out is construction, not solving.

import { gcd } from "../format";
import type { ParamField } from "../types";
import type { Rng } from "../rng";
import { distinctHints, VARIABLE_LETTERS } from "./equationKit";

// ------------------------------------------------------------------ monomials

/** c · v^e[0] · w^e[1]: an integer coefficient and the exponents of the (at
 * most two) variables. A constant has e = [0, 0]. */
export interface Mono {
  c: number;
  e: readonly [number, number];
}

/** A polynomial as a list of terms, in the order they print. */
export type Poly = readonly Mono[];

export const mono = (c: number, ex = 0, ey = 0): Mono => ({ c, e: [ex, ey] });

/** Total degree of a term. */
export const termDegree = (m: Mono): number => m.e[0] + m.e[1];

/** Degree of a polynomial (the zero polynomial has degree -1). */
export const degree = (p: Poly): number => Math.max(-1, ...p.filter((t) => t.c !== 0).map(termDegree));

const sameVars = (a: Mono, b: Mono) => a.e[0] === b.e[0] && a.e[1] === b.e[1];

/** Standard-form order: higher total degree first, then higher power of the first variable. */
export function compareMono(a: Mono, b: Mono): number {
  return termDegree(b) - termDegree(a) || b.e[0] - a.e[0] || b.e[1] - a.e[1];
}

// ------------------------------------------------------------------ arithmetic

/** Combine like terms, drop zero terms and sort into standard form. */
export function norm(p: Poly): Mono[] {
  const out: Mono[] = [];
  for (const t of p) {
    const like = out.findIndex((u) => sameVars(u, t));
    if (like >= 0) out[like] = { c: out[like].c + t.c, e: out[like].e };
    else out.push({ c: t.c, e: t.e });
  }
  return out.filter((t) => t.c !== 0).sort(compareMono);
}

export const add = (a: Poly, b: Poly) => norm([...a, ...b]);
export const neg = (a: Poly): Mono[] => a.map((t) => ({ c: -t.c, e: t.e }));
export const sub = (a: Poly, b: Poly) => add(a, neg(b));
export const mulMono = (s: Mono, t: Mono): Mono => mono(s.c * t.c, s.e[0] + t.e[0], s.e[1] + t.e[1]);
export const mul = (a: Poly, b: Poly) => norm(a.flatMap((s) => b.map((t) => mulMono(s, t))));
export const pow = (a: Poly, n: number): Mono[] => {
  let out: Mono[] = [mono(1)];
  for (let i = 0; i < n; i++) out = mul(out, a);
  return out;
};

/** Equal as polynomials (after combining like terms). */
export function polyEq(a: Poly, b: Poly): boolean {
  const x = norm(a);
  const y = norm(b);
  return x.length === y.length && x.every((t, i) => t.c === y[i].c && sameVars(t, y[i]));
}

/** The gcd of the coefficients (0 for the zero polynomial). */
export const coefGcd = (p: Poly) => p.reduce((g, t) => gcd(g, t.c), 0);

/** The value at v = x, w = y. */
export const evalPoly = (p: Poly, x: number, y = 0) => p.reduce((s, t) => s + t.c * x ** t.e[0] * y ** t.e[1], 0);

// ------------------------------------------------------------------ printing

/** The variable part of a term, e.g. "x^{2}y". */
function varsLatex(e: readonly [number, number], vars: readonly string[]): string {
  return e
    .map((n, i) => (n === 0 ? "" : n === 1 ? vars[i] : `${vars[i]}^{${n}}`))
    .join("");
}

/** A term's magnitude: "5x^{2}", "x", "7". */
function termBody(t: Mono, vars: readonly string[]): string {
  const v = varsLatex(t.e, vars);
  const mag = Math.abs(t.c);
  return v === "" ? String(mag) : (mag === 1 ? "" : String(mag)) + v;
}

/** A single term with its sign: "-3xy", "x^{2}", "4". */
export function monoLatex(t: Mono, vars: readonly string[]): string {
  return (t.c < 0 ? "-" : "") + termBody(t, vars);
}

/** The polynomial's terms in the order given (no sorting or combining), with
 * proper +/- joining and hidden unit coefficients. Zero terms are skipped. */
export function polyLatex(p: Poly, vars: readonly string[]): string {
  const terms = p.filter((t) => t.c !== 0);
  if (terms.length === 0) return "0";
  return terms
    .map((t, i) => {
      const body = termBody(t, vars);
      if (i === 0) return (t.c < 0 ? "-" : "") + body;
      return ` ${t.c < 0 ? "-" : "+"} ${body}`;
    })
    .join("");
}

/** Standard form. */
export const standardLatex = (p: Poly, vars: readonly string[]) => polyLatex(norm(p), vars);

/** A polynomial wrapped in parentheses when it has more than one term. */
export const groupLatex = (p: Poly, vars: readonly string[]) => {
  const s = standardLatex(p, vars);
  return norm(p).length > 1 ? `(${s})` : s;
};

// ------------------------------------------------------------------ factored forms

/** A monomial factor times polynomial factors: 3x(x + 2)(x - 5). */
export interface Factored {
  g: Mono;
  factors: readonly Poly[];
}

export function expandFactored(f: Factored): Mono[] {
  return f.factors.reduce<Mono[]>((acc, p) => mul(acc, p), [f.g]);
}

/** Canonical factor order: higher degree first, then by the leading term
 * (smaller coefficient first), then by the remaining coefficients (larger
 * first), so (x + 3)(x - 3) and (x - 4)(2x + 1) always print alike. */
function compareFactor(a: Poly, b: Poly): number {
  const x = norm(a);
  const y = norm(b);
  const d = degree(y) - degree(x);
  if (d) return d;
  const lead = compareMono(x[0], y[0]) || x[0].c - y[0].c;
  if (lead) return lead;
  for (let i = 1; i < Math.max(x.length, y.length); i++) {
    if (!x[i] || !y[i]) return (x[i] ? 0 : 1) - (y[i] ? 0 : 1);
    const c = compareMono(x[i], y[i]) || y[i].c - x[i].c;
    if (c) return c;
  }
  return 0;
}

/** "3x(x + 2)(x - 5)", "(2x - 3)^{2}", "-(x + 1)": factors in canonical order,
 * repeated factors as a power. */
export function factoredLatex(f: Factored, vars: readonly string[]): string {
  const sorted = [...f.factors].sort(compareFactor);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && polyEq(sorted[j], sorted[i])) j++;
    const body = `(${standardLatex(sorted[i], vars)})`;
    parts.push(j - i === 1 ? body : `${body}^{${j - i}}`);
    i = j;
  }
  const gv = varsLatex(f.g.e, vars);
  let front: string;
  if (gv === "" && Math.abs(f.g.c) === 1) front = f.g.c < 0 ? "-" : "";
  else front = monoLatex(f.g, vars);
  // a lone factor with nothing in front needs no parentheses
  if (front === "" && parts.length === 1 && sorted.length === 1) return standardLatex(sorted[0], vars);
  return front + parts.join("");
}

/**
 * Distractors from factored candidates: each must expand to something other
 * than the Answer (a choice equal in value is not wrong), then the usual
 * well-formed, distinct, not-the-Answer filter. Plain strings (like
 * "\text{prime}") pass straight through to that filter.
 */
export function factoredHints(
  answer: string,
  answerPoly: Poly | null,
  candidates: (Factored | string | null | undefined)[],
  vars: readonly string[],
): string[] {
  return distinctHints(
    answer,
    candidates.map((c) => {
      if (c == null || typeof c === "string") return c;
      if (c.factors.some((p) => norm(p).length === 0)) return null;
      if (answerPoly && polyEq(expandFactored(c), answerPoly)) return null;
      return factoredLatex(c, vars);
    }),
  );
}

/** Distractors that are polynomials: any equal to the Answer is dropped. */
export function polyHints(answer: Poly, candidates: (Poly | null | undefined)[], vars: readonly string[]): string[] {
  const tex = standardLatex(answer, vars);
  return distinctHints(
    tex,
    candidates.map((c) => (c && !polyEq(c, answer) ? standardLatex(c, vars) : null)),
  );
}

// ------------------------------------------------------------------ choosing

/** A nonzero integer in [-max, max] (positive only when negatives are off). */
export function nonzero(rng: Rng, max: number, allowNegative = true): number {
  const m = rng.int(1, Math.max(1, max));
  return allowNegative && rng.bool() ? -m : m;
}

/** Shuffle a copy of a list. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const varyPolyVariableField = {
  type: "boolean",
  key: "varyVariable",
  label: "Use letters other than x",
  default: false,
} as const satisfies ParamField;

/** Pairs of letters for two-variable Problems. */
const PAIRS: readonly (readonly [string, string])[] = [
  ["x", "y"],
  ["a", "b"],
  ["m", "n"],
  ["p", "q"],
  ["u", "v"],
];

/** The variable letters [v, w]: "x" (and "y" for a second variable) unless
 * varied, when a one-variable Problem takes any safe letter and a
 * two-variable one a familiar pair. */
export function pickVars(rng: Rng, vary: boolean, two = false): [string, string] {
  if (!vary) return ["x", "y"];
  if (two) {
    const [v, w] = rng.pick(PAIRS);
    return [v, w];
  }
  return [rng.pick(VARIABLE_LETTERS.filter((l) => l !== "y")), "y"];
}
