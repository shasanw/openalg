// Shared pieces of the linear Topics (slope, parallel and perpendicular
// slopes, graphing and writing linear equations): exact rational arithmetic,
// slopes chosen answer-first, a line's equation in each form, and the one
// coordinate grid every line is drawn on.
//
// Everything is exact: a slope is a reduced rise/run of integers and a line's
// numbers are rationals, so an equation printed in any form is read off the
// very numbers that were chosen, never solved.

import type { Rng } from "../rng";
import { choiceKey } from "../mc";
import { fractionToLatex, gcd, renderPolynomial } from "../format";
import { symmetricWindow, type CoordinatePlaneSpec, type LineCurve } from "../plot";

// ------------------------------------------------------------ rationals

/** An exact rational n/d, always reduced with d > 0 (and never -0). */
export interface Q {
  n: number;
  d: number;
}

export function q(n: number, d = 1): Q {
  if (d === 0) throw new Error("q: zero denominator");
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return { n: n / g + 0, d: d / g };
}

export const add = (a: Q, b: Q): Q => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Q, b: Q): Q => q(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Q, b: Q): Q => q(a.n * b.n, a.d * b.d);
export const neg = (a: Q): Q => q(-a.n, a.d);
export const eq = (a: Q, b: Q): boolean => a.n === b.n && a.d === b.d;
export const value = (a: Q): number => a.n / a.d;
export const qLatex = (a: Q): string => fractionToLatex(a.n, a.d);

// ---------------------------------------------------------------- slopes

/**
 * A slope as a reduced rise over run with run >= 0. A vertical line (an
 * undefined slope) is rise 1 over run 0; a horizontal one is 0 over 1.
 */
export interface Slope {
  rise: number;
  run: number;
}

export function slope(rise: number, run: number): Slope {
  if (run === 0) return { rise: rise === 0 ? 0 : 1, run: 0 };
  if (run < 0) {
    rise = -rise;
    run = -run;
  }
  const g = gcd(rise, run) || 1;
  return { rise: rise / g + 0, run: run / g };
}

export const isVertical = (s: Slope): boolean => s.run === 0;
export const slopeQ = (s: Slope): Q => q(s.rise, s.run);

/** A slope as printed in an Answer: "-\frac{2}{3}", "0" or "\text{undefined}". */
export function slopeLatex(s: Slope): string {
  return isVertical(s) ? "\\text{undefined}" : fractionToLatex(s.rise, s.run);
}

/**
 * "m = -\frac{2}{3}": a slope stated as an equation. Printed straight after
 * \text{...}, a negative slope would typeset as "text minus number" (Typst
 * spaces a minus that follows text as a binary operator, braces or not);
 * after "=" it is a sign.
 */
export function slopeEquation(s: Slope, name = "m"): string {
  return `${name} = ${slopeLatex(s)}`;
}

/** The slope of a perpendicular line: the negative reciprocal (vertical and horizontal swap). */
export const perpendicular = (s: Slope): Slope => slope(-s.run, s.rise);

/** Largest |rise| and run a chosen slope uses, so it stays easy to count on a grid. */
export const SLOPE_LIMIT = 4;

/**
 * A nonzero, non-vertical slope. Whole-number slopes are 1 to 4 either way;
 * with `fractions`, three in four are proper or improper fractions with a
 * run of 2 to 4 (so 2/3, -5/4 and 3/2, never 4/2).
 */
export function pickSlope(rng: Rng, fractions: boolean): Slope {
  const sign = rng.bool() ? 1 : -1;
  if (fractions && rng.bool(0.75)) {
    const run = rng.int(2, SLOPE_LIMIT);
    const rises: number[] = [];
    for (let r = 1; r <= SLOPE_LIMIT + 1; r++) if (gcd(r, run) === 1) rises.push(r);
    return slope(sign * rng.pick(rises), run);
  }
  return slope(sign * rng.int(1, SLOPE_LIMIT), 1);
}

// ----------------------------------------------------------------- lines

/** A line: y = m x + b, or the vertical line x = c. */
export type Line = { vertical: false; m: Q; b: Q } | { vertical: true; x: Q };

/** The line through (x0, y0) with slope `s`. */
export function lineThrough(s: Slope, x0: number, y0: number): Line {
  if (isVertical(s)) return { vertical: true, x: q(x0) };
  const m = slopeQ(s);
  return { vertical: false, m, b: sub(q(y0), mul(m, q(x0))) };
}

export function lineSlope(l: Line): Slope {
  return l.vertical ? slope(1, 0) : slope(l.m.n, l.m.d);
}

export type EquationForm = "slopeIntercept" | "pointSlope" | "standard";

/** "x", "-x", "3x", "-\frac{2}{3}x": a coefficient times a variable. */
function term(c: Q, v: string): string {
  if (c.n === c.d) return v;
  if (c.n === -c.d) return `-${v}`;
  return qLatex(c) + v;
}

