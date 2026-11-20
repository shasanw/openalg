// Test-only: checks shared by the Radicals Topics' property tests. Values are
// read from the BAKED LaTeX (via latexEval), not from the construction, so a
// printing slip is caught as well as an arithmetic one.

import { expect } from "vitest";
import fc from "fast-check";
import katex from "katex";
import { close, evalLatex } from "./latexEval.testkit";
import type { Generator, ParamValues } from "../types";

/** Positive values for the variables (they are assumed positive). */
export const ENVS = [
  { x: 1.37, y: 2.29 },
  { x: 3.11, y: 0.53 },
];

export const anySeed = fc.integer({ min: 0, max: 0xffffffff });

/** The value of a printed expression at each test env. */
export const valuesOf = (latex: string) => ENVS.map((env) => evalLatex(latex, env));

export function sameValue(a: string, b: string): boolean {
  const va = valuesOf(a);
  const vb = valuesOf(b);
  return va.every((v, i) => close(v, vb[i], 1e-9));
}

/**
 * Simplest radical form, read from the LaTeX: every radicand is free of
 * index-th powers (numbers and variables alike), and no denominator holds a
 * radical.
 */
export function expectSimplest(latex: string): void {
  const re = /\\sqrt(?:\[(\d)\])?\{(-?)(\d*)((?:[a-z](?:\^\{\d+\})?)*)\}/g;
  for (const m of latex.matchAll(re)) {
    const index = Number(m[1] ?? 2);
    const n = m[3] === "" ? 1 : Number(m[3]);
    expect(m[2], `${latex}: a minus under the root`).toBe("");
    for (let f = 2; f ** index <= n; f++) expect(n % f ** index, `${latex}: ${f}^${index} left in ${n}`).not.toBe(0);
    for (const v of m[4].matchAll(/[a-z](?:\^\{(\d+)\})?/g))
      expect(Number(v[1] ?? 1), `${latex}: a power left under the root`).toBeLessThan(index);
  }
  for (const m of latex.matchAll(/\\frac\{(?:[^{}]|\{[^{}]*\})*\}\{((?:[^{}]|\{[^{}]*\})*)\}/g))
    expect(m[1], `${latex}: a radical in the denominator`).not.toContain("\\sqrt");
}

/** Determinism, KaTeX rendering and enough variety, for any Topic. */
export function commonChecks(g: Generator, anyParams: fc.Arbitrary<ParamValues>, variety: ParamValues[], minDistinct = 120) {
  fc.assert(
    fc.property(anySeed, anyParams, (seed, params) => {
      expect(g.generate(params, seed)).toEqual(g.generate(params, seed));
    }),
    { numRuns: 60 },
  );
  fc.assert(
    fc.property(anySeed, anyParams, (seed, params) => {
      const p = g.generate(params, seed);
      for (const tex of [p.prompt, p.answer, ...p.distractorHints])
        expect(() => katex.renderToString(tex, { throwOnError: true }), tex).not.toThrow();
      expect(p.prompt).not.toMatch(/(^|[^0-9.])1(x|\\sqrt)/);
      expect(p.prompt + p.answer).not.toMatch(/[+-] [+-]|\+ -|- 0(?![.\d])|\+ 0(?![.\d])/);
    }),
    { numRuns: 100 },
  );
  for (const params of variety) {
    const prompts = new Set(Array.from({ length: 200 }, (_, s) => g.generate(params, s).prompt));
    expect(prompts.size, JSON.stringify(params)).toBeGreaterThan(minDistinct);
  }
}

/** At least `min` Distractors, distinct, and none equal to the Answer in value. */
export function expectValueDistractors(answer: string, hints: string[], min = 3): void {
  expect(hints.length, answer).toBeGreaterThanOrEqual(min);
  expect(new Set(hints).size).toBe(hints.length);
  for (const d of hints) expect(sameValue(d, answer), `${d} equals ${answer}`).toBe(false);
  for (let i = 0; i < hints.length; i++)
    for (let j = i + 1; j < hints.length; j++) expect(sameValue(hints[i], hints[j]), `${hints[i]} ~ ${hints[j]}`).toBe(false);
}
