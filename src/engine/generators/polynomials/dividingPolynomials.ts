// "Dividing polynomials": by a monomial, (12x^{3} - 8x^{2} + 4x) \div 4x, or by
// a binomial, (2x^{3} - 3x^{2} - 11x + 6) \div (x - 3), with no remainder at
// the default options.
//
// Built ANSWER-FROM-CONSTRUCTION: the divisor, the quotient (the Answer) and
// any remainder are chosen first; the dividend is quotient · divisor +
// remainder, multiplied out. A dividend with a missing term (x^{3} - 8) is
// made by choosing the quotient's coefficients so that term cancels in that
// product. Nothing is ever divided to find the Answer; only the "divided by
// the wrong sign" Distractor runs a division, replaying the student's mistake.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints } from "../shared/equationKit";
import {
  add,
  groupLatex,
  mono,
  mul,
  nonzero,
  norm,
  pickVars,
  polyEq,
  shuffled,
  standardLatex,
  varyPolyVariableField,
  type Mono,
  type Poly,
} from "./polyKit";

export const DIVIDING_POLYNOMIALS_ID = "dividing-polynomials";

export type Divisor = "mixed" | "monomial" | "binomial";

export const schema = [
  {
    type: "enum",
    key: "divisor",
    label: "Divisor",
    default: "mixed",
    options: [
      { value: "mixed", label: "Mixed" },
      { value: "monomial", label: "A monomial" },
      { value: "binomial", label: "A binomial" },
    ],
  },
  {
    type: "int",
    key: "maxDegree",
    label: "Highest degree of the dividend",
    min: 2,
    max: 5,
    default: 3,
  },
  {
    type: "int",
    key: "maxCoefficient",
    label: "Largest number in the quotient and divisor",
    min: 2,
    max: 12,
    default: 6,
  },
  {
    type: "boolean",
    key: "remainders",
    label: "Include remainders (binomial divisors)",
    default: false,
  },
  {
    type: "boolean",
    key: "leadingCoefficients",
    label: "Binomial divisors with a leading coefficient other than 1",
    default: false,
  },
  {
    type: "boolean",
    key: "missingTerms",
    label: "Dividends with missing terms, like x^3 - 8",
    default: false,
  },
  varyPolyVariableField,
] as const satisfies ParamSchema;

export interface DividingConstruction {
  vars: [string, string];
  dividend: Mono[];
  divisor: Mono[];
  quotient: Mono[];
  /** the remainder (0 for none); only binomial divisors have one */
  remainder: number;
}

const isMonomial = (k: DividingConstruction) => k.divisor.length === 1;

/** Coefficients of degrees 0..n as a polynomial in v. */
const fromCoefs = (q: number[]): Mono[] => norm(q.map((c, i) => mono(c, i)));

function monomialCase(rng: Rng, n: number, C: number, vars: [string, string]): DividingConstruction {
  const k = rng.int(0, Math.min(2, n - 1));
  // a negative divisor now and then; a bare number divisor is at least 2
  const c = (k === 0 ? rng.int(2, C) : rng.int(1, C)) * (rng.bool(0.25) ? -1 : 1);
  const divisor = [mono(c, k)];
  const dq = n - k;
  const count = rng.int(2, Math.min(3, dq + 1));
  const lower = shuffled(
    rng,
    Array.from({ length: dq }, (_, i) => i),
  ).slice(0, count - 1);
  const quotient = norm([mono(rng.int(1, C), dq), ...lower.map((d) => mono(nonzero(rng, C), d))]);
  return { vars, divisor, quotient, dividend: mul(divisor, quotient), remainder: 0 };
}

function binomialCase(
  rng: Rng,
  n: number,
  C: number,
  p: ParamValues,
  vars: [string, string],
): DividingConstruction | null {
  const a = p.leadingCoefficients && rng.bool(0.7) ? rng.int(2, 3) : 1;
  let b = nonzero(rng, C);
  while (gcd2(a, b) !== 1) b += b > 0 ? 1 : -1;
  // quotient coefficients q[0..n-1] by degree, leading positive
  const q = Array.from({ length: n }, (_, i) => (i === n - 1 ? rng.int(1, Math.min(C, 4)) : nonzero(rng, C)));
  if (p.missingTerms && rng.bool(0.6)) {
    // Make chosen dividend terms of degree j (1..n-1) vanish: a·q[j-1] + b·q[j] = 0.
    const all = rng.bool(0.4);
    const one = rng.int(1, n - 1);
    for (let j = n - 1; j >= 1; j--) {
      if (!(all || j === one)) continue;
      if ((b * q[j]) % a !== 0) return null;
      q[j - 1] = (-b * q[j]) / a;
    }
  }
  if (q.some((c) => c === 0 || Math.abs(c) > 4 * C)) return null;
  const remainder = p.remainders && rng.bool(0.75) ? nonzero(rng, C) : 0;
  const divisor = [mono(a, 1), mono(b)];
  const quotient = fromCoefs(q);
  const dividend = add(mul(quotient, divisor), [mono(remainder)]);
  const full = dividend.length === n + 1;
  if (!p.missingTerms && !full) return null;
  // a constant must remain, or the "dividend" has a common factor of x
  if (!dividend.some((t) => t.e[0] === 0)) return null;
  return { vars, divisor, quotient, dividend, remainder };
}

