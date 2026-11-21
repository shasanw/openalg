// "Solving logarithmic equations": rewrite in exponential form
// (\log_{2} (x + 3) = 5 gives x + 3 = 2^{5}), or use the one-to-one property
// (\log_{5} (2x + 1) = \log_{5} (x + 7) gives 2x + 1 = x + 7). Opt-in harder
// equations lead to a quadratic and can have an extraneous solution:
// \log_{2} x + \log_{2} (x + 6) = 4, and \log (x^{2} - 6) = \log x.
//
// Built ANSWER-FROM-CONSTRUCTION:
// - exponential form: the base b, the right side k, the Answer x and the
//   coefficient a are chosen; the constant is c = b^k - ax;
// - one-to-one: x, both coefficients and the arguments' common value v are
//   chosen; each constant is v - ax;
// - sum of logs: b^k is split as u * w, and x + p = u, x + q = w; the other
//   root of (x + p)(x + q) = b^k makes both arguments negative (extraneous);
// - quadratic one-to-one: both roots r1, r2 are chosen and the equation is
//   x^2 - (r1 + r2)x + r1 r2 = 0 split across the two arguments; a root that
//   makes the arguments non-positive is extraneous.
// Nothing is ever solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  distinctHints,
  div,
  linearLatex,
  NO_SOLUTION,
  rat,
  solutionHint,
  solutionLatex,
  solutionsLatex,
  type Rat,
} from "../shared/equationKit";
import { COMMON, intPow, logOf, NATURAL, numberBase, type LogBase } from "./logKit";

export const LOGARITHMIC_EQUATIONS_ID = "logarithmic-equations";

export type FormMode = "mixed" | "exponential" | "oneToOne";
export type Form = "exponential" | "oneToOne" | "sum" | "quadratic";

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Equations",
    default: "mixed",
    options: [
      { value: "mixed", label: "Both kinds" },
      { value: "exponential", label: "Rewrite in exponential form, like log_2 (x + 3) = 5" },
      { value: "oneToOne", label: "The same logarithm on both sides, like log_5 (2x + 1) = log_5 (x + 7)" },
    ],
  },
  {
    type: "boolean",
    key: "extraneous",
    label: "Include harder equations that can have extraneous solutions",
    default: false,
  },
  {
    type: "boolean",
    key: "naturalCommon",
    label: "Include natural and common logarithms (ln and log)",
    default: true,
  },
] as const satisfies ParamSchema;

export interface LogEquationConstruction {
  form: Form;
  base: LogBase;
  /** printed left and right sides */
  left: string;
  right: string;
  /** the valid solutions, ascending (natural exponential form: none, see `exactE`) */
  solutions: number[];
  /** a root of the algebra that the logarithms reject, if any */
  extraneous: number | null;
  /** natural exponential form: x = (e^k - c)/a */
  exactE: { k: number; a: number; c: number } | null;
  /** the Distractors, most common mistake first */
  hints: (string | null)[];
}

// ------------------------------------------------------------------ printing

const lin = (a: number, c: number) => linearLatex([{ coef: rat(a), v: "x" }, { coef: rat(c), v: "" }]);
/** A logarithm's argument: a lone x stays bare, anything else is bracketed. */
const arg = (expr: string) => (expr === "x" ? expr : `(${expr})`);

/** x = \frac{e^{3} - 2}{4}, x = e^{2} + 5 */
export function exactELatex(k: number, a: number, c: number): string {
  const power = k === 1 ? "e" : `e^{${k}}`;
  const numer = c === 0 ? power : `${power} ${c > 0 ? "-" : "+"} ${Math.abs(c)}`;
  return `x = ${a === 1 ? numer : `\\frac{${numer}}{${a}}`}`;
}

const hint = (r: Rat | null) => solutionHint("x", r);

// ------------------------------------------------------------------ choosing

function pickNumberBase(rng: Rng): LogBase {
  return numberBase(rat(rng.pick([2, 2, 3, 3, 4, 5, 6, 7])));
}

function pickBase(rng: Rng, naturalCommon: boolean, natural: boolean): LogBase {
  if (naturalCommon) {
    const roll = rng.next();
    if (natural && roll < 0.2) return NATURAL;
    if (roll < 0.35) return COMMON;
  }
  return pickNumberBase(rng);
}

