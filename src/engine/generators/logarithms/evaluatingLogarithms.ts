// "Evaluating logarithms": \log_{2} 32 = 5, \log_{8} 2 = \frac{1}{3},
// \log_{3} \frac{1}{9} = -2, \log_{\frac{1}{3}} 9 = -2, \log 0.01 = -2,
// \ln \sqrt{e} = \frac{1}{2}.
//
// Built ANSWER-FROM-CONSTRUCTION: the Answer q = s/t is chosen first. Then a
// root r is picked and the base written as r^m and the argument as r^n with
// n/m = q (m a multiple of t), or the argument as a root of r when the base is
// r itself. Nothing is ever solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { gcd } from "../../format";
import { distinctHints, div, isInt, neg, numLatex, rat, sub, add, type Rat } from "../shared/equationKit";
import { baseLatex, COMMON, intPow, logOf, NATURAL, numberBase, type LogBase } from "./logKit";

export const EVALUATING_LOGARITHMS_ID = "evaluating-logarithms";

export type Answers = "whole" | "integers" | "rational";

export const schema = [
  {
    type: "enum",
    key: "answers",
    label: "Answers",
    default: "rational",
    options: [
      { value: "whole", label: "Whole numbers, like log_2 8 = 3" },
      { value: "integers", label: "Integers, like log_3 (1/9) = -2" },
      { value: "rational", label: "Integers and fractions, like log_8 2 = 1/3" },
    ],
  },
  {
    type: "boolean",
    key: "fractionBases",
    label: "Include fraction bases, like log_(1/3) 9",
    default: false,
  },
  {
    type: "boolean",
    key: "commonNatural",
    label: "Include common and natural logarithms (log and ln)",
    default: true,
  },
] as const satisfies ParamSchema;

export interface EvaluateConstruction {
  base: LogBase;
  /** the argument as printed */
  arg: string;
  /** the Answer */
  q: Rat;
  /** the argument's value when it is a whole number (for the "divided" Distractor) */
  argInt: number | null;
  /** the exponents of the common root: base r^m, argument r^n (null for a root argument) */
  m: number;
  n: Rat;
}

/** The Answer, chosen first: never 0 or 1, which are rules rather than exercises. */
function pickAnswer(rng: Rng, answers: Answers): Rat {
  if (answers === "rational" && rng.bool(0.5)) {
    const t = rng.pick([2, 2, 3, 3, 4]);
    const options = [-3, -2, -1, 1, 2, 3].filter((s) => gcd(s, t) === 1);
    const s = rng.bool(0.7) ? rng.pick(options.filter((x) => x > 0)) : rng.pick(options);
    return rat(s, t);
  }
  if (answers !== "whole" && rng.bool(0.4)) return rat(-rng.int(1, 4));
  return rat(rng.int(2, 6));
}

/** r^k printed: "8", "\frac{1}{8}". */
function powerOf(r: number, k: number): string {
  const v = intPow(r, Math.abs(k))!;
  return k < 0 ? `\\frac{1}{${v}}` : String(v);
}

/** The t-th root of a printed radicand: "\sqrt{5}", "\sqrt[3]{25}". */
function rootLatex(t: number, radicand: string): string {
  return t === 2 ? `\\sqrt{${radicand}}` : `\\sqrt[${t}]{${radicand}}`;
}

/** r^{s/t} as a root, with a negative s as a reciprocal: "\frac{1}{\sqrt{2}}". */
function rootArg(r: string, s: number, t: number, power: (k: number) => string): string {
  const root = rootLatex(t, Math.abs(s) === 1 ? r : power(Math.abs(s)));
  return s < 0 ? `\\frac{1}{${root}}` : root;
}

