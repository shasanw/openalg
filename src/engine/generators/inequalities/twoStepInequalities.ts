// "Solving two-step inequalities": ax + b < c, b + ax >= c and x/a + b <= c
// (either side first), with negative coefficients that flip the symbol and
// optional fraction boundaries.
//
// Built ANSWER-FROM-CONSTRUCTION: the boundary s, the symbol, the coefficient
// a and the constant b are chosen first, and the other side c is computed
// (c = as + b or s/a + b). The solution set is then x op s, with the symbol
// flipped when a is negative. Nothing is ever solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { add, div, isZero, linearLatex, mul, neg, nonzeroInt, numLatex, rat, sub, type Rat } from "../shared/equationKit";
import {
  FLIP,
  flipped,
  negated,
  notationField,
  OP_LATEX,
  OPS,
  ray,
  rayFor,
  showNumberLineField,
  solvedProblem,
  toggled,
  type Op,
  type SolutionSet,
} from "./inequalityKit";

export const TWO_STEP_INEQUALITIES_ID = "two-step-inequalities";

export type Form = "linear" | "constantFirst" | "divided";
export type Numbers = "integer" | "fractionAnswers";

export const schema = [
  {
    type: "enum",
    key: "numbers",
    label: "Boundary values",
    default: "integer",
    options: [
      { value: "integer", label: "Integers" },
      { value: "fractionAnswers", label: "Fractions" },
    ],
  },
  {
    type: "boolean",
    key: "divisionForms",
    label: "Include division forms like x/3 + 2 > 5",
    default: true,
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative numbers (negative coefficients flip the symbol)",
    default: true,
  },
  {
    type: "int",
    key: "maxSolution",
    label: "Largest boundary value",
    min: 2,
    max: 50,
    default: 10,
  },
  {
    type: "int",
    key: "maxCoefficient",
    label: "Largest coefficient or constant",
    min: 2,
    max: 20,
    default: 9,
  },
  notationField,
  showNumberLineField,
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface TwoStepConstruction {
  form: Form;
  /** the boundary of the solution set */
  s: Rat;
  /** the symbol as printed with the variable on the left */
  op: Op;
  /** the coefficient (linear, constantFirst) or divisor (divided) */
  a: Rat;
  b: Rat;
  c: Rat;
  swapSides: boolean;
  solution: SolutionSet;
}

export function evaluate(form: Form, s: Rat, a: Rat, b: Rat): Rat {
  return form === "divided" ? add(div(s, a)!, b) : add(mul(a, s), b);
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): TwoStepConstruction {
  const p = resolveParams(schema, params);
  const S = p.maxSolution as number;
  const C = p.maxCoefficient as number;
  const negOk = p.allowNegatives as boolean;
  const fractions = p.numbers === "fractionAnswers";

  const forms: Form[] = ["linear", "linear", "constantFirst"];
  if (p.divisionForms && !fractions) forms.push("divided");
  const form = rng.pick(forms);
  const op = rng.pick(OPS);

  let a: Rat;
  let s: Rat;
  if (form === "divided") {
    a = rat(nonzeroInt(rng, 2, Math.max(2, Math.min(C, S)), negOk));
    const A = Math.abs(a.n);
    s = rat(A * nonzeroInt(rng, 1, Math.max(1, Math.floor(S / A)), negOk));
  } else {
    a = rat(nonzeroInt(rng, 2, C, negOk));
    if (fractions) {
      const A = Math.abs(a.n);
      let n = nonzeroInt(rng, 1, S * A, negOk);
      if (n % A === 0) n -= n > 0 ? 1 : -1; // toward zero keeps |s| <= S
      s = rat(n, A);
    } else s = rat(nonzeroInt(rng, 1, S, negOk));
  }
  // a constant leading its side prints as a negative number, so it is
  // positive with negatives off; elsewhere a negative one prints as subtraction
  let b = rat(nonzeroInt(rng, 1, C, negOk || form !== "constantFirst"));
  let c = evaluate(form, s, a, b);
  if (isZero(c) || (!negOk && c.n < 0)) {
    b = negOk ? neg(b) : rat(Math.abs(b.n));
    c = evaluate(form, s, a, b);
  }
  return { form, s, op, a, b, c, swapSides: rng.bool(0.2), solution: rayFor(s, op, a.n) };
}

/** The side holding the variable. */
export function variableSide(k: TwoStepConstruction): string {
  const { a, b } = k;
  switch (k.form) {
    case "linear":
      return linearLatex([{ coef: a, v: "x" }, { coef: b, v: "" }]);
    case "constantFirst":
      return linearLatex([{ coef: b, v: "" }, { coef: a, v: "x" }]);
    case "divided":
      return `${a.n < 0 ? "-" : ""}\\frac{x}{${Math.abs(a.n)}} ${b.n < 0 ? "-" : "+"} ${Math.abs(b.n)}`;
  }
}

export function promptLatex(k: TwoStepConstruction): string {
  const expr = variableSide(k);
  const c = numLatex(k.c);
  return k.swapSides ? `${c} ${OP_LATEX[FLIP[k.op]]} ${expr}` : `${expr} ${OP_LATEX[k.op]} ${c}`;
}

/**
 * Mistake-based Distractors, each the solution set of a mis-solved
 * inequality, most common first:
 * - with a negative coefficient, forgot to flip the symbol after dividing (or
 *   multiplying) by it; with a positive one and a negative right side,
 *   flipped it anyway;
 * - moved the constant with the wrong sign: (c + b)/a (or a(c + b));
 * - wrong endpoint inclusion;
 * - divided before undoing the constant, and only c: c/a - b (or divided by
 *   the divisor instead of multiplying: (c - b)/a);
 * - both the flip and the sign mistakes at once;
 * - a reversed inequality read the wrong way round, and the boundary's sign
 *   changed.
 */
export function mistakes(k: TwoStepConstruction): (SolutionSet | null)[] {
  const { a, b, c, op, s } = k;
  const answer = k.solution;
  const at = (x: Rat | null) => (x ? rayFor(x, op, a.n) : null);
  const divided = k.form === "divided";
  const wrongSign = divided ? mul(a, add(c, b)) : div(add(c, b), a);
  const out: (SolutionSet | null)[] = [];
  if (a.n < 0) out.push(ray(s, op));
  else if (c.n < 0) out.push(flipped(answer));
  out.push(at(wrongSign), toggled(answer));
  out.push(divided ? at(div(sub(c, b), a)) : at(sub(div(c, a)!, b)));
  if (a.n < 0 && wrongSign) out.push(ray(wrongSign, op));
  if (k.swapSides || a.n > 0) out.push(flipped(answer));
  out.push(negated(answer));
  return out;
}

export const generator: Generator = {
  id: TWO_STEP_INEQUALITIES_ID,
  title: "Solving two-step inequalities",
  defaultDirections: "Solve each inequality.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return solvedProblem(
      { generatorId: TWO_STEP_INEQUALITIES_ID, params: resolved, seed, prompt: promptLatex(k) },
      k.solution,
      mistakes(k),
    );
  },
};
