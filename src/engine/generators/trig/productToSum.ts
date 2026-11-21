// "Product-to-sum identities": rewrite a product as a sum
// (\sin 3x \cos x = \frac{1}{2}\left(\sin 4x + \sin 2x\right)), a sum as a
// product (\sin 5x + \sin x = 2\sin 3x \cos 2x), and find exact values
// either way (\sin 75^{\circ} \cos 15^{\circ} = \frac{2 + \sqrt{3}}{4},
// \cos 75^{\circ} + \cos 15^{\circ} = \frac{\sqrt{6}}{2}).
//
// Canonical Answer forms (so the Answer and its Distractors compare alike):
// - A sum: the factor in front (\frac{1}{2}, nothing for a coefficient-2
//   product), then the two terms in brackets with every argument positive
//   (\sin(-2x) is written -\sin 2x, \cos(-2x) as \cos 2x), the positive term
//   first, and for two terms of the same sign the larger argument first:
//   \frac{1}{2}\left(\cos 2x - \cos 4x\right), \sin 4x + \sin 2x.
// - A product: 2 (or -2) in front, then the function of the half-sum (A+B)/2,
//   then the function of the half-difference (A-B)/2: 2\cos 3x \sin 2x,
//   -2\sin 3x \sin 2x. Sums are always printed larger argument first.
//
// Built ANSWER-FIRST. To a sum: the product's two arguments A ≠ B are chosen,
// and the identity gives the sum. To a product: the half-sum p and the
// half-difference q are chosen first and the prompt is printed at A = p + q,
// B = p - q. Exact values: the two angles are chosen so that their sum and
// difference (or half-sum and half-difference) are standard angles, and the
// value follows by table lookup and exact surd arithmetic.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { add, distinctHints, mul, rat, sub, type Rat } from "../shared/equationKit";
import {
  angleLatex,
  exactValue,
  STANDARD_ANGLES,
  sumAdd,
  sumLatex,
  sumMul,
  sumNeg,
  sumScale,
  surdToSum,
  trigOf,
  type Angle,
  type AngleUnit,
  type Surd,
  type SurdSum,
} from "./trigKit";

export const PRODUCT_TO_SUM_ID = "product-to-sum";

export type ProblemType = "toSum" | "toProduct" | "exact" | "mixed";
export type Units = AngleUnit | "mixed";
type SC = "sin" | "cos";

export const schema = [
  {
    type: "enum",
    key: "problemType",
    label: "Problems",
    default: "mixed",
    options: [
      { value: "toSum", label: "Write a product as a sum" },
      { value: "toProduct", label: "Write a sum as a product" },
      { value: "exact", label: "Exact values, like sin 75° cos 15°" },
      { value: "mixed", label: "Mixed" },
    ],
  },
  {
    type: "enum",
    key: "units",
    label: "Angles in exact values",
    default: "degrees",
    options: [
      { value: "degrees", label: "Degrees" },
      { value: "radians", label: "Radians" },
      { value: "mixed", label: "Both" },
    ],
  },
] as const satisfies ParamSchema;

// ------------------------------------------------------------------ the identities

/** A product f A · g B. */
export interface ProductForm {
  f: SC;
  g: SC;
}

/** One term of a sum: sign·fn(arg), arg a signed multiple. */
export interface SumTerm {
  sign: 1 | -1;
  fn: SC;
  arg: Rat;
}

/** f A · g B = ½ (t1 + t2), by the product-to-sum identities (arguments may be negative). */
export function productToSum(pf: ProductForm, A: Rat, B: Rat): SumTerm[] {
  const s = add(A, B);
  const d = sub(A, B);
  if (pf.f === "sin" && pf.g === "cos") return [{ sign: 1, fn: "sin", arg: s }, { sign: 1, fn: "sin", arg: d }];
  if (pf.f === "cos" && pf.g === "sin") return [{ sign: 1, fn: "sin", arg: s }, { sign: -1, fn: "sin", arg: d }];
  if (pf.f === "cos") return [{ sign: 1, fn: "cos", arg: d }, { sign: 1, fn: "cos", arg: s }];
  return [{ sign: 1, fn: "cos", arg: d }, { sign: -1, fn: "cos", arg: s }];
}

