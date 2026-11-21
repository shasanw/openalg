// "Geometric sequences": find an explicit rule a_n = a_1 r^{n-1}, or a given
// term a_k, from the opening terms (3, 6, 12, 24, ...) or from two terms three
// places apart (a_2 = 6, a_5 = 48), with whole-number or fraction ratios and,
// optionally, negative ones.
//
// Built ANSWER-FROM-CONSTRUCTION: a_1 and the ratio r are chosen first; the
// printed terms, the rule and a_k are all evaluated forwards from them. Two
// given terms are always an odd number of places apart (three), so the ratio
// they fix is unique: an even gap would allow both r and -r.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  arithmeticRuleLatex,
  arithmeticTerm,
  distinctHints,
  div,
  geometricLatex,
  geometricRuleLatex,
  geometricTerm,
  isInt,
  mul,
  neg,
  numLatex,
  openingTermsLatex,
  pow,
  powerLatex,
  rat,
  ratEq,
  size,
  sub,
  termName,
  type Rat,
} from "./sequenceKit";

export const GEOMETRIC_SEQUENCES_ID = "geometric-sequences";

export type Given = "terms" | "twoTerms";
export type Find = "rule" | "term";
export type Ratios = "integer" | "fraction";

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
    type: "enum",
    key: "ratios",
    label: "Common ratios",
    default: "mixed",
    options: [
      { value: "integer", label: "Whole numbers" },
      { value: "fraction", label: "Fractions" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "boolean",
    key: "negativeRatios",
    label: "Allow negative ratios",
    default: false,
  },
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface GeometricConstruction {
  given: Given;
  find: Find;
  a1: Rat;
  r: Rat;
  /** the two given indices (twoTerms), three apart */
  p: number;
  q: number;
  /** the asked-for index (term) */
  k: number;
}

/** Largest number printed among the given terms and the rule. */
export const MAX_PRINTED = 999;
/** Largest numerator or denominator of an asked-for term. */
export const MAX_TERM = 2500;

const INTEGER_RATIOS = [2, 2, 3, 3, 4, 5];
const FRACTION_RATIOS: [number, number][] = [[1, 2], [1, 2], [1, 3], [2, 3], [3, 2], [1, 4], [3, 4]];

function pickRatio(rng: Rng, kind: Ratios, negative: boolean): Rat {
  const r = kind === "integer" ? rat(rng.pick(INTEGER_RATIOS)) : rat(...rng.pick(FRACTION_RATIOS));
  return negative && rng.bool() ? neg(r) : r;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): GeometricConstruction {
  const pr = resolveParams(schema, params);
  const given: Given = pr.given === "mixed" ? rng.pick(["terms", "twoTerms"] as const) : (pr.given as Given);
  const find: Find = pr.find === "mixed" ? rng.pick(["rule", "term"] as const) : (pr.find as Find);
  const kinds: Ratios[] = pr.ratios === "mixed" ? ["integer", "fraction"] : [pr.ratios as Ratios];

  for (let attempt = 0; ; attempt++) {
    const r = attempt < 100 ? pickRatio(rng, rng.pick(kinds), pr.negativeRatios as boolean) : rat(kinds[0] === "integer" ? 2 : 1, kinds[0] === "integer" ? 1 : 2);
    const p = given === "twoTerms" ? rng.int(1, 3) : 1;
    const q = given === "twoTerms" ? p + 3 : 4;
    // every term up to a_q is whole: a_1 is a multiple of the ratio's denominator^(q-1)
    const a1 = rat(rng.int(1, attempt < 100 ? 9 : 1) * r.d ** (q - 1));
    // a_1 = r gives a rule like 3 \cdot 3^{n-1}, which reads better as 3^n
    if (ratEq(a1, r)) continue;
    const shown = [a1, geometricTerm(a1, r, q)];
    if (!shown.every((x) => size(x) <= MAX_PRINTED)) continue;
    let k = q + rng.int(1, 5);
    while (k > q + 1 && size(geometricTerm(a1, r, k)) > MAX_TERM) k--;
    if (find === "term" && size(geometricTerm(a1, r, k)) > MAX_TERM) continue;
    return { given, find, a1, r, p, q, k };
  }
}

// ------------------------------------------------------------------ render

export function givenLatex(k: GeometricConstruction): string {
  const t = (i: number) => geometricTerm(k.a1, k.r, i);
  if (k.given === "terms") return openingTermsLatex([1, 2, 3, 4].map(t));
  return `${termName(k.p)} = ${numLatex(t(k.p))},\\ ${termName(k.q)} = ${numLatex(t(k.q))}`;
}

export function promptLatex(k: GeometricConstruction): string {
  const ask = k.find === "rule" ? "\\text{find a rule for } a_n" : `\\text{find } ${termName(k.k)}`;
  return `${givenLatex(k)};\\quad ${ask}`;
}

export function answerLatex(k: GeometricConstruction): string {
  return k.find === "rule" ? geometricRuleLatex(k.a1, k.r) : numLatex(geometricTerm(k.a1, k.r, k.k));
}

/**
 * Mistake-based Distractors, most common first.
 * A rule: the exponent n instead of n - 1, a_1 and r multiplied before the
 * power, the ratio upside down (dividing the wrong way), the sign of a
 * negative ratio lost, a_1 and r swapped, and the common difference of an
 * arithmetic sequence. From two terms: the ratio of the given terms taken as
 * r without the cube root, or divided by 3, and the first given term taken as
 * a_1.
 * A term: the same slips evaluated at k, and the terms either side.
 */
export function distractors(k: GeometricConstruction): string[] {
  const { a1, r, p, q } = k;
  const ap = geometricTerm(a1, r, p);
  const aq = geometricTerm(a1, r, q);
  const R = div(aq, ap)!; // r^3
  const one = rat(1);
  const flip = div(one, r)!;
  // [a_1, r] pairs a slip works from, with an exponent offset
  type Slip = { a: Rat; r: Rat; shift?: number } | { power: Rat } | { arithmetic: Rat };
  const slips: Slip[] = [
    { a: a1, r, shift: 1 }, // exponent n
    { power: mul(a1, r) }, // (a_1 r)^{n-1}
    { a: a1, r: flip }, // ratio upside down
  ];
  if (r.n < 0) slips.push({ a: a1, r: neg(r) }); // sign of r lost
  if (k.given === "twoTerms") {
    // a wrong ratio (no cube root, or divided by 3) worked back to a_1, kept
    // only when everything stays whole, as a student's working would
    for (const wrong of [R, div(R, rat(3))!]) {
      const back = div(ap, pow(wrong, p - 1))!;
      if (isInt(wrong) && isInt(back)) slips.push({ a: back, r: wrong });
    }
    slips.push({ a: ap, r }); // a_p taken as a_1
  }
  if (!ratEq(a1, one) && !ratEq(a1, r)) slips.push({ a: r, r: a1 }); // a_1 and r swapped
  slips.push({ arithmetic: sub(geometricTerm(a1, r, 2), a1) }); // a common difference

  const at = (s: Slip, n: number): Rat | null => {
    if ("power" in s) return pow(s.power, n - 1);
    if ("arithmetic" in s) return arithmeticTerm(a1, s.arithmetic, n);
    return mul(s.a, pow(s.r, n - 1 + (s.shift ?? 0)));
  };
  const rule = (s: Slip): string | null => {
    if ("power" in s) return ratEq(s.power, one) ? null : `a_n = ${powerLatex(s.power, "n-1")}`;
    if ("arithmetic" in s) return s.arithmetic.n === 0 ? null : arithmeticRuleLatex(a1, s.arithmetic);
    if (s.a.n === 0 || ratEq(s.r, one) || s.r.n === 0) return null;
    return `a_n = ${geometricLatex(s.a, s.r, s.shift ? "n" : "n-1")}`;
  };

  let candidates: (string | null)[];
  if (k.find === "rule") candidates = slips.map(rule);
  else {
    const term = (x: Rat | null) => (x && size(x) <= 99999 ? numLatex(x) : null);
    candidates = slips.map((s) => term(at(s, k.k)));
    candidates.splice(2, 0, term(geometricTerm(a1, r, k.k - 1)));
    candidates.push(term(geometricTerm(a1, r, k.k + 1)));
  }
  return distinctHints(answerLatex(k), candidates);
}

export const generator: Generator = {
  id: GEOMETRIC_SEQUENCES_ID,
  title: "Geometric sequences",
  defaultDirections: "Find the indicated term or rule of each geometric sequence.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: GEOMETRIC_SEQUENCES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
