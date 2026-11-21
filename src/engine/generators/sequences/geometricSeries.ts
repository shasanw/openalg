// "Geometric series": the sum of a finite geometric series (2 + 6 + 18 +
// \cdots + 486, or \sum_{k=1}^{6} 2 \cdot 3^{k-1}) or of an infinite one with
// |r| < 1 (16 + 8 + 4 + \cdots), and, as an option, infinite series with
// |r| >= 1, whose Answer is that they diverge.
//
// Built ANSWER-FROM-CONSTRUCTION: the first term, the ratio and the number of
// terms are chosen first; the printed series and the sum a_1(1 - r^n)/(1 - r)
// or a_1/(1 - r) are evaluated forwards from them. Nothing is solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  add,
  distinctHints,
  div,
  geometricLatex,
  geometricSum,
  geometricTerm,
  isInt,
  mul,
  neg,
  numLatex,
  pow,
  rat,
  ratEq,
  seriesLatex,
  sigmaLatex,
  size,
  sub,
  type Rat,
} from "./sequenceKit";

export const GEOMETRIC_SERIES_ID = "geometric-series";

export type Kind = "finite" | "infinite";
export type Notation = "terms" | "sigma";

export const DIVERGES = "\\text{diverges}";

export const schema = [
  {
    type: "enum",
    key: "kind",
    label: "Series",
    default: "mixed",
    options: [
      { value: "finite", label: "Finite" },
      { value: "infinite", label: "Infinite" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "enum",
    key: "notation",
    label: "Written as",
    default: "mixed",
    options: [
      { value: "terms", label: "Terms (2 + 6 + 18 + ...)" },
      { value: "sigma", label: "Sigma notation" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "int",
    key: "maxTerms",
    label: "Most terms in a finite series",
    min: 5,
    max: 10,
    default: 7,
  },
  {
    type: "boolean",
    key: "negativeRatios",
    label: "Allow negative ratios",
    default: false,
  },
  {
    type: "boolean",
    key: "includeDiverges",
    label: "Include infinite series that diverge",
    default: false,
  },
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface GeometricSeriesConstruction {
  kind: Kind;
  notation: Notation;
  a1: Rat;
  r: Rat;
  /** how many terms (finite) */
  n: number;
}

export const MAX_PRINTED = 999;

const FINITE_RATIOS: [number, number][] = [[2, 1], [2, 1], [3, 1], [3, 1], [4, 1], [1, 2], [1, 2], [1, 3]];
const CONVERGENT_RATIOS: [number, number][] = [[1, 2], [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5]];
const DIVERGENT_RATIOS: [number, number][] = [[2, 1], [3, 1], [3, 2], [4, 3], [5, 4]];

/** Whether an infinite series with ratio r converges. */
export const converges = (r: Rat): boolean => Math.abs(r.n) < r.d;

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): GeometricSeriesConstruction {
  const p = resolveParams(schema, params);
  const kinds: Kind[] = p.kind === "mixed" ? ["finite", "infinite"] : [p.kind as Kind];
  const notations: Notation[] = p.notation === "mixed" ? ["terms", "sigma"] : [p.notation as Notation];
  const kind = rng.pick(kinds);
  const notation = rng.pick(notations);
  const negOk = p.negativeRatios as boolean;
  const signed = ([a, b]: [number, number]) => rat(negOk && rng.bool() ? -a : a, b);

  for (let attempt = 0; ; attempt++) {
    if (kind === "finite") {
      const r = attempt < 200 ? signed(rng.pick(FINITE_RATIOS)) : rat(2);
      // at least 5 terms, so the written-out series hides one behind its \cdots
      const n = attempt < 200 ? rng.int(5, p.maxTerms as number) : 5;
      // every term whole: a_1 is a multiple of the ratio's denominator^(n-1)
      const a1 = rat(rng.int(1, attempt < 200 ? 5 : 1) * r.d ** (n - 1));
      const k = { kind, notation, a1, r, n };
      // a_1 = r gives 3 \cdot 3^{k-1}, which reads better as 3^k
      if (attempt < 200 && ratEq(a1, r)) continue;
      if ([a1, geometricTerm(a1, r, n)].every((x) => size(x) <= MAX_PRINTED)) return k;
    } else {
      const diverge = (p.includeDiverges as boolean) && rng.bool(0.3);
      const r = signed(rng.pick(diverge ? DIVERGENT_RATIOS : CONVERGENT_RATIOS));
      // the first three terms whole
      const a1 = rat(rng.int(1, 6) * r.d ** 2);
      if (size(a1) <= MAX_PRINTED) return { kind, notation, a1, r, n: Infinity };
    }
  }
}

/** The sum, or null when an infinite series diverges. */
export function sumOf(k: GeometricSeriesConstruction): Rat | null {
  if (k.kind === "finite") return geometricSum(k.a1, k.r, k.n);
  return converges(k.r) ? div(k.a1, sub(rat(1), k.r))! : null;
}

// ------------------------------------------------------------------ render

export function promptLatex(k: GeometricSeriesConstruction): string {
  if (k.notation === "sigma") {
    return `${sigmaLatex(1, k.kind === "finite" ? k.n : "infinity")} ${geometricLatex(k.a1, k.r, "k-1")}`;
  }
  const opening = [1, 2, 3].map((i) => geometricTerm(k.a1, k.r, i));
  return k.kind === "finite" ? seriesLatex(opening, geometricTerm(k.a1, k.r, k.n)) : seriesLatex(opening);
}

export function answerLatex(k: GeometricSeriesConstruction): string {
  const s = sumOf(k);
  return s ? numLatex(s) : DIVERGES;
}

/**
 * Mistake-based Distractors, most common first.
 * Finite: one term short or one too many (miscounting the terms), the sum
 * with the sign slipped (r^n - 1 over 1 - r), and the infinite-sum formula
 * a_1/(1 - r) used on a finite series, the signs of a negative ratio ignored,
 * and the sum started from the second term. Whole-number Answers drop
 * fraction Distractors.
 * Infinite: a_1/(1 + r) (the sign of r), a_1 r/(1 - r) (summed from the
 * second term), "diverges" for a series that converges, and a_1(1 - r). A
 * divergent series offers the formula's number a_1/(1 - r) used anyway.
 */
export function distractors(k: GeometricSeriesConstruction): string[] {
  const { a1, r } = k;
  const one = rat(1);
  const values: (Rat | string | null)[] = [];
  if (k.kind === "finite") {
    values.push(
      geometricSum(a1, r, k.n - 1),
      geometricSum(a1, r, k.n + 1),
      neg(geometricSum(a1, r, k.n)),
      sub(one, r).n === 0 ? null : div(a1, sub(one, r)),
      r.n < 0 ? geometricSum(a1, neg(r), k.n) : null, // the signs ignored
      sub(geometricSum(a1, r, k.n), a1), // summed from the second term
      geometricTerm(a1, r, k.n), // the last term given as the sum
      div(mul(rat(k.n), add(a1, geometricTerm(a1, r, k.n))), rat(2)), // the arithmetic series formula
      add(one, r).n === 0 ? null : div(mul(a1, sub(one, pow(r, k.n))), add(one, r)), // 1 + r in the denominator
      mul(a1, sub(one, pow(r, k.n))), // not divided by 1 - r
      sub(one, r).n === 0 ? null : div(mul(a1, sub(one, mul(rat(k.n), r))), sub(one, r)), // r^n read as rn
      mul(rat(k.n), a1), // n copies of the first term
    );
  } else if (converges(r)) {
    values.push(div(a1, add(one, r)), div(mul(a1, r), sub(one, r)), DIVERGES, mul(a1, sub(one, r)));
  } else {
    values.push(div(a1, sub(one, r)), div(a1, add(one, r)), div(mul(a1, r), sub(one, r)), rat(0));
  }
  const answer = answerLatex(k);
  const whole = k.kind === "finite";
  return distinctHints(
    answer,
    values.map((v) => {
      if (v === null || typeof v === "string") return v;
      if (whole && !isInt(v)) return null;
      return numLatex(v);
    }),
  );
}

export const generator: Generator = {
  id: GEOMETRIC_SERIES_ID,
  title: "Geometric series",
  defaultDirections: "Find the sum of each geometric series, or say that it diverges.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: GEOMETRIC_SERIES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};

