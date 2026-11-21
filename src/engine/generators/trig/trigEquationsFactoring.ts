// "Solving trig equations by factoring and with identities":
// - quadratic in one function, 2\sin^{2} x - \sin x - 1 = 0;
// - a common factor, 2\sin x \cos x - \sin x = 0 or \tan x \sin x = \tan x,
//   where dividing by the factor loses solutions and a factor's zero can be
//   where another function is undefined (extraneous);
// - an identity first: Pythagorean (2\cos^{2} x + 3\sin x - 3 = 0,
//   \sec^{2} x - 2\tan x = 0) or reciprocal (2\sin x - \csc x = 1).
//
// Built ANSWER-FIRST: the function and the values it must take (the factors'
// roots, chosen from its standard values and, for a factor with no
// solutions, values out of its range) are chosen; the equation is the
// product of the factors multiplied out, then rewritten with the identity.
// The solutions are the table lookups of those values, less any angle where
// a printed function is undefined. Nothing is ever solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { gcd } from "../../format";
import { add, mul, rat, type Rat } from "../shared/equationKit";
import {
  angleSet,
  equationLatex,
  firstOfEach,
  reflections,
  promptWith,
  setHints,
  solutionsField,
  solutionsLatex,
  solveContext,
  swappedSpecials,
  term,
  unitField,
  without,
  type SolveContext,
  type Term,
} from "./trigEquationKit";
import {
  anglesWithValue,
  cofunction,
  exactValue,
  reciprocalFn,
  STANDARD_ANGLES,
  surd,
  surdDiv,
  surdMul,
  surdNeg,
  trigOf,
  type Angle,
  type Surd,
  type TrigFn,
} from "./trigKit";

export const TRIG_EQUATIONS_FACTORING_ID = "trig-equations-factoring";

export type FormMode = "mixed" | "quadratic" | "commonFactor" | "identity";
export type Form = "quadratic" | "commonFactor" | "pythagorean" | "reciprocal";

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Equations",
    default: "mixed",
    options: [
      { value: "mixed", label: "All kinds" },
      { value: "quadratic", label: "Quadratic in one function, like 2sin²x − sin x − 1 = 0" },
      { value: "commonFactor", label: "A common factor, like tan x sin x = tan x" },
      { value: "identity", label: "An identity first, like 2cos²x + 3sin x − 3 = 0" },
    ],
  },
  unitField,
  solutionsField,
] as const satisfies ParamSchema;

export interface FactoringConstruction {
  form: Form;
  equation: string;
  /** solutions in [0, 2π) */
  solutions: Angle[];
  /** roots of the factoring that a printed function rejects */
  extraneous: Angle[];
  ctx: SolveContext;
  wrong: (Angle[] | null)[];
}

const s = surd;
const pm = (v: Surd) => [v, surdNeg(v)];

/** Values a factor may set the function to: with solutions, and out of its range. */
const ROOTS: Record<"sinCos" | "tan" | "secCsc", { in: Surd[]; out: Surd[] }> = {
  sinCos: { in: [s(0), ...pm(s(1, 1, 2)), ...pm(s(1))], out: [...pm(s(2)), ...pm(s(3, 1, 2))] },
  tan: { in: [s(0), ...pm(s(1))], out: [] },
  secCsc: { in: [...pm(s(1)), ...pm(s(2))], out: [s(0), ...pm(s(1, 1, 2))] },
};
const groupOf = (fn: TrigFn) => (fn === "sin" || fn === "cos" ? "sinCos" : fn === "tan" || fn === "cot" ? "tan" : "secCsc");

/** Where fn takes v, over one turn. */
const where = (fn: TrigFn, v: Surd) => anglesWithValue(fn, v);

/** Where fn takes 1/v (a factor solved the wrong way up); none for v = 0. */
const flipped = (fn: TrigFn, v: Surd) => (v.n === 0 ? [] : where(fn, surdDiv(s(1), v)!));

/** The angles of one turn where fn is undefined. */
const undefinedAt = (fn: TrigFn) => STANDARD_ANGLES.filter((t) => exactValue(fn, t) === "undefined");

const surdRat = (v: Surd): Rat | null => (v.r === 1 ? rat(v.n, v.d) : null);

