// "Solving one-step inequalities": x + b < c, x - b >= c, ax <= c and x/a > c,
// with negative coefficients and divisors that flip the symbol.
//
// Built ANSWER-FROM-CONSTRUCTION: the boundary s, the symbol and the
// coefficient (or constant) are chosen first, and the other side c is computed
// from them (c = s + b, as, or s/a). The solution set is then known outright:
// x op s, with the symbol flipped when the coefficient is negative. Nothing is
// ever solved.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { add, div, linearLatex, mul, nonzeroInt, numLatex, rat, sub, type Rat } from "./equationKit";
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

export const ONE_STEP_INEQUALITIES_ID = "one-step-inequalities";

export type Operations = "addSub" | "mulDiv" | "all";
export type Form = "add" | "mul" | "div";

export const schema = [
  {
    type: "enum",
    key: "operations",
    label: "Operations",
    default: "all",
    options: [
      { value: "addSub", label: "Addition and subtraction" },
      { value: "mulDiv", label: "Multiplication and division" },
      { value: "all", label: "All four" },
    ],
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
export interface OneStepConstruction {
  form: Form;
  /** the boundary of the solution set */
  s: Rat;
  /** the symbol as printed with the variable on the left */
  op: Op;
  /** the constant added (add), the coefficient (mul) or the divisor (div) */
  a: Rat;
  /** the other side */
  c: Rat;
  /** printed as "c op' expr" */
  swapSides: boolean;
  solution: SolutionSet;
}

function pickForm(rng: Rng, ops: Operations): Form {
  if (ops === "addSub") return "add";
  if (ops === "mulDiv") return rng.pick(["mul", "mul", "div"] as const);
  return rng.pick(["add", "add", "mul", "mul", "div"] as const);
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): OneStepConstruction {
  const p = resolveParams(schema, params);
  const S = p.maxSolution as number;
  const C = p.maxCoefficient as number;
  const negOk = p.allowNegatives as boolean;
  const form = pickForm(rng, p.operations as Operations);
  const op = rng.pick(OPS);

  let s: Rat;
  let a: Rat;
  let c: Rat;
  if (form === "add") {
    s = rat(nonzeroInt(rng, 1, S, negOk));
    // the constant may be subtracted ("x - 4") even with negatives off, as
    // long as the other side stays positive
    let b = nonzeroInt(rng, 1, C, true);
    if (!negOk && s.n + b <= 0) b = -b;
    a = rat(b);
    c = add(s, a);
  } else if (form === "mul") {
    a = rat(nonzeroInt(rng, 2, C, negOk));
    s = rat(nonzeroInt(rng, 1, S, negOk));
    c = mul(a, s);
  } else {
    a = rat(nonzeroInt(rng, 2, Math.max(2, Math.min(C, S)), negOk));
    const m = nonzeroInt(rng, 1, Math.max(1, Math.floor(S / Math.abs(a.n))), negOk);
    s = mul(rat(Math.abs(a.n)), rat(m));
    c = div(s, a)!;
  }
  const sign = form === "add" ? 1 : a.n;
  return { form, s, op, a, c, swapSides: rng.bool(0.25), solution: rayFor(s, op, sign) };
}

/** The side holding the variable. */
export function variableSide(k: OneStepConstruction): string {
  switch (k.form) {
    case "add":
      return linearLatex([{ coef: rat(1), v: "x" }, { coef: k.a, v: "" }]);
    case "mul":
      return linearLatex([{ coef: k.a, v: "x" }]);
    case "div":
      return `${k.a.n < 0 ? "-" : ""}\\frac{x}{${Math.abs(k.a.n)}}`;
  }
}

export function promptLatex(k: OneStepConstruction): string {
  const expr = variableSide(k);
  const c = numLatex(k.c);
  return k.swapSides ? `${c} ${OP_LATEX[FLIP[k.op]]} ${expr}` : `${expr} ${OP_LATEX[k.op]} ${c}`;
}

/**
 * Mistake-based Distractors, each the solution set of a mis-solved
 * inequality, most common first:
 * - with a negative coefficient or divisor, forgot to flip the symbol; with a
 *   positive one and a negative right side, flipped it anyway;
 * - moved the constant with the wrong sign: x op c + b;
 * - subtracted the coefficient instead of dividing (c - a), or divided by the
 *   divisor instead of multiplying (c / a);
 * - wrong endpoint inclusion (< read as <=, or the reverse);
 * - read a reversed inequality (5 > x + 2) the wrong way round;
 * - the boundary's sign changed.
 */
export function mistakes(k: OneStepConstruction): (SolutionSet | null)[] {
  const answer = k.solution;
  const dir = (at: Rat | null) => (at ? { ...answer, at } : null);
  const out: (SolutionSet | null)[] = [];
  if (k.form === "add") {
    out.push(dir(add(k.c, k.a)));
    if (k.swapSides) out.push(flipped(answer));
    out.push(toggled(answer));
  } else {
    if (k.a.n < 0) out.push(ray(k.s, k.op));
    else if (k.c.n < 0) out.push(flipped(answer));
    out.push(k.form === "mul" ? dir(sub(k.c, k.a)) : dir(div(k.c, k.a)));
    out.push(toggled(answer));
    if (k.a.n > 0 && k.c.n >= 0) out.push(flipped(answer));
    if (k.swapSides) out.push(flipped(answer));
  }
  out.push(negated(answer), toggled(flipped(answer)));
  return out;
}

export const generator: Generator = {
  id: ONE_STEP_INEQUALITIES_ID,
  title: "Solving one-step inequalities",
  defaultDirections: "Solve each inequality.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return solvedProblem(
      { generatorId: ONE_STEP_INEQUALITIES_ID, params: resolved, seed, prompt: promptLatex(k) },
      k.solution,
      mistakes(k),
    );
  },
};
