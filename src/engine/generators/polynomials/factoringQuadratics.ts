// "Factoring quadratic expressions": x^{2} - x - 12 = (x + 3)(x - 4) and,
// with a leading coefficient other than 1, 6x^{2} + x - 2 = (2x - 1)(3x + 2).
// Options add a common factor to take out first, two variables, and prime
// trinomials that do not factor.
//
// Built ANSWER-FROM-CONSTRUCTION: the factors (px + q)(rx + s) and any common
// factor are chosen first and multiplied out to make the Problem. A prime
// trinomial is chosen with a discriminant b^{2} - 4ac that is not a perfect
// square, which is what makes it prime; nothing is ever factored or solved.

import { createRng, type Rng } from "../../rng";
import { gcd } from "../../format";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  expandFactored,
  factoredHints,
  factoredLatex,
  mono,
  nonzero,
  pickVars,
  standardLatex,
  varyPolyVariableField,
  type Factored,
  type Mono,
} from "./polyKit";
import { isPerfectSquare } from "../../quadratics";

export const FACTORING_QUADRATICS_ID = "factoring-quadratics";

export type Leading = "mixed" | "one" | "other";

export const PRIME = "\\text{prime}";

export const schema = [
  {
    type: "enum",
    key: "leading",
    label: "Leading coefficient",
    default: "mixed",
    options: [
      { value: "mixed", label: "Mixed" },
      { value: "one", label: "a = 1" },
      { value: "other", label: "a ≠ 1" },
    ],
  },
  {
    type: "int",
    key: "maxConstant",
    label: "Largest constant in a factor",
    min: 2,
    max: 15,
    default: 9,
  },
  {
    type: "int",
    key: "maxLeading",
    label: "Largest leading coefficient in a factor (a ≠ 1)",
    min: 2,
    max: 6,
    default: 3,
  },
  {
    type: "boolean",
    key: "commonFactor",
    label: "Include a common factor to take out first",
    default: false,
  },
  {
    type: "boolean",
    key: "prime",
    label: "Include some prime trinomials",
    default: false,
  },
  {
    type: "boolean",
    key: "twoVariables",
    label: "Two variables, like x^2 + 5xy + 6y^2",
    default: false,
  },
  varyPolyVariableField,
] as const satisfies ParamSchema;

/** p·v + q (or p·v + q·w): a linear factor. */
export const linear = (p: number, q: number, two: boolean): Mono[] => [mono(p, 1), mono(q, 0, two ? 1 : 0)];

export interface QuadraticFactoringConstruction {
  vars: [string, string];
  two: boolean;
  /** the common factor taken out first (1 for none) */
  g: number;
  /** [p, q, r, s] for (pv + q)(rv + s); null for a prime trinomial */
  factors: [number, number, number, number] | null;
  /** the trinomial as printed: a v^2 + b v + c */
  a: number;
  b: number;
  c: number;
}

export function trinomial(k: Pick<QuadraticFactoringConstruction, "a" | "b" | "c" | "two">): Mono[] {
  return [mono(k.a, 2), mono(k.b, 1, k.two ? 1 : 0), mono(k.c, 0, k.two ? 2 : 0)];
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): QuadraticFactoringConstruction {
  const p = resolveParams(schema, params);
  const leading = p.leading as Leading;
  const C = p.maxConstant as number;
  const L = p.maxLeading as number;
  const two = p.twoVariables as boolean;
  const vars = pickVars(rng, p.varyVariable as boolean, two);
  const monic = leading === "one" || (leading === "mixed" && rng.bool());
  const g = p.commonFactor && rng.bool(0.6) ? rng.int(2, 5) : 1;

  const pickLeads = (): [number, number] => {
    if (monic) return [1, 1];
    for (;;) {
      const pp = rng.int(1, L);
      const rr = rng.int(1, L);
      if (pp * rr >= 2) return pp <= rr ? [pp, rr] : [rr, pp];
    }
  };

  if (p.prime && rng.bool(0.3)) {
    for (let tries = 0; tries < 200; tries++) {
      const [pp, rr] = pickLeads();
      const a = pp * rr;
      const b = nonzero(rng, 2 * C);
      const c = nonzero(rng, C * 2);
      const D = b * b - 4 * a * c;
      if (isPerfectSquare(D)) continue;
      if (gcd(gcd(a, b), c) !== 1) continue;
      // No common factor: 2x^2 + 4x + 6 factors as 2(x^2 + 2x + 3), so it is not prime.
      const k = { vars, two, g: 1, factors: null, a, b, c };
      // enough near-miss factor pairs to offer as Distractors
      if (distractors(k, true).length < 4) continue;
      return k;
    }
  }

  for (let tries = 0; tries < 500; tries++) {
    const [pp, rr] = pickLeads();
    const q = nonzero(rng, C);
    const s = nonzero(rng, C);
    if (gcd(pp, q) !== 1 || gcd(rr, s) !== 1) continue;
    const mid = pp * s + q * rr;
    // no middle term is a difference of squares (Factoring special cases)
    if (mid === 0) continue;
    return { vars, two, g, factors: [pp, q, rr, s], a: g * pp * rr, b: g * mid, c: g * q * s };
  }
  return { vars, two, g, factors: [1, 2, 1, 3], a: g, b: 5 * g, c: 6 * g };
}

