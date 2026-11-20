// "Permutations vs combinations": decide whether order matters in a word
// problem, then count. The Answer names the kind of count and gives it
// ("permutation; 720"), or gives the count alone (Task option).
//
// Built ANSWER-FROM-CONSTRUCTION: the kind of count is chosen first (half
// the Problems each way), then a scenario of that kind with its n and r;
// the count is evaluated forwards from them.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { ANSWER_PART_SEPARATOR } from "../format";
import { distinctHints } from "./equationKit";
import {
  comb,
  COMBINATION_SCENARIOS,
  countLatex,
  perm,
  PERMUTATION_SCENARIOS,
  pickScenario,
  scenarioPrompt,
  scenarioSlips,
  type CountKind,
  type Scenario,
} from "./countingKit";

export const PERMUTATIONS_VS_COMBINATIONS_ID = "permutations-vs-combinations";

export const schema = [
  {
    type: "enum",
    key: "ask",
    label: "Ask for",
    default: "both",
    options: [
      { value: "both", label: "Permutation or combination, and the count" },
      { value: "count", label: "The count only" },
    ],
  },
  {
    type: "int",
    key: "maxN",
    label: "Largest group",
    min: 5,
    max: 15,
    default: 12,
  },
] as const satisfies ParamSchema;

export interface PvcConstruction {
  ask: "both" | "count";
  scenario: Scenario;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): PvcConstruction {
  const p = resolveParams(schema, params);
  const kind: CountKind = rng.bool() ? "permutation" : "combination";
  const pool = kind === "permutation" ? PERMUTATION_SCENARIOS : COMBINATION_SCENARIOS;
  for (;;) {
    const scenario = pickScenario(rng, pool, p.maxN as number);
    // every r of n arranged in a line (r = n) makes the combination 1: too easy a tell
    if (scenario.r < scenario.n) return { ask: p.ask as PvcConstruction["ask"], scenario };
  }
}

const kindLatex = (kind: CountKind) => `\\text{${kind}}`;

/** An Answer (or Distractor) in this Problem's shape. */
function answerOf(k: PvcConstruction, kind: CountKind, count: number): string {
  return k.ask === "both" ? `${kindLatex(kind)}${ANSWER_PART_SEPARATOR}${countLatex(count)}` : countLatex(count);
}

export const promptLatex = (k: PvcConstruction): string => scenarioPrompt(k.scenario);
export const answerLatex = (k: PvcConstruction): string => answerOf(k, k.scenario.kind, k.scenario.count);

/**
 * Mistake-based Distractors, most common first: the other kind of count,
 * named and counted that way (the classic mix-up); the right count under
 * the wrong name; the wrong count under the right name; then the slips every
 * counting scenario shares (see scenarioSlips), under the right name.
 */
export function distractors(k: PvcConstruction): string[] {
  const { kind, n, r } = k.scenario;
  const other: CountKind = kind === "permutation" ? "combination" : "permutation";
  const otherCount = other === "permutation" ? perm(n, r) : comb(n, r);
  const candidates = [
    answerOf(k, other, otherCount),
    k.ask === "both" ? answerOf(k, other, k.scenario.count) : null,
    k.ask === "both" ? answerOf(k, kind, otherCount) : null,
    ...scenarioSlips(k.scenario).map((v) => answerOf(k, kind, v)),
  ];
  return distinctHints(answerLatex(k), candidates);
}

export const generator: Generator = {
  id: PERMUTATIONS_VS_COMBINATIONS_ID,
  title: "Permutations vs combinations",
  defaultDirections: "State whether each situation is a permutation or a combination. Then find the number of possibilities.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: PERMUTATIONS_VS_COMBINATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
