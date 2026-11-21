// Shared pieces of the Trigonometry Topics (angles and angle measure, radians
// and degrees, the unit circle, trig functions of any angle, inverse trig,
// trig equations and identities):
//
// - Angles. An `Angle` is an exact rational multiple of π (rat(5, 6) is 5π/6,
//   which is also 150°). Degrees and radians are only ways of printing it, so
//   every function here is unit-free and `angleLatex` picks the unit.
// - Written forms. `writeAngle` prints a standard angle so it must be reduced
//   or rotated first (20π/12, 14π/3, -27π/4); `coterminal`, `location` and
//   `referenceAngle` take any angle back to [0, 2π).
// - Exact values. `exactValue` gives the six trig functions at the 16
//   standard angles (multiples of π/6 and π/4) as a `Surd` n√r/d, already
//   rationalized, or "undefined"; `unitPoint` gives (cos, sin).
// - Inverse trig. `principalAngles` lists the standard angles in each
//   inverse's range, so a Topic picks the Answer there and prints the value.
// - Equations. `anglesWithValue` and `generalSolution` list where a function
//   (of x or of a multiple of x) takes a chosen standard value: a lookup over
//   the standard angles, never a solve.
// - Distractors. Mistake helpers return wrong angles, values and points
//   modelled on real slips; generators filter them with distinctHints.
// - Rounding. Decimals for non-standard angles and sides.
// - Right triangles. Labels for triangle diagrams (surdText, degreeText) and
//   a right triangle laid out with its legs on the axes (rightTriangleCorners).
//
// Nothing here solves a Problem: a Topic chooses the angle (and the form it is
// written in) first, and every value follows from that angle by table lookup.

import { gcd, simplifyRadical } from "../../format";
import type { PlotXY } from "../../plot";
import type { Rng } from "../../rng";
import { add, mul, NO_SOLUTION, numLatex, rat, ratEq, ratValue, sub, type Rat } from "../shared/equationKit";

// ------------------------------------------------------------------ angles

/** An exact angle as a rational multiple of π: rat(5, 6) is 5π/6 = 150°. */
export type Angle = Rat;

export type AngleUnit = "radians" | "degrees";

/** The angle (n/d)·π. */
export const angle = (n: number, d = 1): Angle => rat(n, d);

/** An angle given in degrees (whole or exact rational): 150 -> 5π/6. */
export const fromDegrees = (deg: number | Rat): Angle => {
  const r = typeof deg === "number" ? rat(deg) : deg;
  if (!Number.isInteger(r.n)) throw new Error(`fromDegrees: not exact: ${deg}`);
  return rat(r.n, r.d * 180);
};

/** The angle's measure in degrees, exactly: 5π/6 -> 150. */
export const toDegrees = (a: Angle): Rat => mul(a, rat(180));

/** The angle in radians as a float (for numeric checks only). */
export const radiansValue = (a: Angle): number => ratValue(a) * Math.PI;

export const angleEq = ratEq;

/**
 * (n/d)·π printed as given, not reduced, with `suffix` written right after π:
 * piLatex(20, 12) = "\frac{20\pi}{12}", piLatex(-1, 4) = "-\frac{\pi}{4}",
 * piLatex(2, 1, "k") = "2\pi k", piLatex(0, 3) = "0".
 */
export function piLatex(n: number, d: number, suffix = ""): string {
  if (d <= 0) throw new Error("piLatex: denominator must be positive");
  if (n === 0) return "0";
  const m = Math.abs(n);
  const top = `${m === 1 ? "" : m}\\pi${suffix ? ` ${suffix}` : ""}`;
  return (n < 0 ? "-" : "") + (d === 1 ? top : `\\frac{${top}}{${d}}`);
}

/** In lowest terms: "\frac{5\pi}{6}", "-\frac{\pi}{4}", "2\pi", "0". */
export const radianLatex = (a: Angle): string => piLatex(a.n, a.d);

/** "150^{\circ}", "-45^{\circ}", "22.5^{\circ}" (a non-terminating one as a fraction). */
export const degreeLatex = (a: Angle): string => `${numLatex(toDegrees(a), "decimal")}^{\\circ}`;

export const angleLatex = (a: Angle, unit: AngleUnit): string =>
  unit === "degrees" ? degreeLatex(a) : radianLatex(a);

// ------------------------------------------------------------------ written forms

/** An angle (n/d)·π exactly as printed, which need not be in lowest terms. */
export interface WrittenAngle {
  n: number;
  d: number;
}

export type WrittenForm = "standard" | "unreduced" | "coterminal" | "negative";

/** The angle a written form stands for. */
export const writtenValue = (w: WrittenAngle): Angle => rat(w.n, w.d);

/**
 * `a` turned by `turns` full rotations (a + 2π·turns), with its fraction's top
 * and bottom both multiplied by `factor`: writeAngle(5/3, {factor: 4}) is
 * 20π/12, writeAngle(2/3, {turns: 2}) is 14π/3, writeAngle(5/4, {turns: -4})
 * is -27π/4, writeAngle(0, {turns: 1, factor: 6}) is 12π/6.
 */
export function writeAngle(a: Angle, { factor = 1, turns = 0 }: { factor?: number; turns?: number } = {}): WrittenAngle {
  const v = add(a, rat(2 * turns));
  return { n: v.n * factor, d: v.d * factor };
}

/** Radians as written ("\frac{20\pi}{12}"); degrees ignore the factor ("510^{\circ}"). */
export const writtenLatex = (w: WrittenAngle, unit: AngleUnit): string =>
  unit === "degrees" ? degreeLatex(writtenValue(w)) : piLatex(w.n, w.d);

/**
 * Pick how to write the standard angle `a`: one of the allowed non-standard
 * forms (unreduced only in radians and not for 0; at most `maxTurns` extra
 * rotations), or "standard" when none is allowed or possible.
 */
