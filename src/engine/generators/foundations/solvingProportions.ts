// "Solving proportions": \frac{x}{6} = \frac{4}{3}, \frac{x + 2}{5} = \frac{3}{4},
// or with the variable on both sides, \frac{x + 1}{3} = \frac{x - 4}{2}.
//
// Built ANSWER-FIRST: the solution x is chosen first. For one unknown slot
// the slot's value v = mx + q is computed, and the three given numbers are
// found so that the cross products agree (v \cdot A = B \cdot C, all whole
// numbers). With the variable on both sides, the coefficients and the two
// denominators are drawn and the constants are found so that both sides
// agree at x. Nothing is solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  add,
  distinctHints,
  div,
  isInt,
  linearLatex,
  mul,
  neg,
  pickVariable,
  rat,
  solutionHint,
  solutionLatex,
  sub,
  varyVariableField,
  type NumberStyle,
  type Rat,
} from "../shared/equationKit";

export const SOLVING_PROPORTIONS_ID = "solving-proportions";

export type Form = "simple" | "expression" | "bothSides";
export type Solutions = "integer" | "fraction" | "decimal";

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Unknown",
    default: "simple",
    options: [
      { value: "simple", label: "The variable alone" },
      { value: "expression", label: "An expression like x + 3" },
      { value: "bothSides", label: "The variable on both sides" },
    ],
  },
  {
    type: "enum",
    key: "solutions",
    label: "Solutions",
    default: "integer",
    options: [
      { value: "integer", label: "Integers" },
      { value: "fraction", label: "Fractions" },
      { value: "decimal", label: "Decimals" },
    ],
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative numbers",
    default: false,
  },
  {
    type: "int",
    key: "maxNumber",
    label: "Largest given number",
    min: 6,
    max: 50,
    default: 15,
  },
  varyVariableField,
] as const satisfies ParamSchema;

/** m \cdot x + q in one slot of the proportion. */
export interface Linear {
  m: number;
  q: number;
}

/** A slot holds a given whole number or an expression in x. */
export type Slot = { given: number } | { expr: Linear };

/** The structured construction, a/b = c/d as [a, b, c, d]. Exposed for property tests. */
export interface ProportionConstruction {
  v: string;
  slots: [Slot, Slot, Slot, Slot];
  /** the Answer */
  x: Rat;
  style: NumberStyle;
}

const isExpr = (s: Slot): s is { expr: Linear } => "expr" in s;

/** The diagonal partner of each slot: a \cdot d = b \cdot c. */
const DIAGONAL = [3, 2, 1, 0] as const;

function drawSolution(rng: Rng, solutions: Solutions, max: number, negOk: boolean): Rat {
  const sign = negOk && rng.bool(0.4) ? -1 : 1;
  switch (solutions) {
    case "integer":
      return rat(sign * rng.int(2, max));
    case "fraction": {
      for (;;) {
        const d = rng.int(2, 7);
        const r = rat(rng.int(1, d * Math.min(max, 6)), d);
        if (!isInt(r)) return rat(sign * r.n, r.d);
      }
    }
    case "decimal": {
      // halves, quarters, fifths and tenths: answers that terminate
      for (;;) {
        const d = rng.pick([2, 4, 5, 10]);
        const r = rat(rng.int(1, d * Math.min(max, 12)), d);
        if (!isInt(r)) return rat(sign * r.n, r.d);
      }
    }
  }
}

const evalLinear = (e: Linear, x: Rat): Rat => add(mul(rat(e.m), x), rat(e.q));

