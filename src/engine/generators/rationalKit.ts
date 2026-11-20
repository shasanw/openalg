// Shared pieces for the Algebra 1 Foundations arithmetic Topics (adding and
// subtracting, multiplying and dividing rational numbers) and the Proportions
// and Percents Topics: how a rational number prints (integer, fraction, mixed
// number or decimal), how an operand prints inside an expression, and how nice
// numbers of each kind are drawn. Arithmetic is exact (Rat from equationKit);
// nothing here solves anything.

import type { Rng } from "../rng";
import type { ParamField } from "../types";
import { abs, decimalString, isInt, numLatex, rat, type Rat } from "./equationKit";

/** The kind of numbers a Problem prints. */
export type RationalStyle = "integer" | "fraction" | "mixed" | "decimal";

/** How a non-integer fraction Answer prints: improper ("\frac{7}{4}") or mixed ("1\frac{3}{4}"). */
export type FractionForm = "improper" | "mixed";

/** "2\frac{1}{3}", "-2\frac{1}{3}"; a proper fraction or an integer prints as itself. */
export function mixedLatex(r: Rat): string {
  if (isInt(r) || Math.abs(r.n) < r.d) return numLatex(r);
  const m = abs(r);
  const whole = Math.floor(m.n / m.d);
  return `${r.n < 0 ? "-" : ""}${whole}\\frac{${m.n - whole * m.d}}{${m.d}}`;
}

/** Number of decimal places r prints with, or null when it does not terminate (within 4). */
export function decimalPlaces(r: Rat): number | null {
  const s = decimalString(r);
  if (s === null) return null;
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** A number in the given style and fraction form. A decimal that does not terminate falls back to a fraction. */
export function valueLatex(r: Rat, style: RationalStyle, form: FractionForm = "improper"): string {
  if (style === "decimal") return numLatex(r, "decimal");
  return form === "mixed" ? mixedLatex(r) : numLatex(r);
}

/**
 * An operand inside an expression: a negative one after the first is wrapped
 * in parentheses ("3 - (-2)", "\frac{1}{2} \cdot \left(-\frac{3}{4}\right)"),
 * so two signs never sit side by side.
 */
export function operandLatex(r: Rat, style: RationalStyle, first: boolean): string {
  const body = valueLatex(r, style, style === "mixed" ? "mixed" : "improper");
  if (first || r.n >= 0) return body;
  return body.includes("\\frac") ? `\\left(${body}\\right)` : `(${body})`;
}

/** Does r print cleanly in this style (the right kind of number, small enough)? */
export function fitsStyle(r: Rat, style: RationalStyle, maxWhole: number, maxDenominator: number): boolean {
  if (r.n === 0) return false;
  if (Math.abs(r.n / r.d) > maxWhole) return false;
  switch (style) {
    case "integer":
      return isInt(r);
    case "fraction":
      // proper fractions (and occasionally an improper one after arithmetic)
      return !isInt(r) && r.d <= maxDenominator;
    case "mixed":
      return !isInt(r) && r.d <= maxDenominator && Math.abs(r.n) > r.d;
    case "decimal": {
      const places = decimalPlaces(r);
      return places !== null && places >= 1 && places <= 2;
    }
  }
}

/** Denominators a friendly fraction uses. */
export const FRIENDLY_DENOMINATORS = [2, 3, 4, 5, 6, 8, 9, 10, 12] as const;

/**
 * A random nonzero number of the given style with |value| <= maxWhole:
 * an integer, a proper fraction, a mixed number (whole part 1..maxWhole - 1),
 * or a decimal with one or two places. Negative half the time when allowed.
 */
export function drawRational(rng: Rng, style: RationalStyle, maxWhole: number, allowNegative: boolean): Rat {
  const sign = allowNegative && rng.bool() ? -1 : 1;
  const W = Math.max(2, maxWhole);
  switch (style) {
    case "integer":
      return rat(sign * rng.int(1, W));
    case "fraction": {
      const d = rng.pick(FRIENDLY_DENOMINATORS);
      for (;;) {
        const n = rng.int(1, d - 1);
        const r = rat(n, d);
        if (r.d > 1) return rat(sign * r.n, r.d);
      }
    }
    case "mixed": {
      const d = rng.pick([2, 3, 4, 5, 6, 8]);
      const whole = rng.int(1, W - 1);
      for (;;) {
        const n = rng.int(1, d - 1);
        const f = rat(n, d);
        if (f.d > 1) return rat(sign * (whole * f.d + f.n), f.d);
      }
    }
    case "decimal": {
      const scale = rng.bool(0.6) ? 10 : 100;
      for (;;) {
        const k = rng.int(1, W * scale - 1);
        if (k % scale === 0) continue;
        return rat(sign * k, scale);
      }
    }
  }
}

// ------------------------------------------------------------------ Topic Options

/** The "Numbers" Topic Option shared by the rational-number arithmetic Topics. */
export function numbersField(defaultStyle: RationalStyle) {
  return {
    type: "enum",
    key: "numbers",
    label: "Numbers",
    default: defaultStyle,
    options: [
      { value: "integer", label: "Integers" },
      { value: "fraction", label: "Fractions" },
      { value: "mixed", label: "Mixed numbers" },
      { value: "decimal", label: "Decimals" },
    ],
  } as const satisfies ParamField;
}

export const maxWholeField = {
  type: "int",
  key: "maxWhole",
  label: "Largest whole number",
  min: 2,
  max: 20,
  default: 10,
} as const satisfies ParamField;

/** How fraction Answers print: matching the numbers (mixed for mixed numbers), or always one way. */
export type AnswerForm = "auto" | "improper" | "mixed";

export const answerFormField = {
  type: "enum",
  key: "answerForm",
  label: "Write fraction Answers as",
  default: "auto",
  options: [
    { value: "auto", label: "Like the numbers in the Problem" },
    { value: "improper", label: "Improper fractions" },
    { value: "mixed", label: "Mixed numbers" },
  ],
} as const satisfies ParamField;

export function fractionForm(answerForm: AnswerForm, style: RationalStyle): FractionForm {
  if (answerForm === "auto") return style === "mixed" ? "mixed" : "improper";
  return answerForm;
}