/** Positive arguments, the positive term first, then the larger argument first; zero terms (sin 0) dropped. */
export function canonicalTerms(terms: SumTerm[]): SumTerm[] {
  const pos = terms
    .map((t) => (t.arg.n < 0 ? { sign: (t.fn === "sin" ? -t.sign : t.sign) as 1 | -1, fn: t.fn, arg: rat(-t.arg.n, t.arg.d) } : t))
    .filter((t) => !(t.fn === "sin" && t.arg.n === 0));
  return pos.sort((a, b) => b.sign - a.sign || b.arg.n / b.arg.d - a.arg.n / a.arg.d);
}

/** A sum A ± B of one function. */
export interface SumForm {
  fn: SC;
  op: 1 | -1;
}

/** fn A + op·fn B = coef · f(p) · g(q) with p = (A+B)/2, q = (A-B)/2, by the sum-to-product identities. */
export function sumToProduct(sf: SumForm): { coef: 2 | -2; f: SC; g: SC } {
  if (sf.fn === "sin") return sf.op === 1 ? { coef: 2, f: "sin", g: "cos" } : { coef: 2, f: "cos", g: "sin" };
  return sf.op === 1 ? { coef: 2, f: "cos", g: "cos" } : { coef: -2, f: "sin", g: "sin" };
}

// ------------------------------------------------------------------ constructions

export interface ToSumConstruction {
  type: "toSum";
  pf: ProductForm;
  a: number;
  b: number;
  /** the coefficient printed in front of the product: 1 or 2 */
  m: 1 | 2;
}

export interface ToProductConstruction {
  type: "toProduct";
  sf: SumForm;
  p: number;
  q: number;
}

export interface ExactProductConstruction {
  type: "exactProduct";
  pf: ProductForm;
  A: Angle;
  B: Angle;
  unit: AngleUnit;
}

export interface ExactSumConstruction {
  type: "exactSum";
  sf: SumForm;
  /** the half-sum and half-difference, both standard */
  p: Angle;
  q: Angle;
  unit: AngleUnit;
}

export type Construction = ToSumConstruction | ToProductConstruction | ExactProductConstruction | ExactSumConstruction;

const PRODUCTS: readonly ProductForm[] = [
  { f: "sin", g: "cos" },
  { f: "cos", g: "sin" },
  { f: "cos", g: "cos" },
  { f: "sin", g: "sin" },
];
const SUMS: readonly SumForm[] = [
  { fn: "sin", op: 1 },
  { fn: "sin", op: -1 },
  { fn: "cos", op: 1 },
  { fn: "cos", op: -1 },
];

/** Odd multiples of 15° in (0°, 180°): not standard, but sums and differences of two are. */
const FIFTEENS: readonly Angle[] = [1, 5, 7, 11].map((k) => rat(k, 12));
/** Odd multiples of 22.5° in (0°, 180°). */
const EIGHTHS: readonly Angle[] = [1, 3, 5, 7].map((k) => rat(k, 8));

const val = (fn: SC, a: Angle): SurdSum => surdToSum(exactValue(fn, a) as Surd);

/** ½ Σ terms, exactly. */
function sumOfTerms(terms: SumTerm[]): SurdSum {
  return sumScale(terms.reduce((acc, t) => sumAdd(acc, sumScale(val(t.fn, t.arg), rat(t.sign))), surdToSum({ n: 0, r: 1, d: 1 })), rat(1, 2));
}

export function exactProductValue(pf: ProductForm, A: Angle, B: Angle): SurdSum {
  return sumOfTerms(productToSum(pf, A, B));
}

export function exactSumValue(sf: SumForm, p: Angle, q: Angle): SurdSum {
  const t = sumToProduct(sf);
  return sumScale(sumMul(val(t.f, p), val(t.g, q)), rat(t.coef));
}

function pickUnit(rng: Rng, units: Units): AngleUnit {
  return units === "mixed" ? rng.pick(["degrees", "radians"] as const) : units;
}