function gcd2(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): DividingConstruction {
  const p = resolveParams(schema, params);
  const choice = p.divisor as Divisor;
  const C = p.maxCoefficient as number;
  const maxDegree = p.maxDegree as number;
  const vars = pickVars(rng, p.varyVariable as boolean);
  const binomial = choice === "binomial" || (choice === "mixed" && rng.bool());
  for (let tries = 0; tries < 300; tries++) {
    const n = rng.int(2, maxDegree);
    if (!binomial) return monomialCase(rng, n, C, vars);
    const k = binomialCase(rng, n, C, p, vars);
    if (k) return k;
  }
  // x^2 + 5x + 6 divided by x + 2 (practically unreachable)
  const divisor = [mono(1, 1), mono(2)];
  const quotient = [mono(1, 1), mono(3)];
  return { vars, divisor, quotient, dividend: mul(divisor, quotient), remainder: 0 };
}

export function promptLatex(k: DividingConstruction): string {
  const d = isMonomial(k) && k.divisor[0].c > 0 ? standardLatex(k.divisor, k.vars) : `(${standardLatex(k.divisor, k.vars)})`;
  return `${groupLatex(k.dividend, k.vars)} \\div ${d}`;
}

/** "q + \frac{r}{d}" (or "q - \frac{|r|}{d}"), or just q with no remainder. */
export function quotientLatex(q: Poly, r: number, divisor: Poly, vars: readonly string[]): string {
  const qs = standardLatex(q, vars);
  if (r === 0) return qs;
  const frac = `\\frac{${Math.abs(r)}}{${standardLatex(divisor, vars)}}`;
  return norm(q).length === 0 ? (r < 0 ? `-${frac}` : frac) : `${qs} ${r < 0 ? "-" : "+"} ${frac}`;
}

export const answerLatex = (k: DividingConstruction) => quotientLatex(k.quotient, k.remainder, k.divisor, k.vars);

/**
 * Long division of `dividend` by a·v + b over the integers, or null when a
 * step does not come out whole. Used only to replay a student's mistake.
 */
function divideLinear(dividend: Poly, a: number, b: number): { q: Mono[]; r: number } | null {
  const n = Math.max(...dividend.map((t) => t.e[0]));
  const coef = Array.from({ length: n + 1 }, (_, i) => dividend.filter((t) => t.e[0] === i).reduce((s, t) => s + t.c, 0));
  const q: number[] = new Array(n).fill(0);
  for (let i = n; i >= 1; i--) {
    if (coef[i] % a !== 0) return null;
    const t = coef[i] / a;
    q[i - 1] = t;
    coef[i] = 0;
    coef[i - 1] -= t * b;
  }
  return { q: fromCoefs(q), r: coef[0] };
}

/**
 * Mistake-based Distractors, most diagnostic first.
 * By a binomial:
 * - did not distribute the subtraction (the same as dividing by a·v - b,
 *   or using the wrong sign in synthetic division)
 * - forgot to lower the powers (each term one degree too high)
 * - a sign slip in the last step (the constant of the quotient)
 * - with a remainder: dropped it, or flipped its sign
 * By a monomial:
 * - divided only the first term
 * - divided the coefficients but left the exponents alone
 * - added the exponents instead of subtracting
 * - by a negative monomial: forgot to change the signs
 * - a term equal to the divisor written as 0 (dropped the 1)
 */
export function distractors(k: DividingConstruction): string[] {
  const { quotient: q, remainder: r, divisor, vars } = k;
  const answer = answerLatex(k);
  const out: (string | null)[] = [];
  const plain = (poly: Poly) => (polyEq(poly, q) && r === 0 ? null : standardLatex(poly, vars));
  const withRem = (poly: Poly, rr: number) =>
    polyEq(poly, q) && rr === r ? null : quotientLatex(poly, rr, divisor, vars);
  const raise = q.map((t) => mono(t.c, t.e[0] + 1));
  const flipLast = q.map((t, i) => (i === q.length - 1 ? mono(-t.c, ...t.e) : t));

  if (!isMonomial(k)) {
    const [lead, constant] = norm(divisor);
    const wrong = divideLinear(k.dividend, lead.c, -constant.c);
    if (wrong && norm(wrong.q).length > 0) out.push(withRem(wrong.q, wrong.r));
    out.push(withRem(raise, r));
    out.push(withRem(flipLast, r));
    if (r !== 0) {
      out.push(plain(q));
      out.push(withRem(q, -r));
    }
    out.push(withRem(q.map((t, i) => (i === 1 ? mono(-t.c, ...t.e) : t)), r));
    out.push(withRem(q.map((t) => mono(-t.c, ...t.e)), r));
  } else {
    const m = divisor[0];
    const dividend = k.dividend;
    // only the first term divided (when the result does not run two like terms together)
    const firstOnly = [q[0], ...dividend.slice(1)];
    if (norm(firstOnly).length === firstOnly.length) out.push(plain(firstOnly));
    out.push(plain(dividend.map((t) => mono(t.c / m.c, t.e[0]))));
    out.push(plain(dividend.map((t) => mono(t.c / m.c, t.e[0] + m.e[0]))));
    if (m.c < 0) out.push(plain(q.map((t) => mono(-t.c, ...t.e))));
    const one = q.find((t) => t.e[0] === 0 && Math.abs(t.c) === 1);
    if (one && q.length > 1) out.push(plain(q.filter((t) => t !== one)));
    out.push(plain(flipLast));
    out.push(plain(raise));
    out.push(plain(q.map((t, i) => (i === 0 ? t : mono(-t.c, ...t.e)))));
  }
  return distinctHints(answer, out);
}

export const generator: Generator = {
  id: DIVIDING_POLYNOMIALS_ID,
  title: "Dividing polynomials",
  defaultDirections: "Divide.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const k = construct(params, createRng(seed));
    return {
      kind: "generated",
      generatorId: DIVIDING_POLYNOMIALS_ID,
      params: resolveParams(schema, params),
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
