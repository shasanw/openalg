// "Solving trig equations with multiple-angle identities":
// - double angles: \sin 2x = \cos x (2\sin x \cos x = \cos x, a common
//   factor), \cos 2x + \sin x = 0 and \cos 2x = \cos x (cos 2x as 1 - 2sin²x
//   or 2cos²x - 1, a quadratic);
// - half angles: the same with x and x/2, \sin x = \sin \frac{x}{2} and
//   \cos x + \sin \frac{x}{2} = 1, where x/2 only runs over [0, π);
// - sums and differences: \sin x \cos \frac{\pi}{3} + \cos x \sin \frac{\pi}{3}
//   = \frac{1}{2} (one shifted function) and \sin(x + \frac{\pi}{6}) +
//   \sin(x - \frac{\pi}{6}) = \frac{3}{2} (2\sin x \cos \frac{\pi}{6}).
//
// Built ANSWER-FIRST: the function and the values it must take are chosen
// (the factors' roots, or the shifted function's value), then the equation
// is written from them through the identity. The solutions are table
// lookups (halved angle: doubled; shifted: shifted back). Nothing is solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { gcd } from "../../format";
import { add, mul, rat, type Rat } from "../shared/equationKit";
import {
  angleSet,
  equationLatex,
  firstOfEach,
  promptWith,
  reflections,
  setHints,
  solutionsField,
  solutionsLatex,
  solveContext,
  swappedSpecials,
  term,
  unitField,
  type SolutionSet,
  type SolveContext,
} from "./trigEquationKit";
import {
  angleLatex,
  anglesWithValue,
  cofunction,
  surd,
  surdDiv,
  surdLatex,
  surdMul,
  surdNeg,
  trigOf,
  type Angle,
  type AngleUnit,
  type Surd,
  type TrigFn,
} from "./trigKit";

export const TRIG_EQUATIONS_MULTIPLE_ANGLE_ID = "trig-equations-multiple-angle";

export type FormMode = "mixed" | "double" | "half" | "sumDifference";
export type Form = "double" | "half" | "sumDifference";

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Identities",
    default: "mixed",
    options: [
      { value: "mixed", label: "All kinds" },
      { value: "double", label: "Double angles, like sin 2x = cos x" },
      { value: "half", label: "Half angles, like cos x + sin(x/2) = 1" },
      { value: "sumDifference", label: "Sums and differences, like sin(x + π/6) + sin(x − π/6) = 1" },
    ],
  },
  unitField,
  solutionsField,
] as const satisfies ParamSchema;

export interface MultipleAngleConstruction {
  form: Form;
  equation: string;
  /** the solutions: angles u in [0, 2π) with x = scale·u */
  answer: SolutionSet;
  ctx: SolveContext;
  wrong: (SolutionSet | Angle[] | null)[];
}

const s = surd;
const pm = (v: Surd) => [v, surdNeg(v)];
const where = (fn: TrigFn, v: Surd) => anglesWithValue(fn, v);
const ROOTS_IN: Surd[] = [s(0), ...pm(s(1, 1, 2)), ...pm(s(1))];
const ROOTS_OUT: Surd[] = [...pm(s(2)), ...pm(s(3, 1, 2))];
/** k in sin 2x = k cos x: k/2 is the value sin x must take. */
const K_VALUES: Surd[] = [...pm(s(1)), ...pm(s(1, 2)), ...pm(s(1, 3)), ...pm(s(2))];

/** The single and double angle as printed: x and 2x, or x/2 and x. */
function angles(v: string, half: boolean): { one: string; two: string } {
  return half ? { one: `\\frac{${v}}{2}`, two: v } : { one: v, two: `2${v}` };
}

interface Factored {
  fn: TrigFn;
  roots: Surd[];
  zerosOf: TrigFn | null;
  equation: string;
}

/** sin(2u) = k f(u): f(u)(2 g(u) - k) = 0 with g the cofunction. */
function sinDouble(rng: Rng, one: string, two: string): Factored {
  const f = rng.pick(["sin", "cos"] as const);
  const g = cofunction(f);
  const k = rng.bool(0.15) ? rng.pick(pm(s(4))) : rng.pick(K_VALUES);
  const S2 = trigOf("sin", two);
  const F = trigOf(f, one);
  const equation = rng.bool(0.6)
    ? equationLatex([term(1, S2)], [term(k, F)])
    : equationLatex([term(1, S2), term(surdNeg(k), F)], [term(0)]);
  return { fn: g, roots: [surdDiv(k, s(2))!], zerosOf: f, equation };
}

/** a u² + b u + c from rational roots (a > 0, no common factor). */
function poly(r1: Rat, r2: Rat) {
  const sum = add(r1, r2);
  const prod = mul(r1, r2);
  const m = (sum.d * prod.d) / gcd(sum.d, prod.d);
  const a = m;
  const b = (-sum.n * m) / sum.d;
  const c = (prod.n * m) / prod.d;
  const g = gcd(gcd(a, Math.abs(b)), Math.abs(c)) || 1;
  return { a: a / g, b: b / g, c: c / g };
}

