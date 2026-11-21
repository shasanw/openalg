// "Sum and difference identities": exact values at angles that are not
// standard (\sin 75^{\circ} = \frac{\sqrt{6} + \sqrt{2}}{4},
// \tan\left(-\frac{5\pi}{12}\right) = -2 - \sqrt{3}), expressions that are one
// side of an identity (\sin 50^{\circ} \cos 20^{\circ} - \cos 50^{\circ}
// \sin 20^{\circ} = \frac{1}{2}), and \sin(\alpha + \beta) from \sin\alpha,
// \cos\beta and their quadrants.
//
// Built ANSWER-FIRST. An exact value: the angle (an odd multiple of 15°) is
// chosen first and its value comes from trigKit's twelfthValue, which splits
// it into two standard angles. An expression: the result angle R (standard)
// is chosen first, then a non-standard B, and A = R - B (or R + B), so the
// expression is fn(R) by the identity. Given values: two points from
// Pythagorean triples are chosen first (one per angle); every value is a
// ratio of their coordinates, and the formula is applied exactly.

import { createRng, type Rng } from "../../rng";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { add, distinctHints, div, mul, neg, numLatex, rat, ratEq, sub, type Rat } from "../shared/equationKit";
import {
  angleLatex,
  cofunction,
  exactValue,
  fromDegrees,
  locationLatex,
  PYTHAGOREAN_TRIPLES,
  STANDARD_ANGLES,
  sumAdd,
  sumDiv,
  sumMul,
  sumNeg,
  sumSub,
  sumValueLatex,
  surd,
  surdToSum,
  trigOf,
  trigValueLatex,
  twelfthValue,
  valueMistakes,
  type Angle,
  type AngleUnit,
  type Quadrant,
  type SumValue,
  type SurdSum,
} from "./trigKit";

export const SUM_DIFFERENCE_ID = "sum-difference-identities";

export type ProblemType = "exact" | "expression" | "given" | "mixed";
export type Units = AngleUnit | "mixed";
type Fn3 = "sin" | "cos" | "tan";
type Op = 1 | -1;

export const schema = [
  {
    type: "enum",
    key: "problemType",
    label: "Problems",
    default: "mixed",
    options: [
      { value: "exact", label: "Exact values, like sin 75°" },
      { value: "expression", label: "Expressions, like sin 50° cos 20° - cos 50° sin 20°" },
      { value: "given", label: "sin(α + β) from given values" },
      { value: "mixed", label: "Mixed" },
    ],
  },
  {
    type: "enum",
    key: "units",
    label: "Angles",
    default: "degrees",
    options: [
      { value: "degrees", label: "Degrees" },
      { value: "radians", label: "Radians" },
      { value: "mixed", label: "Both" },
    ],
  },
  { type: "boolean", key: "tangent", label: "Include tangent", default: true },
] as const satisfies ParamSchema;

// ------------------------------------------------------------------ constructions

export interface ExactConstruction {
  type: "exact";
  fn: Fn3;
  angle: Angle;
  unit: AngleUnit;
  /** the split into standard angles a student would make: angle = A + op·B */
  A: Angle;
  B: Angle;
  op: Op;
}

export interface ExpressionConstruction {
  type: "expression";
  fn: Fn3;
  /** the result angle, standard: R = A + op·B */
  R: Angle;
  A: Angle;
  B: Angle;
  op: Op;
  unit: AngleUnit;
}

/** A point on the terminal side, as the exact sin and cos of the angle. */
export interface Given {
  sin: Rat;
  cos: Rat;
  quadrant: Quadrant;
  /** which function's value the prompt states */
  stated: "sin" | "cos";
}

export interface GivenConstruction {
  type: "given";
  fn: Fn3;
  op: Op;
  alpha: Given;
  beta: Given;
}

export type Construction = ExactConstruction | ExpressionConstruction | GivenConstruction;

/**
 * The split angle = A + op·B with A standard and B one of π/6, π/4, π/3, tan
 * defined at both when needed: a sum with A > B is preferred, then the
 * smallest |A| (75° = 45° + 30°, 15° = 45° - 30°, -75° = -45° - 30°).
 */
