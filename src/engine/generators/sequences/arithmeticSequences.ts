// "Arithmetic sequences": find an explicit rule a_n = dn + c, or a given term
// a_k, from the opening terms (5, 8, 11, 14, ...) or from two non-consecutive
// terms (a_4 = 11, a_9 = 26).
//
// Built ANSWER-FROM-CONSTRUCTION: the first term a_1 and the common difference
// d are chosen first; the printed terms, the rule and a_k are all evaluated
// forwards from them. Nothing is solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { nonzeroInt } from "../shared/equationKit";
import {
  add,
  arithmeticRuleLatex,
  arithmeticTerm,
  distinctHints,
  div,
  mul,
  neg,
  numLatex,
  openingTermsLatex,
  rat,
  size,
  sub,
  termName,
  type Rat,
} from "./sequenceKit";

export const ARITHMETIC_SEQUENCES_ID = "arithmetic-sequences";

export type Given = "terms" | "twoTerms";
export type Find = "rule" | "term";

export const schema = [
  {
    type: "enum",
    key: "given",
    label: "Given",
    default: "mixed",
    options: [
      { value: "terms", label: "The first few terms" },
      { value: "twoTerms", label: "Two terms, not next to each other" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "enum",
    key: "find",
    label: "Find",
    default: "mixed",
    options: [
      { value: "rule", label: "A rule for the nth term" },
      { value: "term", label: "A given term" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "boolean",
    key: "fractions",
    label: "Allow fraction common differences",
    default: false,
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative differences and terms",
    default: true,
  },
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface ArithmeticConstruction {
  given: Given;
  find: Find;
  a1: Rat;
  d: Rat;
  /** the two given indices (twoTerms) */
  p: number;
  q: number;
  /** the asked-for index (term) */
  k: number;
  /** integers only: a fraction Distractor would give itself away */
  integers: boolean;
}

export const MAX_PRINTED = 999;

/** A fraction difference p/q, not a whole number. */
function fractionDifference(rng: Rng, negOk: boolean): Rat {
  const q = rng.pick([2, 3, 4]);
  let p = rng.int(1, 2 * q + 1);
  if (p % q === 0) p += 1;
  return rat(negOk && rng.bool() ? -p : p, q);
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): ArithmeticConstruction {
  const pr = resolveParams(schema, params);
  const negOk = pr.allowNegatives as boolean;
  const fractions = pr.fractions as boolean;
  const given: Given = pr.given === "mixed" ? rng.pick(["terms", "twoTerms"] as const) : (pr.given as Given);
  const find: Find = pr.find === "mixed" ? rng.pick(["rule", "term"] as const) : (pr.find as Find);

  for (;;) {
    const d = fractions && rng.bool(0.7) ? fractionDifference(rng, negOk) : rat(nonzeroInt(rng, 2, 9, negOk));
    const a1 = rat(nonzeroInt(rng, 1, 20, negOk));
    const p = given === "twoTerms" ? rng.int(1, 6) : 1;
    const q = given === "twoTerms" ? p + rng.int(2, 7) : 4;
    let k = rng.int(15, 40);
    if (k === p || k === q) k++;
    const out: ArithmeticConstruction = { given, find, a1, d, p, q, k, integers: !fractions };
    // keep every printed number modest
    const shown = [arithmeticTerm(a1, d, q), arithmeticTerm(a1, d, p), sub(a1, d)];
    if (find === "term") shown.push(arithmeticTerm(a1, d, k));
    if (shown.every((x) => size(x) <= MAX_PRINTED)) return out;
  }
}

// ------------------------------------------------------------------ render

export function givenLatex(k: ArithmeticConstruction): string {
  const t = (i: number) => arithmeticTerm(k.a1, k.d, i);
  if (k.given === "terms") return openingTermsLatex([1, 2, 3, 4].map(t));
  return `${termName(k.p)} = ${numLatex(t(k.p))},\\ ${termName(k.q)} = ${numLatex(t(k.q))}`;
}

export function promptLatex(k: ArithmeticConstruction): string {
  const ask = k.find === "rule" ? "\\text{find a rule for } a_n" : `\\text{find } ${termName(k.k)}`;
  return `${givenLatex(k)};\\quad ${ask}`;
}

export function answerLatex(k: ArithmeticConstruction): string {
  return k.find === "rule" ? arithmeticRuleLatex(k.a1, k.d) : numLatex(arithmeticTerm(k.a1, k.d, k.k));
}

/**
 * Mistake-based Distractors, most common first.
 * A rule: a_1 + dn (the "- 1" forgotten), the difference with the wrong sign
 * (a_1 - a_2), a_1 and d swapped, the constant's sign slipped, n + 1 for
 * n - 1. From two terms:
 * the gap in values not divided by the gap in indices, or divided by one too
 * many, and the first given term taken as a_1.
 * A term: a_1 + kd, the wrong sign of d, and from two terms the same slips.
 * Integer mode drops a fraction Distractor, which would give itself away.
 */
export function distractors(k: ArithmeticConstruction): string[] {
  const { a1, d, p, q } = k;
  const ap = arithmeticTerm(a1, d, p);
  const aq = arithmeticTerm(a1, d, q);
  // [first term, difference] pairs a mistake works from
  const wrongD: Rat[] = [];
  if (k.given === "twoTerms") wrongD.push(sub(aq, ap), div(sub(aq, ap), rat(q - p + 1))!);
  // further wrong differences: backwards, and divided by one too few gaps
  const extraD: Rat[] = [];
  if (k.given === "twoTerms") {
    extraD.push(neg(div(sub(aq, ap), rat(q - p))!));
    if (q - p > 1) extraD.push(div(sub(aq, ap), rat(q - p - 1))!);
  } else extraD.push(sub(arithmeticTerm(a1, d, 4), a1)); // first and last listed terms subtracted, not divided
  const fromAp = (dd: Rat) => sub(ap, mul(rat(p - 1), dd)); // a_1 back from a_p with difference dd
  let candidates: (string | null)[];
  if (k.find === "rule") {
    const rule = (first: Rat, dd: Rat) => (dd.n === 0 ? null : arithmeticRuleLatex(first, dd));
    candidates = [
      rule(add(a1, d), d), // a_n = a_1 + dn
      ...wrongD.map((dd) => rule(fromAp(dd), dd)),
      k.given === "twoTerms" ? rule(ap, d) : null, // a_p taken as a_1
      rule(add(a1, mul(rat(2), d)), neg(d)), // the difference's sign wrong
      a1.n === d.n && a1.d === d.d ? null : rule(add(a1, d), a1), // a_1 and d swapped: a_1 n + d
      rule(sub(d, sub(a1, d)), d), // the constant's sign slipped
      rule(add(a1, mul(rat(2), d)), d), // a_1 + d(n + 1)
      rule(sub(add(a1, d), rat(1)), d), // d(n - 1) + a_1 with the 1 left off the d
      rule(rat(0), d), // a_1 dropped: a_n = d(n - 1)
      ...extraD.map((dd) => rule(fromAp(dd), dd)),
      rule(neg(a1), neg(d)), // every sign flipped
    ];
  } else {
    const at = (first: Rat, dd: Rat, i: number) => numLatex(arithmeticTerm(first, dd, i));
    candidates = [
      at(add(a1, d), d, k.k), // a_1 + kd
      ...wrongD.map((dd) => numLatex(add(ap, mul(rat(k.k - p), dd)))),
      k.given === "twoTerms" ? at(ap, d, k.k) : null, // a_p taken as a_1
      at(a1, neg(d), k.k), // the difference's sign wrong
      at(a1, d, k.k - 1),
      at(a1, d, k.k + 1),
      numLatex(mul(rat(k.k), d)), // a_1 forgotten: kd
      a1.n === d.n && a1.d === d.d ? null : at(d, a1, k.k), // a_1 and d swapped
      numLatex(neg(arithmeticTerm(a1, d, k.k))), // the whole term's sign slipped
      at(aq, d, k.k), // the last given term taken as a_1
      ...extraD.map((dd) => numLatex(add(ap, mul(rat(k.k - p), dd)))),
    ];
  }
  return distinctHints(
    answerLatex(k),
    candidates.filter((c) => c !== null && (!k.integers || !c.includes("\\frac"))),
  );
}

export const generator: Generator = {
  id: ARITHMETIC_SEQUENCES_ID,
  title: "Arithmetic sequences",
  defaultDirections: "Find the indicated term or rule of each arithmetic sequence.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: ARITHMETIC_SEQUENCES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
