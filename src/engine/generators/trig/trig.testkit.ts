// Test-only: checks shared by the Trigonometry Topics' property tests. Values
// are read from the BAKED LaTeX (via latexEval, which knows \sin, \arcsin,
// \operatorname{arcsec}, degrees and \theta), not from the construction, so a
// printing slip is caught as well as a table slip.

import { expect } from "vitest";
import fc from "fast-check";
import katex from "katex";
import type { ParamSchema, ParamValues } from "../../types";
import { gcd } from "../../format";
import { NO_SOLUTION } from "../shared/equationKit";
import { answerValues, close, evalLatex, type Env } from "../shared/latexEval.testkit";
import { STANDARD_ANGLES, UNDEFINED_LATEX, type Angle } from "./trigKit";

export const anySeed = fc.integer({ min: 0, max: 0xffffffff });

/** Any of the 16 standard angles, turned by up to ±3 full rotations. */
export const anyStandardAngle: fc.Arbitrary<Angle> = fc
  .tuple(fc.constantFrom(...STANDARD_ANGLES), fc.integer({ min: -3, max: 3 }))
  .map(([a, t]) => ({ n: a.n + 2 * t * a.d, d: a.d }));

/** The value of printed LaTeX in radians for angles; NaN for "\text{undefined}". */
export function evalTrig(latex: string, env: Env = {}): number {
  return latex.trim() === UNDEFINED_LATEX ? NaN : evalLatex(latex, env);
}

/** Equal values, or both undefined (NaN). */
export function sameTrigValue(a: string, b: string, tol = 1e-9): boolean {
  const va = evalTrig(a);
  const vb = evalTrig(b);
  return Number.isNaN(va) || Number.isNaN(vb) ? Number.isNaN(va) && Number.isNaN(vb) : close(va, vb, tol);
}

/** The solutions in an Answer "x = \frac{\pi}{6}, \frac{5\pi}{6}" (or degrees) in radians; [] for no solution. */
export function solutionAngles(answer: string): number[] {
  return answer.trim() === NO_SOLUTION ? [] : answerValues(answer).values;
}

/** Every \frac{...\pi...}{d} is in lowest terms. */
export function expectLowestTerms(latex: string): void {
  for (const m of latex.matchAll(/\\frac\{(\d*)\\pi\}\{(\d+)\}/g)) {
    const n = m[1] === "" ? 1 : Number(m[1]);
    expect(gcd(n, Number(m[2])), `${latex}: ${n}π/${m[2]} not reduced`).toBe(1);
  }
}

/** No radical in a denominator. */
export function expectRationalized(latex: string): void {
  for (const m of latex.matchAll(/\\frac\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g))
    expect(m[1], `${latex}: radical in a denominator`).not.toContain("\\sqrt");
}

export function expectRenders(tex: string): void {
  expect(() => katex.renderToString(tex, { throwOnError: true }), tex).not.toThrow();
}

/** Check printed output for every combination, including mixed settings. */
export function forEachOptionSeed(schema: ParamSchema, check: (seed: number, params: ParamValues) => void): void {
  let combinations: ParamValues[] = [{}];
  for (const f of schema) {
    const values = f.type === "enum" ? f.options.map(o => o.value) : f.type === "boolean" ? [true, false]
      : Array.from({ length: f.max - f.min + 1 }, (_, i) => f.min + i);
    combinations = combinations.flatMap(p => values.map(value => ({ ...p, [f.key]: value })));
  }
  for (const params of combinations) fc.assert(fc.property(anySeed, seed => check(seed, params)), { numRuns: 30 });
}
