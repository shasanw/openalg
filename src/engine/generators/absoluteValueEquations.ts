// "Solving absolute value equations": |bx + c| = k, or a|bx + c| + d = e when
// the absolute value must be isolated first, with optional one-solution
// (|bx + c| = 0) and no-solution (|bx + c| = negative) cases.
//
// Built ANSWER-FROM-CONSTRUCTION. For two solutions, the numerators
// n1 > n2 (with x = n/b) are chosen first, with the same parity; then
// c = -(n1 + n2)/2 and k = (n1 - n2)/2 are whole numbers and bx + c = ±k gives
// exactly x = n1/b and n2/b. One solution chooses x0 and sets c = -b·x0, k = 0;
// no solution chooses any c and a negative k. Isolating is undone forwards:
// e = a·k + d. Nothing is ever solved.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import {
  ALL_REALS,
  distinctHints,
  linearLatex,
  neg,
  NO_SOLUTION,
  nonzeroInt,
  pickVariable,
  rat,
  solutionsLatex,
  varyVariableField,
  type Rat,
} from "./equationKit";

export const ABSOLUTE_VALUE_EQUATIONS_ID = "absolute-value-equations";

export type FormMode = "mixed" | "isolated" | "notIsolated";
export type Solutions = "integer" | "fraction";
export type Outcome = "two" | "one" | "none";

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Absolute value",
    default: "mixed",
    options: [
      { value: "mixed", label: "Isolated or not" },
      { value: "isolated", label: "Already isolated, like |x - 3| = 5" },
      { value: "notIsolated", label: "Isolate it first, like 2|x - 3| + 1 = 11" },
    ],
  },
  {
    type: "boolean",
    key: "innerCoefficient",
    label: "Allow a coefficient inside the bars, like |2x - 3|",
    default: true,
  },
  {
    type: "enum",
    key: "solutions",
    label: "Solutions",
    default: "integer",
    options: [
      { value: "integer", label: "Integers" },
      { value: "fraction", label: "Fractions" },
    ],
  },
  {
    type: "boolean",
    key: "oneSolution",
    label: "Include one-solution cases, like |x - 4| = 0",
    default: false,
  },
  {
    type: "boolean",
    key: "noSolution",
    label: "Include no-solution cases, like |x + 2| = -5",
    default: false,
  },
  {
    type: "boolean",
    key: "negativeOutside",
    label: "Allow a negative number in front of the bars",
    default: false,
  },
  {
    type: "int",
    key: "maxSolution",
    label: "Largest solution",
    min: 2,
    max: 30,
    default: 10,
  },
  varyVariableField,
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface AbsConstruction {
  outcome: Outcome;
  v: string;
  /** a|bx + c| + d = e; isolated means a = 1 and d = 0 */
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  /** the value |bx + c| must take once isolated: (e - d)/a, a whole number */
  k: number;
  /** the Answer's solutions, ascending (empty for no solution) */
  solutions: Rat[];
}

/** Two distinct integers in [-M, M] passing `ok`, larger first. */
function distinctPair(rng: Rng, M: number, ok: (n1: number, n2: number) => boolean): [number, number] {
  for (;;) {
    const p = rng.int(-M, M);
    const q = rng.int(-M, M);
    if (p === q) continue;
    const [n1, n2] = p > q ? [p, q] : [q, p];
    if (ok(n1, n2)) return [n1, n2];
  }
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): AbsConstruction {
  const p = resolveParams(schema, params);
  const S = p.maxSolution as number;
  const fractions = p.solutions === "fraction";
  const v = pickVariable(rng, p.varyVariable as boolean);

  const specials: Outcome[] = [];
  if (p.oneSolution) specials.push("one");
  if (p.noSolution) specials.push("none");
  const outcome: Outcome = specials.length > 0 && rng.bool(0.2 * specials.length) ? rng.pick(specials) : "two";

  // Fraction solutions need a coefficient inside the bars, whatever the
  // inner-coefficient option says.
  const b = fractions ? rng.int(2, 6) : p.innerCoefficient && rng.bool() ? rng.int(2, 5) : 1;

  let c: number;
  let k: number;
  let solutions: Rat[];
  switch (outcome) {
    case "two": {
      // x = n/b with n1 - n2 even (so c and k are whole numbers); integer
      // solutions need b | n, fraction solutions at least one b ∤ n. The
      // solutions are never opposites (c = 0, |x| = 7): too few mistakes to
      // make for a multiple-choice Problem.
      let n1: number;
      let n2: number;
      if (fractions) {
        [n1, n2] = distinctPair(
          rng,
          S * b,
          (x, y) => x + y !== 0 && (x - y) % 2 === 0 && (x % b !== 0 || y % b !== 0),
        );
      } else {
        const [x1, x2] = distinctPair(rng, S, (x, y) => x + y !== 0 && (b * (x - y)) % 2 === 0);
        [n1, n2] = [b * x1, b * x2];
      }
      c = -(n1 + n2) / 2 + 0;
      k = (n1 - n2) / 2;
      solutions = [rat(n2, b), rat(n1, b)];
      break;
    }
    case "one": {
      // x0 = n/b, nonzero (|x| = 0 is no exercise)
      let n: number;
      if (fractions) {
        n = nonzeroInt(rng, 1, S * b, true);
        if (n % b === 0) n -= n > 0 ? 1 : -1; // toward zero keeps |x0| <= S
      } else n = b * nonzeroInt(rng, 1, S, true);
      c = -n;
      k = 0;
      solutions = [rat(n, b)];
      break;
    }
    case "none": {
      c = rng.int(-S, S);
      k = -rng.int(1, S);
      solutions = [];
      break;
    }
  }

  const isolated = p.form === "isolated" || (p.form === "mixed" && rng.bool());
  let a = 1;
  let d = 0;
  if (!isolated) {
    a = rng.int(1, 5);
    if (p.negativeOutside && rng.bool(0.4)) a = -a;
    d = Math.abs(a) >= 2 && rng.bool(0.25) ? 0 : nonzeroInt(rng, 1, 9, true);
  }
  return { outcome, v, a, b, c, d, e: a * k + d, k, solutions };
}

