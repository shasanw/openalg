// "Solving two-step equations": ax + b = c, b + ax = c, x/a + b = c and
// (x + b)/a = c, with integers, fraction answers, fraction coefficients or
// decimals.
//
// Built ANSWER-FROM-CONSTRUCTION: the solution x, the coefficient a and the
// constant b are chosen first, and the right-hand side c is computed from them
// (c = ax + b, x/a + b or (x + b)/a). Nothing is ever solved.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import {
  add,
  distinctHints,
  div,
  isInt,
  isZero,
  linearLatex,
  mul,
  neg,
  nonzeroInt,
  numLatex,
  pickVariable,
  rat,
  ratValue,
  solutionHint,
  solutionLatex,
  sub,
  varyVariableField,
  type NumberStyle,
  type Rat,
} from "./equationKit";

export const TWO_STEP_EQUATIONS_ID = "two-step-equations";

export type Form = "linear" | "constantFirst" | "divided" | "groupedOver";
export type Numbers = "integer" | "fractionAnswers" | "fractions" | "decimals";

export const schema = [
  {
    type: "enum",
    key: "numbers",
    label: "Numbers",
    default: "integer",
    options: [
      { value: "integer", label: "Integers" },
      { value: "fractionAnswers", label: "Integers with fraction answers" },
      { value: "fractions", label: "Fraction coefficients" },
      { value: "decimals", label: "Decimals" },
    ],
  },
  {
    type: "boolean",
    key: "divisionForms",
    label: "Include division forms like x/3 + 2 = 5 and (x + 4)/2 = 7",
    default: true,
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
  varyVariableField,
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface TwoStepConstruction {
  form: Form;
  v: string;
  /** the Answer */
  x: Rat;
  /** the coefficient (linear, constantFirst) or divisor (divided, groupedOver) */
  a: Rat;
  /** the constant added to the variable part (or inside the numerator) */
  b: Rat;
  /** the other side, computed from x, a and b */
  c: Rat;
  swapSides: boolean;
  style: NumberStyle;
}

/** The right-hand side the form gives at x. */
export function evaluate(form: Form, x: Rat, a: Rat, b: Rat): Rat {
  switch (form) {
    case "linear":
    case "constantFirst":
      return add(mul(a, x), b);
    case "divided":
      return add(div(x, a)!, b);
    case "groupedOver":
      return div(add(x, b), a)!;
  }
}

/** A number with one decimal place, not a whole number, 0 < |value| <= max. */
function tenths(rng: Rng, max: number, allowNegative: boolean): Rat {
  for (;;) {
    const t = rng.int(1, max * 10);
    if (t % 10 === 0) continue;
    return rat(allowNegative && rng.bool() ? -t : t, 10);
  }
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): TwoStepConstruction {
  const p = resolveParams(schema, params);
  const S = p.maxSolution as number;
  const C = p.maxCoefficient as number;
  const negOk = p.allowNegatives as boolean;
  const numbers = p.numbers as Numbers;
  const style: NumberStyle = numbers === "decimals" ? "decimal" : "fraction";

  // Division forms are integer-coefficient forms in their own right (and
  // decimals pair with x/a + b); fraction modes use the linear forms only.
  const forms: Form[] = ["linear", "linear", "constantFirst"];
  if (p.divisionForms && numbers === "integer") forms.push("divided", "groupedOver");
  if (p.divisionForms && numbers === "decimals") forms.push("divided");
  let form = rng.pick(forms);

  const intX = () => rat(nonzeroInt(rng, 1, S, negOk));
  // constants: either sign (a negative one prints as subtraction) unless it
  // leads the side, where it would print as a negative number
  const constant = (leads: boolean) => rat(nonzeroInt(rng, 1, C, negOk || !leads));

  let x: Rat;
  let a: Rat;
  let b: Rat;

  if (form === "groupedOver") {
    // (x + b)/a = c: choose x and a, then a c so that b = ac - x is small
    a = rat(rng.int(2, C));
    x = intX();
    const lo = Math.ceil((x.n - C) / a.n);
    const hi = Math.floor((x.n + C) / a.n);
    const cs: number[] = [];
    for (let c = lo; c <= hi; c++) {
      const bb = a.n * c - x.n;
      if (c !== 0 && bb !== 0 && (negOk || c > 0)) cs.push(c);
    }
    if (cs.length > 0) {
      b = rat(a.n * rng.pick(cs) - x.n);
    } else {
      form = "linear";
      b = constant(false);
    }
  } else if (form === "divided") {
    a = rat(rng.int(2, Math.max(2, Math.min(C, S))));
    const m = nonzeroInt(rng, 1, Math.max(1, Math.floor(S / a.n)), negOk);
    x = mul(a, rat(m));
    b = numbers === "decimals" ? tenths(rng, C, true) : constant(false);
  } else {
    const leads = form === "constantFirst";
    // a negative coefficient is only offered with negatives on
    if (numbers === "fractions") {
      const q = rng.pick([2, 3, 4, 5, 6].filter((d) => d <= S).concat(2));
      let pn = rng.int(1, Math.min(C, 2 * q));
      if (pn % q === 0) pn += 1;
      a = rat(negOk && rng.bool() ? -pn : pn, q);
      x = mul(rat(a.d), rat(nonzeroInt(rng, 1, Math.max(1, Math.floor(S / a.d)), negOk)));
      b = constant(leads);
    } else if (numbers === "decimals") {
      if (rng.bool()) {
        a = tenths(rng, Math.min(C, 5), negOk);
        x = intX();
      } else {
        a = rat(nonzeroInt(rng, 2, C, negOk));
        x = tenths(rng, S, negOk);
      }
      b = tenths(rng, C, negOk || !leads);
    } else {
      a = rat(nonzeroInt(rng, 2, C, negOk));
      if (numbers === "fractionAnswers") {
        const A = Math.abs(a.n);
        let n = nonzeroInt(rng, 1, S * A, negOk);
        if (n % A === 0) n -= n > 0 ? 1 : -1; // toward zero keeps |x| <= S
        x = rat(n, A);
      } else x = intX();
      b = constant(leads);
    }
  }

  let c = evaluate(form, x, a, b);
  // Keep the right side nonzero, and positive when negatives are off, by
  // flipping the sign of a subtracted constant (its size is unchanged).
  if (isZero(c) || (!negOk && ratValue(c) <= 0)) {
    if (form === "groupedOver") {
      // b = ac - x with c > 0 already when negatives are off; c = 0 is excluded
    } else {
      b = neg(b);
      if (!negOk) b = rat(Math.abs(b.n), b.d);
      c = evaluate(form, x, a, b);
    }
  }

  return {
    form,
    v: pickVariable(rng, p.varyVariable as boolean),
    x,
    a,
    b,
    c,
    swapSides: rng.bool(0.2),
    style,
  };
}

/** " + 3" or " - 3" */
function signed(r: Rat, style: NumberStyle): string {
  return ` ${r.n < 0 ? "-" : "+"} ${numLatex(rat(Math.abs(r.n), r.d), style)}`;
}

/** The side holding the variable. */
export function variableSide(k: TwoStepConstruction): string {
  const { v, a, b, style } = k;
  switch (k.form) {
    case "linear":
      return linearLatex([{ coef: a, v }, { coef: b, v: "" }], style);
    case "constantFirst":
      return linearLatex([{ coef: b, v: "" }, { coef: a, v }], style);
    case "divided":
      return `\\frac{${v}}{${numLatex(a, style)}}${signed(b, style)}`;
    case "groupedOver":
      return `\\frac{${linearLatex([{ coef: rat(1), v }, { coef: b, v: "" }], style)}}{${numLatex(a, style)}}`;
  }
}

export function promptLatex(k: TwoStepConstruction): string {
  const left = variableSide(k);
  const right = numLatex(k.c, k.style);
  return k.swapSides ? `${right} = ${left}` : `${left} = ${right}`;
}

/**
 * Mistake-based Distractors, most common first. For ax + b = c (and b + ax = c):
 * - moved b with the wrong sign: (c + b)/a;
 * - divided before undoing the constant, and only c: c/a - b;
 * - lost the sign of a negative coefficient: -x;
 * - forgot the second step altogether: c - b;
 * - subtracted the coefficient instead of dividing: (c - b) - a;
 * - multiplied by the coefficient instead of dividing: (c - b)a (first with
 *   a fraction coefficient, where it is the classic slip).
 * For x/a + b = c: a(c + b), divided instead of multiplying (c - b)/a,
 * multiplied first ac - b, -x, and forgot the a step c - b.
 * For (x + b)/a = c: ac + b, undid b before a: a(c - b), forgot the a step
 * c - b, c/a - b, and -x.
 * Distinct, and never equal to the Answer.
 */
export function distractors(k: TwoStepConstruction): string[] {
  const { a, b, c, x } = k;
  let values: (Rat | null)[];
  switch (k.form) {
    case "linear":
    case "constantFirst": {
      const rest = sub(c, b);
      const multiplied = mul(rest, a);
      // Multiplying by a whole-number coefficient gives an implausibly large
      // value, so that slip comes last unless the coefficient is a fraction.
      values = isInt(a)
        ? [div(add(c, b), a), sub(div(c, a)!, b), neg(x), rest, sub(rest, a), multiplied]
        : [multiplied, div(add(c, b), a), sub(div(c, a)!, b), neg(x), rest, sub(rest, a)];
      break;
    }
    case "divided":
      values = [mul(a, add(c, b)), div(sub(c, b), a), sub(mul(a, c), b), neg(x), sub(c, b)];
      break;
    case "groupedOver":
      values = [add(mul(a, c), b), mul(a, sub(c, b)), sub(c, b), sub(div(c, a)!, b), neg(x)];
      break;
  }
  return distinctHints(
    solutionLatex(k.v, x, k.style),
    values.map((r) => solutionHint(k.v, r, k.style)),
  );
}

export const generator: Generator = {
  id: TWO_STEP_EQUATIONS_ID,
  title: "Solving two-step equations",
  defaultDirections: "Solve each equation.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: TWO_STEP_EQUATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: solutionLatex(k.v, k.x, k.style),
      distractorHints: distractors(k),
    };
  },
};
