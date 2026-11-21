// Test-only: independent numeric checks for the trig equation Topics. The
// BAKED prompt is evaluated (latexEval), never the construction: every
// printed solution must satisfy the printed equation with every term defined,
// and a dense scan of the interval must find no other solution.

import { expect } from "vitest";
import { NO_SOLUTION } from "../shared/equationKit";
import { close, evalLatex, prepareLatex, splitEquation } from "../shared/latexEval.testkit";
import type { ParamSchema, ParamValues } from "../../types";

const PROMPT_SEPARATOR = ";\\quad ";

const TAU = 2 * Math.PI;

export interface ParsedPrompt {
  equation: string;
  residual: (x: number) => number;
  where: string;
  /** "x" or "theta" */
  v: string;
  general: boolean;
  /** turns of π the solution set repeats over: 2, or 4 for an equation in x/2 */
  turn: number;
}

/** The printed argument after a function name at `at`: "2x", "\frac{x}{2}" or "\left(...\right)". */
function argumentAt(s: string, at: number): string {
  let i = at;
  if (s.startsWith("^{2}", i)) i += 4;
  while (s[i] === " ") i++;
  const rest = s.slice(i);
  if (rest.startsWith("\\left(")) {
    let depth = 0;
    for (let j = 0; j < rest.length; j++) {
      if (rest.startsWith("\\left(", j)) depth++;
      else if (rest.startsWith("\\right)", j) && --depth === 0) return rest.slice(0, j + 7);
    }
    throw new Error(`unbalanced argument in ${s}`);
  }
  const frac = rest.match(/^\\frac\{[^{}]*\}\{[^{}]*\}/);
  if (frac) return frac[0];
  const plain = rest.match(/^(\d*)(x|\\theta|\\pi)/);
  if (plain) return plain[0];
  throw new Error(`unreadable argument in ${s} at ${at}`);
}

/**
 * Where each printed tan, sec, cot or csc is undefined, read from its own
 * printed argument, so a pole is caught even when a zero factor hides it
 * (\cos x \tan x is not 0 at π/2: it is undefined there).
 */
function denominators(equation: string, v: string): ((x: number) => boolean)[] {
  const out: ((x: number) => boolean)[] = [];
  for (const m of equation.matchAll(/\\(tan|sec|cot|csc)(?![a-z])/g)) {
    const arg = prepareLatex(argumentAt(equation, m.index + m[0].length));
    const fn = m[1] === "tan" || m[1] === "sec" ? Math.cos : Math.sin;
    out.push((x) => Math.abs(fn(arg({ [v]: x }))) < 1e-7);
  }
  return out;
}

export function parsePrompt(prompt: string): ParsedPrompt {
  const at = prompt.lastIndexOf(PROMPT_SEPARATOR);
  expect(at, prompt).toBeGreaterThan(0);
  const equation = prompt.slice(0, at);
  const where = prompt.slice(at + PROMPT_SEPARATOR.length);
  const v = equation.includes("\\theta") ? "theta" : "x";
  const unit = v === "theta" ? "degrees" : "radians";
  const general = where === `\\text{all solutions in ${unit}}`;
  if (!general) expect(where).toBe(unit === "degrees" ? "0^{\\circ} \\le \\theta < 360^{\\circ}" : "0 \\le x < 2\\pi");
  const [lhs, rhs] = splitEquation(equation).map(prepareLatex);
  const poles = denominators(equation, v);
  return {
    equation,
    where,
    v,
    general,
    residual(x) {
      if (poles.some((zeroAt) => zeroAt(x))) return NaN;
      const env = { [v]: x };
      return lhs(env) - rhs(env);
    },
    turn: /\\frac\{(x|\\theta)\}\{2\}/.test(equation) ? 4 : 2,
  };
}

export const satisfies = (p: ParsedPrompt, x: number): boolean => {
  const r = p.residual(x);
  return Number.isFinite(r) && Math.abs(r) < 1e-7;
};