export function pickWritten(
  rng: Rng,
  a: Angle,
  allowed: { unreduced?: boolean; coterminal?: boolean; negative?: boolean },
  unit: AngleUnit,
  maxTurns = 2,
): { written: WrittenAngle; form: WrittenForm } {
  const c = coterminal(a);
  const forms: WrittenForm[] = [];
  if (allowed.unreduced && unit === "radians" && c.n !== 0) forms.push("unreduced");
  if (allowed.coterminal) forms.push("coterminal");
  if (allowed.negative) forms.push("negative");
  if (forms.length === 0) return { written: writeAngle(c), form: "standard" };
  const form = rng.pick(forms);
  if (form === "unreduced") {
    const factors = [2, 3, 4].filter((f) => c.d * f <= 12);
    return { written: writeAngle(c, { factor: rng.pick(factors.length ? factors : [2]) }), form };
  }
  const turns = rng.int(1, Math.max(1, maxTurns));
  return { written: writeAngle(c, { turns: form === "negative" ? -turns : turns }), form };
}

// ------------------------------------------------------------------ position

/** Whole turns t with a - 2π·t in [0, 2π). */
export const turnsOf = (a: Angle): number => Math.floor(a.n / (2 * a.d));

/** The coterminal angle in [0, 2π) (equivalently [0°, 360°)). */
export const coterminal = (a: Angle): Angle => sub(a, rat(2 * turnsOf(a)));

export type Quadrant = 1 | 2 | 3 | 4;
/** Where the terminal side lies: a quadrant, or one of the four half-axes. */
export type Location = Quadrant | "+x" | "+y" | "-x" | "-y";

export function location(a: Angle): Location {
  const c = coterminal(a);
  if (c.n === 0) return "+x";
  if (ratEq(c, rat(1, 2))) return "+y";
  if (ratEq(c, rat(1))) return "-x";
  if (ratEq(c, rat(3, 2))) return "-y";
  return (Math.floor((2 * c.n) / c.d) + 1) as Quadrant;
}

/** The quadrant, or null for a quadrantal angle. */
export function quadrant(a: Angle): Quadrant | null {
  const l = location(a);
  return typeof l === "number" ? l : null;
}

const ROMAN = ["", "I", "II", "III", "IV"];
const AXIS_TEXT: Record<string, string> = {
  "+x": "\\text{positive } x\\text{-axis}",
  "+y": "\\text{positive } y\\text{-axis}",
  "-x": "\\text{negative } x\\text{-axis}",
  "-y": "\\text{negative } y\\text{-axis}",
};

/** "\text{Quadrant II}" or "\text{negative } y\text{-axis}". */
export const locationLatex = (l: Location): string =>
  typeof l === "number" ? `\\text{Quadrant ${ROMAN[l]}}` : AXIS_TEXT[l];

/** The acute (or zero or right) angle to the x-axis, in [0, π/2]. */
export function referenceAngle(a: Angle): Angle {
  const c = coterminal(a);
  const candidates = [c, sub(rat(1), c), sub(c, rat(1)), sub(rat(2), c)];
  return candidates.filter((x) => x.n >= 0 && ratValue(x) <= 0.5)[0];
}

/** The angle in [0, 2π) with reference angle `ref` (in [0, π/2]) in quadrant `q`. */
export function fromReference(ref: Angle, q: Quadrant): Angle {
  if (q === 1) return ref;
  if (q === 2) return sub(rat(1), ref);
  if (q === 3) return add(rat(1), ref);
  return coterminal(sub(rat(2), ref));
}

/** The reference angles of the standard angles: 0, π/6, π/4, π/3, π/2. */
export const REFERENCE_ANGLES: readonly Angle[] = [rat(0), rat(1, 6), rat(1, 4), rat(1, 3), rat(1, 2)];

