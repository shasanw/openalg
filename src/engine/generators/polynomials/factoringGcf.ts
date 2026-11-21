// "Factoring out the greatest common factor": 12x^{3} - 18x^{2} + 6x is
// 6x(2x^{2} - 3x + 1).
//
// Built ANSWER-FROM-CONSTRUCTION: the GCF (a number, a power of x, or both)
// and the polynomial left inside are chosen first; what is left inside has
// coefficients with no common factor and a term without x, so the chosen GCF
// is the greatest by construction. The Problem is their product, multiplied
// out. Nothing is ever factored.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  coefGcd,
  expandFactored,
  factoredHints,
  factoredLatex,
  mono,
  mul,
  nonzero,
  norm,
  pickVars,
  shuffled,
  standardLatex,
  varyPolyVariableField,
  type Factored,
  type Mono,
} from "./polyKit";

export const FACTORING_GCF_ID = "factoring-gcf";

export const schema = [
  {
    type: "int",
    key: "terms",
    label: "Most terms",
    min: 2,
    max: 4,
    default: 3,
  },
  {
    type: "int",
    key: "maxGcf",
    label: "Largest number in the GCF",
    min: 2,
    max: 15,
    default: 8,
  },
  {
    type: "boolean",
    key: "variableGcf",
    label: "The GCF can include a variable",
    default: true,
  },
  {
    type: "boolean",
    key: "twoVariables",
    label: "Terms in two variables",
    default: false,
  },
  varyPolyVariableField,
] as const satisfies ParamSchema;

export interface GcfConstruction {
  vars: [string, string];
  gcf: Mono;
  inner: Mono[];
  expanded: Mono[];
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): GcfConstruction {
  const p = resolveParams(schema, params);
  const maxTerms = p.terms as number;
  const maxGcf = p.maxGcf as number;
  const variable = p.variableGcf as boolean;
  const two = p.twoVariables as boolean;
  const vars = pickVars(rng, p.varyVariable as boolean, two);

  for (let tries = 0; tries < 300; tries++) {
    const ex = variable ? rng.int(0, 3) : 0;
    const ey = variable && two ? rng.int(0, 2) : 0;
    const c = ex + ey === 0 ? rng.int(2, maxGcf) : rng.int(1, maxGcf);
    const gcf = mono(c, ex, ey);

    // The inside: distinct exponent pairs of degree at most 3, one free of v
    // (and one free of w), coefficients with no common factor.
    const n = rng.int(2, maxTerms);
    const pool: [number, number][] = [];
    for (let a = 0; a <= 3; a++) for (let b = 0; b <= (two ? 2 : 0); b++) if (a + b <= 3) pool.push([a, b]);
    const picked = shuffled(rng, pool).slice(0, n);
    if (!picked.some(([a]) => a === 0)) continue;
    if (two && !picked.some(([, b]) => b === 0)) continue;
    if (picked.every(([a, b]) => a + b === 0)) continue;
    const inner = norm(picked.map(([a, b]) => mono(nonzero(rng, 9), a, b)));
    if (inner.length < 2 || coefGcd(inner) !== 1) continue;
    // a leading minus would invite factoring out -GCF; keep the lead positive
    if (inner[0].c < 0) inner[0] = mono(-inner[0].c, ...inner[0].e);
    if (coefGcd(inner) !== 1) continue;
    return { vars, gcf, inner, expanded: mul([gcf], inner) };
  }
  const gcf = mono(2, 1);
  const inner = [mono(1, 1), mono(3)];
  return { vars, gcf, inner, expanded: mul([gcf], inner) };
}

export const answerLatex = (k: GcfConstruction) => factoredLatex({ g: k.gcf, factors: [k.inner] }, k.vars);

/**
 * Mistake-based Distractors, most diagnostic first (a choice equal in value
 * to the Answer, like a common factor that is not the greatest, is never
 * offered: it is not wrong, only unfinished):
 * - left the powers inside unreduced (divided only the numbers)
 * - divided only the variables (left the numbers inside unreduced)
 * - wrote only the number of the GCF, or only its variable part
 * - a term equal to the GCF left out, not written as 1
 * - a sign slip inside
 */
export function distractors(k: GcfConstruction): string[] {
  const { gcf: g, inner, vars } = k;
  const c: Factored[] = [];
  const at = (inside: Mono[], front = g): Factored => ({ g: front, factors: [inside] });
  if (g.e[0] + g.e[1] > 0) c.push(at(inner.map((t) => mono(t.c, t.e[0] + g.e[0], t.e[1] + g.e[1]))));
  if (g.c > 1) c.push(at(inner.map((t) => mono(t.c * g.c, ...t.e))));
  c.push(at(inner, mono(g.c)));
  c.push(at(inner, mono(1, ...g.e)));
  const one = inner.find((t) => t.e[0] + t.e[1] === 0 && Math.abs(t.c) === 1);
  if (one) c.push(at(inner.filter((t) => t !== one)));
  c.push(at(inner.map((t, i) => (i === inner.length - 1 ? mono(-t.c, ...t.e) : t))));
  c.push(at(inner.map((t, i) => (i === 0 ? t : mono(-t.c, ...t.e)))));
  if (inner.length > 2) c.push(at(inner.map((t, i) => (i === 1 ? mono(-t.c, ...t.e) : t))));
  const answer = answerLatex(k);
  return factoredHints(answer, expandFactored({ g, factors: [inner] }), c, vars);
}

export const generator: Generator = {
  id: FACTORING_GCF_ID,
  title: "Factoring out the greatest common factor",
  defaultDirections: "Factor out the greatest common factor.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const k = construct(params, createRng(seed));
    return {
      kind: "generated",
      generatorId: FACTORING_GCF_ID,
      params: resolveParams(schema, params),
      seed,
      prompt: standardLatex(k.expanded, k.vars),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
