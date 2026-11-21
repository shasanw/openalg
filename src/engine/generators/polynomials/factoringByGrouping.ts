// "Factoring by grouping": four-term polynomials whose two pairs share a
// binomial factor. Three forms:
// - cubic:       6x^{3} - 9x^{2} + 4x - 6 = (3x^{2} + 2)(2x - 3)
// - quadratic:   the middle term already split, 2x^{2} + 6x + x + 3 = (2x + 1)(x + 3)
// - two variables: xy + 3x + 2y + 6 = (x + 2)(y + 3)
//
// Built ANSWER-FROM-CONSTRUCTION: the two factors (and any common factor) are
// chosen first, and the four partial products are printed in grouping order
// without combining them. Nothing is ever factored.

import { createRng, type Rng } from "../../rng";
import { gcd } from "../../format";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  expandFactored,
  factoredHints,
  factoredLatex,
  mono,
  mulMono,
  nonzero,
  pickVars,
  polyLatex,
  varyPolyVariableField,
  type Factored,
  type Mono,
} from "./polyKit";

export const FACTORING_BY_GROUPING_ID = "factoring-by-grouping";

export type GroupingForm = "mixed" | "cubic" | "quadratic" | "twoVariables";

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Polynomials",
    default: "mixed",
    options: [
      { value: "mixed", label: "Mixed" },
      { value: "cubic", label: "Cubics, like 2x^3 + 6x^2 + 5x + 15" },
      { value: "quadratic", label: "Split middle terms, like 2x^2 + 6x + x + 3" },
      { value: "twoVariables", label: "Two variables, like xy + 3x + 2y + 6" },
    ],
  },
  {
    type: "int",
    key: "maxLeading",
    label: "Largest leading coefficient in a factor",
    min: 1,
    max: 6,
    default: 3,
  },
  {
    type: "int",
    key: "maxConstant",
    label: "Largest constant in a factor",
    min: 2,
    max: 12,
    default: 8,
  },
  {
    type: "boolean",
    key: "commonFactor",
    label: "Include a common factor to take out first",
    default: false,
  },
  varyPolyVariableField,
] as const satisfies ParamSchema;

export interface GroupingConstruction {
  form: Exclude<GroupingForm, "mixed">;
  vars: [string, string];
  g: number;
  /** (p·A + q)(r·B + s), where A and B are the variable parts of the forms */
  p: number;
  q: number;
  r: number;
  s: number;
}

/** The two variable parts [A, B] of the form's factors (A·p + q)(B·r + s). */
function parts(form: GroupingConstruction["form"]): [Mono, Mono] {
  if (form === "cubic") return [mono(1, 2), mono(1, 1)];
  if (form === "quadratic") return [mono(1, 1), mono(1, 1)];
  return [mono(1, 1), mono(1, 0, 1)];
}

export function factoredOf(k: GroupingConstruction, f = [k.p, k.q, k.r, k.s], g = k.g, swap = false): Factored {
  const [A, B] = swap ? parts(k.form).reverse() : parts(k.form);
  const [p, q, r, s] = f;
  return { g: mono(g), factors: [[mono(p, ...A.e), mono(q)], [mono(r, ...B.e), mono(s)]] };
}

/** The four terms in grouping order: pA·rB, pA·s, q·rB, q·s (times g). */
export function fourTerms(k: GroupingConstruction): Mono[] {
  const [A, B] = parts(k.form);
  const first = [mono(k.g * k.p, ...A.e), mono(k.g * k.q)];
  const second = [mono(k.r, ...B.e), mono(k.s)];
  return first.flatMap((t) => second.map((u) => mulMono(t, u)));
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): GroupingConstruction {
  const pr = resolveParams(schema, params);
  const choice = pr.form as GroupingForm;
  const L = pr.maxLeading as number;
  const C = pr.maxConstant as number;
  const form = choice === "mixed" ? rng.pick(["cubic", "cubic", "quadratic", "twoVariables"] as const) : choice;
  const vars = pickVars(rng, pr.varyVariable as boolean, form === "twoVariables");
  const g = pr.commonFactor && rng.bool(0.6) ? rng.int(2, 4) : 1;
  for (let tries = 0; tries < 300; tries++) {
    const p = rng.int(1, L);
    const r = rng.int(1, L);
    const q = nonzero(rng, C);
    const s = nonzero(rng, C);
    if (gcd(p, q) !== 1 || gcd(r, s) !== 1) continue;
    // a split middle must not cancel (or be two equal halves of nothing to group)
    if (form === "quadratic" && (p * s === q * r || p * s === -q * r)) continue;
    return { form, vars, g, p, q, r, s };
  }
  return { form, vars, g, p: 1, q: 2, r: 1, s: 3 };
}

export const answerLatex = (k: GroupingConstruction) => factoredLatex(factoredOf(k), k.vars);

/**
 * Mistake-based Distractors, most diagnostic first:
 * - a sign slip factoring the second pair: (pA - q)(rB + s), the classic
 *   mistake when the third term is negative
 * - the sign of the shared binomial wrong: (pA + q)(rB - s)
 * - both signs wrong
 * - the constants swapped between the factors
 * - the power on the wrong factor (cubic): (px + q)(rx^{2} + s)
 * - forgot the common factor taken out first
 */
export function distractors(k: GroupingConstruction): string[] {
  const { p, q, r, s } = k;
  const c: Factored[] = [
    factoredOf(k, [p, -q, r, s]),
    factoredOf(k, [p, q, r, -s]),
    factoredOf(k, [p, -q, r, -s]),
    factoredOf(k, [p, s, r, q]),
  ];
  if (k.form === "cubic") c.push(factoredOf(k, [p, q, r, s], k.g, true));
  if (k.g > 1) c.push(factoredOf(k, [p, q, r, s], 1));
  c.push(factoredOf(k, [r, q, p, s]));
  return factoredHints(answerLatex(k), expandFactored(factoredOf(k)), c, k.vars);
}

export const generator: Generator = {
  id: FACTORING_BY_GROUPING_ID,
  title: "Factoring by grouping",
  defaultDirections: "Factor each completely by grouping.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const k = construct(params, createRng(seed));
    return {
      kind: "generated",
      generatorId: FACTORING_BY_GROUPING_ID,
      params: resolveParams(schema, params),
      seed,
      prompt: polyLatex(fourTerms(k), k.vars),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
