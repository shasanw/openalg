// "Simplifying radicals": \sqrt{72} = 6\sqrt{2}, -3\sqrt{50} = -15\sqrt{2},
// and opt-in cube roots (\sqrt[3]{-54} = -3\sqrt[3]{2}) and variables
// (\sqrt{18x^{5}y^{2}} = 3x^{2}y\sqrt{2x}, variables assumed positive).
//
// Built ANSWER-FROM-CONSTRUCTION: the number that comes out of the root, the
// power-free number left inside, each variable's exponent and the optional
// coefficient in front are chosen first; the radicand printed in the Problem
// is (outside)^n times what stays inside. Nothing is ever factored to find
// the Answer.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import {
  cubeRootsField,
  distinctValued,
  mono,
  pickIndex,
  pickPowerFree,
  simplifyTerm,
  term,
  termLatex,
  termValue,
  variablesField,
  type RadTerm,
  type RootIndex,
  type Valued,
} from "./radicalKit";

export const SIMPLIFYING_RADICALS_ID = "simplifying-radicals";

export const schema = [
  {
    type: "boolean",
    key: "coefficients",
    label: "Include a number in front, like 3√50",
    default: true,
  },
  {
    type: "int",
    key: "maxFactor",
    label: "Largest number that comes out of the root",
    min: 2,
    max: 12,
    default: 6,
  },
  cubeRootsField,
  variablesField,
] as const satisfies ParamSchema;

const LETTERS = ["x", "y"] as const;

export interface SimplifyConstruction {
  index: RootIndex;
  /** the coefficient printed in front (1 when none) */
  k: number;
  /** the whole number that comes out of the root (its sign carries a cube root's minus) */
  out: number;
  /** the power-free number left inside */
  inside: number;
  /** each variable's exponent in the printed radicand */
  vars: [string, number][];
}

export function construct(params: ParamValues, rng: Rng): SimplifyConstruction {
  const p = resolveParams(schema, params);
  const index = pickIndex(rng, p.cubeRoots as boolean);
  const maxFactor = p.maxFactor as number;
  // Cube roots grow fast: 12^3 * 22 is no worksheet number.
  const top = index === 3 ? Math.min(maxFactor, 5) : maxFactor;
  const vars: [string, number][] = [];
  if (p.variables) {
    const count = rng.bool(0.5) ? 1 : 2;
    for (const v of LETTERS.slice(0, count)) vars.push([v, rng.int(1, index === 2 ? 7 : 8)]);
    // something must come out of the root
    if (vars.every(([, e]) => e < index)) vars[0][1] = rng.int(index, index === 2 ? 7 : 8);
  }
  // With variables the number may already be simplest (\sqrt{5x^{3}}).
  let out = p.variables && rng.bool(0.25) ? 1 : rng.int(2, Math.max(2, top));
  // A perfect power now and then (\sqrt{144} = 12), but not one as plain as \sqrt{4}.
  const perfect = !p.variables && top >= 4 && rng.bool(0.1);
  if (perfect) out = rng.int(4, top);
  const inside = perfect ? 1 : pickPowerFree(rng, index, index === 2 ? 15 : 12);
  const negative = index === 3 && rng.bool(0.3);
  const k = p.coefficients && rng.bool(0.4) ? rng.int(2, 5) * (rng.bool(0.3) ? -1 : 1) : 1;
  return { index, k, out: negative ? -out : out, inside, vars };
}

/** The printed radicand: out^n * inside * vars. */
export function radicand(k: SimplifyConstruction): number {
  return k.out ** k.index * k.inside;
}

export function problemTerm(k: SimplifyConstruction): RadTerm {
  return term(k.k, k.index, mono(radicand(k), k.vars));
}

export function answerTerm(k: SimplifyConstruction): RadTerm {
  return simplifyTerm(problemTerm(k));
}

export const promptLatex = (k: SimplifyConstruction) => termLatex(problemTerm(k));
export const answerLatex = (k: SimplifyConstruction) => termLatex(answerTerm(k));

