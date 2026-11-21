// "Adding and subtracting rational numbers": evaluate a sum or difference of
// two to four integers, fractions, mixed numbers or decimals, positive or
// negative, e.g. -\frac{3}{4} + \frac{5}{6} or 2.35 - (-4.1).
//
// Built ANSWER-FIRST: the Answer is drawn, then every operand but the last,
// and the last operand is computed exactly so the expression equals the
// Answer. A draw is kept only when that last operand is the same kind of
// number as the others (a proper fraction among fractions, and so on).

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { add, distinctHints, isInt, mul, neg, rat, ratValue, sub, type Rat } from "../shared/equationKit";
import {
  decimalPlaces,
  drawRational,
  fitsStyle,
  FRIENDLY_DENOMINATORS,
  operandLatex,
  valueLatex,
  answerFormField,
  fractionForm,
  maxWholeField,
  numbersField,
  type AnswerForm,
  type FractionForm,
  type RationalStyle,
} from "./rationalKit";

export const ADDING_SUBTRACTING_RATIONALS_ID = "adding-subtracting-rationals";

export type Operations = "both" | "add" | "subtract";
export type Op = "+" | "-";

export const schema = [
  numbersField("fraction"),
  {
    type: "enum",
    key: "operations",
    label: "Operations",
    default: "both",
    options: [
      { value: "both", label: "Addition and subtraction" },
      { value: "add", label: "Addition only" },
      { value: "subtract", label: "Subtraction only" },
    ],
  },
  {
    type: "int",
    key: "terms",
    label: "Numbers in each expression",
    min: 2,
    max: 4,
    default: 2,
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative numbers",
    default: true,
  },
  maxWholeField,
  answerFormField,
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface AddSubConstruction {
  style: RationalStyle;
  form: FractionForm;
  /** the operands, in printed order */
  terms: Rat[];
  /** ops[i] joins terms[i] and terms[i + 1] */
  ops: Op[];
  /** the Answer */
  answer: Rat;
}

/** Evaluate left to right (addition and subtraction only, so this is the true value). */
export function evaluate(terms: Rat[], ops: Op[]): Rat {
  return ops.reduce((acc, op, i) => (op === "+" ? add(acc, terms[i + 1]) : sub(acc, terms[i + 1])), terms[0]);
}

/** The Answer itself: a number of the chosen kind, allowing a little more room than an operand. */
function drawAnswer(rng: Rng, style: RationalStyle, maxWhole: number, negOk: boolean): Rat {
  const sign = negOk && rng.bool() ? -1 : 1;
  switch (style) {
    case "integer":
      return rat(sign * rng.int(1, 2 * maxWhole));
    case "fraction": {
      // proper or a little past one (a sum of two proper fractions can reach 2)
      const d = rng.pick(FRIENDLY_DENOMINATORS);
      for (;;) {
        const r = rat(rng.int(1, 2 * d - 1), d);
        if (!isInt(r)) return rat(sign * r.n, r.d);
      }
    }
    case "mixed":
    case "decimal":
      return mul(rat(sign), drawRational(rng, style, maxWhole, false));
  }
}

/** Does a computed last operand fit in among the drawn ones? */
function operandFits(t: Rat, style: RationalStyle, maxWhole: number, negOk: boolean, improperOk = false): boolean {
  if (!negOk && t.n <= 0) return false;
  if (!fitsStyle(t, style, maxWhole, 12)) return false;
  if (style === "fraction" && Math.abs(t.n) >= t.d && !improperOk) return false; // proper fractions
  if (style === "decimal" && Math.abs(ratValue(t)) < 0.1) return false;
  return true;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): AddSubConstruction {
  const p = resolveParams(schema, params);
  const style = p.numbers as RationalStyle;
  const form = fractionForm(p.answerForm as AnswerForm, style);
  const n = p.terms as number;
  const negOk = p.allowNegatives as boolean;
  const W = p.maxWhole as number;
  const opChoices: Op[] = { both: ["+", "-"] as Op[], add: ["+"] as Op[], subtract: ["-"] as Op[] }[
    p.operations as Operations
  ];

  for (let attempt = 0; attempt < 1000; attempt++) {
    const ops = Array.from({ length: n - 1 }, () => rng.pick(opChoices));
    const answer = drawAnswer(rng, style, W, negOk);
    const drawn = Array.from({ length: n - 1 }, () => drawRational(rng, style, W, negOk));
    // Usually the last number is the one computed; with negatives off and
    // something subtracted, the first is (it must cover what is taken away).
    const firstComputed = !negOk && ops.includes("-") && rng.bool(0.7);
    let terms: Rat[];
    if (firstComputed) {
      // answer = t0 + (signed rest), so t0 = answer - (signed rest)
      const rest = drawn.reduce((acc, t, i) => (ops[i] === "+" ? add(acc, t) : sub(acc, t)), rat(0));
      terms = [sub(answer, rest), ...drawn];
    } else {
      const partial = evaluate(drawn, ops.slice(0, -1));
      terms = [...drawn, ops[n - 2] === "+" ? sub(answer, partial) : sub(partial, answer)];
    }
    const computed = firstComputed ? terms[0] : terms[n - 1];
    // a computed fraction may be improper only when proper ones keep failing
    if (!operandFits(computed, style, W, negOk, attempt > 300)) continue;
    if (!negOk && !runningTotalsPositive(terms, ops)) continue;
    // with negatives on, the sheet is about signs: every Problem has a negative number in it
    if (negOk && terms.every((t) => t.n > 0) && answer.n > 0 && attempt < 900) continue;
    // two numbers of the same size (-7 - 7, 4 - (-4)) leave the sign mistakes nothing to show
    if (n === 2 && Math.abs(terms[0].n) === Math.abs(terms[1].n) && terms[0].d === terms[1].d && attempt < 900) continue;
    // A sum of fractions should need a common denominator.
    if ((style === "fraction" || style === "mixed") && terms.every((t) => t.d === terms[0].d) && rng.bool(0.8)) continue;
    return { style, form, terms, ops, answer };
  }
  // Only reached when the options leave almost no room (say, subtraction only,
  // four terms, no negatives, numbers up to 2): build forwards with the
  // chosen operations, the first number large enough to stay above zero.
  // The Answer is still exact.
  const ops = Array.from({ length: n - 1 }, () => rng.pick(opChoices));
  const terms = Array.from({ length: n }, () => drawRational(rng, style, W, false));
  const taken = terms.slice(1).reduce((acc, t, i) => (ops[i] === "-" ? add(acc, t) : acc), rat(0));
  if (taken.n > 0) terms[0] = add(terms[0], taken);
  // keep the first number the chosen kind (not a whole number among fractions)
  if (style !== "integer" && isInt(terms[0])) terms[0] = add(terms[0], style === "decimal" ? rat(1, 10) : rat(1, 2));
  return { style, form, terms, ops, answer: evaluate(terms, ops) };
}

/** With negatives off, no step of the working goes below zero. */
function runningTotalsPositive(terms: Rat[], ops: Op[]): boolean {
  let acc = terms[0];
  for (let i = 0; i < ops.length; i++) {
    acc = ops[i] === "+" ? add(acc, terms[i + 1]) : sub(acc, terms[i + 1]);
    if (acc.n <= 0) return false;
  }
  return true;
}

export function promptLatex(k: AddSubConstruction): string {
  return k.terms.map((t, i) => (i === 0 ? "" : ` ${k.ops[i - 1]} `) + operandLatex(t, k.style, i === 0)).join("");
}

export function answerLatex(k: AddSubConstruction, r: Rat = k.answer): string {
  return valueLatex(r, k.style, k.form);
}

// ------------------------------------------------------------------ mistakes

/** Fold the expression with a per-step rule. */
function foldWith(k: AddSubConstruction, step: (acc: Rat, op: Op, t: Rat) => Rat | null): Rat | null {
  let acc: Rat | null = k.terms[0];
  for (let i = 0; i < k.ops.length && acc; i++) acc = step(acc, k.ops[i], k.terms[i + 1]);
  return acc;
}

const signed = (acc: Rat, op: Op, t: Rat) => (op === "+" ? add(acc, t) : sub(acc, t));

/** "a - (-b)" worked as "a - b", "a + (-b)" as "a + b": dropped the operand's own sign. */
function droppedOperandSign(k: AddSubConstruction): Rat | null {
  if (!k.terms.slice(1).some((t) => t.n < 0)) return null;
  return foldWith(k, (acc, op, t) => signed(acc, op, t.n < 0 ? neg(t) : t));
}

/** "a - b" worked as "b - a" (only for two numbers): the opposite of the Answer. */
const flippedSign = (k: AddSubConstruction): Rat => neg(k.answer);

/** Added (or subtracted) numerators and denominators straight across. */
function acrossNumeratorsAndDenominators(k: AddSubConstruction): Rat | null {
  return foldWith(k, (acc, op, t) => {
    const n = op === "+" ? acc.n + t.n : acc.n - t.n;
    return rat(n, acc.d + t.d);
  });
}

/** Found the common denominator but left the numerators unchanged. */
function unscaledNumerators(k: AddSubConstruction): Rat | null {
  if (k.terms.every((t) => t.d === k.terms[0].d)) return null;
  return foldWith(k, (acc, op, t) => {
    const d = lcm(acc.d, t.d);
    return rat(op === "+" ? acc.n + t.n : acc.n - t.n, d);
  });
}

/** -2\frac{1}{3} read as -2 + \frac{1}{3}: the whole part negative, the fraction part not. */
function splitMixedSign(k: AddSubConstruction): Rat | null {
  if (!k.terms.some((t) => t.n < 0)) return null;
  const misread = (t: Rat): Rat => {
    if (t.n >= 0) return t;
    const whole = Math.floor(-t.n / t.d);
    return add(rat(-whole), rat(-t.n - whole * t.d, t.d));
  };
  return foldWith({ ...k, terms: k.terms.map(misread) }, signed);
}

/** Lined the digits up on the right instead of at the decimal point: 2.35 + 4.1 as 2.35 + 0.41. */
function misalignedDecimals(k: AddSubConstruction): Rat | null {
  const places = k.terms.map((t) => decimalPlaces(t) ?? 0);
  const most = Math.max(...places);
  if (places.every((pl) => pl === most)) return null;
  const terms = k.terms.map((t, i) => mul(t, rat(1, 10 ** (most - places[i]))));
  return foldWith({ ...k, terms }, signed);
}

/** -7 + 3 worked as -10: combined the sizes and kept the sign of the larger. */
function combinedSizes(k: AddSubConstruction): Rat | null {
  const effective = k.terms.map((t, i) => (i > 0 && k.ops[i - 1] === "-" ? neg(t) : t));
  if (effective.every((t) => t.n > 0) || effective.every((t) => t.n < 0)) return null;
  const total = effective.reduce((acc, t) => add(acc, t.n < 0 ? neg(t) : t), rat(0));
  return k.answer.n < 0 ? neg(total) : total;
}

function lcm(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y) [x, y] = [y, x % y];
  return (a / x) * b;
}

