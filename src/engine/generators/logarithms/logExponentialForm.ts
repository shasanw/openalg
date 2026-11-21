// "Converting between exponential and logarithmic form": 2^{5} = 32 becomes
// \log_{2} 32 = 5, and \log_{3} 81 = 4 becomes 3^{4} = 81. Opt-in negative and
// fractional exponents (5^{-2} = \frac{1}{25}, 16^{\frac{3}{4}} = 8), and
// common and natural logarithms (\log 1000 = 3, e^{a} = 7 as \ln 7 = a).
//
// Built ANSWER-FROM-CONSTRUCTION: one true fact b^{y} = v is chosen (the base,
// the exponent, and the value computed from them), and both the Problem and
// the Answer are that same fact printed in its two forms. Nothing is solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints, numLatex, rat, type Rat } from "../shared/equationKit";
import { gcd } from "../../format";
import { intPow, powerLatex } from "./logKit";

export const LOG_EXPONENTIAL_FORM_ID = "log-exponential-form";

export type Direction = "mixed" | "toLog" | "toExponential";

export const schema = [
  {
    type: "enum",
    key: "direction",
    label: "Rewrite",
    default: "mixed",
    options: [
      { value: "mixed", label: "Both ways" },
      { value: "toLog", label: "Exponential form as logarithmic form" },
      { value: "toExponential", label: "Logarithmic form as exponential form" },
    ],
  },
  {
    type: "boolean",
    key: "negativesAndFractions",
    label: "Include negative and fractional exponents, like 5^(-2) = 1/25",
    default: false,
  },
  {
    type: "boolean",
    key: "commonNatural",
    label: "Include common and natural logarithms (log and ln)",
    default: true,
  },
] as const satisfies ParamSchema;

/** One quantity of the fact: how it prints, and its value when it is a number. */
export interface Quantity {
  tex: string;
  value: number | null;
}

/** The fact base^{exponent} = value, with its two printed forms. */
export interface FormConstruction {
  /** the Problem is in exponential form and the Answer in logarithmic form */
  toLog: boolean;
  base: Quantity;
  exponent: Quantity;
  value: Quantity;
}

const num = (r: Rat): Quantity => ({ tex: numLatex(r), value: r.n / r.d });
const letter = (v: string): Quantity => ({ tex: v, value: null });

/** "\log_{3}", with base 10 as "\log" and base e as "\ln". */
function logName(base: string): string {
  if (base === "10") return "\\log";
  if (base === "e") return "\\ln";
  return `\\log_{${base}}`;
}

/** b^{y} = v */
export function exponentialForm(base: Quantity, exponent: Quantity, value: Quantity): string {
  return `${powerLatex(base.tex, exponent.tex)} = ${value.tex}`;
}

/** \log_{b} v = y */
export function logForm(base: Quantity, exponent: Quantity, value: Quantity): string {
  // a misplaced negative number (only ever a Distractor) is bracketed
  const arg = value.tex.startsWith("-") ? `(${value.tex})` : value.tex;
  return `${logName(base.tex)} ${arg} = ${exponent.tex}`;
}

/** Largest y with b^y at most 1000. */
function maxExponent(b: number): number {
  let y = 0;
  while ((intPow(b, y + 1) ?? Infinity) <= 1000) y++;
  return y;
}

const NUMBER_BASES = [2, 2, 3, 3, 4, 5, 5, 6, 7, 8, 9, 11, 12];
const LETTERS = ["a", "k", "t", "x", "y"];

function reciprocal(n: number): Quantity {
  return { tex: `\\frac{1}{${n}}`, value: 1 / n };
}

