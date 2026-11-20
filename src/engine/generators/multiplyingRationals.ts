// "Multiplying rational numbers": a product of two or three integers,
// fractions, mixed numbers or decimals, positive or negative, e.g.
// -\frac{4}{9} \cdot \frac{3}{8} or 2\frac{1}{4} \cdot \left(-1\frac{1}{3}\right).
//
// Built ANSWER-FIRST: the Answer is drawn, then every factor but the last,
// and the last factor is computed exactly (Answer divided by the others). A
// draw is kept only when that last factor is the same kind of number as the
// others, so the product comes out to the chosen Answer by arithmetic.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { abs, add, distinctHints, div, isInt, mul, neg, rat, sub, type Rat } from "./equationKit";
import {
  answerFormField,
  decimalPlaces,
  drawRational,
  fitsStyle,
  fractionForm,
  FRIENDLY_DENOMINATORS,
  maxWholeField,
  numbersField,
  operandLatex,
  valueLatex,
  type AnswerForm,
  type FractionForm,
  type RationalStyle,
} from "./rationalKit";

export const MULTIPLYING_RATIONALS_ID = "multiplying-rationals";

export const schema = [
  numbersField("fraction"),
  {
    type: "int",
    key: "factors",
    label: "Numbers in each product",
    min: 2,
    max: 3,
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
export interface ProductConstruction {
  style: RationalStyle;
  form: FractionForm;
  factors: Rat[];
  /** the Answer */
  answer: Rat;
}

export const product = (factors: Rat[]): Rat => factors.reduce(mul, rat(1));

/** An Answer of roughly the size a product of these numbers has. */
function drawAnswer(rng: Rng, style: RationalStyle, maxWhole: number, count: number, negOk: boolean): Rat {
  const sign = negOk && rng.bool() ? -1 : 1;
  switch (style) {
    case "integer":
      return rat(sign * rng.int(4, maxWhole ** count));
    case "fraction": {
      // a product of proper fractions: proper, its denominator a product of
      // two friendly ones, often after something cancels
      for (;;) {
        const d = (rng.pick(FRIENDLY_DENOMINATORS) * rng.pick(FRIENDLY_DENOMINATORS)) / rng.pick([1, 1, 2, 3]);
        if (!Number.isInteger(d)) continue;
        const r = rat(rng.int(1, d - 1), d);
        if (r.d > 1) return rat(sign * r.n, r.d);
      }
    }
    case "mixed": {
      const d = rng.int(2, 24);
      for (;;) {
        const r = rat(rng.int(d + 1, d * maxWhole * 2), d);
        if (r.d > 1) return rat(sign * r.n, r.d);
      }
    }
    case "decimal": {
      const scale = rng.pick([10, 100, 100, 1000]);
      for (;;) {
        const k = rng.int(1, maxWhole * maxWhole * scale);
        if (k % scale !== 0) return rat(sign * k, scale);
      }
    }
  }
}

function factorFits(t: Rat, style: RationalStyle, maxWhole: number, negOk: boolean): boolean {
  if (!negOk && t.n < 0) return false;
  if (!fitsStyle(t, style, maxWhole, 12)) return false;
  if (style === "fraction" && Math.abs(t.n) >= t.d) return false;
  if (style === "integer" && Math.abs(t.n) < 2) return false;
  return true;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): ProductConstruction {
  const p = resolveParams(schema, params);
  const style = p.numbers as RationalStyle;
  const form = fractionForm(p.answerForm as AnswerForm, style);
  const n = p.factors as number;
  const negOk = p.allowNegatives as boolean;
  const W = p.maxWhole as number;

  if (style === "decimal") {
    const k = decimalProduct(rng, n, W, negOk);
    if (k) return { style, form, ...k };
  }
  for (let attempt = 0; attempt < 4000; attempt++) {
    const answer = drawAnswer(rng, style, W, n, negOk);
    const factors = Array.from({ length: n - 1 }, () => drawRational(rng, style, W, negOk));
    if (style === "integer" && factors.some((f) => Math.abs(f.n) < 2)) continue;
    const last = div(answer, product(factors))!;
    if (!factorFits(last, style, W, negOk)) continue;
    factors.push(last);
    // a half is the easiest factor to complete a product with; keep it from crowding the sheet
    if (factors.some((f) => Math.abs(f.n) === 1 && f.d === 2) && rng.bool(0.75)) continue;
    // a fraction product should be one where something cancels or multiplies out, not a repeat
    if (factors.every((f) => Math.abs(f.n) === Math.abs(factors[0].n) && f.d === factors[0].d)) continue;
    return { style, form, factors, answer };
  }
  // Practically unreachable: build forwards (the Answer is still exact).
  const factors = Array.from({ length: n }, () => drawRational(rng, style, W, negOk)).map((f) =>
    style === "integer" && Math.abs(f.n) < 2 ? rat(2) : f,
  );
  return { style, form, factors, answer: product(factors) };
}

/**
 * Decimals, Answer first: the Answer's digits M are drawn, M is split into
 * one whole-number factor of its digits per factor (a divisor at a time), and
 * each factor gets one or two decimal places; the Answer's places are their
 * sum: 31.746 has digits 31746 = 74 \cdot 429, so with places 1 and 2 it is
 * 7.4 \cdot 4.29.
 */
function decimalProduct(rng: Rng, n: number, W: number, negOk: boolean): { factors: Rat[]; answer: Rat } | null {
  for (let attempt = 0; attempt < 4000; attempt++) {
    const places = Array.from({ length: n }, () => (n === 3 || rng.bool(0.6) ? 1 : 2));
    const total = places.reduce((a, b) => a + b, 0);
    // the Answer's digits, below the largest product the factors allow
    const most = Math.min(10 ** total * W ** n, 10 ** 6);
    const M = rng.int(10, most);
    const digits: number[] = [];
    let rest = M;
    for (let i = 0; i < n - 1; i++) {
      const cap = W * 10 ** places[i];
      const divs: number[] = [];
      for (let d = 2; d <= Math.min(cap, rest); d++) if (rest % d === 0) divs.push(d);
      if (divs.length === 0) break;
      const d = rng.pick(divs);
      digits.push(d);
      rest /= d;
    }
    if (digits.length !== n - 1) continue;
    digits.push(rest);
    const factors = digits.map((d, i) => rat(negOk && rng.bool(0.4) ? -d : d, 10 ** places[i]));
    if (!factors.every((f) => fitsStyle(f, "decimal", W, 12))) continue;
    const answer = rat((negOk ? Math.sign(product(factors).n) : 1) * M, 10 ** total);
    return { factors, answer };
  }
  return null;
}

export function promptLatex(k: ProductConstruction): string {
  return k.factors.map((f, i) => operandLatex(f, k.style, i === 0)).join(" \\cdot ");
}

export function answerLatex(k: { style: RationalStyle; form: FractionForm }, r: Rat): string {
  return valueLatex(r, k.style, k.form);
}

// ------------------------------------------------------------------ mistakes

/** -2\frac{1}{3} split into its whole part and its fraction part, both carrying the sign. */
export function mixedParts(r: Rat): { whole: Rat; part: Rat } {
  const m = abs(r);
  const whole = Math.floor(m.n / m.d);
  const sign = r.n < 0 ? -1 : 1;
  return { whole: rat(sign * whole), part: rat(sign * (m.n - whole * m.d), m.d) };
}

/** Is r printable alongside the Answer without giving itself away? */
export function plausible(style: RationalStyle, r: Rat | null, maxPlaces = 4): r is Rat {
  if (!r || r.n === 0) return false;
  if (style === "integer") return isInt(r);
  if (style === "decimal") {
    const pl = decimalPlaces(r);
    return pl !== null && pl <= maxPlaces;
  }
  // a whole number among fractions gives itself away
  if (style === "fraction" && isInt(r)) return false;
  return r.d <= 150;
}

/**
 * Mistake-based Distractors: the wrong sign, a fraction turned upside down
 * that should not have been (dividing instead), whole parts and fraction parts
 * of mixed numbers multiplied separately, a common denominator found first
 * (as if adding) and kept, a decimal point placed one digit off, and for
 * integers, adding instead or skip-counting one time too many or too few.
 */
export function distractors(k: ProductConstruction, negativesOnSheet = true): string[] {
  const { factors, answer } = k;
  const values: (Rat | null)[] = [neg(answer)];
  if (k.style === "fraction" || k.style === "mixed") {
    // a/b \cdot c/d worked as a/b \div c/d (flipped the second fraction)
    values.push(factors.slice(1).reduce<Rat | null>((acc, f) => (acc ? div(acc, f) : null), factors[0]));
    // flipped the first fraction instead
    values.push(div(product(factors.slice(1)), factors[0]));
  }
  if (k.style === "mixed") {
    // (2 + \frac{1}{3})(1 + \frac{1}{2}) worked as 2 \cdot 1 + \frac{1}{3} \cdot \frac{1}{2}
    const parts = factors.map(mixedParts);
    values.unshift(add(product(parts.map((x) => x.whole)), product(parts.map((x) => x.part))));
  }
  if (k.style === "fraction") {
    // common denominator first, then multiplied the numerators and kept it
    const L = factors.reduce((acc, f) => lcm(acc, f.d), 1);
    if (factors.some((f) => f.d !== L)) values.push(rat(factors.reduce((acc, f) => acc * f.n * (L / f.d), 1), L));
  }
  if (k.style === "decimal") {
    // miscounted the decimal places in the product
    values.unshift(mul(answer, rat(10)), mul(answer, rat(1, 10)));
    values.push(mul(answer, rat(100)), mul(answer, rat(1, 100)));
  }
  if (k.style === "integer") {
    // added instead of multiplying, then a sign slip on that
    const sum = factors.reduce(add, rat(0));
    values.push(sum, neg(sum));
    // skip-counted one time too many or too few: 6 \cdot 7 as 6 \cdot 8 or 6 \cdot 6
    const [first, ...rest] = factors;
    const others = product(rest);
    const step = first.n < 0 ? -1 : 1;
    values.push(mul(add(first, rat(step)), others), mul(sub(first, rat(step)), others));
  }
  // a negative choice on a sheet with no negative numbers gives itself away
  const signs = negativesOnSheet || factors.some((f) => f.n < 0);
  return distinctHints(
    answerLatex(k, answer),
    values.filter((r): r is Rat => plausible(k.style, r) && (signs || r.n > 0)).map((r) => answerLatex(k, r)),
  );
}

export function lcm(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y) [x, y] = [y, x % y];
  return (a / x) * b;
}

export const generator: Generator = {
  id: MULTIPLYING_RATIONALS_ID,
  title: "Multiplying rational numbers",
  defaultDirections: "Find each product.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: MULTIPLYING_RATIONALS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k, k.answer),
      distractorHints: distractors(k, resolved.allowNegatives as boolean),
    };
  },
};