function constructExact(rng: Rng, unit: AngleUnit): Construction {
  if (rng.bool(0.55)) {
    for (;;) {
      const pf = rng.pick(PRODUCTS);
      const pool = rng.bool(0.7) ? FIFTEENS : EIGHTHS;
      const A = rng.pick(pool);
      const B = rng.pick(pool.filter((x) => x.n !== A.n));
      if (exactProductValue(pf, A, B).terms.length === 0) continue;
      return { type: "exactProduct", pf, A, B, unit };
    }
  }
  for (;;) {
    const sf = rng.pick(SUMS);
    // p ± q odd multiples of 15°: one of p, q an odd multiple of 45°, the other a multiple of 30°
    const p = rng.pick(STANDARD_ANGLES.filter((x) => x.n > 0 && x.n / x.d < 1));
    const q = rng.pick([rat(1, 6), rat(1, 4), rat(1, 3)]);
    if (!(p.n / p.d > q.n / q.d)) continue;
    const A = add(p, q);
    const B = sub(p, q);
    if (A.d !== 12 || B.d !== 12) continue;
    if (exactSumValue(sf, p, q).terms.length === 0) continue;
    return { type: "exactSum", sf, p, q, unit };
  }
}

export function construct(params: ParamValues, rng: Rng): Construction {
  const p = resolveParams(schema, params);
  const type = p.problemType === "mixed" ? rng.pick(["toSum", "toProduct", "exact"] as const) : (p.problemType as Exclude<ProblemType, "mixed">);
  if (type === "toSum") {
    const a = rng.int(1, 5);
    const b = rng.pick([1, 2, 3, 4, 5].filter((x) => x !== a));
    return { type: "toSum", pf: rng.pick(PRODUCTS), a, b, m: rng.bool(0.35) ? 2 : 1 };
  }
  if (type === "toProduct") {
    const pp = rng.int(2, 5);
    return { type: "toProduct", sf: rng.pick(SUMS), p: pp, q: rng.int(1, pp - 1) };
  }
  return constructExact(rng, pickUnit(rng, p.units as Units));
}

// ------------------------------------------------------------------ printing

/** A multiple of x: "x", "3x". */
const xLatex = (k: Rat) => (k.n === 1 && k.d === 1 ? "x" : `${k.n}x`);

/** The bracketed sum with its factor in front: "\frac{1}{2}\left(\sin 4x + \sin 2x\right)"; factor 1 prints bare. */
export function sumLatexOf(terms: SumTerm[], factor: Rat, arg: (a: Rat) => string): string {
  const body = terms
    .map((t, i) => (i === 0 ? (t.sign < 0 ? "-" : "") : t.sign < 0 ? " - " : " + ") + trigOf(t.fn, arg(t.arg)))
    .join("");
  if (factor.n === 1 && factor.d === 1) return body;
  const f = factor.d === 1 ? String(factor.n) : `\\frac{${factor.n}}{${factor.d}}`;
  return terms.length === 1 ? `${f}${body}` : `${f}\\left(${body}\\right)`;
}

const productLatex = (coef: number, f: SC, a: string, g: SC, b: string) =>
  `${coef === 1 ? "" : coef === -1 ? "-" : coef}${trigOf(f, a)} ${trigOf(g, b)}`;

export function promptLatex(k: Construction): string {
  switch (k.type) {
    case "toSum":
      return productLatex(k.m, k.pf.f, xLatex(rat(k.a)), k.pf.g, xLatex(rat(k.b)));
    case "toProduct":
      return `${trigOf(k.sf.fn, xLatex(rat(k.p + k.q)))} ${k.sf.op === 1 ? "+" : "-"} ${trigOf(k.sf.fn, xLatex(rat(k.p - k.q)))}`;
    case "exactProduct":
      return productLatex(1, k.pf.f, angleLatex(k.A, k.unit), k.pf.g, angleLatex(k.B, k.unit));
    case "exactSum": {
      const A = angleLatex(add(k.p, k.q), k.unit);
      const B = angleLatex(sub(k.p, k.q), k.unit);
      return `${trigOf(k.sf.fn, A)} ${k.sf.op === 1 ? "+" : "-"} ${trigOf(k.sf.fn, B)}`;
    }
  }
}

export function answerLatex(k: Construction): string {
  switch (k.type) {
    case "toSum":
      return sumLatexOf(canonicalTerms(productToSum(k.pf, rat(k.a), rat(k.b))), rat(k.m, 2), xLatex);
    case "toProduct": {
      const t = sumToProduct(k.sf);
      return productLatex(t.coef, t.f, xLatex(rat(k.p)), t.g, xLatex(rat(k.q)));
    }
    case "exactProduct":
      return sumLatex(exactProductValue(k.pf, k.A, k.B));
    case "exactSum":
      return sumLatex(exactSumValue(k.sf, k.p, k.q));
  }
}

// ------------------------------------------------------------------ distractors