/** Treated every operation as addition (ignored the subtraction signs). */
function allAdded(k: AddSubConstruction): Rat | null {
  if (!k.ops.includes("-")) return null;
  return foldWith(k, (acc, _op, t) => add(acc, t));
}

/** Dropped every negative sign: -8 + 6 as 8 + 6. */
function droppedAllSigns(k: AddSubConstruction): Rat | null {
  if (!k.terms.some((t) => t.n < 0)) return null;
  return foldWith({ ...k, terms: k.terms.map((t) => (t.n < 0 ? neg(t) : t)) }, signed);
}

/** Lost the sign of the first number: -6 - 8 as 6 - 8. */
function droppedFirstSign(k: AddSubConstruction): Rat | null {
  if (k.terms[0].n >= 0) return null;
  return foldWith({ ...k, terms: [neg(k.terms[0]), ...k.terms.slice(1)] }, signed);
}

/** Found a common denominator by multiplying the denominators, but left the numerators unchanged. */
function productDenominator(k: AddSubConstruction): Rat | null {
  if (k.terms.every((t) => t.d === k.terms[0].d)) return null;
  return foldWith(k, (acc, op, t) => rat(op === "+" ? acc.n + t.n : acc.n - t.n, acc.d * t.d));
}

/** Will r print as the same kind of number as the Answer (so it does not give itself away)? */
function plausible(k: AddSubConstruction, r: Rat | null): r is Rat {
  if (!r || r.n === 0) return false;
  if (k.style === "integer") return isInt(r);
  if (k.style === "decimal") {
    const pl = decimalPlaces(r);
    // (a whole number is fair: decimals often add up to one)
    return pl !== null && pl <= 3;
  }
  return r.d <= 30;
}