/** One unknown slot: find givens A (its diagonal partner), B and C with v \cdot A = B \cdot C. */
function oneSlot(rng: Rng, x: Rat, expr: Linear, M: number, negOk: boolean): ProportionConstruction["slots"] | null {
  const v = evalLinear(expr, x);
  if (v.n === 0 || v.d > M) return null;
  // A must clear v's denominator; try a few
  for (let tries = 0; tries < 30; tries++) {
    const A = v.d * rng.int(1, Math.max(1, Math.floor(M / v.d)));
    if (A < 2 && rng.bool(0.8)) continue;
    const N = mul(v, rat(A)); // B \cdot C, a whole number
    const target = Math.abs(N.n);
    const divs: number[] = [];
    for (let b = 2; b <= Math.min(M, target); b++) if (target % b === 0 && target / b <= M && target / b >= 1) divs.push(b);
    if (divs.length === 0) continue;
    const B = rng.pick(divs);
    let C = target / B;
    if (N.n < 0) {
      // a negative cross product: one given is negative (only with negatives on)
      if (!negOk) return null;
      C = -C;
    }
    const s = rng.int(0, 3);
    const slots: Slot[] = [];
    slots[s] = { expr };
    slots[DIAGONAL[s]] = { given: A };
    const rest = [0, 1, 2, 3].filter((i) => i !== s && i !== DIAGONAL[s]);
    // a negative given sits in a numerator (\frac{-4}{3}, never \frac{4}{-3})
    let [b, c] = rng.bool() ? [B, C] : [C, B];
    if ((b < 0 && rest[0] % 2 === 1) || (c < 0 && rest[1] % 2 === 1)) [b, c] = [c, b];
    slots[rest[0]] = { given: b };
    slots[rest[1]] = { given: c };
    return slots as ProportionConstruction["slots"];
  }
  return null;
}

/** Both sides: (m1 x + a) / B = (m2 x + c) / D, or the expressions in the denominators. */
function bothSides(rng: Rng, x: Rat, M: number, negOk: boolean): ProportionConstruction["slots"] | null {
  const m1 = rng.pick([1, 1, 2, 3]);
  const m2 = rng.pick([1, 1, 2, 3]);
  const B = rng.int(2, Math.min(M, 9));
  const D = rng.int(2, Math.min(M, 9));
  const K = m1 * D - m2 * B; // (m1 D - m2 B) x = cB - aD
  if (K === 0 || B === D) return null;
  const rhs = mul(rat(K), x);
  if (!isInt(rhs)) return null;
  const range = Math.min(M, 12);
  const as = Array.from({ length: 2 * range + 1 }, (_, i) => i - range).filter((a) => a !== 0);
  for (let tries = 0; tries < 30; tries++) {
    const a = rng.pick(as);
    const cb = rhs.n + a * D;
    if (cb % B !== 0) continue;
    const c = cb / B;
    if (c === 0 || Math.abs(c) > range || c === a) continue;
    const top: Linear = { m: m1, q: a };
    const bottom: Linear = { m: m2, q: c };
    // the expressions' values must not vanish (they may sit in a denominator)
    if (evalLinear(top, x).n === 0 || evalLinear(bottom, x).n === 0) continue;
    if (!negOk && (a < 0 || c < 0 || x.n < 0)) continue;
    // numerators (B and D below) or denominators (B and D above): B/(x + a) = D/(x + c) is the same equation
    return rng.bool(0.7)
      ? [{ expr: top }, { given: B }, { expr: bottom }, { given: D }]
      : [{ given: B }, { expr: top }, { given: D }, { expr: bottom }];
  }
  return null;
}

/**
 * A proportion that can be read off without working: a given 1, a given
 * fraction equal to 1 (\frac{15}{15}), or matching denominators or numerators
 * across the equals sign (\frac{x}{5} = \frac{12}{5}).
 */