export function split(a: Angle, fn: Fn3): { A: Angle; B: Angle; op: Op } {
  const Bs = [rat(1, 6), rat(1, 4), rat(1, 3)];
  const As = STANDARD_ANGLES.flatMap((x) => (x.n === 0 ? [x] : [x, neg(x)]));
  let best: { A: Angle; B: Angle; op: Op; score: number } | null = null;
  for (const A of As)
    for (const B of Bs)
      for (const op of [1, -1] as const) {
        if (!ratEq(add(A, mul(rat(op), B)), a)) continue;
        if (op === 1 && !(A.n / A.d > B.n / B.d)) continue;
        if (fn === "tan" && (exactValue("tan", A) === "undefined" || exactValue("tan", B) === "undefined")) continue;
        const score = Math.abs(A.n / A.d) + (op === 1 ? 0 : 0.01);
        if (!best || score < best.score) best = { A, B, op, score };
      }
  if (!best) throw new Error(`split: no split for ${a.n}/${a.d}`);
  return { A: best.A, B: best.B, op: best.op };
}

const FN3: readonly Fn3[] = ["sin", "cos", "tan"];

function pickUnit(rng: Rng, units: Units): AngleUnit {
  return units === "mixed" ? rng.pick(["degrees", "radians"] as const) : units;
}

function constructExact(rng: Rng, fns: readonly Fn3[], unit: AngleUnit): ExactConstruction {
  const fn = rng.pick(fns);
  // an odd multiple of 15°: 15° to 345°, or -165° to -15°
  const k = rng.bool(0.2) ? -rng.pick([1, 5, 7, 11]) : rng.pick([1, 5, 7, 11, 13, 17, 19, 23]);
  const angle = rat(k, 12);
  return { type: "exact", fn, angle, unit, ...split(angle, fn) };
}

/** Whole-degree B that is not a multiple of 15, so neither B nor A is standard. */
const B_DEGREES: Record<AngleUnit, readonly number[]> = {
  degrees: [10, 20, 25, 35, 40, 50, 55, 65, 70, 80],
  radians: [10, 20, 40, 50, 70, 80],
};

function constructExpression(rng: Rng, fns: readonly Fn3[], unit: AngleUnit): ExpressionConstruction {
  const fn = rng.pick(fns);
  for (;;) {
    // R in (0°, 180°) with a nonzero value (cos 90° = 0 needs no identity work)
    const R = rng.pick(STANDARD_ANGLES.filter((x) => x.n > 0 && x.n / x.d < 1));
    const v = exactValue(fn, R);
    if (v === "undefined" || v.n === 0) continue;
    const op: Op = rng.bool() ? 1 : -1;
    const B = fromDegrees(rng.pick(B_DEGREES[unit]));
    const A = sub(R, mul(rat(op), B));
    // A in [10°, 170°] and not B itself
    if (A.n / A.d < 1 / 18 || A.n / A.d > 17 / 18 || ratEq(A, B)) continue;
    return { type: "expression", fn, R, A, B, op, unit };
  }
}

const TRIPLES = PYTHAGOREAN_TRIPLES.slice(0, 4);
const QUADRANT_SIGNS: Record<Quadrant, [number, number]> = { 1: [1, 1], 2: [-1, 1], 3: [-1, -1], 4: [1, -1] };

function pickGiven(rng: Rng, stated: "sin" | "cos"): Given {
  const [a, b, c] = rng.pick(TRIPLES);
  const [u, v] = rng.bool() ? [a, b] : [b, a];
  const quadrant = rng.int(1, 4) as Quadrant;
  const [sx, sy] = QUADRANT_SIGNS[quadrant];
  return { cos: rat(sx * u, c), sin: rat(sy * v, c), quadrant, stated };
}

/** fn(α + op·β) from the four values; null when it is undefined. */
export function combine(fn: Fn3, op: Op, sa: Rat, ca: Rat, sb: Rat, cb: Rat): Rat | null {
  const o = rat(op);
  if (fn === "sin") return add(mul(sa, cb), mul(o, mul(ca, sb)));
  if (fn === "cos") return sub(mul(ca, cb), mul(o, mul(sa, sb)));
  const ta = div(sa, ca);
  const tb = div(sb, cb);
  if (!ta || !tb) return null;
  return div(add(ta, mul(o, tb)), sub(rat(1), mul(o, mul(ta, tb))));
}