export function factoredOf(k: QuadraticFactoringConstruction, f = k.factors!, g = k.g): Factored {
  const [pp, q, rr, s] = f;
  return { g: mono(g), factors: [linear(pp, q, k.two), linear(rr, s, k.two)] };
}

export const answerLatex = (k: QuadraticFactoringConstruction) =>
  k.factors ? factoredLatex(factoredOf(k), k.vars) : PRIME;

/** (p', r', m, n) with p'r' = a and mn = c whose middle p'n + r'm is not b,
 * nearest middle first: the "picked the wrong factor pair" mistake. */
export function wrongPairs(a: number, b: number, c: number): [number, number, number, number][] {
  const out: { f: [number, number, number, number]; miss: number }[] = [];
  const divisors = (n: number) => {
    const ds: number[] = [];
    for (let d = 1; d <= Math.abs(n); d++) if (n % d === 0) ds.push(d);
    return ds;
  };
  for (const pp of divisors(a)) {
    const rr = a / pp;
    if (pp > rr) continue;
    for (const d of divisors(c)) {
      for (const m of [d, -d]) {
        const n = c / m;
        const mid = pp * n + rr * m;
        // the right pair, and the right pair with both signs wrong (offered on its own)
        if (mid === b || mid === -b) continue;
        out.push({ f: [pp, m, rr, n], miss: Math.abs(mid - b) });
      }
    }
  }
  return out
    .sort((x, y) => x.miss - y.miss || x.f[1] - y.f[1] || x.f[0] - y.f[0])
    .map((x) => x.f);
}

/**
 * Mistake-based Distractors, most diagnostic first:
 * - both signs wrong, (x - 3)(x + 4) for (x + 3)(x - 4)
 * - a factor pair with the right product and the wrong sum
 * - one sign wrong
 * - a ≠ 1: the constants placed in the wrong factors
 * - forgot the common factor taken out first
 * - "prime" for one that factors (when prime trinomials are in play)
 * - the coefficients b and c written into the factors
 * A prime trinomial's Distractors are the nearest wrong factor pairs.
 */
export function distractors(k: QuadraticFactoringConstruction, primeInPlay: boolean): string[] {
  const answer = answerLatex(k);
  const base = { a: k.a / k.g, b: k.b / k.g, c: k.c / k.g };
  const pairs = wrongPairs(base.a, base.b, base.c);
  const c: (Factored | string)[] = [];
  if (!k.factors) {
    for (const f of pairs.slice(0, 6)) c.push(factoredOf(k, f));
    return factoredHints(answer, null, c, k.vars);
  }
  const [pp, q, rr, s] = k.factors;
  c.push(factoredOf(k, [pp, -q, rr, -s]));
  if (pairs[0]) c.push(factoredOf(k, pairs[0]));
  c.push(factoredOf(k, [pp, q, rr, -s]));
  c.push(factoredOf(k, [pp, -q, rr, s]));
  if (pp !== rr) c.push(factoredOf(k, [pp, s, rr, q]));
  if (k.g > 1) c.push(factoredOf(k, k.factors, 1));
  if (pairs[1]) c.push(factoredOf(k, pairs[1]));
  if (primeInPlay) c.push(PRIME);
  // wrote the coefficients themselves into the factors: (x + b)(x + c)
  c.push(factoredOf(k, [1, base.b, base.a, base.c]));
  for (const f of pairs.slice(2, 5)) c.push(factoredOf(k, f));
  return factoredHints(answer, expandFactored(factoredOf(k)), c, k.vars);
}

export const generator: Generator = {
  id: FACTORING_QUADRATICS_ID,
  title: "Factoring quadratic expressions",
  defaultDirections: "Factor each completely.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: FACTORING_QUADRATICS_ID,
      params: resolved,
      seed,
      prompt: standardLatex(trinomial(k), k.vars),
      answer: answerLatex(k),
      distractorHints: distractors(k, resolved.prime as boolean),
    };
  },
};