const baseInt = (base: LogBase) => (base.kind === "common" ? 10 : base.kind === "number" ? base.b.n : NaN);

/** The largest k with b^k at most `cap`. */
function maxPower(b: number, cap: number): number {
  let k = 0;
  while ((intPow(b, k + 1) ?? Infinity) <= cap) k++;
  return k;
}

function exponentialForm(rng: Rng, base: LogBase): LogEquationConstruction | null {
  const a = rng.bool(0.5) ? 1 : rng.int(2, 4);
  if (base.kind === "natural") {
    const k = rng.int(1, 4);
    const c = rng.int(1, 9) * (rng.bool() ? 1 : -1);
    const left = logOf(base, arg(lin(a, c)));
    const hints = [
      exactELatex(k, a, -c),
      a !== 1 ? exactELatex(k, 1, c) : null,
      hint(div(rat(k - c), rat(a))),
      hint(div(rat(10 ** k - c), rat(a))),
    ];
    return { form: "exponential", base, left, right: String(k), solutions: [], extraneous: null, exactE: { k, a, c }, hints };
  }
  const b = baseInt(base);
  const k = base.kind === "common" ? rng.int(1, 2) : rng.int(2, Math.max(2, maxPower(b, 250)));
  const V = intPow(b, k)!;
  const x = rng.int(-9, 12);
  const c = V - a * x;
  if (x === 0 || c === 0 || Math.abs(c) > 300) return null;
  const left = logOf(base, arg(lin(a, c)));
  const swapped = intPow(k, b);
  const hints = [
    swapped !== null && swapped <= 1000 ? hint(div(rat(swapped - c), rat(a))) : null,
    hint(div(rat(b * k - c), rat(a))),
    hint(div(rat(V + c), rat(a))),
    a !== 1 ? hint(rat(V - c)) : null,
    hint(div(rat(k - c), rat(a))),
    hint(div(rat(V), rat(a))),
    hint(rat(-x)),
  ];
  return { form: "exponential", base, left, right: String(k), solutions: [x], extraneous: null, exactE: null, hints };
}

function oneToOneForm(rng: Rng, base: LogBase): LogEquationConstruction | null {
  const x = rng.int(-8, 10);
  const a1 = rng.int(1, 6);
  const a2 = rng.int(1, 6);
  const v = rng.int(1, 20);
  const c1 = v - a1 * x;
  const c2 = v - a2 * x;
  if (x === 0 || a1 === a2 || c1 === 0 || c2 === 0) return null;
  const slope = a1 - a2;
  const hints = [
    hint(div(rat(c2 + c1), rat(slope))),
    hint(rat(-x)),
    hint(div(rat(c2 - c1), rat(a1 + a2))),
    hint(div(rat(c1 + c2), rat(a1 + a2))),
  ];
  return {
    form: "oneToOne",
    base,
    left: logOf(base, arg(lin(a1, c1))),
    right: logOf(base, arg(lin(a2, c2))),
    solutions: [x],
    extraneous: null,
    exactE: null,
    hints,
  };
}

function sumForm(rng: Rng, base: LogBase): LogEquationConstruction | null {
  const b = baseInt(base);
  const k = base.kind === "common" ? rng.int(1, 2) : rng.int(Math.max(1, maxPower(b, 8)), maxPower(b, 128));
  const N = intPow(b, k)!;
  const pairs: [number, number][] = [];
  for (let u = 1; u <= N; u++) if (N % u === 0) pairs.push([u, N / u]);
  const [u, w] = rng.pick(pairs);
  const p = rng.int(-6, 6);
  const x = u - p;
  const q = w - x;
  if (p === q || x === 0 || Math.abs(q) > 20) return null;
  const extraneous = -w - p;
  const side = (s: number) => logOf(base, arg(lin(1, s)));
  const valid = rat(x);
  return {
    form: "sum",
    base,
    left: `${side(p)} + ${side(q)}`,
    right: String(k),
    solutions: [x],
    extraneous,
    exactE: null,
    hints: [
      solutionsLatex("x", [valid, rat(extraneous)]),
      hint(rat(extraneous)),
      // (x + p) + (x + q) = b^k: the product rule read as a sum
      hint(div(rat(N - p - q), rat(2))),
      NO_SOLUTION,
      hint(rat(-x)),
    ],
  };
}