function constructGiven(rng: Rng, fns: readonly Fn3[]): GivenConstruction {
  for (;;) {
    const fn = rng.pick(fns);
    const op: Op = rng.bool(0.6) ? 1 : -1;
    const alpha = pickGiven(rng, rng.bool(0.6) ? "sin" : "cos");
    const beta = pickGiven(rng, rng.bool(0.6) ? "cos" : "sin");
    const v = combine(fn, op, alpha.sin, alpha.cos, beta.sin, beta.cos);
    // α ± β a multiple of 90° (equal or supplementary angles) is degenerate: 0, ±1 or undefined
    const s = combine("sin", op, alpha.sin, alpha.cos, beta.sin, beta.cos)!;
    const c = combine("cos", op, alpha.sin, alpha.cos, beta.sin, beta.cos)!;
    if (v === null || s.n === 0 || c.n === 0) continue;
    return { type: "given", fn, op, alpha, beta };
  }
}

export function construct(params: ParamValues, rng: Rng): Construction {
  const p = resolveParams(schema, params);
  const fns = p.tangent ? FN3 : FN3.slice(0, 2);
  const type =
    p.problemType === "mixed" ? rng.pick(["exact", "exact", "expression", "given"] as const) : (p.problemType as Exclude<ProblemType, "mixed">);
  const unit = pickUnit(rng, p.units as Units);
  if (type === "exact") return constructExact(rng, fns, unit);
  if (type === "expression") return constructExpression(rng, fns, unit);
  return constructGiven(rng, fns);
}

// ------------------------------------------------------------------ printing

const at = (fn: Fn3, a: Angle, unit: AngleUnit) => trigOf(fn, angleLatex(a, unit));

/** One side of the identity for fn(A + op·B), with A and B printed. */
export function expressionLatex(fn: Fn3, op: Op, A: string, B: string): string {
  const s = op === 1 ? "+" : "-";
  const t = op === 1 ? "-" : "+";
  if (fn === "sin") return `${trigOf("sin", A)} ${trigOf("cos", B)} ${s} ${trigOf("cos", A)} ${trigOf("sin", B)}`;
  if (fn === "cos") return `${trigOf("cos", A)} ${trigOf("cos", B)} ${t} ${trigOf("sin", A)} ${trigOf("sin", B)}`;
  return `\\frac{${trigOf("tan", A)} ${s} ${trigOf("tan", B)}}{1 ${t} ${trigOf("tan", A)} ${trigOf("tan", B)}}`;
}

const givenLatex = (g: Given, v: string) => {
  const value = g.stated === "sin" ? g.sin : g.cos;
  return `${trigOf(g.stated, v)} = ${numLatex(value)}, \\ ${v} \\text{ in } ${locationLatex(g.quadrant)}`;
};

export function promptLatex(k: Construction): string {
  if (k.type === "exact") return at(k.fn, k.angle, k.unit);
  if (k.type === "expression") return expressionLatex(k.fn, k.op, angleLatex(k.A, k.unit), angleLatex(k.B, k.unit));
  const ask = trigOf(k.fn, `\\alpha ${k.op === 1 ? "+" : "-"} \\beta`);
  return [givenLatex(k.alpha, "\\alpha"), givenLatex(k.beta, "\\beta"), `\\text{find } ${ask}`].join(ANSWER_PART_SEPARATOR);
}

export function answerLatex(k: Construction): string {
  if (k.type === "exact") return sumValueLatex(twelfthValue(k.fn, k.angle));
  if (k.type === "expression") return trigValueLatex(exactValue(k.fn, k.R));
  const { alpha: a, beta: b } = k;
  return numLatex(combine(k.fn, k.op, a.sin, a.cos, b.sin, b.cos)!);
}

// ------------------------------------------------------------------ distractors

const S = (fn: Fn3, a: Angle): SumValue => {
  const v = exactValue(fn, a);
  return v === "undefined" ? v : surdToSum(v);
};

/** (tA + op·tB) / (1 + op·tA·tB): the tangent formula with the denominator's sign wrong. */
function tanWrongDenominator(A: Angle, B: Angle, op: Op): SumValue {
  const ta = S("tan", A);
  const tb = S("tan", B);
  if (ta === "undefined" || tb === "undefined") return "undefined";
  const o = surdToSum(surd(op));
  return sumDiv(sumAdd(ta, sumMul(o, tb)), sumAdd(surdToSum(surd(1)), sumMul(o, sumMul(ta, tb)))) ?? "undefined";
}

/** (tα + op·tβ) / (1 + op·tα·tβ) with given tangents: the denominator's sign wrong. */
const tanGivenWrongDenominator = (op: Op, ta: Rat, tb: Rat): Rat | null =>
  div(add(ta, mul(rat(op), tb)), add(rat(1), mul(rat(op), mul(ta, tb))));