const valued = (t: RadTerm): Valued => ({ tex: termLatex(t), value: termValue(t) });

/**
 * Mistake-based Distractors, each a wrong value (a partly simplified form
 * equals the Answer, so it never appears):
 * - left the power outside: \sqrt{72} = \sqrt{36 \cdot 2} gives 36\sqrt{2};
 * - halved (or thirded) the power instead of taking its root: 18\sqrt{2};
 * - forgot the number in front: 6\sqrt{2} for 3\sqrt{72};
 * - added the number in front instead of multiplying: (3 + 6)\sqrt{2};
 * - dropped what stays inside: 6, or x^{2} for \sqrt{x^{5}};
 * - divided a variable's exponent without keeping the remainder inside;
 * - swapped what comes out and what stays in: 2\sqrt{6};
 * - lost the sign of a negative cube root.
 */
export function distractors(k: SimplifyConstruction): string[] {
  const answer = answerTerm(k);
  const n = k.index;
  const outVars = (f: (e: number) => number): [string, number][] => k.vars.map(([v, e]) => [v, f(e)]);
  const inVars: [string, number][] = k.vars.map(([v, e]) => [v, e % n]);
  const make = (coef: number, cv: [string, number][], inside: number, iv: [string, number][]) =>
    simplifyTerm(term(mono(coef, cv), n, mono(inside, iv)));
  const floor = (e: number) => Math.floor(e / n);
  const out = Math.abs(k.out);
  const sign = Math.sign(k.out);
  const candidates: (RadTerm | null)[] = [
    // the power left outside: out^n (and x^{e - e mod n})
    make(k.k * sign * out ** n, outVars((e) => e - (e % n)), k.inside, inVars),
    // halved the power: out^n / n
    (out ** n) % n === 0 ? make((k.k * sign * out ** n) / n, outVars(floor), k.inside, inVars) : null,
    k.k !== 1 ? make(sign * out, outVars(floor), k.inside, inVars) : null,
    k.k !== 1 ? make((k.k + out) * sign, outVars(floor), k.inside, inVars) : null,
    // dropped the leftover radicand
    make(k.k * k.out, outVars(floor), 1, []),
    // took half of every exponent, remainder lost: \sqrt{x^{5}} = x^{2}
    k.vars.length > 0 ? make(k.k * k.out, outVars(floor), k.inside, []) : null,
    // the exponent divided as a whole: \sqrt{x^{5}} = x^{\frac{5}{2}} read as x^{3}
    k.vars.length > 0 ? make(k.k * k.out, outVars((e) => Math.ceil(e / n)), k.inside, []) : null,
    // swapped outside and inside
    k.inside > 1 && out > 1 ? make(k.k * sign * k.inside, outVars(floor), out, inVars) : null,
    sign < 0 ? make(-k.k * k.out, outVars(floor), k.inside, inVars) : null,
    // a perfect cube read as a square root: \sqrt[3]{64} = 8
    n === 3 && k.inside === 1 && Number.isInteger(Math.sqrt(out ** 3)) ? make(k.k * sign * Math.sqrt(out ** 3), outVars(floor), 1, []) : null,
    // the sign of a cube root lost the other way
    n === 3 && sign > 0 ? make(-k.k * k.out, outVars(floor), k.inside, inVars) : null,
    make(k.k * k.out + (k.k * k.out > 0 ? 1 : -1), outVars(floor), k.inside, inVars),
    make(k.k * k.out - (k.k * k.out > 0 ? 1 : -1), outVars(floor), k.inside, inVars),
  ];
  return distinctValued(
    valued(answer),
    candidates.map((t) => (t ? valued(t) : null)),
  ).slice(0, 6);
}

export const generator: Generator = {
  id: SIMPLIFYING_RADICALS_ID,
  title: "Simplifying radicals",
  defaultDirections: "Simplify.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: SIMPLIFYING_RADICALS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