/** a u² + b u + c (whole numbers, a > 0, no common factor) with roots r1 and r2, or null if not rational. */
function polyFromRoots(r1: Surd, r2: Surd): { a: number; b: number; c: number } | null {
  let sum: Rat | null;
  let prod: Rat | null;
  const x = surdRat(r1);
  const y = surdRat(r2);
  if (x && y) {
    sum = add(x, y);
    prod = mul(x, y);
  } else if (surdNeg(r1).n === r2.n && r1.r === r2.r && r1.d === r2.d) {
    sum = rat(0);
    prod = surdRat(surdMul(r1, r2));
  } else return null;
  if (!prod) return null;
  const m = (sum.d * prod.d) / gcd(sum.d, prod.d);
  const a = m;
  const b = (-sum.n * m) / sum.d;
  const c = (prod.n * m) / prod.d;
  const g = gcd(gcd(a, Math.abs(b)), Math.abs(c)) || 1;
  return { a: a / g, b: b / g, c: c / g };
}

/** Pick two roots for fn (the first with solutions; the second sometimes with none). */
function pickRoots(rng: Rng, fn: TrigFn, opts: { nonzero?: boolean; repeat?: boolean } = {}): [Surd, Surd] {
  const g = ROOTS[groupOf(fn)];
  const ok = (v: Surd) => !opts.nonzero || v.n !== 0;
  const r1 = rng.pick(g.in.filter(ok));
  const pool2 = g.out.filter(ok).length && rng.bool(0.3) ? g.out.filter(ok) : g.in.filter(ok);
  const r2 = opts.repeat && rng.bool(0.15) ? r1 : rng.pick(pool2);
  return [r1, r2];
}

const small = (q: { a: number; b: number; c: number }) => q.a <= 4 && Math.abs(q.b) <= 8 && Math.abs(q.c) <= 8;

interface Built {
  form: Form;
  equation: string;
  /** the function the factors are in, and each factor's value */
  fn: TrigFn;
  roots: Surd[];
  /** extra solution sets (a common factor's zeros) */
  zerosOf: TrigFn | null;
  /** every function printed */
  printed: TrigFn[];
}

/** a f² + b f + c = 0, sometimes with terms moved to the right. */
function quadraticEquation(rng: Rng, sq: string, f: string, q: { a: number; b: number; c: number }): string {
  const roll = rng.int(0, 2);
  if (roll === 1 && q.c !== 0) return equationLatex([term(q.a, sq), term(q.b, f)], [term(-q.c)]);
  if (roll === 2 && q.c !== 0) return equationLatex([term(q.a, sq)], [term(-q.b, f), term(-q.c)]);
  return equationLatex([term(q.a, sq), term(q.b, f), term(q.c)], [term(0)]);
}

function quadraticForm(rng: Rng, v: string): Built | null {
  const roll = rng.next();
  const fn: TrigFn = roll < 0.7 ? rng.pick(["sin", "cos"] as const) : roll < 0.85 ? "tan" : rng.pick(["sec", "csc"] as const);
  const [r1, r2] = pickRoots(rng, fn, { repeat: true });
  const q = polyFromRoots(r1, r2);
  // b = 0 is a "simple" equation (sin² x = 1/4), not one to factor
  if (!q || q.b === 0 || !small(q)) return null;
  const equation = quadraticEquation(rng, trigOf(fn, v, 2), trigOf(fn, v), q);
  return { form: "quadratic", equation, fn, roots: [r1, r2], zerosOf: null, printed: [fn] };
}

const COMMON_VALUES: Record<"sin" | "cos" | "tan", Surd[]> = {
  sin: [...pm(s(1, 1, 2)), ...pm(s(1, 2, 2)), ...pm(s(1, 3, 2)), ...pm(s(1))],
  cos: [...pm(s(1, 1, 2)), ...pm(s(1, 2, 2)), ...pm(s(1, 3, 2)), ...pm(s(1))],
  tan: [...pm(s(1)), ...pm(s(1, 3)), ...pm(s(1, 3, 3))],
};

function commonFactorForm(rng: Rng, v: string): Built | null {
  const f1 = rng.pick(["sin", "cos", "tan"] as const);
  const f2 = rng.pick((["sin", "cos", "tan"] as const).filter((f) => f !== f1));
  const w = f2 !== "tan" && rng.bool(0.2) ? rng.pick(pm(s(2))) : rng.pick(COMMON_VALUES[f2]);
  // α f2 = β with α a whole number or a lone radical
  const usesRadical = w.r > 1 && (w.n * w.r) % w.d === 0 && rng.bool(0.5);
  const alpha = usesRadical ? s(1, w.r) : s(w.d);
  const beta = usesRadical ? s((w.n * w.r) / w.d) : s(w.n, w.r);
  const F1 = trigOf(f1, v);
  const product = `${F1} ${trigOf(f2, v)}`;
  const left: Term[] = [term(alpha, product)];
  const equation = rng.bool(0.5)
    ? equationLatex([...left, term(surdNeg(beta), F1)], [term(0)])
    : equationLatex(left, [term(beta, F1)]);
  return { form: "commonFactor", equation, fn: f2, roots: [w], zerosOf: f1, printed: [f1, f2] };
}