/** m cos(2u) + b f(u) + c = 0, with cos(2u) = 1 - 2sin²u or 2cos²u - 1 making it a quadratic in f(u). */
function cosDouble(rng: Rng, one: string, two: string): Factored | null {
  const f = rng.pick(["sin", "cos"] as const);
  const r1 = rng.pick(ROOTS_IN);
  const r2 = rng.pick(rng.bool(0.3) ? ROOTS_OUT : ROOTS_IN);
  if (surdLatex(r1) === surdLatex(r2)) return null;
  const q = poly(rat(r1.n, r1.d), rat(r2.n, r2.d));
  const lambda = q.a % 2 === 0 ? 1 : 2;
  const m = (lambda * q.a) / 2;
  // sin: -2m u² + b u + (m + c) = -λ(q.a u² + q.b u + q.c); cos: 2m u² + b u + (c - m) = λ(...)
  const b = f === "sin" ? -lambda * q.b : lambda * q.b;
  const c = f === "sin" ? -lambda * q.c - m : lambda * q.c + m;
  if (b === 0 || m > 2 || Math.abs(b) > 6 || Math.abs(c) > 6) return null;
  const C2 = trigOf("cos", two);
  const F = trigOf(f, one);
  const roll = rng.int(0, 2);
  const equation =
    roll === 0 || c === 0
      ? c === 0 && roll !== 0
        ? equationLatex([term(m, C2)], [term(-b, F)])
        : equationLatex([term(m, C2), term(b, F), term(c)], [term(0)])
      : roll === 1
        ? equationLatex([term(m, C2), term(b, F)], [term(-c)])
        : equationLatex([term(m, C2)], [term(-b, F), term(-c)]);
  return { fn: f, roots: [r1, r2], zerosOf: null, equation };
}

/** Sum-and-difference identities: one shifted function, or a sum of two shifted ones. */
function sumDifference(rng: Rng, v: string, unit: AngleUnit): { equation: string; u: Angle[]; wrong: (Angle[] | null)[] } | null {
  const a = rng.pick([rat(1, 6), rat(1, 4), rat(1, 3)]);
  const A = angleLatex(a, unit);
  const fn = rng.pick(["sin", "cos"] as const);
  const shift = (set: Angle[], by: Angle) => angleSet(set.map((t) => add(t, by)));
  const negA = rat(-a.n, a.d);
  if (rng.bool(0.5)) {
    // sin x cos a ± cos x sin a = sin(x ± a); cos x cos a ∓ sin x sin a = cos(x ± a)
    const plus = rng.bool();
    const w = rng.pick([...pm(s(1, 1, 2)), ...pm(s(1, 2, 2)), ...pm(s(1, 3, 2)), ...pm(s(1)), s(0)]);
    const [p1, p2] =
      fn === "sin"
        ? [`${trigOf("sin", v)} ${trigOf("cos", A)}`, `${trigOf("cos", v)} ${trigOf("sin", A)}`]
        : [`${trigOf("cos", v)} ${trigOf("cos", A)}`, `${trigOf("sin", v)} ${trigOf("sin", A)}`];
    const sign = fn === "sin" ? plus : !plus;
    const equation = equationLatex([term(1, p1), term(sign ? 1 : -1, p2)], [term(w)]);
    // f(x ± a) = w: x = t ∓ a
    const base = where(fn, w);
    const back = plus ? negA : a;
    return {
      equation,
      u: shift(base, back),
      wrong: [
        shift(base, plus ? a : negA), // shifted the wrong way
        base, // the shift ignored
        [shift(base, back)[0]],
        shift(where(fn, surdNeg(w)), back),
        shift(where(cofunction(fn), w), back), // the other identity (sin read as cos)
      ],
    };
  }
  // f(x + a) ± f(x - a) collapses to 2 g(x) h(a)
  const kind = rng.int(0, 3);
  const plusA = (f: TrigFn) => trigOf(f, `${v} + ${A}`);
  const minusA = (f: TrigFn) => trigOf(f, `${v} - ${A}`);
  // [printed sum, the function of x left, the factor K = 2·h(a)]
  const cosA = a.d === 6 ? s(1, 3) : a.d === 4 ? s(1, 2) : s(1);
  const sinA = a.d === 6 ? s(1) : a.d === 4 ? s(1, 2) : s(1, 3);
  const forms: [string, string, TrigFn, Surd][] = [
    [plusA("sin"), `+ ${minusA("sin")}`, "sin", cosA],
    [plusA("sin"), `- ${minusA("sin")}`, "cos", sinA],
    [plusA("cos"), `+ ${minusA("cos")}`, "cos", cosA],
    [minusA("cos"), `- ${plusA("cos")}`, "sin", sinA],
  ];
  const [first, second, g, K] = forms[kind];
  const w = rng.pick([...pm(s(1, 1, 2)), ...pm(s(1, 2, 2)), ...pm(s(1, 3, 2)), ...pm(s(1))]);
  const c = surdMul(K, w);
  const equation = `${first} ${second} = ${surdLatex(c)}`;
  const half = surdDiv(c, surdDiv(K, s(2))!)!;
  return {
    equation,
    u: where(g, w),
    wrong: [
      where(cofunction(g), w), // the wrong identity (sin x for cos x)
      [where(g, w)[0]],
      where(g, surdNeg(w)),
      where(g, half), // the 2 in 2 sin x cos a dropped
      where(g, c), // the factor K dropped
    ],
  };
}

