// "Permutations": count ordered arrangements. Evaluate permutation notation
// ({}_{8}P_{3}), solve word problems where order matters (offices, places in
// a race, books on a shelf), or count the distinguishable arrangements of
// letters or digits with repeats (BANANA: 6!/(3! 2!)).
//
// Built ANSWER-FROM-CONSTRUCTION: n and r (or the multiset of letters) are
// chosen first, and the count is evaluated forwards from them.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { prose } from "../../format";
import { distinctHints } from "../shared/equationKit";
import {
  comb,
  countLatex,
  factorial,
  perm,
  PERMUTATION_SCENARIOS,
  permLatex,
  pickScenario,
  scenarioPrompt,
  scenarioSlips,
  type Scenario,
} from "./countingKit";

export const PERMUTATIONS_ID = "permutations";

export type Form = "notation" | "words" | "letters";

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Problems",
    default: "mixed",
    options: [
      { value: "notation", label: "Evaluate nPr" },
      { value: "words", label: "Word problems" },
      { value: "letters", label: "Arrangements with repeated letters or digits" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "int",
    key: "maxN",
    label: "Largest n",
    min: 5,
    max: 12,
    default: 10,
  },
] as const satisfies ParamSchema;

/** Words with repeated letters, for distinguishable arrangements. */
export const REPEAT_WORDS = [
  "APPLE",
  "LEVEL",
  "TOOTH",
  "BANANA",
  "COFFEE",
  "PEPPER",
  "LETTER",
  "SEESAW",
  "CHEESE",
  "ALGEBRA",
  "BALLOON",
  "ALABAMA",
  "GEOMETRY",
  "CALCULUS",
  "TENNESSEE",
  "COMMITTEE",
  "STATISTICS",
  "BOOKKEEPER",
  "MISSISSIPPI",
] as const;

export type PermutationsConstruction =
  | { form: "notation"; n: number; r: number }
  | { form: "words"; scenario: Scenario }
  | { form: "letters"; symbols: string[]; word: boolean };

/** How many times each symbol appears, largest first. */
export function repeats(symbols: readonly string[]): number[] {
  const counts = new Map<string, number>();
  for (const s of symbols) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.values()].sort((a, b) => b - a);
}

/** The distinguishable arrangements of a multiset: n! / (c_1! c_2! ...). */
export const arrangements = (symbols: readonly string[]): number =>
  repeats(symbols).reduce((q, c) => q / factorial(c), factorial(symbols.length));

/** The Answer. */
export function countOf(k: PermutationsConstruction): number {
  if (k.form === "notation") return perm(k.n, k.r);
  if (k.form === "words") return k.scenario.count;
  return arrangements(k.symbols);
}

function digitsWithRepeats(rng: Rng, maxN: number): string[] {
  const n = rng.int(5, Math.min(maxN, 8));
  for (;;) {
    const kinds = rng.int(2, Math.min(4, n - 1));
    const pool = Array.from({ length: kinds }, () => String(rng.int(1, 9)));
    if (new Set(pool).size < kinds) continue;
    const digits = [...pool];
    while (digits.length < n) digits.push(rng.pick(pool));
    digits.sort();
    if (repeats(digits)[0] > 1) return digits;
  }
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): PermutationsConstruction {
  const p = resolveParams(schema, params);
  const maxN = p.maxN as number;
  const forms: Form[] = p.form === "mixed" ? ["notation", "words", "letters"] : [p.form as Form];
  const form = rng.pick(forms);
  if (form === "notation") {
    const n = rng.int(4, maxN);
    const r = rng.int(2, Math.min(n, 5));
    return { form, n, r };
  }
  if (form === "words") return { form, scenario: pickScenario(rng, PERMUTATION_SCENARIOS, maxN) };
  const words = REPEAT_WORDS.filter((w) => w.length <= maxN);
  if (rng.bool(0.6)) return { form, symbols: [...rng.pick(words)], word: true };
  return { form, symbols: digitsWithRepeats(rng, maxN), word: false };
}

export function promptLatex(k: PermutationsConstruction): string {
  if (k.form === "notation") return permLatex(k.n, k.r);
  if (k.form === "words") return scenarioPrompt(k.scenario);
  if (k.word) return prose(`In how many distinguishable ways can the letters of ${k.symbols.join("")} be arranged?`);
  return prose(
    `How many different ${k.symbols.length}-digit numbers can be made by arranging all of the digits ${k.symbols.join(", ")}?`,
  );
}

export const answerLatex = (k: PermutationsConstruction): string => countLatex(countOf(k));

/**
 * Mistake-based Distractors, most common first. For nPr: the combination
 * nCr (dividing by r! too), n^r (repetition allowed), n! / r!, one factor
 * too few or too many, and n!, plus multiplying n by r, dividing by r instead of r!
 * and starting the product one factor low. For word problems, the slips every counting
 * scenario shares (see scenarioSlips). For repeated symbols: n! (repeats
 * ignored), dividing by only the most repeated symbol's count factorial,
 * dividing by the counts themselves rather than their factorials, the
 * arrangements of the distinct symbols alone, and multiplying by the
 * repeats' factorials instead of dividing.
 */
export function distractors(k: PermutationsConstruction): string[] {
  let values: number[];
  if (k.form === "notation") {
    const { n, r } = k;
    values = [perm(n, r) / factorial(r), n ** r, factorial(n) / factorial(r), perm(n, r - 1), perm(n, r + 1), factorial(n)];
    // multiplied n by r, divided by r instead of r!, started the product one factor low (n - 1)
    values.push(n * r, factorial(n) / r, perm(n - 1, r));
  } else if (k.form === "words") {
    values = scenarioSlips(k.scenario);
    if (k.scenario.r === k.scenario.n) {
      values.unshift(factorial(k.scenario.n - 1), k.scenario.n ** 2);
      // repetition allowed (n^n), and stopping the product after two positions
      values.push(k.scenario.n ** k.scenario.n, perm(k.scenario.n, 2));
    }
  } else {
    const n = k.symbols.length;
    const c = repeats(k.symbols);
    values = [
      factorial(n),
      factorial(n) / factorial(c[0]),
      factorial(n) / c.reduce((p, x) => p * x, 1),
      factorial(c.length),
      factorial(n) / factorial(c.filter((x) => x > 1).reduce((t, x) => t + x, 0)),
      factorial(n) * c.reduce((p, x) => p * factorial(x), 1),
      // only choosing the places of the most repeated symbol (nCr), counting those places in order
      // (nPr), and dividing by the repeated symbol's factorial once for each copy of it
      comb(n, c[0]),
      perm(n, c[0]),
      factorial(n) / factorial(c[0]) ** c[0],
    ];
  }
  return distinctHints(
    answerLatex(k),
    values.filter((v) => v > 0 && Number.isSafeInteger(v)).map(countLatex),
  );
}

export const generator: Generator = {
  id: PERMUTATIONS_ID,
  title: "Permutations",
  defaultDirections: "Evaluate each expression or answer each question.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: PERMUTATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
