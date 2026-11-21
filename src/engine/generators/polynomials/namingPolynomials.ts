// "Naming polynomials": name each polynomial by its degree and its number of
// terms, e.g. 4x^{3} - 2x + 7 is a "cubic trinomial".
//
// Built ANSWER-FROM-CONSTRUCTION: the degree and the number of terms (the
// Answer) are chosen first, then a polynomial with exactly that degree and
// that many terms is drawn, already combined, so no like terms hide a
// different count. Out of standard form (an option) the terms are shuffled so
// that the highest-degree term is not first.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints } from "../shared/equationKit";
import { mono, nonzero, pickVars, polyLatex, shuffled, termDegree, varyPolyVariableField, type Mono } from "./polyKit";

export const NAMING_POLYNOMIALS_ID = "naming-polynomials";

export const schema = [
  {
    type: "int",
    key: "maxDegree",
    label: "Highest degree",
    min: 1,
    max: 8,
    default: 5,
  },
  {
    type: "int",
    key: "maxTerms",
    label: "Most terms",
    min: 1,
    max: 6,
    default: 4,
  },
  {
    type: "boolean",
    key: "standardForm",
    label: "Always written in standard form",
    default: true,
  },
  {
    type: "boolean",
    key: "twoVariables",
    label: "Terms in two variables (degree is the sum of the exponents)",
    default: false,
  },
  varyPolyVariableField,
] as const satisfies ParamSchema;

const DEGREE_NAMES = ["constant", "linear", "quadratic", "cubic", "quartic", "quintic"];
// Past the named degrees and term counts, numerals keep every name short
// enough to sit beside its choice letter in a half-page column: "degree 7
// polynomial, 8 terms" rather than "seventh degree polynomial with eight terms".
export function degreeName(d: number): string {
  return d < DEGREE_NAMES.length ? DEGREE_NAMES[d] : `degree ${d}`;
}

export function termsName(n: number): string {
  if (n === 1) return "monomial";
  if (n === 2) return "binomial";
  if (n === 3) return "trinomial";
  return `polynomial, ${n} terms`;
}

export const nameLatex = (d: number, n: number) => `\\text{${degreeName(d)} ${termsName(n)}}`;

export interface NamingConstruction {
  degree: number;
  terms: number;
  vars: [string, string];
  /** in printed order */
  poly: Mono[];
}

/** The exponent pairs of total degree t (one variable: just [t, 0]). */
function shapes(t: number, two: boolean): [number, number][] {
  if (!two) return [[t, 0]];
  const out: [number, number][] = [];
  for (let a = 0; a <= t; a++) out.push([a, t - a]);
  return out;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): NamingConstruction {
  const p = resolveParams(schema, params);
  const maxDegree = p.maxDegree as number;
  const maxTerms = p.maxTerms as number;
  const two = p.twoVariables as boolean;
  const vars = pickVars(rng, p.varyVariable as boolean, two);

  // A constant ("-6, a constant monomial") now and then, when a monomial may be asked for.
  const degree = rng.int(0, 11) === 0 ? 0 : rng.int(1, maxDegree);
  // One variable has only degree + 1 possible terms.
  const most = degree === 0 ? 1 : Math.min(maxTerms, two ? maxTerms : degree + 1);
  // monomials are the easy case: draw again once, so they come up less often
  let terms = rng.int(1, most);
  if (terms === 1 && degree > 0) terms = rng.int(1, most);

  // The leading term has the full degree; the others have distinct exponent
  // pairs of lower or equal degree, so nothing combines.
  const leadShapes = shapes(degree, two);
  const lead = rng.pick(leadShapes);
  const pool: [number, number][] = [];
  for (let t = 0; t <= degree; t++) for (const s of shapes(t, two)) if (s[0] !== lead[0] || s[1] !== lead[1]) pool.push(s);
  const rest = shuffled(rng, pool).slice(0, terms - 1);
  const ordered = [lead, ...rest].sort((a, b) => b[0] + b[1] - (a[0] + a[1]) || b[0] - a[0]);
  let poly = ordered.map(([a, b]) => mono(nonzero(rng, 9), a, b));
  if (poly[0].c < 0 && rng.bool()) poly[0] = mono(-poly[0].c, ...poly[0].e);

  if (!p.standardForm && poly.length > 1) {
    // Out of order, and never with a highest-degree term first.
    const mixed = shuffled(rng, poly);
    if (termDegree(mixed[0]) === degree) {
      const k = mixed.findIndex((t) => termDegree(t) < degree);
      if (k > 0) [mixed[0], mixed[k]] = [mixed[k], mixed[0]];
    }
    poly = mixed;
  }
  return { degree, terms: poly.length, vars, poly };
}

/**
 * Mistake-based Distractors, most diagnostic first:
 * - read the degree off the first term, not the highest (out of standard form)
 * - took the largest single exponent, not the sum (two variables)
 * - confused "quadratic" (2) with "quartic" (4), as quad- suggests four
 * - used the number of terms as the degree
 * - did not count the constant as a term
 * - expected degree + 1 terms (a full polynomial)
 * then the neighbouring names, so there are always enough.
 */
export function distractors(k: NamingConstruction): string[] {
  const { degree: d, terms: n } = k;
  const c: [number, number][] = [];
  const first = termDegree(k.poly[0]);
  if (first !== d) c.push([first, n]);
  const single = Math.max(...k.poly.flatMap((t) => t.e));
  if (single !== d) c.push([single, n]);
  if (d === 2) c.push([4, n]);
  if (d === 4) c.push([2, n]);
  if (n !== d && n >= 1) c.push([n, n]);
  if (n > 1 && k.poly.some((t) => termDegree(t) === 0)) c.push([d, n - 1]);
  c.push([d, d + 1]);
  c.push([d + 1, n], [d, n + 1], [Math.max(0, d - 1), n], [d, Math.max(1, n - 1)], [d + 1, n + 1], [d + 2, n], [d + 2, n + 1], [d + 3, n]);
  const answer = nameLatex(d, n);
  return distinctHints(
    answer,
    c.filter(([dd, nn]) => !(dd === 0 && nn > 1)).map(([dd, nn]) => nameLatex(dd, nn)),
  );
}

export const generator: Generator = {
  id: NAMING_POLYNOMIALS_ID,
  title: "Naming polynomials",
  defaultDirections: "Name each polynomial by its degree and number of terms.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const k = construct(params, createRng(seed));
    return {
      kind: "generated",
      generatorId: NAMING_POLYNOMIALS_ID,
      params: resolveParams(schema, params),
      seed,
      prompt: polyLatex(k.poly, k.vars),
      answer: nameLatex(k.degree, k.terms),
      distractorHints: distractors(k),
    };
  },
};
