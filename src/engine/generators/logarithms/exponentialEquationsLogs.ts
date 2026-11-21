// "Solving exponential equations using logarithms": 3^{x + 2} = 7 gives
// x = \frac{\ln 7}{\ln 3} - 2, e^{2x} = 5 gives x = \frac{\ln 5}{2}, and
// (opt-in) 4 \cdot 2^{x} - 3 = 25 must be isolated first. The Answer can be
// exact, a rounded decimal, or both.
//
// Built ANSWER-FROM-CONSTRUCTION: the base b, the exponent ax + c and the
// value N the power must equal (never a rational power of b, or the Problem
// would belong to the common-base Topic) are chosen first; the exact Answer
// x = (log_b N - c)/a is printed straight from them, and its decimal is that
// printed expression evaluated. With isolating on, a multiplier and a constant
// are chosen too and the right-hand side computed as kN + d. Nothing is
// ever solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints, linearLatex, numLatex, rat } from "../shared/equationKit";
import {
  approxLatex,
  baseLatex,
  baseValue,
  COMMON,
  NATURAL,
  numberBase,
  powerLatex,
  rationalLog,
  roundedLatex,
  type LogBase,
} from "./logKit";

export const EXPONENTIAL_EQUATIONS_LOGS_ID = "exponential-equations-logs";

export type AnswerForm = "exact" | "decimal" | "both";

export const schema = [
  {
    type: "enum",
    key: "answerForm",
    label: "Answers",
    default: "exact",
    options: [
      { value: "exact", label: "Exact, with logarithms" },
      { value: "decimal", label: "Rounded decimals" },
      { value: "both", label: "Exact and rounded" },
    ],
  },
  {
    type: "int",
    key: "decimalPlaces",
    label: "Decimal places when rounding",
    min: 1,
    max: 4,
    default: 2,
  },
  {
    type: "boolean",
    key: "isolate",
    label: "Isolate the power first, like 4 · 2^x - 3 = 25",
    default: false,
  },
  {
    type: "boolean",
    key: "naturalCommon",
    label: "Include base e and base 10",
    default: true,
  },
] as const satisfies ParamSchema;

export interface ExpLogConstruction {
  base: LogBase;
  /** exponent ax + c */
  a: number;
  c: number;
  /** the value the power equals once isolated */
  n: number;
  /** k * power + d = rhs (k = 1, d = 0 when nothing needs isolating) */
  k: number;
  d: number;
  rhs: number;
}

// ------------------------------------------------------------------ printing

/** The logarithm the Answer is written with: \ln for every base but 10. */
const logWord = (base: LogBase) => (base.kind === "common" ? "\\log" : "\\ln");

/** "\ln 7" */
const logN = (base: LogBase, n: number) => `${logWord(base)} ${n}`;

/** " - 2\ln 3", " + \ln 3": the c-multiple of a logarithm, as a signed term. */
function signedLogTerm(c: number, log: string): string {
  const mag = Math.abs(c) === 1 ? log : `${Math.abs(c)}${log}`;
  return ` ${c > 0 ? "-" : "+"} ${mag}`;
}

/**
 * x = (top / bottom - c) / a written exactly, where top and bottom are printed
 * logarithms (bottom null when the base's own logarithm is 1, as for e with
 * \ln and 10 with \log):
 *   \frac{\ln 7}{\ln 3},  \frac{\ln 7}{\ln 3} - 2,  \frac{\ln 7}{2\ln 3},
 *   \frac{\ln 7 - 2\ln 3}{3\ln 3},  \ln 7 - 2,  \frac{\ln 7 - 2}{3}.
 */
export function exactLatex(top: string, bottom: string | null, a: number, c: number): string {
  const lead = (s: string) => (a === 1 ? s : `${a}${s}`);
  if (bottom === null) {
    const numer = c === 0 ? top : `${top} ${c > 0 ? "-" : "+"} ${Math.abs(c)}`;
    return a === 1 ? numer : `\\frac{${numer}}{${a}}`;
  }
  if (c === 0) return `\\frac{${top}}{${lead(bottom)}}`;
  if (a === 1) return `\\frac{${top}}{${bottom}} ${c > 0 ? "-" : "+"} ${Math.abs(c)}`;
  return `\\frac{${top}${signedLogTerm(c, bottom)}}{${lead(bottom)}}`;
}

/** The base's logarithm in the Answer's denominator, or null when it is 1. */
const baseLog = (base: LogBase) => (base.kind === "number" ? `\\ln ${base.b.n}` : null);

export function promptLatex(k: ExpLogConstruction): string {
  const power = powerLatex(baseLatex(k.base), linearLatex([{ coef: rat(k.a), v: "x" }, { coef: rat(k.c), v: "" }]));
  let left = power;
  if (k.k !== 1) left = k.base.kind === "natural" ? `${k.k}${power}` : `${k.k} \\cdot ${power}`;
  if (k.d !== 0) left += ` ${k.d > 0 ? "+" : "-"} ${Math.abs(k.d)}`;
  return `${left} = ${k.rhs}`;
}

