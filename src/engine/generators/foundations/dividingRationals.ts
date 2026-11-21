// "Dividing rational numbers": a quotient of two integers, fractions, mixed
// numbers or decimals, positive or negative, e.g.
// \frac{3}{4} \div \left(-\frac{9}{10}\right) or -4.86 \div 1.8.
//
// Built ANSWER-FIRST: the Answer (the quotient) and the divisor are drawn,
// and the dividend is their exact product. A draw is kept only when the
// dividend is the same kind of number as the divisor.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { abs, add, distinctHints, div, mul, neg, rat, type Rat } from "../shared/equationKit";
import {
  answerFormField,
  drawRational,
  fitsStyle,
  fractionForm,
  maxWholeField,
  numbersField,
  operandLatex,
  type AnswerForm,
  type FractionForm,
  type RationalStyle,
} from "./rationalKit";
import { answerLatex, lcm, mixedParts, plausible } from "./multiplyingRationals";

export const DIVIDING_RATIONALS_ID = "dividing-rationals";

export const schema = [
  numbersField("fraction"),
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
export interface QuotientConstruction {
  style: RationalStyle;
  form: FractionForm;
  dividend: Rat;
  divisor: Rat;
  /** the Answer */
  answer: Rat;
}

/** A quotient of the chosen kind: integers stay whole, the others may be any small fraction. */
function drawAnswer(rng: Rng, style: RationalStyle, maxWhole: number, negOk: boolean): Rat {
  const sign = negOk && rng.bool() ? -1 : 1;
  switch (style) {
    case "integer":
      return rat(sign * rng.int(2, maxWhole));
    case "fraction":
    case "mixed": {
      for (;;) {
        const d = rng.int(2, 16);
        const r = rat(rng.int(1, d * (style === "mixed" ? 4 : 2)), d);
        if (r.d > 1 || style === "mixed") return rat(sign * r.n, r.d);
      }
    }
    case "decimal": {
      // a terminating quotient: tenths, hundredths or a whole number
      const scale = rng.pick([1, 10, 10, 100]);
      return rat(sign * rng.int(scale === 1 ? 2 : 1, maxWhole * scale), scale);
    }
  }
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): QuotientConstruction {
  const p = resolveParams(schema, params);
  const style = p.numbers as RationalStyle;
  const form = fractionForm(p.answerForm as AnswerForm, style);
  const negOk = p.allowNegatives as boolean;
  const W = p.maxWhole as number;

  for (let attempt = 0; attempt < 4000; attempt++) {
    const answer = drawAnswer(rng, style, W, negOk);
    // a quotient of 1 or -1 only asks whether two numbers match
    if (Math.abs(answer.n) === 1 && answer.d === 1) continue;
    const divisor = drawRational(rng, style, W, negOk);
    if (style === "integer" && Math.abs(divisor.n) < 2) continue;
    // the integer quotient's dividend may reach maxWhole squared, like 72 \div 8
    const dividend = mul(answer, divisor);
    const room = style === "integer" ? W * W : W;
    if (!negOk && dividend.n < 0) continue;
    if (!fitsStyle(dividend, style, room, 12)) continue;
    if (style === "fraction" && Math.abs(dividend.n) >= dividend.d) continue;
    if (dividend.n === divisor.n && dividend.d === divisor.d) continue;
    // a half is the easiest number to land on; keep it from crowding the sheet
    const half = (r: Rat) => Math.abs(r.n) === 1 && r.d === 2;
    if ((half(dividend) || half(divisor)) && rng.bool(0.75)) continue;
    return { style, form, dividend, divisor, answer };
  }
  // Practically unreachable: build forwards (the Answer is still exact).
  const divisor = drawRational(rng, style, W, false);
  const dividend = drawRational(rng, style, W, false);
  return { style, form, dividend, divisor, answer: div(dividend, divisor)! };
}

export function promptLatex(k: QuotientConstruction): string {
  return `${operandLatex(k.dividend, k.style, true)} \\div ${operandLatex(k.divisor, k.style, false)}`;
}

/**
 * Mistake-based Distractors: multiplied without flipping the divisor, flipped
 * the dividend instead of the divisor (the reciprocal of the Answer), flipped
 * both, the wrong sign, whole parts and fraction parts of mixed numbers
 * divided separately, and a decimal point placed one digit off.
 */
export function distractors(k: QuotientConstruction, negativesOnSheet = true): string[] {
  const { dividend, divisor, answer } = k;
  const values: (Rat | null)[] = [];
  // a decimal point moved one place too few or too many
  if (k.style === "decimal") values.push(mul(answer, rat(10)), mul(answer, rat(1, 10)));
  values.push(mul(dividend, divisor), div(divisor, dividend), neg(answer));
  if (k.style === "mixed") {
    const a = mixedParts(dividend);
    const b = mixedParts(divisor);
    const wholes = div(a.whole, b.whole);
    const parts = div(a.part, b.part);
    if (wholes && parts) values.unshift(add(wholes, parts));
  }
  values.push(div(rat(1), mul(dividend, divisor)), neg(mul(dividend, divisor)));
  values.push(...moreMistakes(k));
  return distinctHints(
    answerLatex(k, answer),
    // a negative choice on a sheet with no negative numbers gives itself away
    values
      .filter((r): r is Rat => plausible(k.style, r, 3) && (negativesOnSheet || r.n > 0))
      .map((r) => answerLatex(k, r)),
  );
}

function moreMistakes(k: QuotientConstruction): Rat[] {
  const { dividend, divisor, answer } = k;
  const out: (Rat | null)[] = [];
  if (k.style === "fraction" || k.style === "mixed") {
    // a/b \div c/d worked as (a/b) \div c, with only the numerator of the divisor used
    out.push(div(dividend, rat(divisor.n)));
    // ... or multiplied by d only
    out.push(mul(dividend, rat(divisor.d)));
    // ... or divided by d only, or multiplied by c only (the wrong half of the divisor)
    out.push(div(dividend, rat(divisor.d)), mul(dividend, rat(divisor.n)));
    // numerators added and denominators added, as if the sign were a plus: (a + c)/(b + d)
    out.push(rat(dividend.n + divisor.n, dividend.d + divisor.d));
    // common denominator found, the numerators divided and the denominator kept: (a' \div c')/L
    const L = lcm(dividend.d, divisor.d);
    out.push(div(answer, rat(L)));
  }
  // Shifted the decimal in only one operand by two places.
  if (k.style === "decimal") out.push(mul(answer, rat(100)), mul(answer, rat(1, 100)));
  // Recalled the wrong neighbouring fact from the times table: 12 \div 4 as 4 or 2 (instead of 3) for the quotient.
  if (k.style === "integer") {
    const step = answer.n < 0 ? -1 : 1;
    out.push(add(answer, rat(step)), add(answer, rat(-step)));
  }
  // Divided the divisor by the dividend (the quotient upside down).
  out.push(div(divisor, dividend));
  // subtracted, or added, instead of dividing
  out.push(add(dividend, neg(divisor)), add(dividend, divisor));
  // ... or took the smaller from the larger, so the difference comes out positive
  out.push(abs(add(dividend, neg(divisor))));
  return out.filter((r): r is Rat => r !== null);
}

export const generator: Generator = {
  id: DIVIDING_RATIONALS_ID,
  title: "Dividing rational numbers",
  defaultDirections: "Find each quotient.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: DIVIDING_RATIONALS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k, k.answer),
      distractorHints: distractors(k, resolved.allowNegatives as boolean),
    };
  },
};
