// "Graphing trig functions": given y = a·f(b(x − c)) + d, graph it and state
// its amplitude (sine and cosine only), period, phase shift and vertical shift,
// and for tangent, cotangent, secant and cosecant its vertical asymptotes.
//
// Built ANSWER-FIRST: a, b, c and d are picked from small sets so that every
// feature is a nice multiple of π on the π/4 grid, and the prompt is printed
// from them:
// - b is 1/2, 1 or 2 for sine, cosine, secant and cosecant (quarter period
//   π/(2b) is π, π/2 or π/4) and 1/2 or 1 for tangent and cotangent (quarter
//   period π/(4b) is π/2 or π/4), so every max, min, midline crossing and
//   asymptote lands on a grid line; with "two periods" b = 1/2 is dropped for
//   sine-like curves (a 4π period would not fit twice);
// - c is a nonzero multiple of π/4 strictly inside half a period (and at most
//   π), so the phase shift is never the same graph as its sign-flipped
//   Distractor; c = 0 without phase shifts;
// - |a| is 1, 2 or 3 (negative only with reflections), d is ±1 or ±2 with
//   vertical shifts and 0 otherwise.
// The Answer reads off them: amplitude |a|, period 2π/b (π/b for tangent and
// cotangent), phase shift c, vertical shift d, asymptotes x = c + (u₀ + πk)/b
// with u₀ = π/2 (tan, sec) or 0 (cot, csc).
//
// The window is the same for every Problem (trigWindow over −2π..2π, y from
// −6 to 6), fixed by the largest |a| + |d| any option allows, never by this
// Problem's period or shift, so the student's blank grid gives nothing away.
// It is 4π wide: at least one full period of every curve, two with "two
// periods". The Answer Key's graph is the curve across that same window.
//
// Answer parts, in this order and wording, joined with ANSWER_PART_SEPARATOR:
//   \text{Amplitude: } 2            (sine and cosine only)
//   \text{Period: } \pi
//   \text{Phase shift: } \frac{\pi}{4} \text{ right}   (or "left", or "\text{Phase shift: none}")
//   \text{Vertical shift: } 1 \text{ up}               (or "down", or "\text{Vertical shift: none}")
//   \text{Asymptotes: } x = \frac{\pi}{4} + \pi k      (tan, cot, sec, csc; first one at or right of 0)
//
// Multiple choice: text choices (the Answer with one part changed by a common
// mistake), never graphs, as in graphingQuadratics.

import { createRng, type Rng } from "../../rng";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { trigWindow, type CoordinatePlaneSpec } from "../../plot";
import { add, distinctHints, div, mul, numLatex, rat, ratValue, sub, type Rat } from "../shared/equationKit";
import { fnLatex, generalSolutionLatex, piLatex, type TrigFn } from "./trigKit";

export const GRAPHING_TRIG_ID = "graphing-trig";

export type FunctionSet = "sinCos" | "tanCot" | "secCsc" | "all";
export type PromptForm = "factored" | "expanded" | "mixed";
export type Periods = "one" | "two";
export type WorkSpace = "grid" | "none";

/** Largest |a| and |d|; their sum fixes the y-window for every Problem. */
export const MAX_AMPLITUDE = 3;
export const MAX_SHIFT = 2;
/** The window spans −X_MAX_PI·π to X_MAX_PI·π. */
export const X_MAX_PI = 2;

export const schema = [
  {
    type: "enum",
    key: "functions",
    label: "Functions",
    default: "sinCos",
    options: [
      { value: "sinCos", label: "Sine and cosine" },
      { value: "tanCot", label: "Tangent and cotangent" },
      { value: "secCsc", label: "Secant and cosecant" },
      { value: "all", label: "All six" },
    ],
  },
  { type: "boolean", key: "phaseShift", label: "Include phase shifts", default: true },
  { type: "boolean", key: "verticalShift", label: "Include vertical shifts", default: true },
  { type: "boolean", key: "reflections", label: "Include reflections (negative a)", default: true },
  {
    type: "enum",
    key: "form",
    label: "Equation written as",
    default: "factored",
    options: [
      { value: "factored", label: "Factored: a sin(b(x − c)) + d" },
      { value: "expanded", label: "Expanded: a sin(bx − bc) + d (students factor out b)" },
      { value: "mixed", label: "A mix of both" },
    ],
  },
  {
    type: "enum",
    key: "periods",
    label: "Grid shows at least",
    default: "one",
    options: [
      { value: "one", label: "One full period" },
      { value: "two", label: "Two full periods" },
    ],
  },
  {
    type: "enum",
    key: "workSpace",
    label: "Work space",
    default: "grid",
    options: [
      { value: "grid", label: "Blank grid to graph on" },
      { value: "none", label: "None (state the features only)" },
    ],
  },
] as const satisfies ParamSchema;

const SINE_LIKE: readonly TrigFn[] = ["sin", "cos", "sec", "csc"];
const FUNCTIONS: Record<FunctionSet, readonly TrigFn[]> = {
  sinCos: ["sin", "cos"],
  tanCot: ["tan", "cot"],
  secCsc: ["sec", "csc"],
  all: ["sin", "cos", "tan", "cot", "sec", "csc"],
};

