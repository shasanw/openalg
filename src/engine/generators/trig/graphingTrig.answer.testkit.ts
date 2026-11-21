// The printed-Answer checker for graphing-trig: reads the BAKED prompt and
// Answer strings and recomputes the features from the printed equation
// numerically (sampling, period search, pole finding), never from the
// generator's construction. Shared by graphingTrig.test.ts and the
// every-Topic Answer suite.

import { expect } from "vitest";
import { ANSWER_PART_SEPARATOR } from "../../format";
import type { TrigCurve } from "../../plot";
import type { Problem } from "../../types";
import { evalLatex, prepareLatex, splitEquation } from "../shared/latexEval.testkit";

const PI = Math.PI;

// ------------------------------------------------------------------ reading the prompt

export const FN_NAMES = ["sin", "cos", "tan", "cot", "sec", "csc"] as const;
export type Fn = (typeof FN_NAMES)[number];
export const F: Record<Fn, (u: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (u) => Math.cos(u) / Math.sin(u),
  sec: (u) => 1 / Math.cos(u),
  csc: (u) => 1 / Math.sin(u),
};

export interface Printed {
  fn: Fn;
  /** The printed function y(x), evaluated from the prompt LaTeX. */
  g: (x: number) => number;
  /** The printed argument of fn as a function of x. */
  arg: (x: number) => number;
}

export function readPrompt(prompt: string): Printed {
  const [lhs, rhs] = splitEquation(prompt);
  expect(lhs).toBe("y");
  const m = rhs.match(/\\(sin|cos|tan|cot|sec|csc)(?:\\left\((.*)\\right\)| (\d*x))/);
  expect(m, prompt).not.toBeNull();
  const argTex = m![2] ?? m![3];
  // Tokenized once: the checks evaluate these hundreds of times per Problem.
  const g = prepareLatex(rhs);
  const arg = prepareLatex(argTex);
  return {
    fn: m![1] as Fn,
    g: (x) => g({ x }),
    arg: (x) => arg({ x }),
  };
}

// ------------------------------------------------------------------ reading the Answer

export interface Stated {
  amplitude?: number;
  period: number;
  /** Signed: right is positive. */
  shift: number;
  vshift: number;
  asymptotes?: { start: number; spacing: number };
}

const PART = /^\\text\{([A-Za-z ]+):( none)? ?\}\s*(.*?)(?:\s*\\text\{ (right|left|up|down)\})?$/;

export function readParts(answer: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const p of answer.split(ANSWER_PART_SEPARATOR)) {
    const m = p.match(PART);
    expect(m, p).not.toBeNull();
    parts.set(m![1], p);
  }
  return parts;
}

export function readAnswer(answer: string): Stated {
  const out: Partial<Stated> = {};
  for (const p of answer.split(ANSWER_PART_SEPARATOR)) {
    const [, label, none, value, dir] = p.match(PART)!;
    const signed = () => (none ? 0 : evalLatex(value) * (dir === "left" || dir === "down" ? -1 : 1));
    if (label === "Amplitude") out.amplitude = evalLatex(value);
    else if (label === "Period") out.period = evalLatex(value);
    else if (label === "Phase shift") {
      expect(none || dir === "right" || dir === "left").toBeTruthy();
      out.shift = signed();
    } else if (label === "Vertical shift") {
      expect(none || dir === "up" || dir === "down").toBeTruthy();
      out.vshift = signed();
    } else if (label === "Asymptotes") {
      const [x, rhs] = splitEquation(value);
      expect(x).toBe("x");
      const s0 = evalLatex(rhs, { k: 0 });
      out.asymptotes = { start: s0, spacing: evalLatex(rhs, { k: 1 }) - s0 };
    } else throw new Error(`unknown part ${label}`);
  }
  return out as Stated;
}

// ------------------------------------------------------------------ numerics

export const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
export const SAMPLES = Array.from({ length: 97 }, (_, i) => -4 * PI + 0.0731 + (i * 8 * PI) / 97);

/**
 * The smallest p = jπ/8 (j = 1..64) with g(x + p) = g(x) at 65 points across
 * 8π (a lattice π/8 apart, off every special angle), skipping points near a pole.
 */
export function numericPeriod(g: (x: number) => number): number {
  const at = Array.from({ length: 129 }, (_, i) => g(-4 * PI + 0.0731 + (i * PI) / 8));
  for (let j = 1; j <= 64; j++) {
    let ok = true;
    for (let i = 0; i + j < at.length && i <= 64; i++) {
      const [u, v] = [at[i], at[i + j]];
      if (Math.abs(u) > 1e4 || Math.abs(v) > 1e4) continue;
      if (!near(u, v, 1e-7)) {
        ok = false;
        break;
      }
    }
    if (ok) return (j * PI) / 8;
  }
  throw new Error("no period up to 8π");
}

/** Where g blows up over [lo, hi]: a sign change with |g| large on both sides, refined by bisection. */
export function numericPoles(g: (x: number) => number, lo: number, hi: number): number[] {
  const n = 40000;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let p = lo + ((hi - lo) * i) / n;
    let q = lo + ((hi - lo) * (i + 1)) / n;
    if (Math.sign(g(p)) === Math.sign(g(q))) continue;
    for (let k = 0; k < 60; k++) {
      const m = (p + q) / 2;
      if (Math.sign(g(m)) === Math.sign(g(p))) p = m;
      else q = m;
    }
    // A pole, not a zero crossing: |g| is huge just either side.
    if (Math.abs(g(p)) > 1e5 && Math.abs(g(q)) > 1e5) out.push((p + q) / 2);
  }
  return out;
}