const latexOrNull = (v: SumValue | null): string | null => (v === null || v === "undefined" ? null : sumValueLatex(v));

/**
 * Most common first.
 * Exact values: the formula's sign wrong (\cos(A + B) with a plus, which is
 * the value at A - B), the function split over the sum (\sin(A + B) as
 * \sin A + \sin B), the quadrant's sign lost, sin and cos mixed up (tan and
 * cot), and for tangent the denominator's sign wrong.
 * Expressions: wrong values of fn at the right angle (trigKit's
 * valueMistakes: the sign, sin and cos swapped, √3/2 and 1/2 mixed up, the
 * reciprocal), then the other functions' values at that angle (the identity
 * recognised as the wrong one).
 * Given values: the formula's sign wrong, the quadrant signs ignored, the
 * function split over the sum, each cosine's (or sine's) sign wrong, the sign,
 * and for tangent the reciprocal (sin and cos swapped in tan) and the
 * denominator's sign wrong.
 */
export function distractors(k: Construction): string[] {
  const answer = answerLatex(k);
  if (k.type === "exact") {
    const { fn, A, B, op } = k;
    const wrongSign = twelfthValue(fn, sub(A, mul(rat(op), B)));
    const fa = S(fn, A);
    const fb = S(fn, B);
    const splitOver = fa === "undefined" || fb === "undefined" ? null : op === 1 ? sumAdd(fa, fb) : sumSub(fa, fb);
    const right = twelfthValue(fn, k.angle) as SurdSum;
    const co = fn === "tan" ? sumDiv(surdToSum(surd(1)), right) : (twelfthValue(cofunction(fn) as Fn3, k.angle) as SurdSum);
    return distinctHints(answer, [
      fn === "tan" ? latexOrNull(tanWrongDenominator(A, B, op)) : latexOrNull(wrongSign),
      latexOrNull(splitOver),
      latexOrNull(sumNeg(right)),
      latexOrNull(co),
      latexOrNull(wrongSign),
      co ? latexOrNull(sumNeg(co)) : null,
    ]);
  }
  if (k.type === "expression") {
    // the right angle with the wrong value, then the other functions' values there
    const others = FN3.filter((f) => f !== k.fn).map((f) => exactValue(f, k.R));
    return distinctHints(answer, [...valueMistakes(k.fn, k.R), ...others, surd(1, 1, 2), surd(1, 3, 2), surd(1, 2, 2), surd(-1, 1, 2)].filter((v) => v !== "undefined").map(trigValueLatex));
  }
  const { fn, op, alpha: a, beta: b } = k;
  const absR = (r: Rat) => rat(Math.abs(r.n), r.d);
  const value = (r: Rat | null) => (r === null ? null : numLatex(r));
  const fa = fn === "sin" ? a.sin : fn === "cos" ? a.cos : div(a.sin, a.cos)!;
  const fb = fn === "sin" ? b.sin : fn === "cos" ? b.cos : div(b.sin, b.cos)!;
  // the value found by the Pythagorean theorem (not the stated one) with the wrong sign
  const flipA = a.stated === "sin" ? { s: a.sin, c: neg(a.cos) } : { s: neg(a.sin), c: a.cos };
  const flipB = b.stated === "sin" ? { s: b.sin, c: neg(b.cos) } : { s: neg(b.sin), c: b.cos };
  const right = combine(fn, op, a.sin, a.cos, b.sin, b.cos)!;
  return distinctHints(answer, [
    value(combine(fn, (-op) as Op, a.sin, a.cos, b.sin, b.cos)),
    value(combine(fn, op, absR(a.sin), absR(a.cos), absR(b.sin), absR(b.cos))),
    value(add(fa, mul(rat(op), fb))),
    value(combine(fn, op, flipA.s, flipA.c, b.sin, b.cos)),
    value(combine(fn, op, a.sin, a.cos, flipB.s, flipB.c)),
    value(neg(right)),
    value(fa), // keep only the first angle
    value(fb),
    value(neg(fa)),
    value(mul(a.sin, b.cos)), // omit the second product
    value(mul(a.cos, b.sin)),
    fn === "tan" ? value(div(rat(1), right)) : null,
    fn === "tan" ? value(tanGivenWrongDenominator(op, fa, fb)) : null,
  ]);
}

export const generator: Generator = {
  id: SUM_DIFFERENCE_ID,
  title: "Sum and difference identities",
  defaultDirections: "Use the sum and difference identities to find the exact value of each expression.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: SUM_DIFFERENCE_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