/** The 16 standard angles in [0, 2π), ascending: multiples of π/6 and π/4. */
export const STANDARD_ANGLES: readonly Angle[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  .flatMap((k) => [rat(k, 6), rat(k, 4)])
  .filter((x) => ratValue(x) < 2)
  .filter((x, i, all) => all.findIndex((y) => ratEq(x, y)) === i)
  .sort((x, y) => ratValue(x) - ratValue(y));

/** Whether a is coterminal with a standard angle. */
export const isStandard = (a: Angle): boolean => [1, 2, 3, 4, 6].includes(coterminal(a).d);

// ------------------------------------------------------------------ exact values

/** An exact value n·√r / d: r square-free (1 when rational), d > 0, lowest terms. */
export interface Surd {
  n: number;
  r: number;
  d: number;
}

export function surd(n: number, r = 1, d = 1): Surd {
  if (d === 0) throw new Error("surd: zero denominator");
  if (r < 0) throw new Error("surd: negative radicand");
  const { outside, inside } = simplifyRadical(r);
  n *= outside;
  if (n === 0 || inside === 0) return { n: 0, r: 1, d: 1 };
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return { n: n / g, r: inside, d: d / g };
}

export const surdValue = (s: Surd): number => (s.n * Math.sqrt(s.r)) / s.d;
export const surdEq = (a: Surd, b: Surd): boolean => a.n === b.n && a.r === b.r && a.d === b.d;
export const surdNeg = (s: Surd): Surd => surd(-s.n, s.r, s.d);

/** a / b, rationalized; null when b is 0. */
export function surdDiv(a: Surd, b: Surd): Surd | null {
  if (b.n === 0) return null;
  // (a.n √a.r / a.d) / (b.n √b.r / b.d) = a.n b.d √(a.r b.r) / (a.d b.n b.r)
  return surd(a.n * b.d, a.r * b.r, a.d * b.n * b.r);
}

/** "0", "1", "-\sqrt{3}", "\frac{\sqrt{3}}{2}", "-\frac{2\sqrt{3}}{3}", "\frac{1}{2}". */
export function surdLatex(s: Surd): string {
  if (s.n === 0) return "0";
  const m = Math.abs(s.n);
  const body = s.r === 1 ? String(m) : `${m === 1 ? "" : m}\\sqrt{${s.r}}`;
  return (s.n < 0 ? "-" : "") + (s.d === 1 ? body : `\\frac{${body}}{${s.d}}`);
}

export type TrigFn = "sin" | "cos" | "tan" | "csc" | "sec" | "cot";
export const PRIMARY_FNS: readonly TrigFn[] = ["sin", "cos", "tan"];
export const TRIG_FNS: readonly TrigFn[] = ["sin", "cos", "tan", "csc", "sec", "cot"];

/** A trig function's exact value, or "undefined" (tan π/2, csc 0, ...). */
export type TrigValue = Surd | "undefined";

export const UNDEFINED_LATEX = "\\text{undefined}";

export const trigValueLatex = (v: TrigValue): string => (v === "undefined" ? UNDEFINED_LATEX : surdLatex(v));
/** The value as a float, NaN when undefined. */
export const trigValueNumber = (v: TrigValue): number => (v === "undefined" ? NaN : surdValue(v));
export const trigValueEq = (a: TrigValue, b: TrigValue): boolean =>
  a === "undefined" || b === "undefined" ? a === b : surdEq(a, b);

/** A point on the unit circle with exact coordinates. */
export interface UnitPoint {
  x: Surd;
  y: Surd;
}

// (cos, sin) of each reference angle, by its denominator in REFERENCE_ANGLES order
const REF_POINTS: readonly UnitPoint[] = [
  { x: surd(1), y: surd(0) },
  { x: surd(1, 3, 2), y: surd(1, 1, 2) },
  { x: surd(1, 2, 2), y: surd(1, 2, 2) },
  { x: surd(1, 1, 2), y: surd(1, 3, 2) },
  { x: surd(0), y: surd(1) },
];

function requireStandard(a: Angle): void {
  if (!isStandard(a)) throw new Error(`trigKit: ${a.n}/${a.d}·π is not a standard angle`);
}

/** (cos a, sin a) for a standard angle a (any coterminal form). */
export function unitPoint(a: Angle): UnitPoint {
  requireStandard(a);
  const ref = referenceAngle(a);
  const base = REF_POINTS[REFERENCE_ANGLES.findIndex((r) => ratEq(r, ref))];
  const c = ratValue(coterminal(a));
  const sx = c > 0.5 && c < 1.5 ? -1 : 1;
  const sy = c > 1 ? -1 : 1;
  return { x: surd(sx * base.x.n, base.x.r, base.x.d), y: surd(sy * base.y.n, base.y.r, base.y.d) };
}

/** "\left(\frac{\sqrt{3}}{2}, -\frac{1}{2}\right)". */
export const pointLatex = (p: UnitPoint): string => `\\left(${surdLatex(p.x)}, ${surdLatex(p.y)}\\right)`;

const ratio = (top: Surd, bottom: Surd): TrigValue => surdDiv(top, bottom) ?? "undefined";

/** The exact value of fn at a standard angle a. */
export function exactValue(fn: TrigFn, a: Angle): TrigValue {
  const { x, y } = unitPoint(a);
  const one = surd(1);
  switch (fn) {
    case "sin":
      return y;
    case "cos":
      return x;
    case "tan":
      return ratio(y, x);
    case "cot":
      return ratio(x, y);
    case "sec":
      return ratio(one, x);
    case "csc":
      return ratio(one, y);
  }
}

/** fn at x radians as a float (for numeric checks only; huge near an asymptote). */
export function trigNumber(fn: TrigFn, x: number): number {
  switch (fn) {
    case "sin":
      return Math.sin(x);
    case "cos":
      return Math.cos(x);
    case "tan":
      return Math.tan(x);
    case "cot":
      return 1 / Math.tan(x);
    case "sec":
      return 1 / Math.cos(x);
    case "csc":
      return 1 / Math.sin(x);
  }
}

/** "\sin", "\sec", ... */
export const fnLatex = (fn: TrigFn): string => `\\${fn}`;

/**
 * fn applied to a printed argument: "\sin \frac{5\pi}{6}", "\cos 150^{\circ}",
 * "\tan\left(-\frac{\pi}{4}\right)", "\sin^{2} x" with power 2. A negative or
 * multi-term argument is bracketed.
 */
export function trigOf(fn: TrigFn, arg: string, power?: number): string {
  const name = power === undefined || power === 1 ? fnLatex(fn) : `${fnLatex(fn)}^{${power}}`;
  const bare = !arg.trim().startsWith("-") && !/\s[+-]\s/.test(arg);
  return bare ? `${name} ${arg}` : `${name}\\left(${arg}\\right)`;
}

// ------------------------------------------------------------------ inverse trig

/**
 * Principal ranges (the usual US Precalculus conventions):
 * arcsin [-π/2, π/2], arccos [0, π], arctan (-π/2, π/2),
 * arccsc [-π/2, π/2] without 0, arcsec [0, π] without π/2, arccot (0, π).
 */
export function principalRange(fn: TrigFn): { lo: Angle; hi: Angle } {
  return fn === "sin" || fn === "tan" || fn === "csc" ? { lo: rat(-1, 2), hi: rat(1, 2) } : { lo: rat(0), hi: rat(1) };
}

/** The standard angles (as signed angles, not reduced to [0, 2π)) in fn's principal range where fn is defined. */
export function principalAngles(fn: TrigFn): Angle[] {
  const { lo, hi } = principalRange(fn);
  const out: Angle[] = [];
  for (let k = -12; k <= 12; k++) {
    for (const d of [6, 4]) {
      const a = rat(k, d);
      if (ratValue(a) < ratValue(lo) || ratValue(a) > ratValue(hi)) continue;
      if (out.some((b) => ratEq(a, b))) continue;
      if (exactValue(fn, a) === "undefined") continue;
      out.push(a);
    }
  }
  return out.sort((x, y) => ratValue(x) - ratValue(y));
}

/** The principal value of fn^{-1}(v), or null when v is not fn of a standard angle. */
export function inverseValue(fn: TrigFn, v: Surd): Angle | null {
  return principalAngles(fn).find((a) => trigValueEq(exactValue(fn, a), v)) ?? null;
}

/** "\arcsin", "\operatorname{arcsec}", or with notation "power": "\sin^{-1}". */
export function inverseLatex(fn: TrigFn, notation: "arc" | "power" = "arc"): string {
  if (notation === "power") return `${fnLatex(fn)}^{-1}`;
  return fn === "sin" || fn === "cos" || fn === "tan" ? `\\arc${fn}` : `\\operatorname{arc${fn}}`;
}

/** An inverse applied to a printed value: "\arcsin\left(-\frac{1}{2}\right)", "\arctan \sqrt{3}". */
export function inverseOf(fn: TrigFn, arg: string, notation: "arc" | "power" = "arc"): string {
  const name = inverseLatex(fn, notation);
  return arg.trim().startsWith("-") || arg.includes("\\frac") ? `${name}\\left(${arg}\\right)` : `${name} ${arg}`;
}

// ------------------------------------------------------------------ equations

const byValue = (x: Angle, y: Angle) => ratValue(x) - ratValue(y);

/**
 * Every x in [0, 2π) with fn(coef·x) = v, ascending (empty when v is not a
 * value fn takes at a standard angle, e.g. sin x = 2). coef is a positive
 * whole number: anglesWithValue("sin", ½, 2) holds π/12, 5π/12, 13π/12, 17π/12.
 */
export function anglesWithValue(fn: TrigFn, v: Surd, coef = 1): Angle[] {
  const base = STANDARD_ANGLES.filter((t) => trigValueEq(exactValue(fn, t), v));
  return base.flatMap((t) => Array.from({ length: coef }, (_, k) => rat(t.n + 2 * k * t.d, t.d * coef))).sort(byValue);
}

/**
 * The general solution of fn(coef·x) = v: x = start + period·k for each start.
 * Two solutions half a turn apart merge into one family of period π/coef
 * (tan x = 1: x = π/4 + πk; sin x = 0: x = πk), otherwise the period is 2π/coef.
 */
export function generalSolution(fn: TrigFn, v: Surd, coef = 1): { starts: Angle[]; period: Angle } {
  const base = anglesWithValue(fn, v);
  const half = base.length === 2 && ratEq(sub(base[1], base[0]), rat(1));
  const starts = (half ? [base[0]] : base).map((t) => rat(t.n, t.d * coef));
  return { starts, period: rat(half ? 1 : 2, coef) };
}

/** "x = \frac{\pi}{6}, \frac{5\pi}{6}" or "\theta = 30^{\circ}, 150^{\circ}"; NO_SOLUTION when empty. */
export function solutionSetLatex(v: string, angles: readonly Angle[], unit: AngleUnit): string {
  if (angles.length === 0) return NO_SOLUTION;
  return `${v} = ${[...angles].sort(byValue).map((a) => angleLatex(a, unit)).join(", ")}`;
}

/**
 * "x = \frac{\pi}{6} + 2\pi k, \frac{5\pi}{6} + 2\pi k", "x = \pi k",
 * "x = 30^{\circ} + 360^{\circ} k"; NO_SOLUTION when there are no starts.
 */
export function generalSolutionLatex(
  sol: { starts: readonly Angle[]; period: Angle },
  v: string,
  unit: AngleUnit,
  k = "k",
): string {
  if (sol.starts.length === 0) return NO_SOLUTION;
  const step = unit === "degrees" ? `${degreeLatex(sol.period)} ${k}` : piLatex(sol.period.n, sol.period.d, k);
  const family = (s: Angle) => (s.n === 0 ? step : `${angleLatex(s, unit)} + ${step}`);
  return `${v} = ${sol.starts.map(family).join(", ")}`;
}

// ------------------------------------------------------------------ mistakes

const COFUNCTION: Record<TrigFn, TrigFn> = { sin: "cos", cos: "sin", tan: "cot", cot: "tan", sec: "csc", csc: "sec" };
const RECIPROCAL: Record<TrigFn, TrigFn> = { sin: "csc", csc: "sin", cos: "sec", sec: "cos", tan: "cot", cot: "tan" };

/** sin <-> cos, tan <-> cot, sec <-> csc (swapping x and y). */
export const cofunction = (fn: TrigFn): TrigFn => COFUNCTION[fn];
/** sin <-> csc, cos <-> sec, tan <-> cot. */
export const reciprocalFn = (fn: TrigFn): TrigFn => RECIPROCAL[fn];

/** The value with the wrong sign (the quadrant's sign forgotten); undefined stays undefined. */
export const oppositeValue = (v: TrigValue): TrigValue => (v === "undefined" ? v : surdNeg(v));

/**
 * The same quadrant with reference angle π/6 and π/3 swapped (the √3/2 vs 1/2
 * mix-up): 5π/6 -> 2π/3. Null when the reference angle is not π/6 or π/3.
 */
export function swappedSpecialAngle(a: Angle): Angle | null {
  const ref = referenceAngle(a);
  const q = quadrant(a);
  if (q === null) return null;
  if (ratEq(ref, rat(1, 6))) return fromReference(rat(1, 3), q);
  if (ratEq(ref, rat(1, 3))) return fromReference(rat(1, 6), q);
  return null;
}

function distinctBy<T>(right: T, items: readonly (T | null)[], eq: (a: T, b: T) => boolean): T[] {
  const out: T[] = [];
  for (const it of items) if (it !== null && !eq(it, right) && !out.some((o) => eq(o, it))) out.push(it);
  return out;
}

/**
 * Wrong values of fn at a standard angle, most common first: wrong sign,
 * sin/cos (x/y) swapped, √3/2 and 1/2 mixed up, the reciprocal function,
 * swapped with the wrong sign. Distinct and never the right value.
 */
export function valueMistakes(fn: TrigFn, a: Angle): TrigValue[] {
  const right = exactValue(fn, a);
  const special = swappedSpecialAngle(a);
  const swapped = exactValue(cofunction(fn), a);
  return distinctBy(
    right,
    [
      oppositeValue(right),
      swapped,
      special ? exactValue(fn, special) : null,
      exactValue(reciprocalFn(fn), a),
      oppositeValue(swapped),
    ],
    trigValueEq,
  );
}

const pointEq = (p: UnitPoint, q: UnitPoint) => surdEq(p.x, q.x) && surdEq(p.y, q.y);

/** Wrong unit-circle points for a standard angle: x and y swapped, a wrong sign, √3/2 and 1/2 mixed up. */
export function pointMistakes(a: Angle): UnitPoint[] {
  const p = unitPoint(a);
  const special = swappedSpecialAngle(a);
  return distinctBy(
    p,
    [
      { x: p.y, y: p.x },
      { x: surdNeg(p.x), y: p.y },
      { x: p.x, y: surdNeg(p.y) },
      special ? unitPoint(special) : null,
      { x: surdNeg(p.x), y: surdNeg(p.y) },
    ],
    pointEq,
  );
}

/**
 * Wrong reference angles: the angle itself (not measured to the x-axis), the
 * angle to the nearest y-axis, and the distance to the wrong side of the
 * x-axis (π - θ where 2π - θ was needed, and the reverse). Non-negative.
 */
export function referenceAngleMistakes(a: Angle): Angle[] {
  const c = coterminal(a);
  const toY = ratValue(c) < 1 ? sub(c, rat(1, 2)) : sub(c, rat(3, 2));
  const abs = (x: Angle) => (x.n < 0 ? rat(-x.n, x.d) : x);
  return distinctBy(referenceAngle(a), [c, abs(toY), abs(sub(rat(1), c)), abs(sub(rat(2), c))], ratEq);
}

/**
 * Wrong coterminal angles for an angle written as `written`: one turn too few
 * or too many, the minus sign dropped, and reduced by π instead of 2π.
 */
export function coterminalMistakes(written: Angle): Angle[] {
  const c = coterminal(written);
  const dropSign = written.n < 0 ? coterminal(rat(-written.n, written.d)) : null;
  return distinctBy(c, [add(c, rat(2)), sub(c, rat(2)), dropSign, coterminal(add(c, rat(1)))], ratEq);
}

/** r/π printed: "\frac{27000}{\pi}". */
const overPi = (r: Rat): string => `${r.n < 0 ? "-" : ""}\\frac{${Math.abs(r.n)}}{${r.d === 1 ? "" : r.d}\\pi}`;

/**
 * Wrong radian measures for a degree angle a (Answer radianLatex(a)): the π
 * dropped, the factor flipped (deg·180/π), divided by 360 instead of 180, and
 * divided by 90.
 */
export function degreesToRadiansMistakes(a: Angle): string[] {
  const deg = toDegrees(a);
  return [numLatex(a), overPi(mul(deg, rat(180))), radianLatex(mul(a, rat(1, 2))), radianLatex(mul(a, rat(2)))];
}

/**
 * Wrong degree measures for a radian angle a (Answer degreeLatex(a)): π kept
 * ("150\pi^{\circ}"), multiplied by 360 or by 90 instead of 180.
 */
export function radiansToDegreesMistakes(a: Angle): string[] {
  const deg = toDegrees(a);
  const keptPi = deg.d === 1 ? `${deg.n}\\pi^{\\circ}` : null;
  return [keptPi, degreeLatex(mul(a, rat(2))), degreeLatex(mul(a, rat(1, 2)))].filter((s): s is string => s !== null);
}

// ------------------------------------------------------------------ rounding

/** x rounded half away from zero to `places` decimals. */
export function roundTo(x: number, places: number): number {
  const s = 10 ** places;
  const r = (Math.sign(x) * Math.round(Math.abs(x) * s + 1e-9)) / s;
  return r + 0;
}

/**
 * x to `places` decimals with trailing zeros dropped, as the nearest-tenth
 * Topics print it (distanceFormula): "6.3", "6" (not "6.0"), never "-0".
 */
export function decimalLatex(x: number, places: number): string {
  return String(roundTo(x, places));
}

/** An angle in degrees to `places` decimals: "36.9^{\circ}". */
export const roundedDegreesLatex = (deg: number, places = 1): string => `${decimalLatex(deg, places)}^{\\circ}`;

/**
 * Whether x is at least `margin` (in units of the last place) away from a
 * rounding boundary, so a student's calculator and the key cannot disagree;
 * re-pick when it is not.
 */
export function roundsCleanly(x: number, places: number, margin = 0.05): boolean {
  const scaled = Math.abs(x) * 10 ** places;
  return Math.abs((scaled - Math.floor(scaled)) - 0.5) >= margin;
}

/** Degrees, minutes and seconds: "25^{\circ} 30' 15''" (zero parts after the degrees dropped). */
export function dmsLatex(deg: number, min: number, sec = 0): string {
  return [`${deg}^{\\circ}`, min ? `${min}'` : "", sec ? `${sec}''` : ""].filter(Boolean).join(" ");
}

/** Degrees, minutes and seconds as an exact number of degrees. */
export const dmsToDegrees = (deg: number, min: number, sec = 0): Rat => rat(deg * 3600 + min * 60 + sec, 3600);

/** Small Pythagorean triples (legs a < b, hypotenuse c) for right-triangle and unit-circle points. */
export const PYTHAGOREAN_TRIPLES: readonly (readonly [number, number, number])[] = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [7, 24, 25],
  [20, 21, 29],
  [9, 40, 41],
];