function pythagoreanForm(rng: Rng, v: string): Built | null {
  const kind = rng.int(0, 2);
  if (kind === 0) {
    // in sin (or cos), with the square of the other: cos² = 1 - sin²
    const fn = rng.pick(["sin", "cos"] as const);
    const [r1, r2] = pickRoots(rng, fn);
    const q = polyFromRoots(r1, r2);
    if (!q || q.b === 0 || !small(q)) return null;
    // a u² + b u + c = a(1 - w²) + b u + c, printed as a w² - b u - (a + c) = 0
    const w = cofunction(fn);
    const terms = [term(q.a, trigOf(w, v, 2)), term(-q.b, trigOf(fn, v)), term(-(q.a + q.c))];
    const equation = rng.bool(0.5) || q.a + q.c === 0 ? equationLatex(terms, [term(0)]) : equationLatex(terms.slice(0, 2), [term(q.a + q.c)]);
    return { form: "pythagorean", equation, fn, roots: [r1, r2], zerosOf: null, printed: [fn, w] };
  }
  // tan and sec (or cot and csc): sec² = 1 + tan²
  const [t, sc] = rng.bool(0.7) ? (["tan", "sec"] as const) : (["cot", "csc"] as const);
  const inTan = kind === 1;
  const fn: TrigFn = inTan ? t : sc;
  const [r1, r2] = pickRoots(rng, fn, { repeat: true });
  const q = polyFromRoots(r1, r2);
  if (!q || q.b === 0 || !small(q)) return null;
  // in tan: a tan² = a sec² - a; in sec: a sec² = a tan² + a
  const other: TrigFn = inTan ? sc : t;
  const constant = inTan ? q.c - q.a : q.c + q.a;
  const terms = [term(q.a, trigOf(other, v, 2)), term(q.b, trigOf(fn, v)), term(constant)];
  const equation = rng.bool(0.5) || constant === 0 ? equationLatex(terms, [term(0)]) : equationLatex(terms.slice(0, 2), [term(-constant)]);
  return { form: "pythagorean", equation, fn, roots: [r1, r2], zerosOf: null, printed: [fn, other] };
}

/** tan's root pairs for tan x + c cot x = b: a rational sum and product. */
const TAN_RECIPROCAL_ROOTS: [Surd, Surd][] = [
  [s(1), s(-1)],
  [s(1), s(1)],
  [s(-1), s(-1)],
  [s(1, 3), s(-1, 3)],
  [s(1, 3, 3), s(-1, 3, 3)],
];

function reciprocalForm(rng: Rng, v: string): Built | null {
  const fn = rng.pick(["sin", "cos", "tan"] as const);
  const [r1, r2] = fn === "tan" ? rng.pick(TAN_RECIPROCAL_ROOTS) : pickRoots(rng, fn, { nonzero: true });
  const q = polyFromRoots(r1, r2);
  // a u² + b u + c = 0 divided by u: a u + b + c / u = 0 (u ≠ 0 since c ≠ 0)
  if (!q || q.c === 0 || !small(q)) return null;
  const F = trigOf(fn, v);
  const R = trigOf(reciprocalFn(fn), v);
  const equation =
    q.b !== 0 && rng.bool(0.6)
      ? equationLatex([term(q.a, F), term(q.c, R)], [term(-q.b)])
      : equationLatex([term(q.a, F), term(q.b), term(q.c, R)], [term(0)]);
  return { form: "reciprocal", equation, fn, roots: [r1, r2], zerosOf: null, printed: [fn, reciprocalFn(fn)] };
}

function build(rng: Rng, mode: FormMode, v: string): Built {
  for (;;) {
    const kind: FormMode = mode === "mixed" ? rng.pick(["quadratic", "commonFactor", "identity"] as const) : mode;
    const b =
      kind === "quadratic"
        ? quadraticForm(rng, v)
        : kind === "commonFactor"
          ? commonFactorForm(rng, v)
          : rng.bool(0.7)
            ? pythagoreanForm(rng, v)
            : reciprocalForm(rng, v);
    // one lone solution only now and then: two or more make a richer Problem
    const n = b ? solutionsOf(b).solutions.length : 0;
    if (n > 1 || (n === 1 && rng.bool(0.2))) return b!;
  }
}

