// "Solving one-step equations": x + a = b, x - a = b, ax = b and x/a = b,
// with integers, decimals or fractions.
//
// Built ANSWER-FROM-CONSTRUCTION: the solution x and the number a are chosen
// first, then b is computed from them (b = x + a, x - a, ax or x/a). The
// printed equation therefore holds at x by arithmetic, and nothing is solved.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import {
  add,
  distinctHints,
  div,
  isZero,
  linearLatex,
  mul,
  neg,
  nonzeroInt,
  numLatex,
  pickVariable,
  rat,
  ratValue,
  solutionLatex,
  sub,
  varyVariableField,
  type NumberStyle,
  type Rat,
} from "./equationKit";

export const ONE_STEP_EQUATIONS_ID = "one-step-equations";

export type Operation = "add" | "subtract" | "multiply" | "divide";
export type Operations = "all" | "addSubtract" | "multiplyDivide";
export type Numbers = "integer" | "decimal" | "fraction";

export const schema = [
  {
    type: "enum",
    key: "operations",
    label: "Operations",
    default: "all",
    options: [
      { value: "all", label: "All four operations" },
      { value: "addSubtract", label: "Addition and subtraction" },
      { value: "multiplyDivide", label: "Multiplication and division" },
    ],
  },
  {
    type: "enum",
    key: "numbers",
    label: "Numbers",
    default: "integer",
    options: [
      { value: "integer", label: "Integers" },
      { value: "decimal", label: "Decimals" },
      { value: "fraction", label: "Fractions" },
    ],
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative numbers",
    default: true,
  },
  {
    type: "int",
    key: "maxSolution",
    label: "Largest solution",
    min: 2,
    max: 100,
    default: 12,
  },
  {
    type: "int",
    key: "maxCoefficient",
    label: "Largest number in the equation (before computing the right side)",
    min: 2,
    max: 50,
    default: 12,
  },
  varyVariableField,
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface OneStepConstruction {
  op: Operation;
  v: string;
  /** the Answer */
  x: Rat;
  /** the number the variable is combined with (added, subtracted, multiplied by, divided by) */
  a: Rat;
  /** the other side, computed from x and a */
  b: Rat;
  /** "a + x" instead of "x + a" (addition) */
  constantFirst: boolean;
  /** "b = ..." instead of "... = b" */
  swapSides: boolean;
  style: NumberStyle;
}

const OPS: Record<Operations, Operation[]> = {
  all: ["add", "subtract", "multiply", "divide"],
  addSubtract: ["add", "subtract"],
  multiplyDivide: ["multiply", "divide"],
};

/** A non-integer fraction with a small denominator and 0 < |value| <= max
 * (and at most 3, so the fractions stay friendly). */
function niceFraction(
  rng: Rng,
  max: number,
  allowNegative: boolean,
  denominators: readonly number[] = [2, 3, 4, 5, 6, 8],
): Rat {
  const d = rng.pick(denominators);
  for (;;) {
    const n = rng.int(1, Math.min(max, 3) * d);
    if (n % d === 0) continue;
    const r = rat(n, d);
    return allowNegative && rng.bool() ? neg(r) : r;
  }
}

/** A number with one decimal place, not a whole number, 0 < |value| <= max. */
function niceDecimal(rng: Rng, max: number, allowNegative: boolean): Rat {
  for (;;) {
    const tenths = rng.int(1, max * 10);
    if (tenths % 10 === 0) continue;
    return rat(allowNegative && rng.bool() ? -tenths : tenths, 10);
  }
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): OneStepConstruction {
  const p = resolveParams(schema, params);
  const S = p.maxSolution as number;
  const C = p.maxCoefficient as number;
  const negOk = p.allowNegatives as boolean;
  const numbers = p.numbers as Numbers;
  const style: NumberStyle = numbers === "decimal" ? "decimal" : "fraction";
  const op = rng.pick(OPS[p.operations as Operations]);

  const intX = () => rat(nonzeroInt(rng, 1, S, negOk));
  let x: Rat;
  let a: Rat;
  let b: Rat;

  switch (op) {
    case "add":
    case "subtract": {
      const drawA = (): Rat =>
        numbers === "integer"
          ? rat(rng.int(1, C))
          : numbers === "decimal"
            ? niceDecimal(rng, C, false)
            : niceFraction(rng, C, false);
      if (op === "subtract" && !negOk) {
        // keep every printed number positive: x - a = b with 0 < a < x
        x = numbers === "integer" ? rat(rng.int(2, S)) : rat(rng.int(1, S));
        if (numbers === "decimal" && rng.bool() && S > 1) x = sub(x, rat(rng.int(1, 9), 10));
        if (numbers === "fraction" && rng.bool() && S > 1) x = sub(x, rat(1, rng.pick([2, 3, 4])));
        if (numbers === "integer") a = rat(rng.int(1, Math.min(C, x.n - 1)));
        else {
          a = drawA();
          for (let tries = 0; ratValue(a) >= ratValue(x) && tries < 50; tries++) a = drawA();
          if (ratValue(a) >= ratValue(x)) a = mul(x, rat(1, 2));
        }
      } else {
        a = drawA();
        x =
          numbers === "integer" || rng.bool()
            ? intX()
            : numbers === "decimal"
              ? niceDecimal(rng, S, negOk)
              : niceFraction(rng, S, negOk);
      }
      b = op === "add" ? add(x, a) : sub(x, a);
      if (isZero(b)) {
        // "x + 3 = 0" leaves no right-hand number for the mistake-based
        // Distractors to work with; use the opposite solution instead (only
        // reachable with negatives allowed, and |x| is unchanged).
        x = neg(x);
        b = op === "add" ? add(x, a) : sub(x, a);
      }
      break;
    }
    case "multiply": {
      if (numbers === "integer") {
        a = rat(nonzeroInt(rng, 2, C, negOk));
        x = intX();
      } else if (numbers === "decimal") {
        if (rng.bool()) {
          a = niceDecimal(rng, Math.min(C, 5), negOk);
          x = intX();
        } else {
          a = rat(nonzeroInt(rng, 2, C, negOk));
          x = niceDecimal(rng, S, negOk);
        }
      } else if (rng.bool()) {
        // \frac{2}{3}x = 8: a fraction coefficient, a whole-number solution
        a = niceFraction(rng, 2, negOk, [2, 3, 4, 5, 6, 8].filter((d) => d <= S));
        x = mul(rat(a.d), rat(nonzeroInt(rng, 1, Math.max(1, Math.floor(S / a.d)), negOk)));
      } else {
        // 3x = 7: a whole-number coefficient, a fraction solution
        a = rat(nonzeroInt(rng, 2, C, negOk));
        let n = nonzeroInt(rng, 1, S * Math.abs(a.n), negOk);
        if (n % a.n === 0) n += n > 0 ? 1 : -1;
        x = rat(n, Math.abs(a.n));
      }
      b = mul(a, x);
      break;
    }
    case "divide": {
      // x / a = b: choose b, then x = ab
      const A = rng.int(2, Math.max(2, Math.min(C, S)));
      a = rat(A);
      if (numbers === "integer") {
        b = rat(nonzeroInt(rng, 1, Math.max(1, Math.floor(S / A)), negOk));
      } else if (numbers === "decimal") {
        b = niceDecimal(rng, Math.max(1, Math.floor(S / A)), negOk);
      } else {
        b = niceFraction(rng, Math.max(1, Math.floor(S / A)), negOk);
      }
      x = mul(a, b);
      break;
    }
  }

  return {
    op,
    v: pickVariable(rng, p.varyVariable as boolean),
    x,
    a,
    b,
    constantFirst: op === "add" && rng.bool(0.3),
    swapSides: rng.bool(0.25),
    style,
  };
}

/** The side holding the variable, e.g. "x + 5", "-4x", "\frac{x}{3}". */
function variableSide(k: OneStepConstruction): string {
  const { v, a, style } = k;
  switch (k.op) {
    case "add":
      return k.constantFirst
        ? linearLatex([{ coef: a, v: "" }, { coef: rat(1), v }], style)
        : linearLatex([{ coef: rat(1), v }, { coef: a, v: "" }], style);
    case "subtract":
      return linearLatex([{ coef: rat(1), v }, { coef: neg(a), v: "" }], style);
    case "multiply":
      return linearLatex([{ coef: a, v }], style);
    case "divide":
      return `\\frac{${v}}{${numLatex(a, style)}}`;
  }
}

export function promptLatex(k: OneStepConstruction): string {
  const left = variableSide(k);
  const right = numLatex(k.b, k.style);
  return k.swapSides ? `${right} = ${left}` : `${left} = ${right}`;
}

/**
 * Mistake-based Distractors, most common first:
 * - addition / subtraction: did the same operation instead of the inverse
 *   (x + 5 = 12 answered 17), subtracted the wrong way round (5 - 12), or
 *   both with a sign slip;
 * - multiplication: subtracted the coefficient instead of dividing (3x = 12
 *   answered 9), multiplied instead of dividing (36), divided upside down
 *   (\frac{3}{12}), or dropped the sign of a negative coefficient;
 * - division: divided instead of multiplying (x/3 = 6 answered 2), added
 *   (9), divided upside down, or a sign slip;
 * - and, as a last resort, the right-hand number itself (ignored the step).
 * Distinct, and never equal to the Answer.
 */
export function distractors(k: OneStepConstruction): string[] {
  const { a, b } = k;
  let values: (Rat | null)[];
  switch (k.op) {
    case "add":
      values = [add(b, a), sub(a, b), neg(add(b, a)), b, neg(b)];
      break;
    case "subtract":
      values = [sub(b, a), sub(a, b), neg(add(b, a)), b, neg(b)];
      break;
    case "multiply":
      values = [sub(b, a), mul(a, b), div(a, b), neg(k.x), b, add(b, a)];
      break;
    case "divide":
      values = [div(b, a), add(b, a), div(a, b), neg(k.x), b, sub(b, a)];
      break;
  }
  const answer = solutionLatex(k.v, k.x, k.style);
  return distinctHints(
    answer,
    values.map((r) => (r ? solutionLatex(k.v, r, k.style) : null)),
  );
}

export const generator: Generator = {
  id: ONE_STEP_EQUATIONS_ID,
  title: "Solving one-step equations",
  defaultDirections: "Solve each equation.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: ONE_STEP_EQUATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: solutionLatex(k.v, k.x, k.style),
      distractorHints: distractors(k),
    };
  },
};