/** Sampled values of g over the window, densely. */
export function dense(g: (x: number) => number, n = 20000): number[] {
  return Array.from({ length: n + 1 }, (_, i) => g(-2 * PI + (4 * PI * i) / n));
}

export const curveValue = (c: TrigCurve, x: number) => c.a * F[c.fn](c.b * (x - c.c)) + c.d;

/** a·fn(B(x − s)) + D fitted at one well-behaved sample for a, then checked at every sample. */
export function describesSameFunction(
  p: Printed,
  period: number,
  shift: number,
  vshift: number,
  fixedA?: number,
): { same: boolean; a: number; fitted: (x: number) => number } {
  const B = (["tan", "cot"].includes(p.fn) ? PI : 2 * PI) / period;
  const h = (x: number) => F[p.fn](B * (x - shift));
  const x0 = SAMPLES.find((x) => Math.abs(h(x)) > 0.3 && Math.abs(h(x)) < 3 && Math.abs(p.g(x)) < 1e3)!;
  const a = fixedA ?? (p.g(x0) - vshift) / h(x0);
  const same = SAMPLES.every((x) => {
    const want = p.g(x);
    return Math.abs(want) > 1e4 || Math.abs(h(x)) > 1e4 || near(a * h(x) + vshift, want, 1e-7);
  });
  return { same, a, fitted: (x) => a * h(x) + vshift };
}

// ------------------------------------------------------------------ the checks

export function expectCorrectAnswer(p: Problem): void {
  const printed = readPrompt(p.prompt);
  const stated = readAnswer(p.answer);
  const sineLike = ["sin", "cos", "sec", "csc"].includes(printed.fn);

  // Parts in the documented order.
  const labels = [...readParts(p.answer).keys()];
  expect(labels).toEqual([
    ...(["sin", "cos"].includes(printed.fn) ? ["Amplitude"] : []),
    "Period",
    "Phase shift",
    "Vertical shift",
    ...(["sin", "cos"].includes(printed.fn) ? [] : ["Asymptotes"]),
  ]);

  // Period: found by search on the printed equation.
  expect(near(stated.period, numericPeriod(printed.g)), p.prompt).toBe(true);

  // Phase shift: the printed argument is B(x − s), read as a line in x.
  const B = printed.arg(1) - printed.arg(0);
  expect(B).toBeGreaterThan(0);
  expect(near(stated.shift, -printed.arg(0) / B, 1e-9), p.prompt).toBe(true);
  expect(near(stated.period, (sineLike ? 2 * PI : PI) / B, 1e-9)).toBe(true);

  // The stated period, shift and vertical shift rebuild the printed function.
  const fit = describesSameFunction(printed, stated.period, stated.shift, stated.vshift);
  expect(fit.same, p.prompt).toBe(true);

  // Dense sampling on the closed form just shown equal to the printed equation (evalLatex is slow).
  const ys = dense(fit.fitted).filter((y) => Math.abs(y) < 20);
  if (stated.amplitude !== undefined) {
    // Amplitude and midline from the sampled max and min.
    const max = Math.max(...ys);
    const min = Math.min(...ys);
    expect(near(stated.amplitude, (max - min) / 2, 1e-4), p.prompt).toBe(true);
    expect(near(stated.vshift, (max + min) / 2, 1e-4), p.prompt).toBe(true);
    expect(near(Math.abs(fit.a), stated.amplitude, 1e-9)).toBe(true);
  }
  if (printed.fn === "sec" || printed.fn === "csc") {
    // The gap no value falls in is (d − |a|, d + |a|).
    const sorted = [...ys].sort((u, v) => u - v);
    let gap = [0, 0];
    for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] > gap[1] - gap[0]) gap = [sorted[i - 1], sorted[i]];
    expect(near(stated.vshift, (gap[0] + gap[1]) / 2, 1e-4), p.prompt).toBe(true);
  }

  if (stated.asymptotes) {
    // Every numeric pole in the window is in the stated family, and every member is a pole.
    const poles = numericPoles(fit.fitted, -2 * PI, 2 * PI);
    const { start, spacing } = stated.asymptotes;
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start).toBeLessThan(spacing);
    const family: number[] = [];
    for (let k = -40; k <= 40; k++) {
      const x = start + k * spacing;
      if (x > -2 * PI + 1e-6 && x < 2 * PI - 1e-6) family.push(x);
    }
    expect(poles.length, p.prompt).toBe(family.length);
    poles.forEach((x, i) => expect(near(x, family[i], 1e-7), p.prompt).toBe(true));
    // and the printed equation itself blows up there.
    for (const x of family) expect(Math.min(Math.abs(printed.g(x - 1e-9)), Math.abs(printed.g(x + 1e-9))), p.prompt).toBeGreaterThan(1e6);
    if (printed.fn === "tan" || printed.fn === "cot") {
      // Midway between two asymptotes the curve is at its midline d.
      expect(near(printed.g(start + spacing / 2), stated.vshift, 1e-9), p.prompt).toBe(true);
    }
  }
}

/** The every-Topic Answer suite's checker. */
export const graphingTrig = expectCorrectAnswer;
