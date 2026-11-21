// "Arithmetic series": the sum of an arithmetic series, given its opening
// terms and how many to add (3 + 7 + 11 + \cdots, find S_{20}), its opening
// terms and last term (3 + 7 + 11 + \cdots + 79), or in sigma notation
// (\sum_{k=1}^{20} (4k - 1)).
//
// Built ANSWER-FROM-CONSTRUCTION: the first term, the common difference and
// the number of terms are chosen first; the printed series and the sum
// n(a_1 + a_n)/2 are evaluated forwards from them. Nothing is solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { nonzeroInt } from "../shared/equationKit";
import {
  add,
  arithmeticSum,
  arithmeticTerm,
  distinctHints,
  div,
  isInt,
  linearLatex,
  mul,
  numLatex,
  rat,
  seriesLatex,
  sigmaLatex,
  sub,
  type Rat,
} from "./sequenceKit";

export const ARITHMETIC_SERIES_ID = "arithmetic-series";

export type Given = "firstN" | "lastTerm" | "sigma";

export const schema = [
  {
    type: "enum",
    key: "given",
    label: "Series given as",
    default: "mixed",
    options: [
      { value: "firstN", label: "Opening terms and how many (find S_20)" },
      { value: "lastTerm", label: "Opening terms and the last term" },
      { value: "sigma", label: "Sigma notation" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "int",
    key: "maxTerms",
    label: "Most terms to add",
    min: 5,
    max: 60,
    default: 25,
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative terms and differences",
    default: true,
  },
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface ArithmeticSeriesConstruction {
  given: Given;
  a1: Rat;
  d: Rat;
  /** how many terms are added */
  n: number;
  /** sigma notation: the index starts here (the series runs k = from .. from + n - 1) */
  from: number;
}

export const MAX_PRINTED = 999;

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): ArithmeticSeriesConstruction {
  const p = resolveParams(schema, params);
  const negOk = p.allowNegatives as boolean;
  const givens: Given[] = p.given === "mixed" ? ["firstN", "lastTerm", "sigma"] : [p.given as Given];
  const given = rng.pick(givens);
  const from = given === "sigma" ? rng.pick([1, 1, 1, 1, 0, 2, 3]) : 1;
  for (;;) {
    const n = rng.int(5, p.maxTerms as number);
    const d = rat(nonzeroInt(rng, 1, 9, negOk));
    const a1 = rat(nonzeroInt(rng, 1, 20, negOk));
    // no printed term is 0 (a series "+ 0" reads as a slip)
    const printed = [1, 2, 3, n].map((i) => arithmeticTerm(a1, d, i));
    // nor is the sum (its terms would cancel, and every slip lands on 0 too)
    const zeroSum = add(printed[0], printed[3]).n === 0;
    if (printed.every((t) => t.n !== 0) && !zeroSum) return { given, a1, d, n, from };
  }
}

/** The sum (the Answer). */
export const sumOf = (k: ArithmeticSeriesConstruction): Rat => arithmeticSum(k.a1, k.d, k.n);

// ------------------------------------------------------------------ render

/** The sigma body f(k) = dk + c with f(from) = a_1: "(3k - 1)", "4k". */
function sigmaBody(k: ArithmeticSeriesConstruction): string {
  const c = sub(k.a1, mul(k.d, rat(k.from)));
  const body = linearLatex([
    { coef: k.d, v: "k" },
    { coef: c, v: "" },
  ]);
  return c.n === 0 ? body : `(${body})`;
}

export function promptLatex(k: ArithmeticSeriesConstruction): string {
  const t = (i: number) => arithmeticTerm(k.a1, k.d, i);
  switch (k.given) {
    case "firstN":
      return `${seriesLatex([t(1), t(2), t(3)])};\\quad \\text{find } S_{${k.n}}`;
    case "lastTerm":
      return seriesLatex([t(1), t(2), t(3)], t(k.n));
    case "sigma":
      return `${sigmaLatex(k.from, k.from + k.n - 1)} ${sigmaBody(k)}`;
  }
}

export const answerLatex = (k: ArithmeticSeriesConstruction): string => numLatex(sumOf(k));

/**
 * Mistake-based Distractors, most common first: n(a_1 + a_n) without halving;
 * the wrong number of terms (the last index read as the count with the start
 * ignored, or (a_n - a_1)/d without the + 1); a_n taken as a_1 + nd; in sigma
 * notation the constant added once instead of n times; and the last term
 * given as the sum. Only whole numbers, like the Answer.
 */
export function distractors(k: ArithmeticSeriesConstruction): string[] {
  const { a1, d, n } = k;
  const an = arithmeticTerm(a1, d, n);
  const half = (x: Rat) => div(x, rat(2))!;
  const sumWith = (count: number, last: Rat) => half(mul(rat(count), add(a1, last)));
  const values: Rat[] = [mul(rat(n), add(a1, an))]; // not halved
  if (k.given === "sigma") {
    if (k.from !== 1) values.push(sumWith(k.from + n - 1, an)); // the top index taken as the count
    const c = sub(a1, mul(d, rat(k.from)));
    if (c.n !== 0) values.push(add(sub(sumOf(k), mul(rat(n), c)), c)); // constant added once
  }
  values.push(
    sumWith(n - 1, an), // one term short: (a_n - a_1)/d terms
    sumWith(n, add(a1, mul(rat(n), d))), // a_n = a_1 + nd
    sumWith(n + 1, an), // one term too many
    an, // the last term, not the sum
    arithmeticSum(a1, d, n - 1), // the sum stopped a term early
    arithmeticSum(a1, d, n + 1), // or a term late
  );
  return distinctHints(
    answerLatex(k),
    values.filter(isInt).map((v) => numLatex(v)),
  );
}

export const generator: Generator = {
  id: ARITHMETIC_SERIES_ID,
  title: "Arithmetic series",
  defaultDirections: "Find the sum of each arithmetic series.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: ARITHMETIC_SERIES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