/** Top-level comma-separated parts of an Answer's right side. */
function rhsParts(answer: string): string[] {
  const [, rhs] = splitEquation(answer);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < rhs.length; i++) {
    if (rhs[i] === "{") depth++;
    else if (rhs[i] === "}") depth--;
    else if (rhs[i] === "," && depth === 0) {
      parts.push(rhs.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(rhs.slice(start));
  return parts.map((s) => s.trim());
}

const mod = (x: number, m: number) => ((x % m) + m) % m;

function uniqSorted(xs: number[], m: number): number[] {
  const out: number[] = [];
  for (const x of xs.map((y) => mod(y, m)).sort((a, b) => a - b)) {
    const y = Math.abs(x - m) < 1e-9 ? 0 : x;
    if (!out.some((o) => Math.abs(o - y) < 1e-7)) out.push(y);
  }
  return out.sort((a, b) => a - b);
}

/**
 * The solutions an Answer states, in radians over the prompt's period:
 * the listed values (interval), or every family's points for k = -4..4
 * (general). Also checks a general Answer's families each satisfy the equation.
 */
export function statedSolutions(p: ParsedPrompt, answer: string): number[] {
  if (answer === NO_SOLUTION) return [];
  const [v] = splitEquation(answer);
  expect(v).toBe(p.v === "theta" ? "\\theta" : "x");
  const parts = rhsParts(answer);
  if (!p.general) {
    const xs = parts.map((s) => evalLatex(s));
    for (const x of xs) expect(x >= -1e-12 && x < TAU - 1e-9, `${answer}: ${x} outside one turn`).toBe(true);
    expect(uniqSorted(xs, TAU)).toHaveLength(xs.length);
    return xs;
  }
  const span = p.turn * Math.PI;
  const pts: number[] = [];
  for (const fam of parts) {
    expect(fam, answer).toContain("k");
    const start = evalLatex(fam, { k: 0 });
    const step = evalLatex(fam, { k: 1 }) - start;
    const count = Math.round(span / step);
    expect(count > 0 && count < 100 && close(count * step, span), fam).toBe(true);
    for (let k = -count; k <= count; k++) {
      const x = evalLatex(fam, { k });
      expect(satisfies(p, x), `${p.equation} at ${fam}, k = ${k}`).toBe(true);
      if (x >= -1e-9 && x < span - 1e-9) pts.push(x);
    }
  }
  return uniqSorted(pts, span);
}

/**
 * Every solution in [0, turn·π), found without the construction: the grid of
 * multiples of π/72 (every angle these Topics can produce), plus a fine
 * sign-change scan for any root off that grid (which then fails the match).
 */
export function scannedSolutions(p: ParsedPrompt): number[] {
  const span = (p.general ? p.turn : 2) * Math.PI;
  const found: number[] = [];
  const steps = Math.round((span / Math.PI) * 72);
  for (let i = 0; i < steps; i++) {
    const x = (i * Math.PI) / 72;
    if (satisfies(p, x)) found.push(x);
  }
  const onGrid = uniqSorted(found, span);
  const N = 1152;
  let prevX = 0;
  let prev = p.residual(0);
  for (let i = 1; i <= N; i++) {
    const x = (i * span) / N - 1e-6;
    const r = p.residual(x);
    if (Number.isFinite(r) && Number.isFinite(prev) && Math.sign(r) !== Math.sign(prev)) {
      // a crossing, not an asymptote: bisect it
      let a = prevX;
      let b = x;
      for (let j = 0; j < 42; j++) {
        const m = (a + b) / 2;
        const rm = p.residual(m);
        if (!Number.isFinite(rm)) break;
        if (Math.sign(rm) === Math.sign(p.residual(a))) a = m;
        else b = m;
      }
      const root = (a + b) / 2;
      // a touching (double) root on the grid can show as nearby sign noise
      if (Math.abs(p.residual(root)) < 1e-6 && !onGrid.some((g) => Math.min(mod(g - root, span), mod(root - g, span)) < 1e-3)) found.push(root);
    }
    prevX = x;
    prev = r;
  }
  // A touching (double) root off the grid has no sign change: look for a
  // local minimum of |residual| near zero and refine it.
  const abs = (x: number) => {
    const r = p.residual(x);
    return Number.isFinite(r) ? Math.abs(r) : Infinity;
  };
  const h = span / N;
  for (let i = 0; i < N; i++) {
    const x = i * h + h / 3;
    const m = abs(x);
    if (!(m < 1e-2 && m <= abs(x - h) && m <= abs(x + h))) continue;
    let a = x - h;
    let b = x + h;
    for (let j = 0; j < 80; j++) {
      const c1 = a + (b - a) / 3;
      const c2 = b - (b - a) / 3;
      if (abs(c1) < abs(c2)) b = c2;
      else a = c1;
    }
    const root = (a + b) / 2;
    if (abs(root) < 1e-9 && !found.some((g) => Math.min(mod(g - root, span), mod(root - g, span)) < 1e-3)) found.push(root);
  }
  return uniqSorted(found, span);
}

// The catalogue checker substitutes each Distractor into the same printed prompt.
let last: { prompt: string; p: ParsedPrompt; scanned: number[] } | undefined;

/** The Answer is exactly the equation's solution set (over one turn, or every solution). */
export function expectExactSolutions(prompt: string, answer: string): void {
  if (last?.prompt !== prompt) {
    const p = parsePrompt(prompt);
    last = { prompt, p, scanned: scannedSolutions(p) };
  }
  const { p, scanned } = last;
  const stated = statedSolutions(p, answer);
  for (const x of stated) expect(satisfies(p, x), `${prompt} at ${x}`).toBe(true);
  const span = (p.general ? p.turn : 2) * Math.PI;
  const statedHere = uniqSorted(stated, span);
  expect(statedHere.length, `${prompt}: stated ${answer}, scanned ${scanned.map((x) => (x / Math.PI).toFixed(4))}π`).toBe(
    scanned.length,
  );
  statedHere.forEach((x, i) => expect(close(x, scanned[i], 1e-6), `${prompt}: ${answer}`).toBe(true));
}

/** The stated solution set of a Distractor (same printing as the Answer), for comparing with it. */
export function hintSolutions(prompt: string, hint: string): number[] | null {
  const p = parsePrompt(prompt);
  if (hint === NO_SOLUTION) return [];
  try {
    const parts = rhsParts(hint);
    if (!p.general) return uniqSorted(parts.map((s) => evalLatex(s)), TAU);
    const pts: number[] = [];
    for (const fam of parts) for (let k = -16; k <= 16; k++) pts.push(evalLatex(fam, { k }));
    return uniqSorted(pts, p.turn * Math.PI);
  } catch {
    return null;
  }
}

export const sameNumbers = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => close(x, b[i], 1e-7));

/** A one-line description of a Problem for failure messages. */
const show = (p: { prompt: string; answer: string }) => `${p.prompt}  =>  ${p.answer}`;

/** Distractors: at least `min`, distinct as solution sets, never the Answer's set. */
export function expectSetDistractors(p: { prompt: string; answer: string; distractorHints: string[] }, min = 3): void {
  expect(p.distractorHints.length, show(p)).toBeGreaterThanOrEqual(min);
  const q = parsePrompt(p.prompt);
  const answer = statedSolutions(q, p.answer).sort((a, b) => a - b);
  const seen: number[][] = [];
  for (const d of p.distractorHints) {
    const v = hintSolutions(p.prompt, d);
    expect(v, d).not.toBeNull();
    expect(sameNumbers(v!, answer), `${d} vs ${show(p)}`).toBe(false);
    expect(seen.some((s) => sameNumbers(s, v!)), d).toBe(false);
    seen.push(v!);
  }
}

/** Cartesian product of the options offered by the four Topics. */
export function optionCombinations(schema: ParamSchema): ParamValues[] {
  let combinations: ParamValues[] = [{}];
  for (const field of schema) {
    const values = field.type === "enum" ? field.options.map((o) => o.value) : [true, false];
    combinations = combinations.flatMap((p) => values.map((value) => ({ ...p, [field.key]: value })));
  }
  return combinations;
}