export const hasAmplitude = (fn: TrigFn) => fn === "sin" || fn === "cos";
export const hasAsymptotes = (fn: TrigFn) => !hasAmplitude(fn);
const isSineLike = (fn: TrigFn) => SINE_LIKE.includes(fn);

/** The values of b allowed for fn: each puts every key point on the π/4 grid. */
export function allowedB(fn: TrigFn, periods: Periods): Rat[] {
  if (!isSineLike(fn)) return [rat(1, 2), rat(1)];
  return periods === "two" ? [rat(1), rat(2)] : [rat(1, 2), rat(1), rat(2)];
}

/** The construction, exposed for tests. b and c are exact; c is in units of π. */
export interface TrigConstruction {
  fn: TrigFn;
  a: number;
  b: Rat;
  /** Phase shift over π (c = 1/4 means π/4). */
  c: Rat;
  d: number;
  form: "factored" | "expanded";
}

/** Period over π: 2/b, or 1/b for tangent and cotangent. */
export const periodOf = (k: Pick<TrigConstruction, "fn" | "b">): Rat =>
  div(rat(isSineLike(k.fn) ? 2 : 1), k.b)!;

/** x mod m for exact rationals, in [0, m). */
function ratMod(x: Rat, m: Rat): Rat {
  const q = Math.floor(ratValue(x) / ratValue(m) + 1e-12);
  return sub(x, mul(m, rat(q)));
}

/** The asymptotes as one family: the first at or right of 0, and the spacing π/b (both over π). */
export function asymptotesOf(k: Pick<TrigConstruction, "fn" | "b" | "c">): { start: Rat; spacing: Rat } | null {
  if (!hasAsymptotes(k.fn)) return null;
  const u0 = k.fn === "tan" || k.fn === "sec" ? rat(1, 2) : rat(0);
  const spacing = div(rat(1), k.b)!;
  return { start: ratMod(add(k.c, div(u0, k.b)!), spacing), spacing };
}

export function construct(params: ParamValues, rng: Rng): TrigConstruction {
  const p = resolveParams(schema, params);
  const fn = rng.pick(FUNCTIONS[p.functions as FunctionSet]);
  const b = rng.pick(allowedB(fn, p.periods as Periods));
  // c: a nonzero multiple of π/4 with |c| < period/2 and |c| <= π.
  const half = ratValue(periodOf({ fn, b })) / 2;
  const maxQuarters = Math.min(4, Math.ceil(half * 4) - 1);
  const c = p.phaseShift ? rat((rng.bool() ? -1 : 1) * rng.int(1, maxQuarters), 4) : rat(0);
  const mag = rng.int(1, MAX_AMPLITUDE);
  const a = p.reflections && rng.bool() ? -mag : mag;
  const d = p.verticalShift ? (rng.bool() ? -1 : 1) * rng.int(1, MAX_SHIFT) : 0;
  const formParam = p.form as PromptForm;
  const form = formParam === "mixed" ? (rng.bool() ? "factored" : "expanded") : formParam;
  return { fn, a, b, c, d, form };
}

// ------------------------------------------------------------------ printing

/** π·r printed: "\frac{\pi}{4}", "-\pi", "0". */
const piRat = (r: Rat) => piLatex(r.n, r.d);

/** b·x: "x", "2x", "\frac{1}{2}x". */
function bx(b: Rat): string {
  if (b.n === 1 && b.d === 1) return "x";
  return `${numLatex(b)}x`;
}

/** "u - \frac{\pi}{4}" or "u + \frac{\pi}{4}" for u − π·r, or u alone. */
function minusPi(u: string, r: Rat): string {
  if (r.n === 0) return u;
  return r.n > 0 ? `${u} - ${piRat(r)}` : `${u} + ${piRat(rat(-r.n, r.d))}`;
}

/** The argument of f as printed: b(x − c) or bx − bc. */
export function argumentLatex(k: TrigConstruction): string {
  if (k.form === "expanded") return minusPi(bx(k.b), mul(k.b, k.c));
  const inner = minusPi("x", k.c);
  if (k.b.n === 1 && k.b.d === 1) return inner;
  return k.c.n === 0 ? bx(k.b) : `${numLatex(k.b)}\\left(${inner}\\right)`;
}

export function promptLatex(k: TrigConstruction): string {
  const arg = argumentLatex(k);
  // Only a bare "x" or "2x" goes unbracketed: "\sin 2x", "\cos\left(x - \frac{\pi}{4}\right)".
  const f = /^\d*x$/.test(arg) ? `${fnLatex(k.fn)} ${arg}` : `${fnLatex(k.fn)}\\left(${arg}\\right)`;
  const coef = k.a === 1 ? "" : k.a === -1 ? "-" : String(k.a);
  const shift = k.d === 0 ? "" : k.d > 0 ? ` + ${k.d}` : ` - ${-k.d}`;
  return `y = ${coef}${f}${shift}`;
}