/**
 * Exact degrees as degrees, minutes and seconds, or null when the seconds are
 * not whole: 25.505 -> {deg: 25, min: 30, sec: 18}. A non-negative angle only.
 * (Whole seconds give an exact decimal of at most 4 places exactly when the
 * seconds past the degree are a multiple of 9, since 3600 = 9 * 400.)
 */
export function degreesToDms(deg: Rat): { deg: number; min: number; sec: number } | null {
  if (deg.n < 0) throw new Error("degreesToDms: negative angle");
  const seconds = mul(deg, rat(3600));
  if (seconds.d !== 1) return null;
  const s = seconds.n;
  return { deg: Math.floor(s / 3600), min: Math.floor((s % 3600) / 60), sec: s % 60 };
}

// ------------------------------------------------------------------ points on the terminal side

/**
 * fn at an angle whose terminal side passes through the point (x, y) (not the
 * origin), from r = √(x² + y²): sin = y/r, cos = x/r, tan = y/x and their
 * reciprocals, rationalized; "undefined" on an axis where it divides by zero.
 */
export function pointValue(fn: TrigFn, x: number, y: number): TrigValue {
  if (x === 0 && y === 0) throw new Error("pointValue: the origin is on every terminal side");
  const r = surd(1, x * x + y * y);
  const X = surd(x);
  const Y = surd(y);
  switch (fn) {
    case "sin":
      return ratio(Y, r);
    case "cos":
      return ratio(X, r);
    case "tan":
      return ratio(Y, X);
    case "cot":
      return ratio(X, Y);
    case "sec":
      return ratio(r, X);
    case "csc":
      return ratio(r, Y);
  }
}

