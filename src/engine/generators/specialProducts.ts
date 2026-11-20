// "Special products": squares of binomials, (3x - 5)^{2}, and a sum times a
// difference, (2x + 7)(2x - 7).
//
// Built ANSWER-FROM-CONSTRUCTION: the binomial ax + b (or ax + by) is chosen,
// and the Answer follows from the patterns a^{2}x^{2} ± 2abx + b^{2} and
// a^{2}x^{2} - b^{2} by integer arithmetic. Nothing is ever simplified.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { mono, mul, pickVars, polyHints, standardLatex, varyPolyVariableField, type Mono, type Poly } from "./polyKit";

export const SPECIAL_PRODUCTS_ID = "special-products";

export type Product = "mixed" | "square" | "sumDifference";

export const schema = [
  {
    type: "enum",
    key: "product",
    label: "Products",
    default: "mixed",
    options: [
      { value: "mixed", label: "Mixed" },
      { value: "square", label: "Squares of binomials" },
      { value: "sumDifference", label: "Sum times difference" },
    ],
  },
  {
    type: "int",
    key: "maxLeading",
    label: "Largest leading coefficient",
    min: 1,
    max: 9,
    default: 3,
  },
  {
    type: "int",
    key: "maxConstant",
    label: "Largest constant",
    min: 1,
    max: 12,
    default: 9,
  },
  {
    type: "boolean",
    key: "twoVariables",
    label: "Two variables, like (2x + 3y)^2",
    default: false,
  },
  varyPolyVariableField,
] as const satisfies ParamSchema;

export interface SpecialConstruction {
  square: boolean;
  vars: [string, string];
  /** the binomial a·v + b (or a·v + b·w) */
  a: number;
  b: number;
  two: boolean;
  answer: Mono[];
}

const second = (k: { b: number; two: boolean }, b = k.b) => mono(b, 0, k.two ? 1 : 0);
export const binomial = (k: SpecialConstruction, b = k.b): Mono[] => [mono(k.a, 1), second(k, b)];

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): SpecialConstruction {
  const p = resolveParams(schema, params);
  const product = p.product as Product;
  const two = p.twoVariables as boolean;
  const vars = pickVars(rng, p.varyVariable as boolean, two);
  const square = product === "square" || (product === "mixed" && rng.bool());
  const a = rng.int(1, p.maxLeading as number);
  const mag = rng.int(1, p.maxConstant as number);
  // A sum times a difference is printed with the sum first.
  const b = square && rng.bool() ? -mag : mag;
  const k = { square, vars, a, b, two, answer: [] as Mono[] };
  const bin: Poly = [mono(a, 1), second(k)];
  k.answer = square ? mul(bin, bin) : mul(bin, [mono(a, 1), second(k, -b)]);
  return k;
}

export function promptLatex(k: SpecialConstruction): string {
  const v = k.vars;
  if (k.square) return `(${standardLatex(binomial(k), v)})^{2}`;
  return `(${standardLatex(binomial(k), v)})(${standardLatex(binomial(k, -k.b), v)})`;
}

/**
 * Mistake-based Distractors, most diagnostic first:
 * - squared each term and dropped the middle term: (a + b)^{2} = a^{2} + b^{2}
 * - forgot to double the middle term
 * - subtracted the last term, (a - b)^{2} = a^{2} - 2ab - b^{2}
 * - forgot to square the leading coefficient
 * - sum times difference: added the squares, or kept a middle term
 * - doubled the constant instead of squaring it
 */
export function distractors(k: SpecialConstruction): string[] {
  const { a, b, vars } = k;
  const w = k.two ? ([0, 2] as const) : ([0, 0] as const);
  const xw = k.two ? ([1, 1] as const) : ([1, 0] as const);
  const P = (sq: number, mid: number, last: number): Poly => [
    mono(sq, 2),
    mono(mid, ...xw),
    mono(last, ...w),
  ];
  const c: Poly[] = [];
  if (k.square) {
    c.push(P(a * a, 0, b * b));
    c.push(P(a * a, a * b, b * b));
    c.push(P(a * a, 2 * a * b, -b * b));
    c.push(P(a, 2 * a * b, b * b));
    c.push(P(a * a, -2 * a * b, b * b));
    c.push(P(a * a, 2 * a * b, 2 * b));
  } else {
    c.push(P(a * a, 0, b * b));
    c.push(P(a * a, -2 * a * b, -b * b));
    c.push(P(a, 0, -b * b));
    c.push(P(a * a, 0, -2 * b));
    c.push(P(a * a, 2 * a * b, -b * b));
    c.push(P(2 * a, 0, -2 * b));
  }
  return polyHints(k.answer, c, vars);
}

export const generator: Generator = {
  id: SPECIAL_PRODUCTS_ID,
  title: "Special products",
  defaultDirections: "Find each product.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const k = construct(params, createRng(seed));
    return {
      kind: "generated",
      generatorId: SPECIAL_PRODUCTS_ID,
      params: resolveParams(schema, params),
      seed,
      prompt: promptLatex(k),
      answer: standardLatex(k.answer, k.vars),
      distractorHints: distractors(k),
    };
  },
};