export function construct(params: ParamValues, rng: Rng): MultipleAngleConstruction {
  const p = resolveParams(schema, params);
  const ctx = solveContext(p);
  const mode = p.form as FormMode;
  for (;;) {
    const form: Form =
      mode === "mixed" ? (rng.bool(0.5) ? "double" : rng.bool(0.6) ? "sumDifference" : "half") : (mode as Form);
    if (form === "sumDifference") {
      const k = sumDifference(rng, ctx.v, ctx.unit);
      if (!k || k.u.length === 0) continue;
      const wrong = [...k.wrong, swappedSpecials(k.u), ...reflections(k.u)];
      return { form, equation: k.equation, answer: { u: k.u }, ctx, wrong };
    }
    const half = form === "half";
    const { one, two } = angles(ctx.v, half);
    const f = rng.bool(0.45) ? sinDouble(rng, one, two) : cosDouble(rng, one, two);
    if (!f) continue;
    const perRoot = f.roots.map((r) => where(f.fn, r));
    const zeros = f.zerosOf ? where(f.zerosOf, s(0)) : [];
    const u = angleSet([...perRoot.flat(), ...zeros]);
    const scale = half ? 2 : 1;
    const answer: SolutionSet = { u, scale };
    const turnX = u.map((t) => mul(t, rat(scale))).filter((x) => x.n / x.d < 2);
    if (turnX.length === 0 || (turnX.length < 2 && !rng.bool(0.2))) continue;
    const at = (set: Angle[]): SolutionSet => ({ u: set, scale });
    const wrong: (SolutionSet | Angle[] | null)[] = [];
    if (f.zerosOf) {
      wrong.push(at(perRoot[0])); // divided by the common factor
      wrong.push(at(zeros)); // only the common factor's zeros
      wrong.push(at(angleSet([...where(f.fn, surdMul(f.roots[0], s(2))), ...zeros]))); // sin 2u read as sin u: the 2 dropped
      wrong.push(at(angleSet([...where(f.fn, surdNeg(f.roots[0])), ...zeros])));
      // the factor 2g(u) - k = 0 solved the wrong way up (cos x = 1/2 for cos x = 2)
      if (f.roots[0].n !== 0) wrong.push(at(angleSet([...where(f.fn, surdDiv(s(1), f.roots[0])!), ...zeros])));
      // the common factor's zeros mixed up with its cofunction's (sin x = 0 at π/2)
      wrong.push(at(angleSet([...where(cofunction(f.zerosOf), s(0)), ...perRoot[0]])));
    } else {
      for (const r of perRoot) wrong.push(at(r));
      wrong.push(at(angleSet(f.roots.flatMap((r) => where(f.fn, surdNeg(r))))));
      wrong.push(at(firstOfEach(perRoot)));
    }
    if (half) {
      wrong.unshift(
        { u, scale: 1 }, // solved for x/2 and stopped
        { u: angleSet(u.map((t) => mul(t, rat(2)))) }, // doubled every x/2 in [0, 2π), extra solutions
      );
    }
    wrong.push(at(angleSet(f.roots.flatMap((r) => where(cofunction(f.fn), r)).concat(zeros))));
    const sw = swappedSpecials(u);
    wrong.push(sw ? at(sw) : null);
    for (const r of reflections(u)) wrong.push(at(r));
    // half angles: x itself in the wrong quadrants
    if (half) for (const r of reflections(turnX)) wrong.push({ u: r });
    return { form, equation: f.equation, answer, ctx, wrong };
  }
}

export const promptLatex = (k: MultipleAngleConstruction) => promptWith(k.equation, k.ctx);
export const answerLatex = (k: MultipleAngleConstruction) => solutionsLatex(k.answer, k.ctx);

/**
 * Mistake-based Distractors, most common first: for half angles, the values
 * of x/2 given as x, and every x/2 in [0, 2π) doubled (solutions beyond one
 * turn kept); sin 2x = k cos x divided by cos x (its zeros lost), only the
 * common factor's zeros, the 2 of 2 sin x cos x dropped, the value's sign
 * flipped; a quadratic's factors alone, with signs flipped, or only their
 * first solutions; sums and differences shifted the wrong way, the shift
 * ignored, the 2 or the factor 2cos a dropped, the wrong identity (sin for
 * cos); then sin and cos mixed up, π/6 and π/3 mixed up, and wrong quadrants.
 */
export const distractors = (k: MultipleAngleConstruction): string[] => setHints(k.answer, k.ctx, k.wrong);

export const generator: Generator = {
  id: TRIG_EQUATIONS_MULTIPLE_ANGLE_ID,
  title: "Solving trig equations with multiple-angle identities",
  defaultDirections: "Solve each equation. For general solutions, let k be any integer.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: TRIG_EQUATIONS_MULTIPLE_ANGLE_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