/** The Answer's value: (log_b N - c)/a. */
export function answerValue(k: ExpLogConstruction): number {
  return (Math.log(k.n) / Math.log(baseValue(k.base)) - k.c) / k.a;
}

/** One way to write an answer (right or wrong): its exact form and value. */
interface Candidate {
  tex: string;
  value: number;
}

function exactCandidate(k: ExpLogConstruction, n: number, a = k.a, c = k.c): Candidate {
  return {
    tex: exactLatex(logN(k.base, n), baseLog(k.base), a, c),
    value: (Math.log(n) / Math.log(baseValue(k.base)) - c) / a,
  };
}

function present(form: AnswerForm, places: number, c: Candidate): string {
  if (form === "decimal") return approxLatex("x", c.value, places);
  if (form === "both") return `x = ${c.tex} \\approx ${roundedLatex(c.value, places)}`;
  return `x = ${c.tex}`;
}

// ------------------------------------------------------------------ choosing

const NUMBER_BASES = [2, 3, 4, 5, 6, 7, 8, 9];

function pickBase(rng: Rng, naturalCommon: boolean): LogBase {
  if (naturalCommon) {
    const roll = rng.next();
    if (roll < 0.25) return NATURAL;
    if (roll < 0.4) return COMMON;
  }
  return numberBase(rat(rng.pick(NUMBER_BASES)));
}

/** N such that log_b N is irrational. */
function pickValue(rng: Rng, base: LogBase): number {
  for (;;) {
    const n = rng.int(2, 40);
    if (base.kind === "natural") return n;
    const b = base.kind === "common" ? 10 : base.b.n;
    if (!rationalLog(b, n)) return n;
  }
}

export function construct(params: ParamValues, rng: Rng): ExpLogConstruction {
  const p = resolveParams(schema, params);
  for (;;) {
    const base = pickBase(rng, p.naturalCommon as boolean);
    const a = rng.pick([1, 1, 1, 1, 2, 3, 4]);
    const c = rng.bool(0.5) ? 0 : rng.int(1, 5) * (rng.bool() ? 1 : -1);
    const n = pickValue(rng, base);
    let k = 1;
    let d = 0;
    if (p.isolate) {
      const shape = rng.pick(["k", "d", "kd"] as const);
      if (shape !== "d") k = rng.int(2, 6);
      if (shape !== "k") d = rng.int(1, 12) * (rng.bool() ? 1 : -1);
    }
    const rhs = k * n + d;
    if (rhs <= 0) continue;
    const kk: ExpLogConstruction = { base, a, c, n, k, d, rhs };
    // an Answer that rounds to 0.0 says little; this is independent of the
    // Answer form, so every form gets the same Problem for a seed
    if (Math.abs(answerValue(kk)) < 0.1) continue;
    return kk;
  }
}

// ------------------------------------------------------------------ answers and distractors

export function answerLatex(k: ExpLogConstruction, form: AnswerForm, places: number): string {
  return present(form, places, exactCandidate(k, k.n));
}

/**
 * Mistake-based Distractors, most common first:
 * - divided N by the base: 3^{x} = 7 as x = \frac{7}{3} (whole-number bases and 10);
 * - the quotient of logarithms taken as a logarithm of the quotient:
 *   \frac{\ln 7}{\ln 3} as \ln 7 - \ln 3;
 * - the exponent's constant moved with the wrong sign;
 * - the exponent's constant forgotten;
 * - the logarithms inverted: \frac{\ln 3}{\ln 7};
 * - forgot to divide by the x coefficient;
 * - (base e and 10) subtracted the constant before taking the logarithm:
 *   e^{x + 2} = 7 as x = \ln 5; and \log in place of \ln, or the reverse;
 * - (isolating) took the logarithm before isolating the power, or undid the
 *   added constant with the wrong sign.
 * In decimal form each is its value rounded; any that rounds the same as the
 * Answer is dropped.
 */
