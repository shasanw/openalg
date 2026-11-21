// Shared by the four identity Topics' printed-Answer checkers
// (fundamentalIdentities, sumDifferenceIdentities, multipleAngleIdentities and
// productToSum .answer.testkit.ts). Reads ONLY the printed prompt and Answer
// strings: never the generators or trigKit. Values are evaluated with Math;
// rewrites at several random x.

import { expect } from "vitest";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { createRng } from "../../rng";
import type { Problem } from "../../types";
import { close, evalLatex, type Env } from "../shared/latexEval.testkit";

const QUADRANTS = ["I", "II", "III", "IV"];

/**
 * Read a stated value like "\sin \alpha = -\frac{3}{5}, \ \alpha \text{ in }
 * \text{Quadrant III}" (or a range "\pi < \theta < \frac{3\pi}{2}"), find the
 * one angle in that quadrant or range with that value, and bind it in env.
 */
function readGiven(given: string, env: Env): void {
  const match = /^\\(sin|cos|tan|sec|csc|cot) \\(theta|alpha|beta) = (.+), \\ (.+)$/.exec(given);
  expect(match, `unknown given: ${given}`).not.toBeNull();
  const [, fn, variable, value, location] = match!;
  const quadrant = /^\\(\w+) \\text\{ in \} \\text\{Quadrant (I|II|III|IV)\}$/.exec(location);
  let lo: number, hi: number;
  if (quadrant) {
    expect(quadrant[1]).toBe(variable);
    lo = (QUADRANTS.indexOf(quadrant[2]) * Math.PI) / 2;
    hi = lo + Math.PI / 2;
  } else {
    const [lower, name, upper] = location.split(" < ");
    expect(name).toBe(`\\${variable}`);
    lo = evalLatex(lower);
    hi = evalLatex(upper);
  }
  const v = Math.abs(evalLatex(value));
  const reference = {
    sin: Math.asin(v),
    cos: Math.acos(v),
    tan: Math.atan(v),
    csc: Math.asin(1 / v),
    sec: Math.acos(1 / v),
    cot: Math.atan(1 / v),
  }[fn]!;
  // a strictly-inside angle: a quadrantal value would make the quadrant meaningless
  expect(reference > 1e-9 && reference < Math.PI / 2 - 1e-9, given).toBe(true);
  const angle = [reference, Math.PI - reference, Math.PI + reference, 2 * Math.PI - reference].find(
    (t) => t > lo && t < hi,
  );
  expect(angle, `${given}: the value's sign does not fit the quadrant`).toBeDefined();
  env[variable] = angle!;
  expect(close(evalLatex(`\\${fn} \\${variable}`, env), evalLatex(value))).toBe(true);
}

/** Random x away from multiples of π/2 (where tan, sec, csc and cot blow up), in every quadrant. */
export function samples(seed: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: 8 }, (_, i) => ((i - 4) * Math.PI) / 2 + 0.13 + rng.next() * 1.25);
}

export interface Printed {
  /** the stated values (with their quadrant or range), empty when there are none */
  givens: string[];
  /** what is asked for: the expression itself, or each "find" item */
  asked: string[];
  /** the Answer's right-hand side for each asked item */
  answers: string[];
  /** whether the Problem is a rewrite in x (else every value is a number) */
  inX: boolean;
}

/**
 * Split the printed Problem and check that each printed Answer equals what
 * is asked, numerically: at the angles the givens pin down, at several x for
 * a rewrite, or by direct evaluation of an exact value.
 */
export function expectPrintedValues(p: Problem): Printed {
  const parts = p.prompt.split(ANSWER_PART_SEPARATOR);
  const last = parts.pop()!;
  const givens = parts;
  const env: Env = {};
  for (const g of givens) readGiven(g, env);
  const find = /^\\text\{find \} (.+)$/.exec(last);
  if (givens.length > 0) expect(find, p.prompt).not.toBeNull();
  const asked = find ? find[1].split(", ") : [last];
  const answerParts = p.answer.split(ANSWER_PART_SEPARATOR);
  expect(answerParts.length, p.prompt).toBe(asked.length);
  // the variable x, not the x of a command like \text or \alpha
  const hasX = (tex: string) => /x/.test(tex.replace(/\\[a-zA-Z]+/g, ""));
  const inX = hasX(last);
  const answers = answerParts.map((part, i) => {
    const sides = part.split(" = ");
    // a single asked expression's Answer is bare; several are labelled
    if (asked.length > 1) {
      expect(sides.length, part).toBe(2);
      expect(sides[0]).toBe(asked[i]);
    } else expect(sides.length, part).toBe(1);
    const rhs = sides[sides.length - 1];
    if (!inX) expect(hasX(rhs), part).toBe(false);
    for (const x of inX ? samples(p.seed) : [0]) {
      const vars = { ...env, x };
      const want = evalLatex(asked[i], vars);
      const got = evalLatex(rhs, vars);
      expect(Number.isFinite(want), `${p.prompt} is undefined`).toBe(true);
      expect(close(want, got, 1e-9), `${p.prompt}: ${asked[i]} is ${want}, the Answer ${rhs} is ${got}`).toBe(true);
    }
    return rhs;
  });
  return { givens, asked, answers, inX };
}