const otherFn = (f: SC): SC => (f === "sin" ? "cos" : "sin");
const flipSecond = (ts: SumTerm[]) => ts.map((t, i) => (i === 0 ? t : { ...t, sign: (-t.sign) as 1 | -1 }));
const swapFns = (ts: SumTerm[]) => ts.map((t) => ({ ...t, fn: otherFn(t.fn) }));

/**
 * Most common first.
 * To a sum: the ½ forgotten (or, for 2\sin A\cos B, doubled), the sign
 * between the terms wrong, sin and cos mixed up in the result, only the
 * first term kept (\sin A\cos B = \frac{1}{2}\sin(A + B)), and a
 * difference subtracted the wrong way round.
 * To a product: the 2 forgotten, the two functions swapped
 * (2\cos p \sin q for \sin A + \sin B), the arguments not halved
 * (2\sin(A + B)\cos(A - B)), the minus of cos A - cos B dropped, and the
 * half-sum and half-difference swapped.
 * Exact values: the ½ (or 2) forgotten, the sign between the terms wrong, sin
 * and cos mixed up, and the sign of the whole.
 */
export function distractors(k: Construction): string[] {
  const answer = answerLatex(k);
  switch (k.type) {
    case "toSum": {
      const terms = canonicalTerms(productToSum(k.pf, rat(k.a), rat(k.b)));
      const half = rat(k.m, 2);
      const tex = (ts: SumTerm[], f = half) => sumLatexOf(canonicalTerms(ts), f, xLatex);
      return distinctHints(answer, [
        tex(terms, k.m === 1 ? rat(1) : rat(2)),
        tex(flipSecond(terms)),
        tex(swapFns(terms)),
        tex(terms.slice(0, 1)),
        // \sin A\sin B as \frac{1}{2}(\cos(A + B) - \cos(A - B)): subtracted the wrong way round
        terms.length === 2 && terms[1].sign < 0 ? tex(terms.map((t) => ({ ...t, sign: (-t.sign) as 1 | -1 }))) : null,
        tex(flipSecond(terms), k.m === 1 ? rat(1) : rat(2)),
      ]);
    }
    case "toProduct": {
      const t = sumToProduct(k.sf);
      const p = xLatex(rat(k.p));
      const q = xLatex(rat(k.q));
      return distinctHints(answer, [
        productLatex(t.coef / 2, t.f, p, t.g, q),
        productLatex(t.coef, t.g, p, t.f, q),
        productLatex(t.coef, t.f, xLatex(rat(2 * k.p)), t.g, xLatex(rat(2 * k.q))),
        productLatex(-t.coef, t.f, p, t.g, q),
        // halve the sum but leave the difference unhalved
        productLatex(t.coef, t.f, p, t.g, xLatex(rat(2 * k.q))),
      ]);
    }
    case "exactProduct": {
      const terms = productToSum(k.pf, k.A, k.B);
      const right = sumOfTerms(terms);
      return distinctHints(answer, [
        sumLatex(sumScale(right, rat(2))),
        sumLatex(sumOfTerms(flipSecond(terms))),
        sumLatex(sumOfTerms(swapFns(terms))),
        sumLatex(sumNeg(right)),
        sumLatex(sumScale(sumOfTerms(flipSecond(terms)), rat(2))),
        sumLatex(sumScale(right, rat(-2))),
        sumLatex(sumScale(right, rat(1, 2))),
      ]);
    }
    case "exactSum": {
      const right = exactSumValue(k.sf, k.p, k.q);
      const t = sumToProduct(k.sf);
      const swapped = sumScale(sumMul(val(t.g, k.p), val(t.f, k.q)), rat(t.coef));
      const notHalved = sumScale(sumMul(val(t.f, mul(k.p, rat(2))), val(t.g, mul(k.q, rat(2)))), rat(t.coef));
      return distinctHints(answer, [
        sumLatex(sumScale(right, rat(1, 2))),
        sumLatex(swapped),
        sumLatex(notHalved),
        sumLatex(sumScale(right, rat(-1, 2))),
        sumLatex(sumScale(right, rat(1, 4))), // use ½ in the reverse identity
        sumLatex(sumNeg(right)),
      ]);
    }
  }
}

export const generator: Generator = {
  id: PRODUCT_TO_SUM_ID,
  title: "Product-to-sum identities",
  defaultDirections:
    "Use the product-to-sum or sum-to-product identities to rewrite each expression, or to find its exact value.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: PRODUCT_TO_SUM_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
