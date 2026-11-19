// Shared pieces of the Systems of Equations Topics (graphing, elimination,
// substitution): a linear equation A x + B y = C with integer coefficients,
// a two-equation system printed with a left brace, the solution (a point, or
// no solution, or infinitely many solutions) as an Answer, and the Distractors
// every system shares.
//
// Every Problem is built ANSWER-FIRST: the solution (x0, y0) is chosen and
// each equation's constant is computed from it (C = A x0 + B y0), so the
// printed system is satisfied by the Answer by construction. The only solving
// done here is in `solveSystem`, which models a student's MISTAKE (a slipped
// sign, an unscaled constant) to produce a Distractor; it never finds an Answer.

import { gcd, renderPolynomial } from "../format";
import type { ParamField } from "../types";
import type { Rng } from "../rng";
import { NO_SOLUTION, rat, type Rat } from "./equationKit";
import { Distractors, pointLatex } from "./lines";

export { NO_SOLUTION };
export const INFINITELY_MANY = "\\text{infinitely many solutions}";

/** The solution of a system: one point, none (parallel lines) or every point of one line. */
export type SystemSolution =
  | { kind: "point"; x: number; y: number }
  | { kind: "none" }
  | { kind: "infinite" };

export type SpecialKind = "none" | "infinite";

/** A x + B y = C, integer coefficients. */
export interface StdEq {
  a: number;
  b: number;
  c: number;
}

/** The equation A x + B y = C through (x0, y0). */
export const eqThrough = (a: number, b: number, x0: number, y0: number): StdEq => ({ a, b, c: a * x0 + b * y0 });

export const satisfiesEq = (e: StdEq, x: number, y: number): boolean => e.a * x + e.b * y === e.c;

/** "2x - 3y = 6", "-x + y = 0". */
export function stdEqLatex(e: StdEq): string {
  const lhs = renderPolynomial([
    { coef: e.a, variable: "x" },
    { coef: e.b, variable: "y" },
  ]);
  return `${lhs} = ${e.c}`;
}

/** k times every coefficient of e. */
export const scaleEq = (e: StdEq, k: number): StdEq => ({ a: k * e.a + 0, b: k * e.b + 0, c: k * e.c + 0 });

/** The coefficient determinant: nonzero exactly when the system has one solution. */
export const det = (e1: StdEq, e2: StdEq): number => e1.a * e2.b - e2.a * e1.b;

/**
 * Two equations, one above the other with their equals signs aligned, behind a
 * left brace. (A `cases` environment prints at script size in Typst, so the
 * brace is built from \left\{ ... \right. around `aligned`.)
 */
export function systemLatex(first: string, second: string): string {
  const align = (eq: string) => {
    const i = eq.indexOf(" = ");
    if (i < 0 || eq.indexOf(" = ", i + 1) >= 0) throw new Error(`systemLatex: not one equation: ${eq}`);
    return `${eq.slice(0, i)} &= ${eq.slice(i + 3)}`;
  };
  return `\\left\\{ \\begin{aligned} ${align(first)} \\\\ ${align(second)} \\end{aligned} \\right.`;
}