/**
 * Wrong values of fn for a point (x, y) on the terminal side, most common
 * first: the quadrant's sign ignored, x and y swapped, the reciprocal
 * function, r taken as |x| + |y| instead of √(x² + y²), swapped with the wrong
 * sign, and (for tan and cot) divided by r. Distinct and never the right value.
 */
export function pointValueMistakes(fn: TrigFn, x: number, y: number): TrigValue[] {
  const right = pointValue(fn, x, y);
  const sumR = Math.abs(x) + Math.abs(y);
  // with r replaced by |x| + |y|, which is a perfect square only by accident
  const wrongR = (): TrigValue | null => {
    if (fn === "tan" || fn === "cot") return null;
    const top = fn === "sin" ? y : fn === "cos" ? x : sumR;
    const bottom = fn === "sin" || fn === "cos" ? sumR : fn === "sec" ? x : y;
    return bottom === 0 ? null : surd(top, 1, bottom);
  };
  return distinctBy(
    right,
    [
      oppositeValue(right),
      pointValue(fn, y, x),
      pointValue(reciprocalFn(fn), x, y),
      wrongR(),
      oppositeValue(pointValue(fn, y, x)),
      // tan and cot taken over r, like sin and cos
      fn === "tan" ? pointValue("sin", x, y) : fn === "cot" ? pointValue("cos", x, y) : null,
    ],
    trigValueEq,
  );
}

