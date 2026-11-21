// "Expanding and condensing logarithms" with the product, quotient and power
// rules: \log_{3} \frac{x^{2}\sqrt{y}}{z^{4}} expands to
// 2\log_{3} x + \frac{1}{2}\log_{3} y - 4\log_{3} z, and condensing runs the
// other way. Opt-in number factors that are powers of the base
// (\log_{2} (8x) = 3 + \log_{2} x).
//
// Built ANSWER-FROM-CONSTRUCTION: the base and a list of factors with their
// exponents are chosen first; the expanded and the condensed forms are both
// printed from that one list, so they are equal by construction. Nothing is
// ever simplified or solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints, linearLatex, rat, type Rat } from "../shared/equationKit";
import { gcd } from "../../format";
import { baseValue, COMMON, intPow, logOf, NATURAL, numberBase, type LogBase } from "./logKit";

export const LOG_PROPERTIES_ID = "log-properties";

export type Direction = "expand" | "condense" | "mixed";
export type LogType = "mixed" | "number" | "common" | "natural";

export const schema = [
  {
    type: "enum",
    key: "direction",
    label: "Direction",
    default: "expand",
    options: [
      { value: "expand", label: "Expand" },
      { value: "condense", label: "Condense" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "int",
    key: "terms",
    label: "Logarithms in the expanded form",
    min: 2,
    max: 4,
    default: 3,
  },
  {
    type: "boolean",
    key: "roots",
    label: "Include roots (fraction coefficients)",
    default: true,
  },
  {
    type: "boolean",
    key: "numbers",
    label: "Include numbers that are powers of the base, like log_2 (8x) = 3 + log_2 x",
    default: false,
  },
  {
    type: "enum",
    key: "logType",
    label: "Logarithms",
    default: "mixed",
    options: [
      { value: "mixed", label: "Mixed" },
      { value: "number", label: "Whole-number bases (log_3)" },
      { value: "common", label: "Common logarithms (log)" },
      { value: "natural", label: "Natural logarithms (ln)" },
    ],
  },
] as const satisfies ParamSchema;

/** A variable factor v^e of the argument (e a nonzero rational). */
export interface Factor {
  v: string;
  e: Rat;
}

export interface PropertiesConstruction {
  expand: boolean;
  base: LogBase;
  /** in condensed order: the numerator's factors, then the denominator's */
  factors: Factor[];
  /** a number factor base^k in the argument (0 for none) */
  k: number;
  /** the order the expanded terms are printed in a condense Problem (indices; -1 is the number) */
  order: number[];
}

const LETTERS = ["x", "y", "z", "w"];

// ------------------------------------------------------------------ printing

/** v^e for e > 0: "x", "x^{3}", "\sqrt{x}", "\sqrt[3]{x^{2}}". */
export function factorLatex(v: string, e: Rat): string {
  const power = e.n === 1 ? v : `${v}^{${e.n}}`;
  if (e.d === 1) return power;
  return e.d === 2 ? `\\sqrt{${power}}` : `\\sqrt[${e.d}]{${power}}`;
}

/** base^k for k > 0 as printed in an argument: "8", "100", "e^{2}". */
function numberFactor(base: LogBase, k: number): string {
  if (base.kind === "natural") return k === 1 ? "e" : `e^{${k}}`;
  const b = base.kind === "common" ? 10 : base.b.n;
  return String(intPow(b, k));
}

/** The single logarithm of a product over a quotient. */
export function condensedLatex(base: LogBase, factors: Factor[], k: number, numberTex?: string): string {
  return logOf(base, condensedArg(base, factors, k, numberTex));
}

/** The argument of the single logarithm: "x^{2}", "(8xy)", "\frac{x\sqrt{y}}{z^{3}}". */
function condensedArg(base: LogBase, factors: Factor[], k: number, numberTex?: string): string {
  const top: string[] = [];
  const bottom: string[] = [];
  if (k !== 0) (k > 0 ? top : bottom).push(numberTex ?? numberFactor(base, Math.abs(k)));
  for (const f of factors) {
    const tex = factorLatex(f.v, rat(Math.abs(f.e.n), f.e.d));
    (f.e.n > 0 ? top : bottom).push(tex);
  }
  const num = top.length > 0 ? top.join("") : "1";
  let arg: string;
  if (bottom.length > 0) arg = `\\frac{${num}}{${bottom.join("")}}`;
  else arg = top.length === 1 ? num : `(${num})`;
  return arg;
}

/** The sum of logarithms, terms in the given order (-1 is the number term). */
export function expandedLatex(base: LogBase, factors: Factor[], k: number, order: number[], numberTex?: string): string {
  return linearLatex(
    order.map((i) =>
      i < 0 ? { coef: rat(k), v: numberTex ?? "" } : { coef: factors[i].e, v: logOf(base, factors[i].v) },
    ),
  );
}

const canonicalOrder = (k: PropertiesConstruction) =>
  (k.k !== 0 ? [-1] : []).concat(k.factors.map((_, i) => i));

export function promptLatex(k: PropertiesConstruction): string {
  return k.expand ? condensedLatex(k.base, k.factors, k.k) : expandedLatex(k.base, k.factors, k.k, k.order);
}

export function answerLatex(k: PropertiesConstruction): string {
  return k.expand ? expandedLatex(k.base, k.factors, k.k, canonicalOrder(k)) : condensedLatex(k.base, k.factors, k.k);
}

// ------------------------------------------------------------------ choosing

function pickBase(rng: Rng, logType: LogType): LogBase {
  const kind = logType === "mixed" ? rng.pick(["number", "number", "common", "natural"] as const) : logType;
  if (kind === "common") return COMMON;
  if (kind === "natural") return NATURAL;
  return numberBase(rat(rng.int(2, 9)));
}

function pickExponent(rng: Rng, roots: boolean): Rat {
  if (roots && rng.bool(0.3)) {
    const d = rng.pick([2, 3]);
    const n = rng.pick([1, 1, 2, 3].filter((x) => gcd(x, d) === 1));
    return rat(rng.bool(0.25) ? -n : n, d);
  }
  const n = rng.pick([1, 1, 2, 2, 3, 4]);
  return rat(rng.bool(0.35) ? -n : n);
}

export function construct(params: ParamValues, rng: Rng): PropertiesConstruction {
  const p = resolveParams(schema, params);
  const direction = p.direction as Direction;
  const expand = direction === "mixed" ? rng.bool() : direction === "expand";
  const base = pickBase(rng, p.logType as LogType);
  const terms = p.terms as number;
  let k = 0;
  if (p.numbers && rng.bool(0.6)) {
    const b = base.kind === "number" ? base.b.n : 10;
    const top = base.kind === "natural" ? 3 : Math.max(1, Math.floor(Math.log(125.5) / Math.log(b)));
    k = rng.int(1, top);
    if (rng.bool(0.3)) k = -k;
  }
  const count = terms - (k !== 0 ? 1 : 0);
  let factors: Factor[];
  for (;;) {
    factors = LETTERS.slice(0, count).map((v) => ({ v, e: pickExponent(rng, p.roots as boolean) }));
    const positive = factors.some((f) => f.e.n > 0);
    // some factor has a power, unless a number and two or more letters make it work
    const interesting =
      factors.some((f) => !(f.e.d === 1 && Math.abs(f.e.n) === 1)) || (k !== 0 && factors.length > 1);
    if (positive && interesting) break;
  }
  // condensed order: numerator factors first, then the denominator's
  factors = [...factors.filter((f) => f.e.n > 0), ...factors.filter((f) => f.e.n < 0)];
  // a condense Problem lists its terms in a shuffled order, led by a positive one
  const order = (k !== 0 ? [-1] : []).concat(factors.map((_, i) => i));
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const lead = order.findIndex((i) => (i < 0 ? k : factors[i].e.n) > 0);
  order.unshift(...order.splice(lead, 1));
  return { expand, base, factors, k, order };
}

// ------------------------------------------------------------------ distractors

const mapE = (fs: Factor[], f: (e: Rat) => Rat) => fs.map((x) => ({ v: x.v, e: f(x.e) }));
const unit = (e: Rat) => rat(Math.sign(e.n));
const absE = (e: Rat) => rat(Math.abs(e.n), e.d);
const negE = (e: Rat) => rat(-e.n, e.d);
/** a root's exponent flipped: \sqrt{x} read as x^{2} */
const flipRoot = (e: Rat) => (e.d === 1 ? e : rat(Math.sign(e.n) * e.d, Math.abs(e.n)));

/** A Distractor and its value at the sample point, to tell equivalent forms apart. */
interface Candidate {
  tex: string;
  /** the expression's value at SAMPLE; NaN when it has none (the log of a negative) */
  value: number;
}

/** Values the variables take when two forms are compared numerically. */
const SAMPLE: Record<string, number> = { x: 1.7, y: 2.3, z: 3.1, w: 4.3 };

/** log in the Problem's base of a positive number. */
const logIn = (base: LogBase, v: number) => (v > 0 ? Math.log(v) / Math.log(baseValue(base)) : NaN);

/** The value of a sum of coefficient times log of a variable, plus a constant. */
const sumValue = (base: LogBase, fs: Factor[], constant: number) =>
  fs.reduce((s, f) => s + (f.e.n / f.e.d) * logIn(base, SAMPLE[f.v]), constant);

/**
 * Mistake-based Distractors, most common first.
 * Expanding:
 * - added every term (ignored the quotient rule);
 * - left the exponents in place (coefficients of 1);
 * - only the first denominator factor subtracted: \log \frac{x}{yz} as
 *   \log x - \log y + \log z;
 * - numerator and denominator swapped (every sign flipped);
 * - a root's index as the coefficient: \sqrt{x} as 2\log x;
 * - the number not evaluated: \log_{2} (8x) as 8 + \log_{2} x;
 * - the product rule read as a product: \log (100x) as 2\log x;
 * - an exponent added rather than multiplied: \log x^{2} as 2 + \log x;
 * Condensing:
 * - a quotient of logarithms: \frac{\log x^{2}}{\log y};
 * - every factor in the numerator;
 * - the coefficients dropped;
 * - the fraction upside down;
 * - a fraction coefficient as a power: \frac{1}{2}\log x as \log x^{2};
 * - the number term as a factor: 3 + \log_{2} x as \log_{2} (3x);
 * - the number term as a power: 2 + \log x as \log x^{2};
 * - the product and quotient rules read as sums: \log (x^{2} + y - z);
 * - coefficients kept as multipliers: 2\log x + 3\log y as \log (2x \cdot 3y).
 * Either way, last come a lost factor and a factor moved across the fraction bar.
 * Candidates that equal the Answer or an earlier Distractor in value (checked
 * at sample values) are dropped, so no two choices are equivalent forms.
 */
export function distractors(k: PropertiesConstruction): string[] {
  const { base, factors: fs, k: n } = k;
  const out: Candidate[] = [];
  const add = (tex: string, value: number) => out.push({ tex, value });
  const hasRoot = fs.some((f) => f.e.d > 1);
  const answerValue = sumValue(base, fs, n);
  if (k.expand) {
    const order = canonicalOrder(k);
    /** an expansion; `numberTex` (the number evaluated wrongly) stands in for the constant */
    const ex = (f: Factor[], kk = n, numberTex?: string, constantValue = kk) =>
      add(
        expandedLatex(base, f, kk, order, numberTex),
        sumValue(base, f, constantValue),
      );
    ex(mapE(fs, absE), Math.abs(n));
    ex(mapE(fs, unit));
    const firstBottom = fs.findIndex((f) => f.e.n < 0);
    if (firstBottom >= 0 && firstBottom < fs.length - 1)
      ex(fs.map((f, i) => (i > firstBottom ? { v: f.v, e: absE(f.e) } : f)));
    ex(mapE(fs, negE), -n);
    if (hasRoot) ex(mapE(fs, flipRoot));
    if (n !== 0)
      ex(fs, Math.sign(n), numberFactor(base, Math.abs(n)), Math.sign(n) * baseValue(base) ** Math.abs(n));
    // \log (100x) as 2\log x: the product rule read as a product
    if (n !== 0) ex(fs.map((f, i) => (i === 0 ? { v: f.v, e: rat(f.e.n * n, f.e.d) } : f)), 0);
    if (!hasRoot) {
      // \log x^{2} as 2 + \log x: the exponent added rather than multiplied
      const c = fs.reduce((s, f) => s + (Math.abs(f.e.n) > 1 ? f.e.n : 0), n);
      add(expandedLatex(base, mapE(fs, unit), c, [-1, ...fs.map((_, i) => i)]), sumValue(base, mapE(fs, unit), c));
    }
  } else {
    const co = (f: Factor[], kk = n, numberTex?: string, constantValue = kk) =>
      add(
        condensedLatex(base, f, kk, numberTex),
        sumValue(base, f, constantValue),
      );
    const top = fs.filter((f) => f.e.n > 0);
    const bottom = fs.filter((f) => f.e.n < 0);
    if (bottom.length > 0 && n >= 0) {
      const numTex = logOf(base, condensedArg(base, top, n));
      const denTex = logOf(base, condensedArg(base, mapE(bottom, negE), 0));
      add(`\\frac{${numTex}}{${denTex}}`, sumValue(base, top, n) / sumValue(base, mapE(bottom, absE), 0));
    }
    co(mapE(fs, absE), Math.abs(n));
    co(mapE(fs, unit));
    co(mapE(fs, negE), -n);
    if (hasRoot) co(mapE(fs, flipRoot));
    // 3 + \log_{2} x as \log_{2} (3x): the number taken as a factor, not a power of the base
    if (Math.abs(n) > 1) co(fs, n, String(Math.abs(n)), logIn(base, Math.abs(n)) * Math.sign(n));
    // 2 + \log x as \log x^{2}: the number taken as a power
    if (n !== 0) co(fs.map((f, i) => (i === 0 ? { v: f.v, e: rat(f.e.n * n, f.e.d) } : f)), 0);
    {
      // \log x + \log y as \log (x + y): the product rule read as a sum
      const parts = (
        n !== 0
          ? [{ tex: numberFactor(base, Math.abs(n)), sign: Math.sign(n), num: baseValue(base) ** Math.abs(n) }]
          : []
      ).concat(
        fs.map((f) => ({
          tex: factorLatex(f.v, absE(f.e)),
          sign: Math.sign(f.e.n),
          num: SAMPLE[f.v] ** (Math.abs(f.e.n) / f.e.d),
        })),
      );
      parts.sort((a, b) => b.sign - a.sign);
      const sum = parts.map((q, i) => (i === 0 ? "" : q.sign > 0 ? " + " : " - ") + q.tex).join("");
      add(logOf(base, `(${sum})`), logIn(base, parts.reduce((s, q) => s + q.sign * q.num, 0)));
    }
    if (!hasRoot && n === 0) {
      // 2\log x + 3\log y as \log (2x \cdot 3y): coefficients kept as multipliers
      const side = (g: Factor[]) =>
        g.map((f) => (Math.abs(f.e.n) > 1 ? `${Math.abs(f.e.n)}${f.v}` : f.v)).join(" \\cdot ");
      const t = side(top);
      add(
        logOf(base, bottom.length > 0 ? `\\frac{${t}}{${side(bottom)}}` : top.length > 1 ? `(${t})` : t),
        fs.reduce((s, f) => s + Math.sign(f.e.n) * logIn(base, Math.abs(f.e.n) * SAMPLE[f.v]), 0),
      );
    }
  }
  // Lose a factor, or move it across the fraction bar (change just its sign).
  for (const i of canonicalOrder(k)) {
    for (const omit of [true, false]) {
      const constant = i === -1 ? (omit ? 0 : -n) : n;
      const factors = fs.flatMap((factor, j) =>
        j !== i ? [factor] : omit ? [] : [{ ...factor, e: negE(factor.e) }],
      );
      const changed = { ...k, k: constant, factors };
      add(answerLatex(changed), sumValue(base, factors, constant));
    }
  }
  return distinctHints(
    answerLatex(k),
    dedupeByValue(out, answerValue).map((c) => c.tex),
  );
}

/** Drop candidates whose value matches the Answer's or an earlier candidate's. */
function dedupeByValue(candidates: Candidate[], answerValue: number): Candidate[] {
  const seen = [answerValue];
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const kept: Candidate[] = [];
  for (const c of candidates) {
    if (Number.isFinite(c.value)) {
      if (seen.some((v) => same(v, c.value))) continue;
      seen.push(c.value);
    }
    kept.push(c);
  }
  return kept;
}

export const generator: Generator = {
  id: LOG_PROPERTIES_ID,
  title: "Expanding and condensing logarithms",
  defaultDirections: "Expand each logarithm, or condense each expression into a single logarithm.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: LOG_PROPERTIES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