/** The values a choice takes (at the sample x for a rewrite), for telling choices apart. */
export function choiceValues(tex: string, seed: number): number[] {
  return tex.split(ANSWER_PART_SEPARATOR).flatMap((part) => {
    const rhs = part.split(" = ").pop()!;
    return (rhs.includes("x") ? samples(seed) : [0]).map((x) => evalLatex(rhs, { x }));
  });
}

// ------------------------------------------------------------------ simplest form

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const isSquareFree = (n: number) => {
  for (let k = 2; k * k <= n; k++) if (n % (k * k) === 0) return false;
  return true;
};
const isSquare = (n: number) => n >= 0 && Number.isInteger(Math.sqrt(n));

/**
 * An exact number in simplest form: an integer, a fraction in lowest terms, a
 * sum of distinct square-free radicals (and at most one integer) over a
 * positive integer, or a nested radical √(a ± b√r)/d that does not denest
 * (a² - b²r not a perfect square). No radical in a denominator, no trig, π,
 * decimals or variables.
 */
export function expectSimplestExact(tex: string): void {
  expect(tex, tex).not.toMatch(/\\(?:sin|cos|tan|csc|sec|cot|pi|theta|alpha|beta)|\.|x|undefined/);
  let s = tex;
  let outerNeg = false;
  const frac = /^(-?)\\frac\{(.+)\}\{(\d+)\}$/.exec(s);
  let d = 1;
  if (frac) {
    outerNeg = frac[1] === "-";
    s = frac[2];
    d = Number(frac[3]);
    expect(d, tex).toBeGreaterThan(1);
  }
  const nested = /^(-?)\\sqrt\{(\d+) ([+-]) (\d*)\\sqrt\{(\d+)\}\}$/.exec(s);
  if (nested) {
    expect(frac ? nested[1] : "", tex).toBe("");
    const a = Number(nested[2]);
    const b = nested[4] === "" ? 1 : Number(nested[4]);
    const r = Number(nested[5]);
    expect(r > 1 && isSquareFree(r), tex).toBe(true);
    expect(a * a > b * b * r, `${tex}: the radicand is not positive`).toBe(true);
    expect(isSquare(a * a - b * b * r), `${tex}: the nested radical denests`).toBe(false);
    for (let k = 2; k * k <= a; k++) expect(a % (k * k) === 0 && b % (k * k) === 0, `${tex}: a square comes out`).toBe(false);
    if (d > 1) {
      // √(a ± b√r)/d with 4 | a, b and d even would simplify too
      expect(d % 2 === 0 && a % 4 === 0 && b % 4 === 0, tex).toBe(false);
    }
    return;
  }
  const pieces = s.split(/ ([+-]) /);
  const terms: { c: number; r: number }[] = [];
  for (let i = 0; i < pieces.length; i += 2) {
    let t = pieces[i];
    let sign = i === 0 ? 1 : pieces[i - 1] === "-" ? -1 : 1;
    if (t.startsWith("-")) {
      expect(i, `${tex}: a minus sign inside a term`).toBe(0);
      sign = -1;
      t = t.slice(1);
    }
    const m = /^(?:(\d*)\\sqrt\{(\d+)\}|(\d+))$/.exec(t);
    expect(m, `${tex}: "${t}" is not an integer or a radical`).not.toBeNull();
    if (m![3] !== undefined) terms.push({ c: sign * Number(m![3]), r: 1 });
    else {
      const c = m![1] === "" ? 1 : Number(m![1]);
      expect(m![1] === "1", `${tex}: coefficient 1 printed`).toBe(false);
      const r = Number(m![2]);
      expect(r > 1 && isSquareFree(r), `${tex}: √${r} is not simplified`).toBe(true);
      terms.push({ c: sign * c, r });
    }
  }
  expect(new Set(terms.map((t) => t.r)).size, `${tex}: like terms not combined`).toBe(terms.length);
  for (const t of terms) expect(t.c, `${tex}: a zero term`).not.toBe(0);
  if (frac) {
    expect(terms[0].c > 0, `${tex}: a fraction's numerator starts with a minus`).toBe(true);
    if (outerNeg) expect(terms.every((t) => t.c > 0), `${tex}: the minus is factored out only from all terms`).toBe(true);
  }
  expect(terms.reduce((g, t) => gcd(g, t.c), d), `${tex}: not in lowest terms`).toBe(1);
}

/** Whether an angle (radians) is a multiple of 30° or 45°, so a table gives its values. */
export const isStandardAngle = (a: number): boolean =>
  [Math.PI / 6, Math.PI / 4].some((u) => Math.abs(a / u - Math.round(a / u)) < 1e-9);

/** The numeric angles printed in a prompt, in radians: 75^{\circ}, -105^{\circ}, \frac{7\pi}{12}, -\frac{5\pi}{12}. */
export function printedAngles(prompt: string): number[] {
  const re = /-?\d+(?:\.\d+)?\^\{\\circ\}|-?\\frac\{\d*\\pi\}\{\d+\}|-?\d*\\pi(?![}\w])/g;
  return [...prompt.matchAll(re)].map((m) => evalLatex(m[0]));
}

/** The trig function names printed in a LaTeX string, in order. */
export const trigNames = (tex: string): string[] =>
  [...tex.matchAll(/\\(sin|cos|tan|csc|sec|cot)\b/g)].map((m) => m[1]);