/** The features an Answer states; any of them may be a Distractor's wrong value. */
export interface TrigFacts {
  fn: TrigFn;
  /** Printed as is (a Distractor may print a negative "amplitude"). */
  amplitude: number;
  period: Rat;
  shift: Rat;
  vshift: number;
  asymptotes: { start: Rat; spacing: Rat } | null;
}

export function factsOf(k: TrigConstruction): TrigFacts {
  return {
    fn: k.fn,
    amplitude: Math.abs(k.a),
    period: periodOf(k),
    shift: k.c,
    vshift: k.d,
    asymptotes: asymptotesOf(k),
  };
}

export function answerLatex(f: TrigFacts): string {
  const parts: string[] = [];
  if (hasAmplitude(f.fn)) parts.push(`\\text{Amplitude: } ${f.amplitude}`);
  parts.push(`\\text{Period: } ${piRat(f.period)}`);
  parts.push(
    f.shift.n === 0
      ? "\\text{Phase shift: none}"
      : `\\text{Phase shift: } ${piRat(rat(Math.abs(f.shift.n), f.shift.d))} \\text{ ${f.shift.n > 0 ? "right" : "left"}}`,
  );
  parts.push(
    f.vshift === 0
      ? "\\text{Vertical shift: none}"
      : `\\text{Vertical shift: } ${Math.abs(f.vshift)} \\text{ ${f.vshift > 0 ? "up" : "down"}}`,
  );
  if (f.asymptotes) {
    const family = generalSolutionLatex({ starts: [f.asymptotes.start], period: f.asymptotes.spacing }, "x", "radians");
    parts.push(`\\text{Asymptotes: } ${family}`);
  }
  return parts.join(ANSWER_PART_SEPARATOR);
}

/**
 * The Answer with one part changed by a common mistake, most telling first:
 * period 2π·b (π·b) instead of 2π/b (π/b); tangent's period taken as 2π/b, or
 * a sine-like period halved; the phase shift's sign flipped; with bx − bc
 * printed, the shift read as bc without dividing by b; the amplitude given as
 * a negative a; the vertical shift's sign flipped; the amplitude as the full
 * height 2|a|; the asymptotes of the cofunction (tangent's where cotangent's
 * are) or with the phase shift left out; b itself given as the period.
 */
export function distractorsOf(k: TrigConstruction): string[] {
  const f = factsOf(k);
  const one = isSineLike(k.fn) ? rat(2) : rat(1);
  const variants: Partial<TrigFacts>[] = [
    { period: mul(one, k.b) },
    { period: isSineLike(k.fn) ? div(rat(1), k.b)! : div(rat(2), k.b)! },
    { shift: rat(-k.c.n, k.c.d) },
    k.form === "expanded" ? { shift: mul(k.b, k.c) } : {},
    hasAmplitude(k.fn) && k.a < 0 ? { amplitude: k.a } : {},
    { vshift: -k.d },
    hasAmplitude(k.fn) ? { amplitude: 2 * Math.abs(k.a) } : {},
  ];
  if (f.asymptotes) {
    const { spacing } = f.asymptotes;
    variants.push(
      { asymptotes: { start: ratMod(add(f.asymptotes.start, div(spacing, rat(2))!), spacing), spacing } },
      { asymptotes: asymptotesOf({ ...k, c: rat(0) }) },
    );
  }
  const answer = answerLatex(f);
  const candidates = variants.filter((v) => Object.keys(v).length > 0).map((v) => answerLatex({ ...f, ...v }));
  // b as the period: printed as a plain number, not a multiple of π.
  candidates.push(answer.replace(`\\text{Period: } ${piRat(f.period)}`, `\\text{Period: } ${numLatex(k.b)}`));
  return distinctHints(answer, candidates);
}

// ------------------------------------------------------------------ graphs

/** The blank window every Problem of this Topic is drawn on, whatever its options. */
export function graphWindow(): CoordinatePlaneSpec {
  return trigWindow([MAX_AMPLITUDE + MAX_SHIFT], X_MAX_PI);
}

export function answerGraph(k: TrigConstruction): CoordinatePlaneSpec {
  return {
    ...graphWindow(),
    curves: [{ kind: "trig", fn: k.fn, a: k.a, b: ratValue(k.b), c: ratValue(k.c) * Math.PI, d: k.d }],
  };
}

export const generator: Generator = {
  id: GRAPHING_TRIG_ID,
  title: "Graphing trig functions",
  defaultDirections:
    "Give each function's amplitude (if it has one), period, phase shift, vertical shift, and asymptotes (if any). If a grid is given, graph the function across it.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    const problem: Problem = {
      kind: "generated",
      generatorId: GRAPHING_TRIG_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(factsOf(k)),
      distractorHints: distractorsOf(k),
    };
    if (resolved.workSpace === "grid") {
      problem.graph = graphWindow();
      problem.answerGraph = answerGraph(k);
    }
    return problem;
  },
};
