// Shared pieces of the trig equation Topics (simple trig equations, equations
// with factoring and fundamental identities, equations with multiple-angle
// identities):
//
// - Context. Radians solve for x, degrees for θ; the interval (or "all
//   solutions") is printed in the prompt so one Directions line fits every
//   Topic Option.
// - Answers. A Topic chooses the solution set first (angles in [0, 2π) of
//   the variable it substitutes, u = x or u = x/2) and prints it here, as the
//   set over one turn or as general-solution families. Distractors are wrong
//   solution sets printed the same way, so equal sets print alike.
// - Printing. Sums of terms with surd coefficients ("2\sin^{2} x - \sin x - 1",
//   "\sqrt{3} \tan x - 1") and quadratics built from chosen roots.

import { ANSWER_PART_SEPARATOR } from "../../format";
import type { ParamField, ParamValues } from "../../types";
import { add, distinctHints, mul, NO_SOLUTION, rat, ratEq, ratValue, type Rat } from "../shared/equationKit";
import {
  coterminal,
  familiesLatex,
  solutionFamilies,
  solutionSetLatex,
  surd,
  surdLatex,
  surdNeg,
  swappedSpecialAngle,
  type Angle,
  type AngleUnit,
  type Surd,
} from "./trigKit";

export type SolutionMode = "interval" | "general";

export const unitField = {
  type: "enum",
  key: "unit",
  label: "Angle measure",
  default: "radians",
  options: [
    { value: "radians", label: "Radians" },
    { value: "degrees", label: "Degrees" },
  ],
} as const satisfies ParamField;

export const solutionsField = {
  type: "enum",
  key: "solutions",
  label: "Solutions",
  default: "interval",
  options: [
    { value: "interval", label: "One turn, 0 ≤ x < 2π (or 0° ≤ θ < 360°)" },
    { value: "general", label: "All solutions, like x = π/6 + 2πk" },
  ],
} as const satisfies ParamField;

export interface SolveContext {
  mode: SolutionMode;
  unit: AngleUnit;
  /** "x" in radians, "\theta" in degrees */
  v: string;
}

export const variableFor = (unit: AngleUnit): string => (unit === "degrees" ? "\\theta" : "x");

export function solveContext(p: ParamValues): SolveContext {
  const unit = p.unit as AngleUnit;
  return { mode: p.solutions as SolutionMode, unit, v: variableFor(unit) };
}

/** "0 \le x < 2\pi" or "0^{\circ} \le \theta < 360^{\circ}". */
export const intervalLatex = (ctx: SolveContext): string =>
  ctx.unit === "degrees" ? `0^{\\circ} \\le ${ctx.v} < 360^{\\circ}` : `0 \\le ${ctx.v} < 2\\pi`;



/** The equation followed by where to solve it: "2\sin x + 1 = 0,\quad 0 \le x < 2\pi". */
export const promptWith = (equation: string, ctx: SolveContext): string =>
  `${equation}${ANSWER_PART_SEPARATOR}${ctx.mode === "interval" ? intervalLatex(ctx) : `\\text{all solutions in ${ctx.unit}}`}`;

// ------------------------------------------------------------------ angle sets

const byValue = (x: Angle, y: Angle) => ratValue(x) - ratValue(y);

/** Distinct angles, each reduced to [0, 2π), ascending. */
export function angleSet(angles: readonly Angle[]): Angle[] {
  const out: Angle[] = [];
  for (const a of angles.map(coterminal)) if (!out.some((b) => ratEq(a, b))) out.push(a);
  return out.sort(byValue);
}

export const without = (a: readonly Angle[], drop: readonly Angle[]): Angle[] =>
  angleSet(a).filter((t) => !drop.some((d) => ratEq(coterminal(d), t)));

/** The first solution of each value only (the reference-quadrant answer). */
export const firstOfEach = (sets: readonly Angle[][]): Angle[] => angleSet(sets.filter((s) => s.length).map((s) => s[0]));

/** Every solution with π/6 and π/3 reference angles swapped, or null when one cannot be. */
export function swappedSpecials(set: readonly Angle[]): Angle[] | null {
  const out = set.map(swappedSpecialAngle);
  return out.every((a) => a !== null) && out.length ? angleSet(out as Angle[]) : null;
}

/**
 * Wrong-quadrant versions of a whole solution set, for padding the
 * Distractors: each solution reflected as sin's pair (π - t), cos's pair
 * (2π - t) or tan's (t + π), and the set with tan's pairs added.
 */
