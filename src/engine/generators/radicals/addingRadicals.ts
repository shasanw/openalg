// "Adding and subtracting radicals": 3\sqrt{2} - \sqrt{8} + 2\sqrt{18}
// simplifies each term and combines like radicals into 7\sqrt{2}. Opt-in
// radicals that don't all combine (2\sqrt{12} + \sqrt{5} - \sqrt{3} =
// 3\sqrt{3} + \sqrt{5}), cube roots and variables (assumed positive).
//
// Built ANSWER-FROM-CONSTRUCTION: each like group's simplified radical (the
// power-free radicand, with any variables) is chosen first; then each term
// gets its coefficient k and a hidden factor s that is written under the
// root (k\sqrt{s^2 b}), so the group's Answer coefficient is the sum of k*s.
// Groups whose coefficients cancel are redrawn. Nothing is ever factored.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  combine,
  cubeRootsField,
  distinctValued,
  mono,
  pickIndex,
  pickPowerFree,
  sumLatex,
  term,
  valuedSum,
  variablesField,
  varsKey,
  type RadTerm,
  type RootIndex,
} from "./radicalKit";

export const ADDING_RADICALS_ID = "adding-radicals";

export const schema = [
  {
    type: "int",
    key: "terms",
    label: "Terms",
    min: 2,
    max: 4,
    default: 3,
  },
  {
    type: "boolean",
    key: "simplifyFirst",
    label: "Terms need simplifying first",
    default: true,
  },
  {
    type: "boolean",
    key: "unlike",
    label: "Include radicals that don't all combine",
    default: false,
  },
  cubeRootsField,
  variablesField,
] as const satisfies ParamSchema;

/** One like group: the simplified radical every one of its terms becomes. */
export interface Group {
  b: number;
  /** the variable's exponent left inside (0 for none) */
  e: number;
  /** the variable's exponent outside the root in the Answer (0 or 1) */
  J: number;
}

/** One printed term: k * x^(J - t) * root(s^n * x^(t n) * b x^e). */
export interface AddTerm {
  group: number;
  k: number;
  s: number;
  t: number;
}

export interface AddConstruction {
  index: RootIndex;
  v: string;
  groups: Group[];
  terms: AddTerm[];
}

export function printedTerm(k: AddConstruction, a: AddTerm): RadTerm {
  const g = k.groups[a.group];
  const n = k.index;
  return term(mono(a.k, [[k.v, g.J - a.t]]), n, mono(a.s ** n * g.b, [[k.v, a.t * n + g.e]]));
}

/** The Answer's term for a group, given its coefficient. */
function groupTerm(k: AddConstruction, group: number, coef: number, inside = k.groups[group].b): RadTerm {
  const g = k.groups[group];
  return term(mono(coef, [[k.v, g.J]]), k.index, mono(inside, [[k.v, g.e]]));
}

const groupSum = (k: AddConstruction, group: number, f: (a: AddTerm) => number) =>
  k.terms.filter((a) => a.group === group).reduce((s, a) => s + f(a), 0);

function attempt(p: ParamValues, rng: Rng): AddConstruction | null {
  const index = pickIndex(rng, p.cubeRoots as boolean);
  const n = p.terms as number;
  const variables = p.variables as boolean;
  const simplify = p.simplifyFirst as boolean;
  const G = p.unlike && n >= 3 && rng.bool(0.7) ? 2 : 1;
  const groups: Group[] = [];
  while (groups.length < G) {
    const b = pickPowerFree(rng, index, index === 2 ? 15 : 12);
    if (groups.some((g) => g.b === b)) continue;
    groups.push({ b, e: variables ? rng.int(1, index - 1) : 0, J: variables && rng.bool(0.5) ? 1 : 0 });
  }
  const terms: AddTerm[] = [];
  for (let i = 0; i < n; i++) {
    const group = i < G ? i : rng.int(0, G - 1);
    const s = simplify && rng.bool(0.65) ? rng.int(2, index === 2 ? 4 : 3) : 1;
    const k = rng.int(1, 6) * (i > 0 && rng.bool(0.4) ? -1 : 1);
    // a variable written under the root needs simplifying too
    const t = simplify && groups[group].J === 1 && rng.bool() ? 1 : 0;
    terms.push({ group, k, s, t });
  }
  // shuffle the order the terms are printed in
  for (let i = terms.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [terms[i], terms[j]] = [terms[j], terms[i]];
  }
  const k: AddConstruction = { index, v: "x", groups, terms };
  if (simplify && terms.every((a) => a.s === 1)) return null;
  // every group combines to something, and something combines
  for (let g = 0; g < G; g++) if (groupSum(k, g, (a) => a.k * a.s) === 0) return null;
  if (G === n) return null;
  // no two printed terms alike in every way
  const printed = terms.map((a) => printedTerm(k, a));
  const bodies = printed.map((t) => sumLatex([t]).replace(/^-/, ""));
  if (new Set(bodies).size !== bodies.length) return null;
  // keep the radicands readable, and let them look different when there is simplifying to do
  if (printed.some((t) => t.rad.n > (index === 2 ? 150 : 200))) return null;
  if (simplify && new Set(printed.map((t) => `${t.rad.n}${t.rad.vars}`)).size < 2) return null;
  return k;
}