/** b^{y} = v with b a whole number other than 10. */
function numberFact(rng: Rng, kind: "whole" | "negative" | "fraction"): [Quantity, Quantity, Quantity] {
  if (kind === "fraction") {
    // b = r^n and y = m/n, so v = r^m
    const pairs: [number, number][] = [];
    for (let r = 2; r <= 9; r++) for (let n = 2; n <= 4; n++) if (intPow(r, n)! <= 125) pairs.push([r, n]);
    const [r, n] = rng.pick(pairs);
    const ms = [-3, -2, -1, 1, 2, 3].filter((m) => gcd(m, n) === 1 && intPow(r, Math.abs(m))! <= 1000);
    const m = rng.bool(0.7) ? rng.pick(ms.filter((x) => x > 0)) : rng.pick(ms);
    const rm = intPow(r, Math.abs(m))!;
    return [num(rat(intPow(r, n)!)), num(rat(m, n)), m > 0 ? num(rat(rm)) : reciprocal(rm)];
  }
  const b = rng.pick(NUMBER_BASES);
  const top = maxExponent(b);
  if (kind === "negative") {
    const y = rng.int(2, Math.min(top, 4));
    return [num(rat(b)), num(rat(-y)), reciprocal(intPow(b, y)!)];
  }
  let y = rng.int(2, top);
  // 2^{2} = 4 and 3^{3} = 27 read the same with base and exponent swapped
  if (y === b) y = y === top ? 2 : y + 1;
  return [num(rat(b)), num(rat(y)), num(rat(intPow(b, y)!))];
}

/** 10^{y} = v, with v a whole number or a decimal like 0.01. */
function commonFact(rng: Rng, signed: boolean): [Quantity, Quantity, Quantity] {
  const ten = num(rat(10));
  if (rng.bool(0.3)) {
    // 10^{x} = 50 as \log 50 = x
    const v = rng.pick([2, 3, 5, 7, 20, 30, 50, 70, 200, 500]);
    return [ten, letter(rng.pick(LETTERS)), num(rat(v))];
  }
  if (signed && rng.bool(0.4)) {
    const y = rng.int(2, 3);
    return [ten, num(rat(-y)), { tex: (10 ** -y).toFixed(y), value: 10 ** -y }];
  }
  const y = rng.int(2, 4);
  return [ten, num(rat(y)), num(rat(10 ** y))];
}

/** e^{a} = 7 or e^{3} = x: one side is a letter, since e's powers are not whole. */
function naturalFact(rng: Rng, signed: boolean): [Quantity, Quantity, Quantity] {
  const e: Quantity = { tex: "e", value: Math.E };
  const v = rng.pick(LETTERS);
  if (rng.bool()) return [e, letter(v), num(rat(rng.int(2, 20)))];
  let y = rat(rng.int(2, 5));
  // never -1: e^{-1} = k turns misplacements into true facts (\log_{k} e = -1)
  if (signed && rng.bool(0.5)) y = rng.bool() ? rat(-rng.int(2, 3)) : rat(1, rng.pick([2, 3]));
  return [e, num(y), letter(v)];
}

export function construct(params: ParamValues, rng: Rng): FormConstruction {
  const p = resolveParams(schema, params);
  const direction = p.direction as Direction;
  const signed = p.negativesAndFractions as boolean;
  const toLog = direction === "mixed" ? rng.bool() : direction === "toLog";
  let fact: [Quantity, Quantity, Quantity];
  const roll = rng.next();
  if (p.commonNatural && roll < 0.15) fact = commonFact(rng, signed);
  else if (p.commonNatural && roll < 0.3) fact = naturalFact(rng, signed);
  else {
    const kinds = signed ? (["whole", "negative", "fraction"] as const) : (["whole"] as const);
    fact = numberFact(rng, rng.pick(kinds));
  }
  const [base, exponent, value] = fact;
  return { toLog, base, exponent, value };
}

export function promptLatex(k: FormConstruction): string {
  return k.toLog ? exponentialForm(k.base, k.exponent, k.value) : logForm(k.base, k.exponent, k.value);
}

export function answerLatex(k: FormConstruction): string {
  return k.toLog ? logForm(k.base, k.exponent, k.value) : exponentialForm(k.base, k.exponent, k.value);
}

/** Whether base^{exponent} = value holds, when all three are numbers. */
export function isTrue(base: Quantity, exponent: Quantity, value: Quantity): boolean {
  if (base.value === null || exponent.value === null || value.value === null) return false;
  const lhs = base.value ** exponent.value;
  return Math.abs(lhs - value.value) <= 1e-9 * Math.max(1, Math.abs(value.value));
}

/** A number usable as a logarithm's base or argument: positive, and a base other than 1. */
const positive = (q: Quantity) => q.value === null || q.value > 0;