export function trivial(slots: readonly Slot[]): boolean {
  const g = (i: number) => (isExpr(slots[i]) ? null : (slots[i] as { given: number }).given);
  if (slots.some((_, i) => Math.abs(g(i) ?? 2) === 1)) return true;
  for (const [i, j] of [
    [0, 1],
    [2, 3],
    [0, 2],
    [1, 3],
  ]) {
    if (g(i) !== null && Math.abs(g(i)!) === Math.abs(g(j) ?? NaN)) return true;
  }
  return false;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): ProportionConstruction {
  const p = resolveParams(schema, params);
  const form = p.form as Form;
  const solutions = p.solutions as Solutions;
  const negOk = p.allowNegatives as boolean;
  const M = p.maxNumber as number;
  const v = pickVariable(rng, p.varyVariable as boolean);
  const style: NumberStyle = solutions === "decimal" ? "decimal" : "fraction";

  for (let attempt = 0; attempt < 2000; attempt++) {
    const x = drawSolution(rng, solutions, form === "simple" ? M : Math.min(M, 12), negOk);
    let slots: ProportionConstruction["slots"] | null;
    if (form === "bothSides") slots = bothSides(rng, x, M, negOk);
    else {
      const expr: Linear =
        form === "simple"
          ? { m: 1, q: 0 }
          : { m: rng.pick([1, 1, 2, 3, 4]), q: rng.int(1, 9) * (rng.bool(negOk ? 0.5 : 0.3) ? -1 : 1) };
      slots = oneSlot(rng, x, expr, M, negOk);
      // the expression's own value must stay positive without negatives: x - 7 with x = 3 is not
      if (slots && !negOk && evalLinear(expr, x).n < 0) slots = null;
    }
    if (!slots) continue;
    if (!negOk && x.n < 0) continue;
    if (trivial(slots)) continue;
    return { v, slots, x, style };
  }
  // Practically unreachable: x/2 = (x)/2 cannot happen; use a fixed friendly proportion.
  const x = rat(6);
  return { v, slots: [{ expr: { m: 1, q: 0 } }, { given: 4 }, { given: 3 }, { given: 2 }], x, style };
}

// ------------------------------------------------------------------ printing

function slotLatex(s: Slot, v: string): string {
  if (!isExpr(s)) return String(s.given);
  return linearLatex([
    { coef: rat(s.expr.m), v },
    { coef: rat(s.expr.q), v: "" },
  ]);
}

export function promptLatex(k: ProportionConstruction): string {
  const [a, b, c, d] = k.slots.map((s) => slotLatex(s, k.v));
  return `\\frac{${a}}{${b}} = \\frac{${c}}{${d}}`;
}

// ------------------------------------------------------------------ mistakes

/**
 * Solve a (mis-written) linear equation p x + r = s x + t for x, or null
 * when it has no single solution. Used only for Distractors, which model a
 * student's working; the Answer is never found this way.
 */
function solveLinear(p: Rat, r: Rat, s: Rat, t: Rat): Rat | null {
  return div(sub(t, r), sub(p, s));
}

/** coef \cdot expr as (x-coefficient, constant); a given slot has no x. */
function asLinear(s: Slot): { m: Rat; q: Rat } {
  return isExpr(s) ? { m: rat(s.expr.m), q: rat(s.expr.q) } : { m: rat(0), q: rat(s.given) };
}

/** product of two slots where at most one has x: (m, q) times a number. */
function times(s: Slot, t: Slot, distribute = true): { m: Rat; q: Rat } {
  const [e, n] = isExpr(s) ? [asLinear(s), asLinear(t).q] : [asLinear(t), asLinear(s).q];
  // forgot to distribute: 5(x + 2) as 5x + 2
  return { m: mul(e.m, n), q: distribute ? mul(e.q, n) : e.q };
}

/** Cross products set equal: pair (i, j) against pair (k, l). */
function crossSolve(k: ProportionConstruction, [i, j]: [number, number], [p, q]: [number, number], distribute = true): Rat | null {
  const s = k.slots;
  const both = (a: number, b: number) =>
    isExpr(s[a]) && isExpr(s[b]) ? null : times(s[a], s[b], distribute);
  const L = both(i, j);
  const R = both(p, q);
  if (!L || !R) return null;
  return solveLinear(L.m, L.q, R.m, R.q);
}

