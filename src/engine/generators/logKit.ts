// Shared pieces for the Precalculus Exponential and Logarithmic Functions
// Topics: printing logarithms (\log_{b}, \log, \ln), powers with a base that
// needs brackets, exact powers of small integers, rounded decimals, and the
// "same root" test that tells whether a logarithm is rational. Nothing here
// solves an equation: generators pick the Answer first and use these helpers to
// print the Problem built around it.

import { numLatex, type Rat } from "./equationKit";

// ------------------------------------------------------------------ bases

/**
 * The base of a logarithm: a number (integer or reciprocal, printed
 * \log_{b}), 10 (the common logarithm, printed \log) or e (printed \ln).
 */
export type LogBase = { kind: "number"; b: Rat } | { kind: "common" } | { kind: "natural" };

export const numberBase = (b: Rat): LogBase => ({ kind: "number", b });
export const COMMON: LogBase = { kind: "common" };
export const NATURAL: LogBase = { kind: "natural" };

/** "\log_{3}", "\log_{\frac{1}{2}}", "\log" or "\ln". */
export function logName(base: LogBase): string {
  switch (base.kind) {
    case "common":
      return "\\log";
    case "natural":
      return "\\ln";
    case "number":
      return `\\log_{${numLatex(base.b)}}`;
  }
}

/** A logarithm of an already-printed argument: "\log_{2} 8", "\ln (x + 1)". */
export function logOf(base: LogBase, arg: string): string {
  return `${logName(base)} ${arg}`;
}

/** The base's value as a number (for evaluating, never for solving). */
export function baseValue(base: LogBase): number {
  if (base.kind === "common") return 10;
  if (base.kind === "natural") return Math.E;
  return base.b.n / base.b.d;
}

/** The base as printed in a power: "3", "\frac{1}{2}", "10" or "e". */
export function baseLatex(base: LogBase): string {
  if (base.kind === "common") return "10";
  if (base.kind === "natural") return "e";
  return numLatex(base.b);
}

// ------------------------------------------------------------------ powers

/** Does a printed base need brackets before a superscript? */
function needsBrackets(base: string): boolean {
  return base.startsWith("-") || base.includes("\\frac") || base.includes("\\sqrt") || base.includes(".");
}

/** base^{exp}, bracketing a fraction or negative base: "\left(\frac{1}{2}\right)^{x}". */
export function powerLatex(base: string, exp: string): string {
  const b = needsBrackets(base) ? `\\left(${base}\\right)` : base;
  return `${b}^{${exp}}`;
}

/** Wrap a sum in brackets for use as a log argument: "(x + 3)"; a lone term stays bare. */
export function argLatex(expr: string): string {
  return /[ ]/.test(expr.trim()) ? `(${expr})` : expr;
}

/** Exact integer power, or null when it would not be a safe integer. */
export function intPow(b: number, k: number): number | null {
  let out = 1;
  for (let i = 0; i < k; i++) {
    out *= b;
    if (!Number.isSafeInteger(out)) return null;
  }
  return out;
}

/** The smallest r with n = r^k (n >= 2), and that k: 8 -> {2, 3}, 12 -> {12, 1}. */
export function perfectPower(n: number): { root: number; exp: number } {
  for (let r = 2; r * r <= n; r++) {
    let v = r;
    let k = 1;
    while (v < n) {
      v *= r;
      k++;
    }
    if (v === n) return { root: r, exp: k };
  }
  return { root: n, exp: 1 };
}

/**
 * Whether log_b n is rational for integers b, n >= 2: exactly when both are
 * powers of one common root (log_4 8 = 3/2, but log_3 7 is irrational).
 */
export function rationalLog(b: number, n: number): boolean {
  return perfectPower(b).root === perfectPower(n).root;
}

// ------------------------------------------------------------------ decimals

/** A value rounded to `places` decimals, keeping trailing zeros: "1.70", "-0.23". */
export function roundedLatex(value: number, places: number): string {
  const s = value.toFixed(places);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/** Whether a value rounds to zero at `places` decimals ("0.00" is a poor Answer). */
export function roundsToZero(value: number, places: number): boolean {
  return Number(value.toFixed(places)) === 0;
}

/** "x \approx 1.77" */
export function approxLatex(v: string, value: number, places: number): string {
  return `${v} \\approx ${roundedLatex(value, places)}`;
}
