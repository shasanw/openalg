// Test-only helpers shared by the Polynomials and Factoring Topics: every
// Topic Option drawn at random from a schema, value checks of the BAKED
// strings (a polynomial equals its factored form at sample points), and the
// tidiness and Distractor checks every one of them runs.

import fc from "fast-check";
import katex from "katex";
import { expect } from "vitest";
import { choiceKey } from "../../mc";
import type { ParamSchema, ParamValue, ParamValues, Problem } from "../../types";
import { close, evalLatex, type Env } from "../shared/latexEval.testkit";

export const anySeed = fc.integer({ min: 0, max: 0xffffffff });

/** Any Topic Options the schema allows. */
export function anyParams(schema: ParamSchema): fc.Arbitrary<ParamValues> {
  const fields: Record<string, fc.Arbitrary<ParamValue>> = {};
  for (const f of schema) {
    if (f.type === "boolean") fields[f.key] = fc.boolean();
    else if (f.type === "int") fields[f.key] = fc.integer({ min: f.min, max: f.max });
    else fields[f.key] = fc.constantFrom(...f.options.map((o) => o.value));
  }
  return fc.record(fields);
}

/** Sample points binding every letter (each a different, non-integer value). */
const POINTS: Env[] = [0, 1, 2].map((k) => {
  const env: Env = {};
  "abcdefghijklmnopqrstuvwxyz".split("").forEach((l, i) => {
    env[l] = 0.7 + 0.31 * i + 0.53 * k * (i % 3 === 0 ? -1 : 1);
  });
  return env;
});

/** The value of a LaTeX expression at each sample point, with \div read as division. */
export function values(tex: string): number[] {
  const parts = tex.split("\\div");
  return POINTS.map((env) => parts.map((part) => evalLatex(part, env)).reduce((a, b) => a / b));
}

/** Equal at every sample point. */
export function sameValue(a: string, b: string): boolean {
  const x = values(a);
  const y = values(b);
  return x.every((v, i) => close(v, y[i], 1e-9));
}

/** Degenerate spellings no printed polynomial may contain. */
export function expectTidy(tex: string): void {
  expect(tex, tex).not.toMatch(/(^|[^0-9])1[a-z(]/);
  expect(tex, tex).not.toMatch(/[+-] [+-]/);
  expect(tex, tex).not.toMatch(/[+-] 0(?![.\d])/);
  expect(tex, tex).not.toMatch(/\^\{[01]\}/);
  expect(tex, tex).not.toMatch(/(^|[^0-9])0[a-z(]/);
  expect(tex, tex).not.toMatch(/\(\)/);
}

export function expectKatex(tex: string): void {
  expect(() => katex.renderToString(tex, { throwOnError: true }), tex).not.toThrow();
}

/** Distractors are distinct (as the multiple-choice assembler compares them), never the Answer, and tidy. */
export function expectGoodHints(p: Problem, atLeast = 3): void {
  expect(p.distractorHints.length, p.prompt).toBeGreaterThanOrEqual(atLeast);
  const keys = p.distractorHints.map(choiceKey);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).not.toContain(choiceKey(p.answer));
  for (const h of p.distractorHints) expectTidy(h);
}

/** A Distractor that is an expression must differ in value from the Answer: a wrong choice must be wrong. */
export function expectHintsWrongInValue(p: Problem): void {
  if (p.answer.startsWith("\\text")) return;
  for (const h of p.distractorHints) {
    if (h.startsWith("\\text")) continue;
    expect(sameValue(h, p.answer), `${h} vs ${p.answer}`).toBe(false);
  }
}

/** The number of top-level terms in a printed polynomial. */
export function countTerms(tex: string): number {
  let depth = 0;
  let n = 1;
  for (let i = 0; i < tex.length; i++) {
    const ch = tex[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    else if (depth === 0 && (ch === "+" || ch === "-") && i > 0 && tex[i - 1] === " ") n++;
  }
  return n;
}

/** The exponents of each variable in each top-level term of a printed polynomial (one letter variables). */
export function termDegrees(tex: string): number[] {
  const terms = tex.replace(/ ([+-]) /g, "|").split("|");
  return terms.map((t) => {
    let d = 0;
    for (const m of t.matchAll(/([a-z])(?:\^\{(\d+)\})?/g)) d += m[2] ? Number(m[2]) : 1;
    return d;
  });
}
