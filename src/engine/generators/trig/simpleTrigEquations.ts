// "Solving simple trig equations": one trig function, to the first power or
// squared, as in 2\sin x + 1 = 0, \sqrt{3} \tan x - 1 = 0, 4\cos^{2} x = 3,
// with an opt-in multiple of the angle (\sin 2x = \frac{1}{2}), the
// reciprocal functions, and equations with no solution (\sin x = 2).
//
// Built ANSWER-FIRST: the function, its value v (a standard value, or one out
// of the function's range for "no solution") and the angle's coefficient c
// are chosen; the solutions are the table lookup anglesWithValue(fn, v, c)
// (squared: of v and -v). The equation is then written from v: a coefficient
// α and constant β with α·v = β (2 and -1 for v = -1/2, √3 and 1 for
// v = √3/3), arranged as α f - β = 0, α f = β, α f + B = β + B, or with f on
// both sides. Nothing is ever solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  angleSet,
  equationLatex,
  firstOfEach,
  NO_SOLUTION,
  promptWith,
  reflections,
  setHints,
  solutionsField,
  solutionsLatex,
  solveContext,
  swappedSpecials,
  term,
  unitField,
  type SolveContext,
  type Term,
} from "./trigEquationKit";
import {
  anglesWithValue,
  cofunction,
  reciprocalFn,
  surd,
  surdDiv,
  surdMul,
  surdNeg,
  trigOf,
  type Angle,
  type Surd,
  type TrigFn,
} from "./trigKit";
import { rat } from "../shared/equationKit";

export const SIMPLE_TRIG_EQUATIONS_ID = "simple-trig-equations";

export const schema = [
  unitField,
  solutionsField,
  { type: "boolean", key: "squared", label: "Include squared functions, like 4cos²x = 3", default: true },
  { type: "boolean", key: "multiple", label: "Include multiples of the angle, like sin 2x = 1/2", default: false },
  { type: "boolean", key: "reciprocal", label: "Include csc, sec and cot", default: false },
  { type: "boolean", key: "noSolution", label: "Include equations with no solution", default: false },
] as const satisfies ParamSchema;

const s = surd;
const pm = (v: Surd) => [v, surdNeg(v)];

/** Values each function takes at a standard angle (0 left out: sin x = 0 is too plain alone). */
const VALUES: Record<TrigFn, Surd[]> = {
  sin: [s(1, 1, 2), s(1, 2, 2), s(1, 3, 2), s(1)].flatMap(pm),
  cos: [s(1, 1, 2), s(1, 2, 2), s(1, 3, 2), s(1)].flatMap(pm),
  tan: [s(1, 3, 3), s(1), s(1, 3)].flatMap(pm),
  cot: [s(1, 3, 3), s(1), s(1, 3)].flatMap(pm),
  sec: [s(2), s(1, 2), s(2, 3, 3), s(1)].flatMap(pm),
  csc: [s(2), s(1, 2), s(2, 3, 3), s(1)].flatMap(pm),
};

/** Values out of range whose reciprocal is a standard value (so the slip of dividing the wrong way gives angles). */
const OUT_OF_RANGE: Partial<Record<TrigFn, Surd[]>> = {
  sin: [s(2), s(1, 2), s(2, 3, 3)].flatMap(pm),
  cos: [s(2), s(1, 2), s(2, 3, 3)].flatMap(pm),
  sec: [s(1, 1, 2), s(1, 2, 2), s(1, 3, 2)].flatMap(pm),
  csc: [s(1, 1, 2), s(1, 2, 2), s(1, 3, 2)].flatMap(pm),
};

export interface SimpleTrigConstruction {
  fn: TrigFn;
  /** f(c·x) = v, or f²(x) = v² when squared */
  value: Surd;
  coef: number;
  squared: boolean;
  equation: string;
  /** solutions in [0, 2π) */
  solutions: Angle[];
  ctx: SolveContext;
  /** wrong solution sets, most common mistake first */
  wrong: (Angle[] | null)[];
  extraHints: (string | null)[];
}