// ------------------------------------------------------------------ rendering

export function promptLatex(k: AbsConstruction): string {
  const inner = linearLatex([
    { coef: rat(k.b), v: k.v },
    { coef: rat(k.c), v: "" },
  ]);
  // \lvert and \rvert, not plain bars: mitex then spaces them as opening and
  // closing delimiters, so 3|4x + 2| never reads as "3 divides ..."
  const bars = `\\lvert ${inner} \\rvert`;
  const front = k.a === 1 ? "" : k.a === -1 ? "-" : String(k.a);
  const tail = k.d === 0 ? "" : ` ${k.d < 0 ? "-" : "+"} ${Math.abs(k.d)}`;
  return `${front}${bars}${tail} = ${k.e}`;
}

export function answerLatex(k: AbsConstruction): string {
  if (k.outcome === "none") return NO_SOLUTION;
  return solutionsLatex(k.v, k.solutions);
}

// ------------------------------------------------------------------ distractors

/**
 * Mistake-based Distractors, most common first. Two solutions:
 * - with a negative in front, gave up at |...| = negative before dividing by
 *   it ("no solution");
 * - split into cases before isolating: a(bx + c) + d = ±e;
 * - negated only the constant for the second case: |x + 3| = 5 solved as
 *   x + 3 = 5 or x - 3 = 5;
 * - kept only the positive case;
 * - sign errors on both solutions;
 * - subtracted d after dividing by a while isolating;
 * - wrote the positive solution and its opposite;
 * - forgot to divide by the coefficient inside the bars.
 * One solution: "no solution" (|...| = 0 read as impossible), the solution
 * and its opposite, a sign error, and forgetting to divide by b.
 * No solution: solved |bx + c| = k as if k were positive (both cases, or one).
 * Distinct, and never equal to the Answer.
 */
export function distractors(k: AbsConstruction): string[] {
  const { a, b, c, d, e, v } = k;
  const x = (n: number, den = b) => rat(n, den);
  const set = (...xs: Rat[]) => solutionsLatex(v, xs);
  const answer = answerLatex(k);
  const isolated = a === 1 && d === 0;
  const out: string[] = [];

  if (k.outcome === "two") {
    const [lo, hi] = k.solutions;
    const pos = hi; // from bx + c = k (and lo from bx + c = -k)
    if (!isolated && a < 0 && e - d < 0) out.push(NO_SOLUTION);
    if (!isolated) {
      // a(bx + c) + d = ±e
      out.push(set(x(e - d - a * c, a * b), x(-e - d - a * c, a * b)));
    }
    if (c !== 0) out.push(set(pos, x(k.k + c))); // bx - c = k
    out.push(set(pos)); // only the positive case
    out.push(set(neg(lo), neg(hi)));
    if (!isolated && a !== 1 && d !== 0) {
      // (e / a) - d instead of (e - d) / a
      const kk = rat(e - d * a, a);
      out.push(set(rat(kk.n - c * kk.d, kk.d * b), rat(-kk.n - c * kk.d, kk.d * b)));
    }
    out.push(set(pos, neg(pos)));
    if (b !== 1) out.push(set(rat(k.k - c), rat(-k.k - c))); // forgot to divide by b
    out.push(set(lo)); // only the negative case
  } else if (k.outcome === "one") {
    const [x0] = k.solutions;
    out.push(NO_SOLUTION, set(x0, neg(x0)), set(neg(x0)));
    if (b !== 1) out.push(set(rat(-c))); // forgot to divide by b
    out.push(`${v} = 0`, ALL_REALS);
  } else {
    const m = Math.abs(k.k);
    out.push(set(x(m - c), x(-m - c)), set(x(m - c)), set(x(-m - c)), ALL_REALS, `${v} = 0`);
  }
  return distinctHints(answer, out);
}

export const generator: Generator = {
  id: ABSOLUTE_VALUE_EQUATIONS_ID,
  title: "Solving absolute value equations",
  defaultDirections: "Solve each equation.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: ABSOLUTE_VALUE_EQUATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