// ------------------------------------------------------------------ right triangles

/** x cut (not rounded) to `places` decimals: the "dropped the extra digits" slip. */
export function truncateTo(x: number, places: number): number {
  const s = 10 ** places;
  return (Math.sign(x) * Math.floor(Math.abs(x) * s + 1e-9)) / s + 0;
}

/** A Surd as plain text for a triangle label: "12", "√13", "2√5", "√3/2", "−1/2". */
export function surdText(s: Surd): string {
  const m = Math.abs(s.n);
  const body = s.r === 1 ? String(m) : `${m === 1 ? "" : m}√${s.r}`;
  return (s.n < 0 ? "−" : "") + body + (s.d === 1 ? "" : `/${s.d}`);
}

/** An angle in degrees as a triangle label, to `places` decimals: "35°", "36.9°". */
export const degreeText = (deg: number, places = 1): string => `${decimalLatex(deg, places)}°`;

/** A side of a right triangle named from one of its acute angles. */
export type RightSide = "opp" | "adj" | "hyp";

/**
 * A right triangle drawn with its legs along the axes: `run` the horizontal
 * leg, `rise` the vertical one. Returns [the right-angle corner, the far end
 * of the horizontal leg, the top of the vertical leg]; `flip` puts the right
 * angle at the bottom right instead of the bottom left.
 */
export function rightTriangleCorners(run: number, rise: number, flip = false): [PlotXY, PlotXY, PlotXY] {
  if (!(run > 0 && rise > 0)) throw new RangeError(`rightTriangleCorners: legs ${run}, ${rise}`);
  const s = flip ? -1 : 1;
  return [
    { x: 0, y: 0 },
    { x: s * run + 0, y: 0 },
    { x: 0, y: rise },
  ];
}

// ------------------------------------------------------------------ sums of surds
//
// Added for the identity Topics (sum and difference, multiple-angle and
// product-to-sum): exact values that are sums of radicals, like
// sin 75° = (√6 + √2)/4 and tan 15° = 2 - √3, and nested radicals like
// sin 22.5° = √(2 - √2)/2. Purely additive; nothing above changes.