function quadraticForm(rng: Rng, base: LogBase): LogEquationConstruction | null {
  const r1 = rng.int(-8, 8);
  const r2 = rng.int(-8, 8);
  const f = r1 + r2;
  const g = rng.int(-12, 12);
  const e = r1 * r2 + g;
  // f > 0 keeps the right side reading "(4x + 3)" rather than "(-6x - 4)"
  if (r1 === r2 || f <= 0 || g === 0 || e === 0 || Math.abs(e) > 40) return null;
  const ok = (r: number) => f * r + g > 0;
  const bothValid = rng.bool(0.3);
  if (!ok(r1) || ok(r2) !== bothValid) return null;
  const left = logOf(base, arg(linearLatex([{ coef: rat(1), v: "x^{2}" }, { coef: rat(e), v: "" }])));
  const right = logOf(base, arg(lin(f, g)));
  const both = solutionsLatex("x", [rat(r1), rat(r2)]);
  const negated = solutionsLatex("x", [rat(-r1), rat(-r2)]);
  return {
    form: "quadratic",
    base,
    left,
    right,
    solutions: bothValid ? [Math.min(r1, r2), Math.max(r1, r2)] : [r1],
    extraneous: bothValid ? null : r2,
    exactE: null,
    hints: bothValid
      ? [hint(rat(r1)), hint(rat(r2)), negated, NO_SOLUTION]
      : [both, hint(rat(r2)), negated, NO_SOLUTION, hint(rat(-r1))],
  };
}

export function construct(params: ParamValues, rng: Rng): LogEquationConstruction {
  const p = resolveParams(schema, params);
  const mode = p.form as FormMode;
  const naturalCommon = p.naturalCommon as boolean;
  const family = mode === "mixed" ? rng.pick(["exponential", "oneToOne"] as const) : mode;
  const harder = (p.extraneous as boolean) && rng.bool(0.5);
  for (;;) {
    let k: LogEquationConstruction | null;
    if (family === "exponential") {
      if (harder) k = sumForm(rng, naturalCommon && rng.bool(0.25) ? COMMON : pickNumberBase(rng));
      else k = exponentialForm(rng, pickBase(rng, naturalCommon, true));
    } else if (harder) k = quadraticForm(rng, pickBase(rng, naturalCommon, true));
    else k = oneToOneForm(rng, pickBase(rng, naturalCommon, true));
    if (k) return k;
  }
}

export function promptLatex(k: LogEquationConstruction): string {
  return `${k.left} = ${k.right}`;
}

export function answerLatex(k: LogEquationConstruction): string {
  if (k.exactE) return exactELatex(k.exactE.k, k.exactE.a, k.exactE.c);
  return k.solutions.length === 1 ? solutionLatex("x", rat(k.solutions[0])) : solutionsLatex("x", k.solutions.map((s) => rat(s)));
}

/**
 * Mistake-based Distractors, most common first (each form builds its own):
 * - exponential form, log_b (ax + c) = k: k^b in place of b^k, b times k,
 *   the constant moved with the wrong sign, forgot to divide by a, and the
 *   logarithm dropped (ax + c = k), the constant dropped, and the opposite
 *   sign; for ln, the e^k answer with the wrong sign
 *   or undivided, the logarithm dropped, and 10^k in place of e^k;
 * - one-to-one: the constants moved with the wrong signs, the opposite sign,
 *   and the x terms added rather than subtracted;
 * - sum of logs: the extraneous root kept alongside the Answer, the
 *   extraneous root alone, the product rule read as a sum, "no solution",
 *   and the opposite sign;
 * - quadratic one-to-one: the extraneous root kept (or a valid root dropped),
 *   the roots with their signs flipped (factored wrongly), and "no solution".
 */
export function distractors(k: LogEquationConstruction): string[] {
  return distinctHints(answerLatex(k), k.hints);
}

export const generator: Generator = {
  id: LOGARITHMIC_EQUATIONS_ID,
  title: "Solving logarithmic equations",
  defaultDirections: "Solve each equation.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: LOGARITHMIC_EQUATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
