// "Adding and subtracting polynomials": (3x^{2} - 5x + 2) - (x^{2} + 4x - 7).
//
// Built ANSWER-FROM-CONSTRUCTION: a set of terms (the like terms the two
// polynomials share) is chosen, then the Answer A and the second polynomial Q
// on it; the first polynomial is P = A - Q for a sum or P = A + Q for a
// difference, so P ± Q is A by construction. Nothing is simplified after the
// fact.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import {
  add,
  groupLatex,
  mono,
  neg,
  nonzero,
  norm,
  pickVars,
  polyHints,
  shuffled,
  standardLatex,
  sub,
  varyPolyVariableField,
  type Mono,
  type Poly,
} from "./polyKit";

export const ADDING_POLYNOMIALS_ID = "adding-subtracting-polynomials";

export type Operation = "mixed" | "add" | "subtract";

export const schema = [
  {
    type: "enum",
    key: "operation",
    label: "Operation",
    default: "mixed",
    options: [
      { value: "mixed", label: "Adding and subtracting" },
      { value: "add", label: "Adding only" },
      { value: "subtract", label: "Subtracting only" },
    ],
  },
  {
    type: "int",
    key: "maxDegree",
    label: "Highest degree",
    min: 1,
    max: 6,
    default: 3,
  },
  {
    type: "int",
    key: "terms",
    label: "Most terms in each polynomial",
    min: 2,
    max: 5,
    default: 3,
  },
  {
    type: "int",
    key: "maxCoefficient",
    label: "Largest coefficient",
    min: 3,
    max: 20,
    default: 9,
  },
  {
    type: "boolean",
    key: "twoVariables",
    label: "Terms in two variables",
    default: false,
  },
  varyPolyVariableField,
] as const satisfies ParamSchema;

export interface AddingConstruction {
  subtract: boolean;
  vars: [string, string];
  p: Mono[];
  q: Mono[];
  answer: Mono[];
}

/** Exponent pairs of total degree at most d (one variable: [k, 0]). */
function shapesUpTo(d: number, two: boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let t = 0; t <= d; t++) {
    if (!two) out.push([t, 0]);
    else for (let a = 0; a <= t; a++) out.push([a, t - a]);
  }
  return out;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): AddingConstruction {
  const p = resolveParams(schema, params);
  const op = p.operation as Operation;
  const maxDegree = p.maxDegree as number;
  const maxTerms = p.terms as number;
  const C = p.maxCoefficient as number;
  const two = p.twoVariables as boolean;
  const vars = pickVars(rng, p.varyVariable as boolean, two);
  const subtract = op === "subtract" || (op === "mixed" && rng.bool());

  for (let tries = 0; tries < 400; tries++) {
    const all = shapesUpTo(maxDegree, two);
    // The shared terms, the leading one of full degree.
    const top = all.filter(([a, b]) => a + b === maxDegree);
    const lead = rng.pick(top);
    const others = shuffled(
      rng,
      all.filter((s) => s !== lead),
    );
    const n = rng.int(2, maxTerms);
    const support = [lead, ...others.slice(0, n - 1)];
    // Q uses at least two of them; A uses them all (some may cancel in P).
    const q = norm(shuffled(rng, support).slice(0, rng.int(2, n)).map(([a, b]) => mono(nonzero(rng, C), a, b)));
    const answer = norm(support.map(([a, b]) => mono(nonzero(rng, C), a, b)));
    const pp = subtract ? add(answer, q) : sub(answer, q);
    if (pp.length < 2 || pp.length > maxTerms) continue;
    if (pp.some((t) => Math.abs(t.c) > C)) continue;
    // The two must share at least one like term, or there is nothing to combine.
    if (!pp.some((t) => q.some((u) => u.e[0] === t.e[0] && u.e[1] === t.e[1]))) continue;
    if (answer.length < 1) continue;
    return { subtract, vars, p: pp, q, answer };
  }
  // A safe fallback (practically unreachable): (2x + 3) ± (x + 1).
  const pp = [mono(2, 1), mono(3)];
  const q = [mono(1, 1), mono(1)];
  return { subtract, vars, p: pp, q, answer: subtract ? sub(pp, q) : add(pp, q) };
}

export function promptLatex(k: AddingConstruction): string {
  return `(${standardLatex(k.p, k.vars)}) ${k.subtract ? "-" : "+"} ${groupLatex(k.q, k.vars)}`;
}

const isLike = (a: Mono, b: Mono) => a.e[0] === b.e[0] && a.e[1] === b.e[1];

/**
 * Mistake-based Distractors, most diagnostic first:
 * - subtracting: changed the sign of only the first term of the second polynomial
 * - subtracting: added instead; adding: subtracted instead
 * - added the exponents when combining like terms (x^{2} + x^{2} = 2x^{4})
 * - dropped a term that had no like term to combine with
 * - a sign slip on the constant (or last) term
 */
export function distractors(k: AddingConstruction): string[] {
  const { p, q, answer, vars } = k;
  const c: (Poly | null)[] = [];
  if (k.subtract) c.push(norm([...p, ...neg(q.slice(0, 1)), ...q.slice(1)]));
  c.push(k.subtract ? add(p, q) : sub(p, q));
  const signed = k.subtract ? neg(q) : q;
  // Like terms present in both, combined with doubled exponents.
  const doubled = norm(
    answer.map((t) => {
      const both = p.some((u) => isLike(u, t)) && signed.some((u) => isLike(u, t));
      return both && t.e[0] + t.e[1] > 0 ? mono(t.c, 2 * t.e[0], 2 * t.e[1]) : t;
    }),
  );
  c.push(doubled);
  const lonely = [...p, ...signed].find((t) => !p.some((u) => isLike(u, t)) || !signed.some((u) => isLike(u, t)));
  if (lonely) c.push(answer.filter((t) => !isLike(t, lonely)));
  c.push(answer.map((t, i) => (i === answer.length - 1 ? mono(-t.c, ...t.e) : t)));
  c.push(answer.map((t, i) => (i === 0 ? mono(-t.c, ...t.e) : t)));
  return polyHints(answer, c, vars);
}

export const generator: Generator = {
  id: ADDING_POLYNOMIALS_ID,
  title: "Adding and subtracting polynomials",
  defaultDirections: "Simplify each expression.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const k = construct(params, createRng(seed));
    return {
      kind: "generated",
      generatorId: ADDING_POLYNOMIALS_ID,
      params: resolveParams(schema, params),
      seed,
      prompt: promptLatex(k),
      answer: standardLatex(k.answer, k.vars),
      distractorHints: distractors(k),
    };
  },
};
