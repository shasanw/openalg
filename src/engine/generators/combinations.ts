// "Combinations": count unordered selections. Evaluate combination notation
// ({}_{9}C_{4}) or solve word problems where order does not matter
// (committees, pizza toppings, handshakes), including a selection from two
// groups at once (2 of 6 teachers and 3 of 10 students).
//
// Built ANSWER-FROM-CONSTRUCTION: n and r (or each group's) are chosen first,
// and the count is evaluated forwards from them.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { distinctHints } from "./equationKit";
import {
  comb,
  COMBINATION_SCENARIOS,
  combLatex,
  countLatex,
  factorial,
  perm,
  pickScenario,
  scenarioPrompt,
  scenarioSlips,
  twoGroupScenario,
  type Scenario,
} from "./countingKit";

export const COMBINATIONS_ID = "combinations";

export type Form = "notation" | "words";

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Problems",
    default: "mixed",
    options: [
      { value: "notation", label: "Evaluate nCr" },
      { value: "words", label: "Word problems" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "int",
    key: "maxN",
    label: "Largest n",
    min: 5,
    max: 15,
    default: 12,
  },
  {
    type: "boolean",
    key: "twoGroups",
    label: "Include choosing from two groups at once",
    default: true,
  },
] as const satisfies ParamSchema;

export type CombinationsConstruction =
  | { form: "notation"; n: number; r: number }
  | { form: "words"; scenario: Scenario };

export const countOf = (k: CombinationsConstruction): number =>
  k.form === "notation" ? comb(k.n, k.r) : k.scenario.count;

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): CombinationsConstruction {
  const p = resolveParams(schema, params);
  const maxN = p.maxN as number;
  const forms: Form[] = p.form === "mixed" ? ["notation", "words"] : [p.form as Form];
  const form = rng.pick(forms);
  if (form === "notation") {
    const n = rng.int(4, maxN);
    // r = 0 and r = n are trivial (1); keep 1 < r < n - 1 mostly
    const r = n > 4 && rng.bool(0.85) ? rng.int(2, Math.min(n - 2, 6)) : rng.pick([1, n - 1]);
    return { form, n, r };
  }
  if (p.twoGroups && rng.bool(0.2)) {
    const s = twoGroupScenario(rng, maxN);
    if (s) return { form, scenario: s };
  }
  return { form, scenario: pickScenario(rng, COMBINATION_SCENARIOS, maxN) };
}

export function promptLatex(k: CombinationsConstruction): string {
  return k.form === "notation" ? combLatex(k.n, k.r) : scenarioPrompt(k.scenario);
}

export const answerLatex = (k: CombinationsConstruction): string => countLatex(countOf(k));

/**
 * Mistake-based Distractors, most common first. For nCr: the permutation nPr
 * (not dividing by r!), n! / r! (forgetting (n - r)!), n! / (n - r)! / r
 * (dividing by r, not r!), the neighbouring counts nC(r - 1) and
 * (n - 1)Cr, and n times r. For word problems, the slips every counting
 * scenario shares (see scenarioSlips).
 */
export function distractors(k: CombinationsConstruction): string[] {
  let values: number[];
  if (k.form === "notation") {
    const { n, r } = k;
    values = [perm(n, r), factorial(n) / factorial(r), perm(n, r) / r, comb(n, r - 1), comb(n - 1, r), comb(n, r + 1), n * r];
  } else values = scenarioSlips(k.scenario);
  return distinctHints(
    answerLatex(k),
    values.filter((v) => v > 0 && Number.isSafeInteger(v)).map(countLatex),
  );
}

export const generator: Generator = {
  id: COMBINATIONS_ID,
  title: "Combinations",
  defaultDirections: "Evaluate each expression or answer each question.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: COMBINATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