export function construct(params: ParamValues, rng: Rng): AddConstruction {
  const p = resolveParams(schema, params);
  for (;;) {
    const k = attempt(p, rng);
    if (k) return k;
  }
}

export const promptTerms = (k: AddConstruction): RadTerm[] => k.terms.map((a) => printedTerm(k, a));
export const answerTerms = (k: AddConstruction): RadTerm[] => combine(promptTerms(k));

export const promptLatex = (k: AddConstruction) => sumLatex(promptTerms(k));
export const answerLatex = (k: AddConstruction) => sumLatex(answerTerms(k));

/**
 * Mistake-based Distractors, each a wrong value:
 * - added the radicands as well as the coefficients: \sqrt{2} + \sqrt{8} = \sqrt{10}
 *   (only when every term shares a group and there are no variables);
 * - simplified each term but forgot to multiply by what came out: k\sqrt{s^2 b} as k\sqrt{b};
 * - brought out s^2 instead of s;
 * - lost a subtraction sign on the last term;
 * - combined radicals that are not alike (with two groups).
 */
export function distractors(k: AddConstruction): string[] {
  const G = k.groups.length;
  const n = k.index;
  const perGroup = (f: (a: AddTerm) => number) =>
    combine(k.groups.map((_, g) => groupTerm(k, g, groupSum(k, g, f))));
  const last = k.terms[k.terms.length - 1];
  const candidates: RadTerm[][] = [];
  const printed = k.terms.map((a) => printedTerm(k, a));
  const sameVars = printed.every((t) => varsKey(t.rad.vars) === varsKey(printed[0].rad.vars) && varsKey(t.coef.vars) === varsKey(printed[0].coef.vars));
  if (G === 1 && sameVars) {
    const coef = k.terms.reduce((s, a) => s + a.k, 0);
    const inside = printed.reduce((s, t) => s + t.rad.n, 0);
    if (coef !== 0) candidates.push(combine([term(mono(coef, printed[0].coef.vars), n, mono(inside, printed[0].rad.vars))]));
  }
  // added the variables outside as well: x\sqrt{3x} + 2x\sqrt{3x} = 3x^{2}\sqrt{3x}
  if (k.groups.some((g) => g.J === 1))
    candidates.push(combine(k.groups.map((g, i) => term(mono(groupSum(k, i, (a) => a.k * a.s), [[k.v, 2 * g.J]]), n, mono(g.b, [[k.v, g.e]])))));
  candidates.push(perGroup((a) => a.k));
  candidates.push(perGroup((a) => a.k * a.s ** n));
  candidates.push(perGroup((a) => (a === last ? -1 : 1) * a.k * a.s));
  if (G === 2) {
    const total = k.terms.reduce((s, a) => s + a.k * a.s, 0);
    candidates.push(combine([groupTerm(k, 0, total)]), combine([groupTerm(k, 1, total)]));
  }
  candidates.push(perGroup((a) => -a.k * a.s));
  candidates.push(perGroup((a) => a.k * a.s + (a === last ? 1 : 0)));
  // fallbacks for when nothing needs simplifying and the coefficients are small (everything above coincides):
  // signs ignored, the last term dropped, and a coefficient one too small
  candidates.push(perGroup((a) => Math.abs(a.k) * a.s));
  candidates.push(perGroup((a) => (a === last ? 0 : a.k * a.s)));
  candidates.push(perGroup((a) => a.k * a.s + (a === last ? -1 : 0)));
  return distinctValued(
    valuedSum(answerTerms(k)),
    candidates.filter((c) => c.length > 0).map(valuedSum),
  ).slice(0, 6);
}

export const generator: Generator = {
  id: ADDING_RADICALS_ID,
  title: "Adding and subtracting radicals",
  defaultDirections: "Simplify.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: ADDING_RADICALS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