/** An exact value (Σ nᵢ√rᵢ) / d: each rᵢ square-free and distinct, nᵢ ≠ 0, d > 0, lowest terms. */
export interface SurdSum {
  /** sorted by radicand, ascending (the rational term, r = 1, first) */
  terms: { n: number; r: number }[];
  d: number;
}

/** Collect rational coefficients by radicand into a normalized SurdSum. */
function normalizeSum(coefs: Map<number, Rat>): SurdSum {
  const entries = [...coefs.entries()].filter(([, c]) => c.n !== 0).sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return { terms: [], d: 1 };
  const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
  const d = entries.reduce((l, [, c]) => lcm(l, c.d), 1);
  const terms = entries.map(([r, c]) => ({ n: (c.n * d) / c.d, r }));
  const g = terms.reduce((acc, t) => gcd(acc, t.n), d);
  return { terms: terms.map((t) => ({ n: t.n / g, r: t.r })), d: d / g };
}

function sumCoefs(s: SurdSum): Map<number, Rat> {
  const m = new Map<number, Rat>();
  for (const t of s.terms) m.set(t.r, add(m.get(t.r) ?? rat(0), rat(t.n, s.d)));
  return m;
}

/** The sum of the given surds (none: 0). */
export function surdSum(...parts: Surd[]): SurdSum {
  const m = new Map<number, Rat>();
  for (const p of parts) if (p.n !== 0) m.set(p.r, add(m.get(p.r) ?? rat(0), rat(p.n, p.d)));
  return normalizeSum(m);
}

export const sumAdd = (a: SurdSum, b: SurdSum): SurdSum => {
  const m = sumCoefs(a);
  for (const [r, c] of sumCoefs(b)) m.set(r, add(m.get(r) ?? rat(0), c));
  return normalizeSum(m);
};

export const sumScale = (a: SurdSum, k: Rat): SurdSum =>
  normalizeSum(new Map([...sumCoefs(a)].map(([r, c]) => [r, mul(c, k)])));

export const sumNeg = (a: SurdSum): SurdSum => sumScale(a, rat(-1));
export const sumSub = (a: SurdSum, b: SurdSum): SurdSum => sumAdd(a, sumNeg(b));

/** a · b, with √p·√q simplified. */
export function sumMul(a: SurdSum, b: SurdSum): SurdSum {
  const m = new Map<number, Rat>();
  for (const s of a.terms)
    for (const t of b.terms) {
      const p = surd(s.n * t.n, s.r * t.r, a.d * b.d);
      if (p.n !== 0) m.set(p.r, add(m.get(p.r) ?? rat(0), rat(p.n, p.d)));
    }
  return normalizeSum(m);
}

const primesOf = (n: number): number[] => {
  const out: number[] = [];
  for (let p = 2; p * p <= n; p++) if (n % p === 0) {
    out.push(p);
    while (n % p === 0) n /= p;
  }
  if (n > 1) out.push(n);
  return out;
};

/** a with every √r whose radicand contains the prime p negated (a Galois conjugate). */
const conjugate = (a: SurdSum, p: number): SurdSum => ({
  terms: a.terms.map((t) => (t.r % p === 0 ? { n: -t.n, r: t.r } : t)),
  d: a.d,
});

/** a / b with the denominator rationalized (by conjugates); null when b is 0. */
export function sumDiv(a: SurdSum, b: SurdSum): SurdSum | null {
  if (b.terms.length === 0) return null;
  let top = a;
  let bottom = b;
  for (;;) {
    const p = bottom.terms.map((t) => primesOf(t.r)).flat()[0];
    if (p === undefined) break;
    const c = conjugate(bottom, p);
    top = sumMul(top, c);
    bottom = sumMul(bottom, c);
  }
  // bottom is now a single rational term n/d
  const q = bottom.terms[0];
  return sumScale(top, rat(bottom.d, q.n));
}

export const surdToSum = (s: Surd): SurdSum => surdSum(s);
export const sumValue = (s: SurdSum): number => s.terms.reduce((v, t) => v + t.n * Math.sqrt(t.r), 0) / s.d;
export const sumEq = (a: SurdSum, b: SurdSum): boolean =>
  a.d === b.d && a.terms.length === b.terms.length && a.terms.every((t, i) => t.n === b.terms[i].n && t.r === b.terms[i].r);
/** The single surd a one-term (or zero) sum is, else null. */
export const sumAsSurd = (s: SurdSum): Surd | null =>
  s.terms.length === 0 ? surd(0) : s.terms.length === 1 ? surd(s.terms[0].n, s.terms[0].r, s.d) : null;

/**
 * Canonical printing: the rational term first, then radicals by decreasing
 * radicand; when every term is negative the minus sign goes in front of the
 * fraction, otherwise the positive terms lead. "\frac{\sqrt{6} + \sqrt{2}}{4}",
 * "\frac{\sqrt{2} - \sqrt{6}}{4}", "2 - \sqrt{3}", "\sqrt{3} - 2",
 * "-\frac{\sqrt{6} + \sqrt{2}}{4}", "-2 - \sqrt{3}" (d = 1 is printed with a
 * leading minus, like any sum). A single term prints as surdLatex does.
 */
export function sumLatex(s: SurdSum): string {
  const single = sumAsSurd(s);
  if (single) return surdLatex(single);
  const ordered = [...s.terms].sort((a, b) => (a.r === 1 ? -1 : b.r === 1 ? 1 : b.r - a.r));
  const allNeg = ordered.every((t) => t.n < 0);
  const factorOut = allNeg && s.d !== 1;
  const terms = factorOut
    ? ordered.map((t) => ({ n: -t.n, r: t.r }))
    : [...ordered.filter((t) => t.n > 0), ...ordered.filter((t) => t.n < 0)];
  const body = terms
    .map((t, i) => {
      const m = Math.abs(t.n);
      const tex = t.r === 1 ? String(m) : `${m === 1 ? "" : m}\\sqrt{${t.r}}`;
      return i === 0 ? (t.n < 0 ? "-" : "") + tex : ` ${t.n < 0 ? "-" : "+"} ${tex}`;
    })
    .join("");
  const frac = s.d === 1 ? body : `\\frac{${body}}{${s.d}}`;
  return factorOut ? `-${frac}` : frac;
}