const isInt = (v: Surd) => v.r === 1 && v.d === 1;

/** α and β with α·v = β, α a whole number or a lone radical: 2 and -1 for -1/2, √3 and 1 for √3/3. */
function core(rng: Rng, v: Surd): { alpha: Surd; beta: Surd } {
  if (v.r > 1 && (v.n * v.r) % v.d === 0 && rng.bool(0.5)) return { alpha: s(1, v.r), beta: s((v.n * v.r) / v.d) };
  const k = v.r === 1 && rng.bool(0.25) ? 2 : 1;
  return { alpha: s(v.d * k), beta: s(v.n * k, v.r) };
}

/** α f = β arranged one of several ways (B shifts only with a rational β and whole α). */
function arrange(rng: Rng, f: string, alpha: Surd, beta: Surd): string {
  const plain = isInt(alpha) && beta.r === 1;
  const roll = rng.int(0, plain ? 3 : 1);
  if (roll === 0) return equationLatex([term(alpha, f), term(surdNeg(beta))], [term(0)]);
  if (roll === 1) return equationLatex([term(alpha, f)], [term(beta)]);
  const b = rng.int(1, 6) * (rng.bool() ? 1 : -1);
  const c = beta.n / beta.d + b;
  if (roll === 2 || !Number.isInteger(c)) {
    return equationLatex([term(alpha, f), term(b)], [term(s(beta.n + b * beta.d, 1, beta.d))]);
  }
  const g = rng.int(1, 3);
  const left: Term[] = [term(alpha.n + g, f), term(b)];
  const right: Term[] = [term(g, f), term(c)];
  return rng.bool() ? equationLatex(left, right) : equationLatex(right, left);
}

/** For each t in [0, 2π) with fn(t) = v, the x in [0, 2π) with c·x = t + 2πk. */
const spread = (base: readonly Angle[], c: number): Angle[] =>
  angleSet(base.flatMap((t) => Array.from({ length: c }, (_, k) => rat(t.n + 2 * k * t.d, t.d * c))));

/** The two-solution patterns a student might pair θ with: π - θ, π + θ, 2π - θ. */
const pairs = (t: Angle): Angle[][] => [
  [t, rat(t.d - t.n, t.d)],
  [t, rat(t.d + t.n, t.d)],
  [t, rat(2 * t.d - t.n, t.d)],
];

function pickFn(rng: Rng, reciprocal: boolean, allow: (f: TrigFn) => boolean): TrigFn {
  const pool = (reciprocal && rng.bool(0.35) ? (["csc", "sec", "cot"] as TrigFn[]) : (["sin", "cos", "tan"] as TrigFn[])).filter(allow);
  return rng.pick(pool.length ? pool : (["sin", "cos"] as TrigFn[]));
}