/** The two equations of a system printed by `systemLatex`, as plain "lhs = rhs" strings. */
export function systemEquations(latex: string): [string, string] {
  const m = latex.match(/^\\left\\\{ \\begin\{aligned\} (.*) \\\\ (.*) \\end\{aligned\} \\right\.$/);
  if (!m) throw new Error(`not a system: ${latex}`);
  const plain = (s: string) => s.replace(" &= ", " = ");
  return [plain(m[1]), plain(m[2])];
}

export function solutionLatex(s: SystemSolution): string {
  if (s.kind === "none") return NO_SOLUTION;
  if (s.kind === "infinite") return INFINITELY_MANY;
  return pointLatex([s.x, s.y]);
}

// ---------------------------------------------------------------- options

export const specialField = {
  type: "boolean",
  key: "includeSpecial",
  label: "Include systems with no solution or infinitely many solutions",
  default: false,
} as const satisfies ParamField;

/** With `includeSpecial`, about one Problem in four is a special case, split evenly. */
export function pickSpecial(rng: Rng, includeSpecial: boolean): SpecialKind | null {
  if (!includeSpecial || !rng.bool(0.25)) return null;
  return rng.bool() ? "none" : "infinite";
}

// --------------------------------------------------------------- choosing

/** A nonzero integer with |n| in [lo, hi]. */
export const signedInt = (rng: Rng, lo: number, hi: number): number => (rng.bool() ? 1 : -1) * rng.int(lo, hi);

/** A solution with each coordinate in [-limit, limit], neither zero, and x != y (so swapping them is a real mistake). */
export function pickSolution(rng: Rng, limit: number): [number, number] {
  const x = signedInt(rng, 1, limit);
  let y = signedInt(rng, 1, limit);
  if (y === x) y = -y;
  return [x, y];
}

/**
 * Draw from `make` until `ok` accepts, at most `tries` times, then return
 * `fallback`. Keeps rejection sampling pure and bounded.
 */
export function sample<T>(make: () => T, ok: (t: T) => boolean, fallback: T, tries = 500): T {
  for (let i = 0; i < tries; i++) {
    const t = make();
    if (ok(t)) return t;
  }
  return fallback;
}

/** e, negated three times in four when it leads with a negative x term (printed systems mostly lead with a positive one). */
export function mostlyLeadPositive(rng: Rng, e: StdEq): StdEq {
  return e.a < 0 && rng.bool(0.75) ? scaleEq(e, -1) : e;
}

/** Neither coefficient zero, and no common factor (so the equation does not simplify). */
export const isReduced = (e: StdEq): boolean => e.a !== 0 && e.b !== 0 && gcd(e.a, e.b) === 1;

// ------------------------------------------------------------ Distractors

/**
 * The solution of a1 x + b1 y = c1, a2 x + b2 y = c2 by Cramer's rule, or null
 * when the determinant is zero. Only used to work out where a student's
 * MISTAKE leads (a Distractor), never for an Answer.
 */
export function solveSystem(e1: StdEq, e2: StdEq): [Rat, Rat] | null {
  const d = det(e1, e2);
  if (d === 0) return null;
  return [rat(e1.c * e2.b - e2.c * e1.b, d), rat(e1.a * e2.c - e2.a * e1.c, d)];
}

/** A point Distractor, only when both coordinates are integers (a fraction among integer choices gives itself away) and small. */
export function intPoint(x: Rat | number | null, y: Rat | number | null, limit = 20): string | null {
  if (x === null || y === null) return null;
  const xr = typeof x === "number" ? rat(x) : x;
  const yr = typeof y === "number" ? rat(y) : y;
  if (xr.d !== 1 || yr.d !== 1) return null;
  if (Math.abs(xr.n) > limit || Math.abs(yr.n) > limit) return null;
  return pointLatex([xr.n, yr.n]);
}

/** Where the mistaken system e1, e2 leads, as an integer point Distractor. */
export function mistakePoint(e1: StdEq, e2: StdEq): string | null {
  const s = solveSystem(e1, e2);
  return s ? intPoint(s[0], s[1]) : null;
}

/** Swapped coordinates, then each sign slip: the classic slips on a point Answer. */
export function pointSlips(x: number, y: number): string[] {
  return [pointLatex([y, x]), pointLatex([x, -y]), pointLatex([-x, y]), pointLatex([-x, -y])];
}

/** Small lattice points of e, nearest the origin first. */
export function latticePoints(e: StdEq, count: number, limit = 9): [number, number][] {
  const out: [number, number][] = [];
  const xs = [0];
  for (let i = 1; i <= limit; i++) xs.push(i, -i);
  for (const x of xs) {
    if (e.b === 0) continue;
    const r = e.c - e.a * x;
    if (r % e.b !== 0) continue;
    const y = r / e.b + 0;
    if (Math.abs(y) > limit) continue;
    out.push([x, y]);
    if (out.length === count) break;
  }
  return out;
}

/**
 * Distractors for a special system. No solution: "infinitely many", then a
 * point on just one of the lines (checked only one equation). Infinitely
 * many: "no solution" (0 = 0 read as a contradiction), then (0, 0) or another
 * point off the line (0 = 0 read as x = 0 and y = 0, or a point mis-plotted).
 */
export function specialDistractors(kind: SpecialKind, e1: StdEq, e2: StdEq): string[] {
  const answer = kind === "none" ? NO_SOLUTION : INFINITELY_MANY;
  const d = new Distractors(answer);
  if (kind === "none") {
    d.add(INFINITELY_MANY);
    const p1 = latticePoints(e1, 3);
    const p2 = latticePoints(e2, 3);
    for (let i = 0; i < 3; i++) d.add(p1[i] && pointLatex(p1[i]), p2[i] && pointLatex(p2[i]));
  } else {
    d.add(NO_SOLUTION);
    if (!satisfiesEq(e1, 0, 0)) d.add(pointLatex([0, 0]));
    for (const [x, y] of latticePoints(e1, 6)) {
      for (const [u, v] of [
        [y, x],
        [x, -y],
        [-x, y],
      ]) {
        if (!satisfiesEq(e1, u, v)) d.add(pointLatex([u, v]));
      }
    }
  }
  return d.list;
}