function numberConstruction(rng: Rng, q: Rat, fractionBases: boolean): EvaluateConstruction {
  const reciprocal = fractionBases && rng.bool(0.4);
  const sign = reciprocal ? -1 : 1;
  const options: EvaluateConstruction[] = [];
  for (let r = 2; r <= 12; r++) {
    if (r === 10) continue; // base 10 is the common logarithm
    for (let j = 1; j <= 3; j++) {
      const m = q.d * j;
      const n = q.n * j;
      if (intPow(r, m)! > 125 || intPow(r, Math.abs(n))! > 1000) continue;
      const b = sign > 0 ? rat(intPow(r, m)!) : rat(1, intPow(r, m)!);
      const argExp = sign * n;
      options.push({
        base: numberBase(b),
        arg: powerOf(r, argExp),
        q,
        argInt: argExp > 0 ? intPow(r, argExp) : null,
        m: sign * m,
        n: rat(argExp),
      });
    }
    // a root argument with the root itself as the base: \log_{5} \sqrt[3]{25}
    if (q.d > 1 && intPow(r, Math.abs(q.n))! <= 100) {
      const b = sign > 0 ? rat(r) : rat(1, r);
      const s = sign * q.n;
      options.push({
        base: numberBase(b),
        arg: rootArg(String(r), s, q.d, (k) => String(intPow(r, k))),
        q,
        argInt: null,
        m: sign,
        n: rat(s, q.d),
      });
    }
  }
  // prefer root arguments for a fraction Answer about a third of the time
  const roots = options.filter((o) => !isInt(o.n));
  if (roots.length > 0 && rng.bool(0.35)) return rng.pick(roots);
  const plain = options.filter((o) => isInt(o.n));
  return rng.pick(plain.length > 0 ? plain : options);
}

function commonArg(q: Rat): string {
  if (q.d === 1) return q.n > 0 ? String(10 ** q.n) : (10 ** q.n).toFixed(-q.n);
  return rootArg("10", q.n, q.d, (k) => String(10 ** k));
}

function naturalArg(q: Rat): string {
  if (q.d === 1) return q.n > 0 ? `e^{${q.n}}` : q.n === -1 ? "\\frac{1}{e}" : `\\frac{1}{e^{${-q.n}}}`;
  return rootArg("e", q.n, q.d, (k) => `e^{${k}}`);
}

export function construct(params: ParamValues, rng: Rng): EvaluateConstruction {
  const p = resolveParams(schema, params);
  const q = pickAnswer(rng, p.answers as Answers);
  const roll = rng.next();
  if (p.commonNatural && roll < 0.15 && Math.abs(q.n) <= 4) {
    return { base: COMMON, arg: commonArg(q), q, argInt: q.n > 0 && q.d === 1 ? 10 ** q.n : null, m: 1, n: q };
  }
  if (p.commonNatural && roll < 0.3) return { base: NATURAL, arg: naturalArg(q), q, argInt: null, m: 1, n: q };
  return numberConstruction(rng, q, p.fractionBases as boolean);
}

export function promptLatex(k: EvaluateConstruction): string {
  return logOf(k.base, k.arg);
}

/**
 * Mistake-based Distractors, most common first:
 * - the reciprocal: \log_{8} 2 as 3 rather than \frac{1}{3};
 * - the opposite sign (a reciprocal argument or base mishandled);
 * - divided the argument by the base: \log_{2} 8 as 4;
 * - the argument's exponent alone, forgetting the base is a power: \log_{8} 4 as 2;
 * - the negative reciprocal;
 * - one more or one fewer (miscounted the factors).
 */
export function distractors(k: EvaluateConstruction): string[] {
  const { q } = k;
  const b = k.base.kind === "number" ? k.base.b : k.base.kind === "common" ? rat(10) : null;
  const values: (Rat | null)[] = [
    div(rat(1), q),
    neg(q),
    k.argInt !== null && b !== null && isInt(b) ? rat(k.argInt, b.n) : null,
    Math.abs(k.m) !== 1 ? k.n : null,
    div(rat(-1), q),
    add(q, rat(1)),
    sub(q, rat(1)),
  ];
  // Identify the base instead of the exponent being asked for.
  return distinctHints(numLatex(q), [...values.map((v) => v && numLatex(v)), baseLatex(k.base)]);
}

export const generator: Generator = {
  id: EVALUATING_LOGARITHMS_ID,
  title: "Evaluating logarithms",
  defaultDirections: "Evaluate each logarithm.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: EVALUATING_LOGARITHMS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: numLatex(k.q),
      distractorHints: distractors(k),
    };
  },
};