export function reflections(set: readonly Angle[]): Angle[][] {
  const map = (f: (t: Angle) => Angle) => angleSet(set.map(f));
  const plusPi = map((t) => rat(t.n + t.d, t.d));
  return [map((t) => rat(t.d - t.n, t.d)), map((t) => rat(2 * t.d - t.n, t.d)), plusPi, angleSet([...set, ...plusPi])];
}

// ------------------------------------------------------------------ answers

/**
 * A solution set: the angles `u` in [0, 2π) of the substituted variable, with
 * x = scale·u (scale 2 for an equation in x/2). Over one turn the Answer lists
 * the x in [0, 2π); in general form the families of x over its whole period.
 */
export interface SolutionSet {
  u: readonly Angle[];
  scale?: number;
}

export function solutionsLatex(s: SolutionSet, ctx: SolveContext): string {
  const scale = s.scale ?? 1;
  const xs = angleSet(s.u).map((u) => mul(u, rat(scale)));
  if (ctx.mode === "interval") return solutionSetLatex(ctx.v, xs.filter((x) => ratValue(x) < 2), ctx.unit);
  return familiesLatex(solutionFamilies(xs, 2 * scale), ctx.v, ctx.unit);
}

/**
 * Distractors from wrong solution sets (null entries skipped), printed as the
 * Answer is, distinct and never the Answer; `extra` are already printed.
 */
export function setHints(
  answer: SolutionSet,
  ctx: SolveContext,
  wrong: readonly (SolutionSet | Angle[] | null)[],
  extra: readonly (string | null)[] = [],
): string[] {
  // A half-angle mistake may repeat every 2π while the actual equation
  // repeats every 4π. Compare both sets over the same span.
  const key = (s: SolutionSet) => {
    const scale = s.scale ?? 1;
    const xs = angleSet(s.u).map((u) => mul(u, rat(scale)));
    const points = ctx.mode === "interval" ? xs.filter((x) => ratValue(x) < 2)
      : scale === 1 ? [...xs, ...xs.map((x) => add(x, rat(2)))] : xs;
    return points.map((x) => `${x.n}/${x.d}`).join(",");
  };
  const seen = new Set([key(answer)]);
  const hints: string[] = [];
  const take = (s: SolutionSet) => {
    const id = key(s);
    if (!seen.has(id)) {
      seen.add(id);
      hints.push(solutionsLatex(s, ctx));
    }
  };
  for (const w of wrong) {
    if (w !== null) take(Array.isArray(w) ? { u: w, scale: answer.scale } : w);
  }
  // Keep a quadrantal angle of x introduced by multiplying through by sin or
  // cos (for an equation in x/2, the u that gives that x).
  for (const axis of [rat(0), rat(1, 2), rat(1), rat(3, 2)]) {
    if (hints.length >= 4) break;
    take({ ...answer, u: [...answer.u, mul(axis, rat(1, answer.scale ?? 1))] });
  }
  return distinctHints(solutionsLatex(answer, ctx), [...hints, ...extra]);
}

export { NO_SOLUTION };

// ------------------------------------------------------------------ printing

/** coef · body ("" body for a constant). */
export interface Term {
  coef: Surd;
  body: string;
}

export const term = (coef: Surd | number, body = ""): Term => ({ coef: typeof coef === "number" ? surd(coef) : coef, body });

const surdAbs = (s: Surd): Surd => (s.n < 0 ? surdNeg(s) : s);

/** "2\sin^{2} x - \sin x - 1", "\sqrt{3} \tan x - 1", "0" when every term is zero. */
export function termsLatex(terms: readonly Term[]): string {
  const parts: string[] = [];
  for (const t of terms) {
    if (t.coef.n === 0) continue;
    const m = surdAbs(t.coef);
    const one = m.n === 1 && m.r === 1 && m.d === 1;
    const body = t.body === "" ? surdLatex(m) : one ? t.body : `${surdLatex(m)} ${t.body}`;
    const neg = t.coef.n < 0;
    parts.push(parts.length === 0 ? (neg ? `-${body}` : body) : `${neg ? "-" : "+"} ${body}`);
  }
  return parts.length ? parts.join(" ") : "0";
}

/** An equation from two sums of terms. */
export const equationLatex = (left: readonly Term[], right: readonly Term[]): string =>
  `${termsLatex(left)} = ${termsLatex(right)}`;

/** A Rat as a Surd. */
export const ratSurd = (r: Rat): Surd => surd(r.n, 1, r.d);