/** Additive thinking: \frac{x}{6} = \frac{4}{3} read as "6 is 3 more than 3, so x is 4 + 3". */
function additive(k: ProportionConstruction): Rat | null {
  const [a, b, c, d] = k.slots.map(asLinear);
  // a - b = c - d
  return solveLinear(sub(a.m, b.m), sub(a.q, b.q), sub(c.m, d.m), sub(c.q, d.q));
}

/** The value of the unknown expression, not x itself (stopped one step short). */
function stoppedAtExpression(k: ProportionConstruction): Rat | null {
  const exprs = k.slots.filter(isExpr);
  if (exprs.length !== 1 || (exprs[0].expr.m === 1 && exprs[0].expr.q === 0)) return null;
  return evalLinear(exprs[0].expr, k.x);
}

/** Moved the constant without changing its sign: x + 2 = 7.5 answered 9.5. */
function constantSignSlip(k: ProportionConstruction): Rat | null {
  const exprs = k.slots.filter(isExpr);
  if (exprs.length !== 1 || exprs[0].expr.q === 0) return null;
  const e = exprs[0].expr;
  return div(add(evalLinear(e, k.x), rat(e.q)), rat(e.m));
}

/**
 * Slips made after cross-multiplying correctly to p x + r = s x + t: moving
 * the constant without changing its sign, or the variable term without
 * changing its sign.
 */
function movingSlips(k: ProportionConstruction): (Rat | null)[] {
  const s = k.slots;
  const L = isExpr(s[0]) && isExpr(s[3]) ? null : times(s[0], s[3]);
  const R = isExpr(s[1]) && isExpr(s[2]) ? null : times(s[1], s[2]);
  if (!L || !R) return [];
  return [
    L.q.n === 0 && R.q.n === 0 ? null : div(add(R.q, L.q), sub(L.m, R.m)),
    L.m.n === 0 || R.m.n === 0 ? null : div(sub(R.q, L.q), add(L.m, R.m)),
  ];
}

/** Would this value look like the Answer's kind of number (so it does not give itself away)? */
function plausible(k: ProportionConstruction, r: Rat | null): r is Rat {
  if (!r) return false;
  if (isInt(k.x)) return isInt(r) || r.d <= 4;
  return r.d <= 30;
}

/**
 * Mistake-based Distractors: cross-multiplied straight across (a \cdot c =
 * b \cdot d) or multiplied the wrong pair, thought additively (the same
 * difference on both sides), forgot to distribute over a binomial, stopped at
 * the value of the expression instead of x, moved a constant or a variable
 * term without changing its sign, a sign slip on the Answer, and dividing
 * the wrong way at the last step (the reciprocal).
 */
export function distractors(k: ProportionConstruction, negativesOnSheet = true): string[] {
  const values: (Rat | null)[] = [
    crossSolve(k, [0, 2], [1, 3]),
    crossSolve(k, [0, 1], [2, 3]),
    additive(k),
    crossSolve(k, [0, 3], [1, 2], false),
    stoppedAtExpression(k),
    constantSignSlip(k),
    ...movingSlips(k),
    neg(k.x),
    // divided the wrong way at the last step: 6x = 4 answered \frac{6}{4}
    Math.abs(k.x.n) === 1 && k.x.d === 1 ? null : div(rat(1), k.x),
  ];
  return distinctHints(
    solutionLatex(k.v, k.x, k.style),
    // a negative choice on a sheet with no negative numbers gives itself away
    values
      // (solving a binomial proportion can land anywhere, so a negative choice is fair there)
      .filter((r) => plausible(k, r) && (negativesOnSheet || k.slots.some((s) => "expr" in s && s.expr.q !== 0) || r!.n > 0))
      .map((r) => solutionHint(k.v, r, k.style)),
  );
}

export const generator: Generator = {
  id: SOLVING_PROPORTIONS_ID,
  title: "Solving proportions",
  defaultDirections: "Solve each proportion.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: SOLVING_PROPORTIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: solutionLatex(k.v, k.x, k.style),
      distractorHints: distractors(k, resolved.allowNegatives as boolean),
    };
  },
};