/** A sum-valued trig value, or "undefined". */
export type SumValue = SurdSum | "undefined";

export const sumValueLatex = (v: SumValue): string => (v === "undefined" ? UNDEFINED_LATEX : sumLatex(v));

/** Whether a is coterminal with a multiple of π/12 (15°): the standard angles plus 15°, 75°, ... */
export const isTwelfth = (a: Angle): boolean => 12 % coterminal(a).d === 0;

/**
 * sin, cos or tan at any multiple of π/12 as an exact sum: a standard angle
 * by table, and an odd multiple kπ/12 as π/4 + (k - 3)π/12 by the sum
 * identities (sin 75° = (√6 + √2)/4, tan 15° = 2 - √3).
 */
export function twelfthValue(fn: "sin" | "cos" | "tan", a: Angle): SumValue {
  if (!isTwelfth(a)) throw new Error(`twelfthValue: ${a.n}/${a.d}·π is not a multiple of π/12`);
  if (isStandard(a)) {
    const v = exactValue(fn, a);
    return v === "undefined" ? v : surdToSum(v);
  }
  const p = rat(1, 4);
  const q = sub(a, p);
  const S = (f: TrigFn, x: Angle) => surdToSum(exactValue(f, x) as Surd);
  const sin = sumAdd(sumMul(S("sin", p), S("cos", q)), sumMul(S("cos", p), S("sin", q)));
  const cos = sumSub(sumMul(S("cos", p), S("cos", q)), sumMul(S("sin", p), S("sin", q)));
  if (fn === "sin") return sin;
  if (fn === "cos") return cos;
  return sumDiv(sin, cos) ?? "undefined";
}

/** s·√(a + b√r) / d: a nested radical (half-angle values at 22.5°, or 15° written as the formula gives it). */
export interface NestedRadical {
  s: 1 | -1;
  a: number;
  b: number;
  r: number;
  d: number;
}

export const nestedValue = (x: NestedRadical): number => (x.s * Math.sqrt(x.a + x.b * Math.sqrt(x.r))) / x.d;

/** "\frac{\sqrt{2 - \sqrt{3}}}{2}", "-\frac{\sqrt{2 + \sqrt{2}}}{2}". */
export function nestedLatex(x: NestedRadical): string {
  const b = Math.abs(x.b);
  const inner = `${x.a} ${x.b < 0 ? "-" : "+"} ${b === 1 ? "" : b}\\sqrt{${x.r}}`;
  const root = `\\sqrt{${inner}}`;
  return (x.s < 0 ? "-" : "") + (x.d === 1 ? root : `\\frac{${root}}{${x.d}}`);
}

export const nestedNeg = (x: NestedRadical): NestedRadical => ({ ...x, s: x.s === 1 ? -1 : 1 });

/** A half-angle value: a single surd, or a nested radical (√(2 ± √3)/2). */
export type HalfValue = { kind: "surd"; v: SurdSum } | { kind: "nested"; v: NestedRadical };

export const halfValueLatex = (h: HalfValue): string => (h.kind === "surd" ? sumLatex(h.v) : nestedLatex(h.v));
export const halfValueNumber = (h: HalfValue): number => (h.kind === "surd" ? sumValue(h.v) : nestedValue(h.v));

/**
 * sin, cos or tan of the angle h by the half-angle identities from the
 * standard angle 2h, exactly as the formulas give them:
 * sin h = ±√((1 - cos 2h)/2), cos h = ±√((1 + cos 2h)/2) (a nested radical
 * when cos 2h is ±√2/2 or ±√3/2, else a surd), tan h = (1 - cos 2h)/sin 2h,
 * with the sign of h's quadrant. Throws when 2h is not standard or tan h is
 * undefined.
 */
export function halfAngleValue(fn: "sin" | "cos" | "tan", h: Angle): HalfValue {
  const full = mul(h, rat(2));
  const c = exactValue("cos", full) as Surd;
  if (fn === "tan") {
    const s = exactValue("sin", full) as Surd;
    const top = sumSub(surdSum(surd(1)), surdToSum(c));
    if (s.n === 0) {
      if (top.terms.length === 0) return { kind: "surd", v: surdSum() };
      throw new Error("halfAngleValue: tan undefined");
    }
    return { kind: "surd", v: sumDiv(top, surdToSum(s))! };
  }
  const pos = location(h);
  const negative = fn === "sin" ? pos === 3 || pos === 4 || pos === "-y" : pos === 2 || pos === 3 || pos === "-x";
  const sign = negative ? -1 : 1;
  // (1 ∓ c)/2 with c = n√r/d is (d ∓ n√r)/(2d)
  const n = fn === "sin" ? -c.n : c.n;
  if (c.r === 1) {
    // a rational radicand: √(p/q) = √(pq)/q
    const v = rat(c.d + n, 2 * c.d);
    return { kind: "surd", v: surdToSum(surd(sign, v.n * v.d, v.d)) };
  }
  // √((d + n√r)/(2d)): here d = 2, so √((2 ± √r)/4) = √(2 ± √r)/2
  if (c.d !== 2) throw new Error("halfAngleValue: unexpected cosine");
  return { kind: "nested", v: { s: sign as 1 | -1, a: c.d, b: n, r: c.r, d: 2 } };
}
