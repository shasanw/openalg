// "Solving exponential equations with a common base": 2^{3x - 1} = 32,
// 4^{2x - 1} = 8^{x + 2}, and (opt-in) reciprocals like (1/4)^{x} = 32.
//
// Built ANSWER-FROM-CONSTRUCTION: the common base c, the powers of c each side
// is written in (4 = 2^2, 8 = 2^3, 1/4 = 2^-2), the Answer x and the exponent
// coefficients are chosen first; the remaining constant (the right-hand
// exponent's constant, or the right-hand value c^k) is computed so that both
// sides equal c^{p(a1 x + b1)}. Nothing is ever solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  add,
  distinctHints,
  div,
  isInt,
  linearLatex,
  mul,
  neg,
  nonzeroInt,
  rat,
  solutionHint,
  solutionLatex,
  sub,
  type Rat,
} from "../shared/equationKit";
import { intPow, powerLatex } from "./logKit";

export const EXPONENTIAL_COMMON_BASE_ID = "exponential-common-base";

export type Form = "oneSide" | "bothSides";
export type FormMode = "mixed" | Form;

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Equations",
    default: "mixed",
    options: [
      { value: "mixed", label: "Both kinds" },
      { value: "oneSide", label: "A power equal to a number, like 2^(x + 1) = 32" },
      { value: "bothSides", label: "Powers on both sides, like 4^(2x - 1) = 8^(x + 2)" },
    ],
  },
  {
    type: "boolean",
    key: "reciprocals",
    label: "Include reciprocals, like (1/2)^x = 8 and 3^x = 1/9",
    default: false,
  },
  {
    type: "boolean",
    key: "fractionAnswers",
    label: "Allow fraction answers",
    default: false,
  },
] as const satisfies ParamSchema;

/** Largest exponent of each common base: its powers stay at most a few hundred. */
const MAX_K: Record<number, number> = { 2: 8, 3: 5, 5: 4, 6: 3, 7: 3 };
/** Largest power of the common base a side's base may be (8 = 2^3, 27 = 3^3). */
const MAX_P: Record<number, number> = { 2: 5, 3: 4, 5: 2, 6: 2, 7: 2 };
const ROOTS = [2, 2, 2, 3, 3, 5, 6, 7];

/** One side c^{p(a x + b)} written as (c^p)^{a x + b}. */
export interface Side {
  p: number;
  a: number;
  b: number;
}

export interface CommonBaseConstruction {
  form: Form;
  /** the common base */
  c: number;
  left: Side;
  /** bothSides: the right-hand power */
  right: Side | null;
  /** oneSide: the right-hand value is c^k */
  k: number;
  /** the Answer */
  x: Rat;
}

/** A side's base c^p: "8", or "\frac{1}{4}" for a negative p. */
export function sideBase(c: number, p: number): string {
  const v = intPow(c, Math.abs(p))!;
  return p < 0 ? `\\frac{1}{${v}}` : String(v);
}

/** The value c^k: "32", or "\frac{1}{9}" for a negative k. */
export function valueLatex(c: number, k: number): string {
  return sideBase(c, k);
}

function sideLatex(c: number, s: Side): string {
  return powerLatex(sideBase(c, s.p), linearLatex([{ coef: rat(s.a), v: "x" }, { coef: rat(s.b), v: "" }]));
}

export function promptLatex(k: CommonBaseConstruction): string {
  const right = k.right ? sideLatex(k.c, k.right) : valueLatex(k.c, k.k);
  return `${sideLatex(k.c, k.left)} = ${right}`;
}

/** The exponent of c a side equals at the Answer: p(a x + b). */
export function sideExponent(s: Side, x: Rat): Rat {
  return mul(rat(s.p), add(mul(rat(s.a), x), rat(s.b)));
}

function pickAnswer(rng: Rng, fractions: boolean): Rat {
  if (fractions && rng.bool()) {
    const d = rng.pick([2, 3, 4]);
    let n = nonzeroInt(rng, 1, 3 * d, true);
    if (n % d === 0) n += 1;
    return rat(n, d);
  }
  return rat(nonzeroInt(rng, 1, 6, true));
}

/** An exponent's x coefficient: 1 to 4, now and then negative. */
function coefficient(rng: Rng): number {
  const a = rng.int(1, 4);
  return rng.bool(0.2) ? -a : a;
}

function pickPower(rng: Rng, c: number, reciprocals: boolean): number {
  const p = rng.int(1, MAX_P[c]);
  return reciprocals && rng.bool(0.3) ? -p : p;
}

function tryConstruct(rng: Rng, form: Form, reciprocals: boolean, fractions: boolean): CommonBaseConstruction | null {
  const c = rng.pick(ROOTS);
  const x = pickAnswer(rng, fractions);
  const left: Side = { p: pickPower(rng, c, reciprocals), a: coefficient(rng), b: rng.int(-6, 6) };
  if (form === "oneSide") {
    const e = sideExponent(left, x);
    if (!isInt(e) || e.n === 0 || Math.abs(e.n) > MAX_K[c]) return null;
    if (e.n < 0 && !reciprocals) return null;
    // "25^{2x - 5} = 25" needs no common base; a power of the left base
    // itself (8^{x} = 64) is fine now and then
    if (Math.abs(e.n) === Math.abs(left.p) || (e.n % left.p === 0 && rng.bool())) return null;
    // a plain c^{x + b} = c^k with c itself as the base is too easy unless the
    // value is a reciprocal: make the left base a power of c instead
    if (Math.abs(left.p) === 1 && left.a === 1 && (left.b === 0 || rng.bool(0.6))) return null;
    return { form, c, left, right: null, k: e.n, x };
  }
  const right: Side = { p: pickPower(rng, c, reciprocals), a: coefficient(rng), b: 0 };
  if (right.p === left.p) return null;
  // p1 a1 x + p1 b1 = p2 a2 x + p2 b2, so b2 = (p1(a1 x + b1) - p2 a2 x) / p2
  if (left.p * left.a === right.p * right.a) return null;
  // 6^{3x + 3} = (1/6)^{3x} mirrors itself: every slip lands on the same few values
  if (left.p === -right.p && left.a === right.a) return null;
  const b2 = div(sub(sideExponent(left, x), mul(rat(right.p * right.a), x)), rat(right.p))!;
  if (!isInt(b2) || Math.abs(b2.n) > 9) return null;
  right.b = b2.n;
  if (left.b === 0 && right.b === 0) return null;
  // both sides equal to 1 at the Answer reads as a trick question
  if (sideExponent(left, x).n === 0) return null;
  return { form, c, left, right, k: 0, x };
}