export function distractorCandidates(k: ExpLogConstruction): Candidate[] {
  const { base, a, c, n } = k;
  const b = baseValue(base);
  const out: Candidate[] = [];
  const word = logWord(base);
  if (base.kind !== "natural") {
    const bInt = base.kind === "common" ? 10 : base.b.n;
    // (N/b - c)/a as a number
    out.push({ tex: numLatex(rat(n - c * bInt, a * bInt)), value: (n / bInt - c) / a });
  }
  if (base.kind === "number") {
    out.push({
      tex: exactLatex(`${word} ${n} - ${word} ${base.b.n}`, null, a, c),
      value: (Math.log(n) - Math.log(b) - c) / a,
    });
  }
  if (c !== 0) out.push(exactCandidate(k, n, a, -c), exactCandidate(k, n, a, 0));
  if (a === 1 || c === 0) {
    const top = base.kind === "number" ? `\\ln ${base.b.n}` : "1";
    out.push({ tex: exactLatex(top, logN(base, n), a, c), value: (Math.log(b) / Math.log(n) - c) / a });
  }
  if (a !== 1) out.push(exactCandidate(k, n, 1, c));
  if (base.kind !== "number") {
    if (c !== 0 && n - c > 0 && n - c !== 1)
      out.push({ tex: exactLatex(logN(base, n - c), null, a, 0), value: Math.log(n - c) / Math.log(b) / a });
    const other = base.kind === "natural" ? "\\log" : "\\ln";
    const otherValue = base.kind === "natural" ? Math.log10(n) : Math.log(n);
    out.push({ tex: exactLatex(`${other} ${n}`, null, a, c), value: (otherValue - c) / a });
  }
  if (k.k !== 1 || k.d !== 0) {
    const wrongNs = [k.rhs, (k.rhs + k.d) / k.k, k.rhs / k.k - k.d, k.rhs - k.d];
    for (const w of wrongNs) if (Number.isInteger(w) && w > 1 && w !== n) out.push(exactCandidate(k, w));
  }
  const logb = Math.log(n) / Math.log(b);
  const signed = (v: number) => (v > 0 ? "-" : "+");
  if (base.kind === "number") {
    // forgot to divide by \ln b
    out.push({ tex: exactLatex(`\\ln ${n}`, null, a, c), value: (Math.log(n) - c) / a });
    // \ln 7 divided by 3, not by \ln 3: the base's logarithm not taken
    out.push({ tex: exactLatex(`\\ln ${n}`, null, a * base.b.n, c * base.b.n), value: (Math.log(n) / base.b.n - c) / a });
    // multiplied the logarithms instead of dividing
    out.push({ tex: exactLatex(`\\ln ${n} \\cdot \\ln ${base.b.n}`, null, a, c), value: (Math.log(n) * Math.log(b) - c) / a });
  }
  if (base.kind === "natural") {
    // e^{x} = N: N divided by e, as if e were a number to divide by
    out.push({
      tex:
        c === 0
          ? `\\frac{${n}}{${a === 1 ? "" : a}e}`
          : `\\frac{${n} ${c > 0 ? "-" : "+"} ${Math.abs(c) === 1 ? "" : Math.abs(c)}e}{${a === 1 ? "" : a}e}`,
      value: (n / Math.E - c) / a,
    });
  }
  // Reverse the sign when taking logs on both sides: use log_b(1/N).
  out.push({ tex: exactLatex(`-${logN(base, n)}`, baseLog(base), a, c), value: (-logb - c) / a });
  // the base ignored altogether: x = N - c
  out.push({ tex: numLatex(rat(n - c, a)), value: (n - c) / a });
  if (a !== 1) {
    // multiplied by a instead of dividing
    const inner = exactLatex(logN(base, n), baseLog(base), 1, c);
    out.push({ tex: c === 0 ? `${a} \\cdot ${inner}` : `${a}\\left(${inner}\\right)`, value: (logb - c) * a });
    // only the logarithm divided by a, the constant left alone
    if (c !== 0)
      out.push({
        tex: `${exactLatex(logN(base, n), baseLog(base), a, 0)} ${signed(c)} ${Math.abs(c)}`,
        value: logb / a - c,
      });
  }
  // the exponential taken instead of the logarithm: x = b^{N}
  if (n <= 12 && a === 1 && c === 0) out.push({ tex: `${baseLatex(base)}^{${n}}`, value: b ** n });
  if (k.k !== 1 || k.d !== 0) {
    const more = [k.rhs + k.d, k.rhs / k.k + k.d, (k.rhs - k.d) * k.k];
    for (const w of more) if (Number.isInteger(w) && w > 1 && w !== n) out.push(exactCandidate(k, w));
  }
  return out.filter((x) => Number.isFinite(x.value));
}

export function distractors(k: ExpLogConstruction, form: AnswerForm, places: number): string[] {
  const answer = answerLatex(k, form, places);
  const seen = [answerValue(k)];
  const rounded = new Set([roundedLatex(seen[0], places)]);
  const hints: string[] = [];
  for (const c of distractorCandidates(k)) {
    if (seen.some((v) => Math.abs(v - c.value) < 1e-10 * Math.max(1, Math.abs(v)))) continue;
    const decimal = roundedLatex(c.value, places);
    if (form !== "exact" && rounded.has(decimal)) continue;
    seen.push(c.value);
    rounded.add(decimal);
    hints.push(present(form, places, c));
  }
  return distinctHints(answer, hints);
}

export const generator: Generator = {
  id: EXPONENTIAL_EQUATIONS_LOGS_ID,
  title: "Solving exponential equations using logarithms",
  defaultDirections: "Solve each equation.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    const form = resolved.answerForm as AnswerForm;
    const places = resolved.decimalPlaces as number;
    return {
      kind: "generated",
      generatorId: EXPONENTIAL_EQUATIONS_LOGS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k, form, places),
      distractorHints: distractors(k, form, places),
    };
  },
};