/**
 * Mistake-based Distractors, most common first: the three numbers of the fact
 * put in the wrong places. Into logarithmic form, b^{y} = v:
 * - \log_{b} y = v (the exponent as the argument);
 * - \log_{v} b = y (the value as the base);
 * - \log_{y} v = b, \log_{v} y = b and \log_{y} b = v.
 * Into exponential form, \log_{b} v = y:
 * - y^{b} = v (base and exponent swapped);
 * - b^{v} = y (exponent and value swapped);
 * - v^{y} = b, y^{v} = b and v^{b} = y.
 * A misplacement that happens to be another true fact (2^{4} = 16 and
 * 4^{2} = 16) is no Distractor, and neither is a logarithm with a negative
 * base or a base of 1.
 */
export function distractors(k: FormConstruction): string[] {
  // the letter of a natural or common fact stands for the number the fact
  // makes it (e^{-1} = k: k is 1/e), so a misplacement that happens to be
  // true, like k^{-1} = e, is caught too
  const b = k.base;
  const y = k.exponent.value === null ? { ...k.exponent, value: Math.log(k.value.value!) / Math.log(b.value!) } : k.exponent;
  const v = k.value.value === null ? { ...k.value, value: b.value! ** k.exponent.value! } : k.value;
  // each triple is (base, exponent, value) of a misplaced fact
  const triples: [Quantity, Quantity, Quantity][] = k.toLog
    ? [
        [b, v, y],
        [v, y, b],
        [y, b, v],
        [v, b, y],
        [y, v, b],
      ]
    : [
        [y, b, v],
        [b, v, y],
        [v, y, b],
        [y, v, b],
        [v, b, y],
      ];
  const negated = (q: Quantity): Quantity => ({
    tex: q.tex.startsWith("-") ? q.tex.slice(1) : `-${q.tex}`,
    value: -q.value!,
  });
  // a number's reciprocal, spelled the way it is printed
  const inverted = (q: Quantity): Quantity | null => {
    if (q.value === null || q.value <= 0) return null;
    const frac = q.tex.match(/^\\frac\{1\}\{(\d+)\}$/);
    if (frac) return { tex: frac[1], value: 1 / q.value };
    if (/^0\.0*1$/.test(q.tex)) return { tex: String(Math.round(1 / q.value)), value: 1 / q.value };
    return /^\d+$/.test(q.tex) ? reciprocal(Number(q.tex)) : null;
  };
  const inverse = inverted(v);
  const slips: [Quantity, Quantity, Quantity][] = [...triples, [b, negated(y), v]];
  if (inverse) slips.push([b, y, inverse]); // invert the argument
  // Omit the written base, reading the logarithm as log or ln.
  if (b.tex !== "10") slips.push([num(rat(10)), y, v]);
  if (b.tex !== "e") slips.push([{ tex: "e", value: Math.E }, y, v]);
  if (y.value! < 0) slips.push([v, b, negated(y)]); // swap base and result, losing the negative sign

  const letter = k.exponent.value === null ? y.tex : k.value.value === null ? v.tex : null;
  const seen: number[][] = [];
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
  const candidates = slips.map(([B, E, V]) => {
    if (isTrue(B, E, V)) return null;
    if (k.toLog && (!positive(B) || B.value === 1 || !positive(V))) return null;
    let values: number[];
    if (letter) {
      // Different placements of a letter can still imply the same value for it.
      let solution: number;
      if (B.tex === letter) solution = V.value! ** (1 / E.value!);
      else if (V.tex === letter) solution = B.value! ** E.value!;
      else solution = Math.log(V.value!) / Math.log(B.value!) * (E.tex === `-${letter}` ? -1 : 1);
      if (!Number.isFinite(solution)) return null;
      values = [solution];
    } else if (k.toLog) {
      values = [Math.log(V.value!) / Math.log(B.value!), E.value!];
    } else {
      // Compare powers by sign and log magnitude, even if the power overflows.
      if (B.value! < 0 && !Number.isInteger(E.value)) return null;
      const negative = B.value! < 0 && E.value! % 2 !== 0;
      values = [Number(negative), E.value! * Math.log(Math.abs(B.value!)), V.value!];
    }
    if (seen.some((earlier) => values.every((v, i) => close(v, earlier[i])))) return null;
    seen.push(values);
    return k.toLog ? logForm(B, E, V) : exponentialForm(B, E, V);
  });
  return distinctHints(answerLatex(k), candidates);
}

export const generator: Generator = {
  id: LOG_EXPONENTIAL_FORM_ID,
  title: "Converting between exponential and logarithmic form",
  defaultDirections: "Rewrite each exponential equation in logarithmic form, and each logarithmic equation in exponential form.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: LOG_EXPONENTIAL_FORM_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