/**
 * Mistake-based Distractors, most telling first: dropping an operand's own
 * sign (a - (-b) as a - b), the opposite of the Answer, adding numerators and
 * denominators straight across, a common denominator with unscaled
 * numerators, reading a negative mixed number as -2 + \frac{1}{3}, a slip of
 * one when regrouping a mixed number, decimals lined up on the right,
 * combining sizes under the larger sign, losing the first number's sign or
 * every negative sign, and ignoring the subtraction signs.
 */
export function distractors(k: AddSubConstruction, negativesOnSheet = true): string[] {
  const values: (Rat | null)[] = [droppedOperandSign(k), flippedSign(k)];
  if (k.style === "decimal") values.unshift(misalignedDecimals(k));
  if (k.style === "mixed") values.push(splitMixedSign(k), sub(k.answer, rat(1)), add(k.answer, rat(1)));
  if (k.style === "fraction" || k.style === "mixed") {
    values.push(acrossNumeratorsAndDenominators(k), unscaledNumerators(k), productDenominator(k));
  }
  values.push(combinedSizes(k), droppedFirstSign(k), droppedAllSigns(k), allAdded(k));
  // a negative choice on a sheet with no negative numbers gives itself away
  const signs = negativesOnSheet || promptLatex(k).includes("-");
  return distinctHints(
    answerLatex(k),
    values.filter((r): r is Rat => plausible(k, r) && (signs || r.n > 0)).map((r) => answerLatex(k, r)),
  );
}

export const generator: Generator = {
  id: ADDING_SUBTRACTING_RATIONALS_ID,
  title: "Adding and subtracting rational numbers",
  defaultDirections: "Evaluate each expression.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: ADDING_SUBTRACTING_RATIONALS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k, resolved.allowNegatives as boolean),
    };
  },
};