export function construct(params: ParamValues, rng: Rng): CommonBaseConstruction {
  const p = resolveParams(schema, params);
  const mode = p.form as FormMode;
  const reciprocals = p.reciprocals as boolean;
  const fractions = p.fractionAnswers as boolean;
  const form: Form = mode === "mixed" ? rng.pick<Form>(["oneSide", "bothSides"]) : mode;
  for (let tries = 0; tries < 2000; tries++) {
    const k = tryConstruct(rng, form, reciprocals, fractions);
    if (k) return k;
  }
  // practically unreachable: a fixed, valid Problem of the requested form
  return form === "oneSide"
    ? { form, c: 2, left: { p: 2, a: 1, b: 1 }, right: null, k: 6, x: rat(2) }
    : { form, c: 2, left: { p: 2, a: 1, b: 1 }, right: { p: 3, a: 1, b: -1 }, k: 0, x: rat(5) };
}

/**
 * Mistake-based Distractors, most common first.
 * A power equal to a number, p(ax + b) = k:
 * - forgot to rewrite the base as a power of c: ax + b = k;
 * - multiplied only the x term by p: pax + b = k;
 * - moved the constant with the wrong sign: (k/p + b)/a;
 * - the opposite sign: -x;
 * - divided before undoing the constant: k/(pa) - b;
 * - lost the sign of a reciprocal's exponent: (-k/p - b)/a;
 * - forgot to divide by a, or multiplied by it instead;
 * - divided the powers the wrong way round: p/k in place of k/p;
 * - set the exponent equal to the printed number itself (small numbers only);
 * - divided the number by the base: 2^{x} = 8 gives x = 4.
 * Powers on both sides, p1(a1 x + b1) = p2(a2 x + b2):
 * - equated the exponents without rewriting the bases: a1 x + b1 = a2 x + b2;
 * - multiplied only the x terms by the powers;
 * - swapped the two powers;
 * - a sign slip moving the constants: (p2 b2 + p1 b1)/(p1 a1 - p2 a2);
 * - the opposite sign: -x;
 * - dropped a reciprocal's negative power: |p1|(a1 x + b1) = |p2|(a2 x + b2);
 * - moved an x term with the wrong sign: (p2 b2 - p1 b1)/(p1 a1 + p2 a2).
 */
export function distractors(k: CommonBaseConstruction): string[] {
  const { left: L, x } = k;
  const R = (n: number) => rat(n);
  let values: (Rat | null)[];
  if (!k.right) {
    const K = R(k.k);
    const printed = k.k > 0 ? intPow(k.c, k.k) : null;
    const Kp = div(K, R(L.p))!;
    values = [
      div(sub(K, R(L.b)), R(L.a)),
      div(sub(K, R(L.b)), R(L.p * L.a)),
      div(add(Kp, R(L.b)), R(L.a)),
      neg(x),
      sub(div(Kp, R(L.a))!, R(L.b)),
      div(sub(neg(Kp), R(L.b)), R(L.a)),
      sub(Kp, R(L.b)),
      mul(sub(Kp, R(L.b)), R(L.a)),
      div(sub(div(R(L.p), K)!, R(L.b)), R(L.a)),
      printed !== null && printed <= 32 ? div(sub(R(printed), R(L.b)), R(L.a)) : null,
      printed !== null && L.p > 0 ? div(sub(div(R(printed), R(intPow(k.c, L.p)!))!, R(L.b)), R(L.a)) : null,
    ];
  } else {
    const Rt = k.right;
    const slope = R(L.p * L.a - Rt.p * Rt.a);
    values = [
      div(R(Rt.b - L.b), R(L.a - Rt.a)),
      div(R(Rt.b - L.b), slope),
      div(R(L.p * Rt.b - Rt.p * L.b), R(Rt.p * L.a - L.p * Rt.a)),
      div(R(Rt.p * Rt.b + L.p * L.b), slope),
      neg(x),
      div(R(Math.abs(Rt.p) * Rt.b - Math.abs(L.p) * L.b), R(Math.abs(L.p) * L.a - Math.abs(Rt.p) * Rt.a)),
      div(R(Rt.p * Rt.b - L.p * L.b), R(L.p * L.a + Rt.p * Rt.a)),
    ];
  }
  return distinctHints(
    solutionLatex("x", x),
    values.map((r) => solutionHint("x", r)),
  );
}

export const generator: Generator = {
  id: EXPONENTIAL_COMMON_BASE_ID,
  title: "Solving exponential equations with a common base",
  defaultDirections: "Solve each equation by rewriting both sides with a common base.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: EXPONENTIAL_COMMON_BASE_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: solutionLatex("x", k.x),
      distractorHints: distractors(k),
    };
  },
};