function solutionsOf(b: Built): { solutions: Angle[]; extraneous: Angle[]; perRoot: Angle[][] } {
  const perRoot = b.roots.map((r) => where(b.fn, r));
  const zeros = b.zerosOf ? where(b.zerosOf, s(0)) : [];
  const all = angleSet([...perRoot.flat(), ...zeros]);
  const bad = b.printed.flatMap(undefinedAt);
  const solutions = without(all, bad);
  return { solutions, extraneous: without(all, solutions), perRoot };
}

export function construct(params: ParamValues, rng: Rng): FactoringConstruction {
  const p = resolveParams(schema, params);
  const ctx = solveContext(p);
  const b = build(rng, p.form as FormMode, ctx.v);
  const { solutions, extraneous, perRoot } = solutionsOf(b);
  const bad = b.printed.flatMap(undefinedAt);
  const ok = (set: Angle[]) => without(set, bad);
  const wrong: (Angle[] | null)[] = [];
  if (b.zerosOf) {
    const zeros = where(b.zerosOf, s(0));
    wrong.push(ok(perRoot[0])); // divided by the common factor
    if (extraneous.length) wrong.push(angleSet([...solutions, ...extraneous])); // kept the undefined angle
    wrong.push(ok(zeros)); // only the common factor's zeros
    wrong.push(ok(where(b.fn, surdNeg(b.roots[0])).concat(zeros))); // the value's sign flipped
    wrong.push(firstOfEach([ok(zeros), ok(perRoot[0])]));
    wrong.push(ok(angleSet([...flipped(b.fn, b.roots[0]), ...zeros]))); // a f2 = b solved as f2 = a/b
    // the common factor's zeros mixed up with its cofunction's (sin x = 0 at π/2)
    const mixed = where(cofunction(b.zerosOf), s(0));
    wrong.push(angleSet([...mixed, ...ok(perRoot[0])]), mixed);
  } else {
    // a factor's solutions alone (one lost, or the factor divided out)
    for (const r of perRoot) wrong.push(ok(r));
    if (extraneous.length) wrong.push(angleSet([...solutions, ...extraneous]));
    // factored with the signs flipped (both, or one)
    const [r1, r2] = b.roots;
    wrong.push(ok(angleSet(b.roots.flatMap((r) => where(b.fn, surdNeg(r))))));
    wrong.push(ok(angleSet([...where(b.fn, surdNeg(r1)), ...where(b.fn, r2)])));
    wrong.push(ok(angleSet([...where(b.fn, r1), ...where(b.fn, surdNeg(r2))])));
    wrong.push(firstOfEach(perRoot.map(ok)));
    // a factor solved the wrong way up (2 sin x - 1 = 0 as sin x = 2)
    wrong.push(ok(angleSet([...flipped(b.fn, r1), ...where(b.fn, r2)])));
    wrong.push(ok(angleSet([...where(b.fn, r1), ...flipped(b.fn, r2)])));
    // solved for the other function (cos where sin was meant)
    wrong.push(ok(angleSet(b.roots.flatMap((r) => where(cofunction(b.fn), r)))));
  }
  wrong.push(swappedSpecials(solutions));
  wrong.push([solutions[0]]);
  wrong.push(...reflections(solutions));
  return { form: b.form, equation: b.equation, solutions, extraneous, ctx, wrong };
}

export const promptLatex = (k: FactoringConstruction) => promptWith(k.equation, k.ctx);
export const answerLatex = (k: FactoringConstruction) => solutionsLatex({ u: k.solutions }, k.ctx);

/**
 * Mistake-based Distractors, most common first: for a common factor,
 * dividing by it (its zeros lost), keeping an angle where a printed function
 * is undefined, only the common factor's zeros, the other factor's value with
 * the wrong sign; otherwise each factor's solutions alone (the other lost),
 * keeping an undefined angle, the factors' signs flipped, only the first
 * solution of each factor, and the cofunction's angles (sin and cos mixed
 * up); then π/6 and π/3 mixed up, and only the first solution.
 */
export const distractors = (k: FactoringConstruction): string[] => setHints({ u: k.solutions }, k.ctx, k.wrong);

export const generator: Generator = {
  id: TRIG_EQUATIONS_FACTORING_ID,
  title: "Solving trig equations by factoring and identities",
  defaultDirections: "Solve each equation. For general solutions, let k be any integer.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: TRIG_EQUATIONS_FACTORING_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
