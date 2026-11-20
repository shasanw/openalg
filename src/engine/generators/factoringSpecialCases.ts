// "Factoring special cases": differences of squares, 9x^{2} - 25 =
// (3x + 5)(3x - 5), and perfect-square trinomials, 4x^{2} - 12x + 9 =
// (2x - 3)^{2}, optionally after taking out a common factor or in two
// variables.
//
// Built ANSWER-FROM-CONSTRUCTION: the binomial a·v + b (b ≠ 0, no common
// factor) and any common factor are chosen first, and the Problem is the
// product (av + b)(av - b) or (av + b)^{2}, multiplied out. Nothing is ever
// factored.

import { createRng, type Rng } from "../rng";
import { gcd } from "../format";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import {
  expandFactored,
  factoredHints,
  factoredLatex,
  mono,
  pickVars,
  standardLatex,
  varyPolyVariableField,
  type Factored,
} from "./polyKit";
import { linear, PRIME } from "./factoringQuadratics";

export const FACTORING_SPECIAL_CASES_ID = "factoring-special-cases";

export type SpecialCase = "mixed" | "differenceOfSquares" | "perfectSquare";

export const schema = [
  {
    type: "enum",
    key: "caseType",
    label: "Cases",
    default: "mixed",
    options: [
      { value: "mixed", label: "Mixed" },
      { value: "differenceOfSquares", label: "Differences of squares" },
      { value: "perfectSquare", label: "Perfect-square trinomials" },
    ],
  },
  {
    type: "int",
    key: "maxLeading",
    label: "Largest leading coefficient in a factor",
    min: 1,
    max: 6,
    default: 3,
  },
  {
    type: "int",
    key: "maxConstant",
    label: "Largest constant in a factor",
    min: 1,
    max: 12,
    default: 9,
  },
  {
    type: "boolean",
    key: "commonFactor",
    label: "Include a common factor to take out first",
    default: false,
  },
  {
    type: "boolean",
    key: "twoVariables",
    label: "Two variables, like 4x^2 - 9y^2",
    default: false,
  },
  varyPolyVariableField,
] as const satisfies ParamSchema;

export interface SpecialCaseConstruction {
  vars: [string, string];
  two: boolean;
  square: boolean;
  g: number;
  /** the factor a·v + b (b < 0 allowed for a perfect square) */
  a: number;
  b: number;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): SpecialCaseConstruction {
  const p = resolveParams(schema, params);
  const caseType = p.caseType as SpecialCase;
  const two = p.twoVariables as boolean;
  const vars = pickVars(rng, p.varyVariable as boolean, two);
  const square = caseType === "perfectSquare" || (caseType === "mixed" && rng.bool());
  const g = p.commonFactor && rng.bool(0.6) ? rng.int(2, 5) : 1;
  let a = rng.int(1, p.maxLeading as number);
  let b = rng.int(1, p.maxConstant as number);
  // (2x + 4)^2 = 4(x + 2)^2: a common factor inside a factor is not factored completely
  if (gcd(a, b) !== 1) {
    const d = gcd(a, b);
    a /= d;
    b /= d;
  }
  if (square && rng.bool()) b = -b;
  return { vars, two, square, g, a, b };
}

function factoredOf(k: SpecialCaseConstruction, a: number, b: number, other: number | null, g = k.g): Factored {
  const first = linear(a, b, k.two);
  return { g: mono(g), factors: [first, other === null ? first : linear(a, other, k.two)] };
}

export const answerFactored = (k: SpecialCaseConstruction) => factoredOf(k, k.a, k.b, k.square ? null : -k.b);
export const answerLatex = (k: SpecialCaseConstruction) => factoredLatex(answerFactored(k), k.vars);
export const expandedOf = (k: SpecialCaseConstruction) => expandFactored(answerFactored(k));

/**
 * Mistake-based Distractors, most diagnostic first.
 * A difference of squares:
 * - written as a square, (av - b)^{2} or (av + b)^{2}
 * - did not take the square root of the constant, or of the leading coefficient
 * - "prime" (a difference of squares does factor)
 * A perfect-square trinomial:
 * - the wrong sign, (av - b)^{2} for (av + b)^{2}
 * - taken for a difference of squares, (av + b)(av - b)
 * - did not take the square root of the constant
 * Either: forgot the common factor taken out first.
 */
export function distractors(k: SpecialCaseConstruction): string[] {
  const { a, b, g } = k;
  const c: (Factored | string)[] = [];
  if (!k.square) {
    c.push(factoredOf(k, a, -b, null));
    c.push(factoredOf(k, a, b, null));
    if (b > 1) c.push(factoredOf(k, a, b * b, -b * b));
    if (a > 1) c.push(factoredOf(k, a * a, b, -b));
    if (g > 1) c.push(factoredOf(k, a, b, -b, 1));
    c.push(PRIME);
    c.push(factoredOf(k, a, b, b));
  } else {
    c.push(factoredOf(k, a, -b, null));
    c.push(factoredOf(k, a, Math.abs(b), -Math.abs(b)));
    if (Math.abs(b) > 1) c.push(factoredOf(k, a, Math.sign(b) * b * b, null));
    if (g > 1) c.push(factoredOf(k, a, b, null, 1));
    if (a > 1) c.push(factoredOf(k, a * a, b, null));
    c.push(factoredOf(k, a, 2 * b, null));
    c.push(PRIME);
  }
  return factoredHints(answerLatex(k), expandedOf(k), c, k.vars);
}

export const generator: Generator = {
  id: FACTORING_SPECIAL_CASES_ID,
  title: "Factoring special cases",
  defaultDirections: "Factor each completely.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const k = construct(params, createRng(seed));
    return {
      kind: "generated",
      generatorId: FACTORING_SPECIAL_CASES_ID,
      params: resolveParams(schema, params),
      seed,
      prompt: standardLatex(expandedOf(k), k.vars),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