/** " + 3" / " - \frac{1}{2}" / "" for zero: a signed trailing constant. */
function signed(c: Q): string {
  if (c.n === 0) return "";
  return ` ${c.n < 0 ? "-" : "+"} ${qLatex(q(Math.abs(c.n), c.d))}`;
}

/** y = m x + b, "y = 4" when horizontal, "x = -2" when vertical. */
export function slopeInterceptLatex(l: Line): string {
  if (l.vertical) return `x = ${qLatex(l.x)}`;
  if (l.m.n === 0) return `y = ${qLatex(l.b)}`;
  return `y = ${term(l.m, "x")}${signed(l.b)}`;
}

/**
 * y - y1 = m(x - x1) through the given point, hiding a zero coordinate and a
 * unit slope: "y + 1 = 3(x - 2)", "y - 4 = -(x + 1)", "y = \frac{1}{2}x" at
 * the origin. Horizontal and vertical lines print as y = c and x = c.
 */
export function pointSlopeLatex(l: Line, x1: Q, y1: Q): string {
  if (l.vertical || l.m.n === 0) return slopeInterceptLatex(l);
  const lhs = `y${signed(neg(y1))}`;
  const inner = `x${signed(neg(x1))}`;
  const { m } = l;
  let rhs: string;
  if (x1.n === 0) rhs = term(m, "x");
  else if (m.n === m.d) rhs = inner;
  else if (m.n === -m.d) rhs = `-(${inner})`;
  else rhs = `${qLatex(m)}(${inner})`;
  return `${lhs} = ${rhs}`;
}

/** Integers A, B, C with A x + B y = C the line, no common factor, A > 0 (or A = 0, B > 0). */
export function standardCoefficients(l: Line): [number, number, number] {
  let A: number;
  let B: number;
  let C: number;
  if (l.vertical) {
    [A, B, C] = [l.x.d, 0, l.x.n];
  } else {
    // y = (p/q) x + r/s, times L = lcm(q, s): -(pL/q) x + L y = rL/s
    const L = (l.m.d * l.b.d) / gcd(l.m.d, l.b.d);
    [A, B, C] = [-(l.m.n * L) / l.m.d, L, (l.b.n * L) / l.b.d];
  }
  const g = gcd(gcd(A, B), C) || 1;
  const s = A < 0 || (A === 0 && B < 0) ? -1 : 1;
  return [(s * A) / g + 0, (s * B) / g + 0, (s * C) / g + 0];
}

/** A x + B y = C with integer coefficients, e.g. "2x - 3y = 6", "y = -4". */
export function standardLatex(l: Line): string {
  const [A, B, C] = standardCoefficients(l);
  const lhs = renderPolynomial([
    { coef: A, variable: "x" },
    { coef: B, variable: "y" },
  ]);
  return `${lhs} = ${C}`;
}

/** The line's equation in `form`; point-slope form uses `through`. */
export function equationLatex(l: Line, form: EquationForm, through: [number, number]): string {
  if (form === "standard") return standardLatex(l);
  if (form === "pointSlope") return pointSlopeLatex(l, q(through[0]), q(through[1]));
  return slopeInterceptLatex(l);
}

/** A point "(2, -3)". */
export const pointLatex = ([x, y]: readonly [number, number]): string => `(${x}, ${y})`;

// ----------------------------------------------------------------- graphs

/** Every line is drawn on the same grid: -10 to 10 both ways, one unit a square. */
export function lineGrid(): CoordinatePlaneSpec {
  const w = symmetricWindow([]);
  return { kind: "plane", x: w.range, y: w.range, xStep: w.step, yStep: w.step, labelEvery: 2 };
}

/** Points on a line's graph stay within this many units of the origin (one square inside the grid). */
export const GRID_LIMIT = 9;

export function lineCurve(l: Line): LineCurve {
  return l.vertical
    ? { kind: "line", form: "vertical", x: value(l.x) }
    : { kind: "line", form: "slopeIntercept", m: value(l.m), b: value(l.b) };
}

/** A line drawn on the grid with its marked lattice points. */
export function lineGraph(l: Line, points: readonly (readonly [number, number])[]): CoordinatePlaneSpec {
  return {
    ...lineGrid(),
    curves: [lineCurve(l)],
    points: points.map(([x, y]) => ({ x, y })),
  };
}

/**
 * Collects mistake-based Distractors in rank order, keeping each one once and
 * never the Answer itself (compared as the multiple-choice assembler does).
 */
export class Distractors {
  private readonly seen = new Set<string>();
  readonly list: string[] = [];
  constructor(answer: string) {
    this.seen.add(choiceKey(answer));
  }
  add(...candidates: (string | null | undefined)[]): this {
    for (const c of candidates) {
      if (!c) continue;
      const key = choiceKey(c);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.list.push(c);
    }
    return this;
  }
}