export function construct(params: ParamValues, rng: Rng): SimpleTrigConstruction {
  const p = resolveParams(schema, params);
  const ctx = solveContext(p);
  const noSolution = (p.noSolution as boolean) && rng.bool(0.2);
  const squared = !noSolution && (p.squared as boolean) && rng.bool(0.35);
  const coef = !squared && (p.multiple as boolean) && rng.bool(0.6) ? rng.int(2, 3) : 1;
  const fn = pickFn(rng, p.reciprocal as boolean, (f) => !noSolution || f in OUT_OF_RANGE);
  const arg = coef === 1 ? ctx.v : `${coef}${ctx.v}`;
  const extraHints: (string | null)[] = [];

  if (squared) {
    const mag = rng.pick(VALUES[fn].filter((v) => v.n > 0));
    const sq = surdMul(mag, mag); // rational p/q
    const f2 = trigOf(fn, arg, 2);
    const roll = rng.int(0, 2);
    const b = rng.int(1, 5);
    const equation =
      roll === 0
        ? equationLatex([term(sq.d, f2), term(-sq.n)], [term(0)])
        : roll === 1
          ? equationLatex([term(sq.d, f2)], [term(sq.n)])
          : equationLatex([term(sq.d, f2), term(-b)], [term(sq.n - b)]);
    const plus = anglesWithValue(fn, mag);
    const minus = anglesWithValue(fn, surdNeg(mag));
    const solutions = angleSet([...plus, ...minus]);
    const wrong = [
      plus, // forgot the ± when taking the square root
      firstOfEach([plus, minus]),
      swappedSpecials(solutions),
      anglesWithValue(cofunction(fn), mag).concat(anglesWithValue(cofunction(fn), surdNeg(mag))),
      [solutions[0]],
      minus,
    ];
    return { fn, value: mag, coef, squared, equation, solutions, ctx, wrong, extraHints };
  }

  const value = rng.pick(noSolution ? OUT_OF_RANGE[fn]! : VALUES[fn]);
  const { alpha, beta } = core(rng, value);
  const equation = arrange(rng, trigOf(fn, arg), alpha, beta);
  const solutions = anglesWithValue(fn, value, coef);
  const base = anglesWithValue(fn, value);
  const wrong: (Angle[] | null)[] = [];
  if (noSolution) {
    const flipped = surdDiv(s(1), value)!;
    const asRecip = anglesWithValue(fn, flipped, coef); // divided the wrong way: sin x = 1/2 for sin x = 2
    wrong.push(asRecip, asRecip.length ? [asRecip[0]] : null, anglesWithValue(fn, surdNeg(flipped), coef));
    wrong.push(anglesWithValue(reciprocalFn(fn), value, coef));
  } else {
    if (coef > 1) {
      wrong.push(base.map((t) => rat(t.n, t.d * coef))); // divided the first turn's angles by c, but not the period
      wrong.push(base); // ignored the coefficient
    }
    wrong.push([solutions[0]]);
    wrong.push(anglesWithValue(fn, surdNeg(value), coef)); // the constant moved with the wrong sign
    if (base.length) for (const pair of pairs(base[0])) wrong.push(spread(pair, coef));
    const sw = swappedSpecials(base);
    wrong.push(sw ? spread(sw, coef) : null);
    wrong.push(anglesWithValue(cofunction(fn), value, coef));
    if (p.noSolution as boolean) extraHints.push(NO_SOLUTION);
  }
  wrong.push(...reflections(solutions));
  return { fn, value, coef, squared, equation, solutions, ctx, wrong, extraHints };
}

export const promptLatex = (k: SimpleTrigConstruction): string => promptWith(k.equation, k.ctx);
export const answerLatex = (k: SimpleTrigConstruction): string => solutionsLatex({ u: k.solutions }, k.ctx);

/**
 * Mistake-based Distractors, most common first: for a multiple of the angle,
 * the first turn's angles divided by c but the period not (only the
 * solutions in [0, 2π/c)) and the coefficient ignored; only the first
 * (reference-quadrant) solution; the constant moved with the wrong sign; the
 * first solution paired with the wrong quadrant (π - θ, π + θ or 2π - θ);
 * π/6 and π/3 mixed up; sin and cos mixed up. Squared: the ± forgotten (only
 * f = +√), one solution per sign, π/6 and π/3 mixed up, the cofunction's
 * angles. No solution: the value's reciprocal used (sin x = 1/2 for
 * sin x = 2), with either sign, and the reciprocal function's angles.
 */
export function distractors(k: SimpleTrigConstruction): string[] {
  return setHints({ u: k.solutions }, k.ctx, k.wrong, k.extraHints);
}

export const generator: Generator = {
  id: SIMPLE_TRIG_EQUATIONS_ID,
  title: "Solving simple trig equations",
  defaultDirections: "Solve each equation. For general solutions, let k be any integer.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: SIMPLE_TRIG_EQUATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
