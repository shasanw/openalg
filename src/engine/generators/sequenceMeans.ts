// "Arithmetic and geometric means": fill in the k terms between two numbers
// so that the whole run is arithmetic (4, __, __, __, 24) or geometric
// (3, __, __, 81).
//
// Built ANSWER-FROM-CONSTRUCTION: the first number, the common difference or
// ratio and the number of means are chosen first; the means and the last
// number are evaluated forwards from them. Nothing is solved. An odd number of
// geometric means leaves an even gap, which a ratio and its negative both
// fill, so those prompts say r > 0 (and the negative ratio is a Distractor).

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { nonzeroInt } from "./equationKit";
import {
  BLANK,
  arithmeticTerm,
  distinctHints,
  div,
  geometricTerm,
  listLatex,
  neg,
  numLatex,
  rat,
  size,
  sub,
  type Rat,
} from "./sequenceKit";

export const SEQUENCE_MEANS_ID = "arithmetic-geometric-means";

export type MeanType = "arithmetic" | "geometric";

export const schema = [
  {
    type: "enum",
    key: "type",
    label: "Means",
    default: "mixed",
    options: [
      { value: "arithmetic", label: "Arithmetic" },
      { value: "geometric", label: "Geometric" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "int",
    key: "maxMeans",
    label: "Most means to insert",
    min: 1,
    max: 4,
    default: 3,
  },
  {
    type: "boolean",
    key: "fractions",
    label: "Allow fraction differences (arithmetic)",
    default: false,
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative numbers and ratios",
    default: true,
  },
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface MeansConstruction {
  type: MeanType;
  /** how many means go between the two ends */
  m: number;
  first: Rat;
  /** the common difference or ratio */
  step: Rat;
  /** odd geometric means: the prompt says r > 0 */
  positiveRatio: boolean;
}

export const MAX_PRINTED = 999;

/** The whole run: first, the m means, last. */
export function run(k: MeansConstruction): Rat[] {
  const at = (i: number) =>
    k.type === "arithmetic" ? arithmeticTerm(k.first, k.step, i) : geometricTerm(k.first, k.step, i);
  return Array.from({ length: k.m + 2 }, (_, i) => at(i + 1));
}

const RATIOS: [number, number][] = [[2, 1], [2, 1], [3, 1], [3, 1], [1, 2], [1, 3], [2, 3], [3, 2]];

function arithmetic(rng: Rng, m: number, fractions: boolean, negOk: boolean): MeansConstruction {
  const gap = m + 1;
  let step: Rat;
  if (fractions && rng.bool(0.6)) {
    let p = rng.int(1, 3 * gap);
    if (p % gap === 0) p += 1;
    step = rat(negOk && rng.bool() ? -p : p, gap);
  } else step = rat(nonzeroInt(rng, 2, 9, negOk));
  // the ends are whole: the step's denominator divides the gap
  const first = rat(nonzeroInt(rng, 1, 20, negOk));
  return { type: "arithmetic", m, first, step, positiveRatio: false };
}

function geometric(rng: Rng, m: number, negOk: boolean): MeansConstruction {
  const gap = m + 1;
  const positiveRatio = gap % 2 === 0;
  const [pn, pd] = rng.pick(RATIOS);
  const step = rat(negOk && !positiveRatio && rng.bool() ? -pn : pn, pd);
  // every term whole: the first is a multiple of the ratio's denominator^gap
  const first = rat(rng.int(1, 5) * pd ** gap);
  return { type: "geometric", m, first, step, positiveRatio };
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): MeansConstruction {
  const p = resolveParams(schema, params);
  const negOk = p.allowNegatives as boolean;
  const types: MeanType[] = p.type === "mixed" ? ["arithmetic", "geometric"] : [p.type as MeanType];
  const type = rng.pick(types);
  for (;;) {
    const m = rng.int(1, p.maxMeans as number);
    const k = type === "arithmetic" ? arithmetic(rng, m, p.fractions as boolean, negOk) : geometric(rng, m, negOk);
    if (run(k).every((x) => size(x) <= MAX_PRINTED)) return k;
  }
}


// ------------------------------------------------------------------ render

export function promptLatex(k: MeansConstruction): string {
  const terms = run(k);
  const ends = [numLatex(terms[0]), ...Array(k.m).fill(BLANK), numLatex(terms[terms.length - 1])].join(", ");
  const label = k.type === "arithmetic" ? "\\text{arithmetic}" : k.positiveRatio ? "\\text{geometric}, r > 0" : "\\text{geometric}";
  return `${ends};\\quad ${label}`;
}

export function answerLatex(k: MeansConstruction): string {
  return listLatex(run(k).slice(1, -1));
}

/**
 * Mistake-based Distractors, most common first.
 * Arithmetic: the gap divided by the number of means instead of the number of
 * steps (one more), or by the number of terms; the difference's sign flipped.
 * Geometric: the negative ratio (for r > 0 prompts), the ratio upside down,
 * the m-th root instead of the (m+1)-th, arithmetic means in place of
 * geometric ones, the ratio of the ends divided rather than rooted, and a
 * negative ratio where it does not fit.
 * Both: the ends listed with the means, and the means in reverse order.
 * A fraction Distractor among whole-number Answers would give itself away,
 * so those are dropped.
 */
export function distractors(k: MeansConstruction): string[] {
  const terms = run(k);
  const first = terms[0];
  const last = terms[terms.length - 1];
  const means = (step: Rat | null, type: MeanType = k.type) =>
    step && step.n !== 0 ? listLatex(run({ ...k, type, step }).slice(1, -1)) : null;
  const candidates: (string | null)[] = [];
  const arithmeticStep = (divisor: number) => div(sub(last, first), rat(divisor));
  if (k.type === "arithmetic") {
    candidates.push(means(arithmeticStep(k.m)), means(arithmeticStep(k.m + 2)), means(neg(k.step)));
  } else {
    const whole = div(last, first)!;
    if (k.positiveRatio) candidates.push(means(neg(k.step)));
    candidates.push(means(div(rat(1), k.step)));
    candidates.push(means(exactRoot(whole, k.m)));
    candidates.push(means(arithmeticStep(k.m + 1), "arithmetic"));
    // the ratio of the ends divided by the steps, not rooted
    candidates.push(means(div(whole, rat(k.m + 1))));
    if (!k.positiveRatio) candidates.push(means(neg(k.step)));
  }
  // the ends listed too, and the means listed from the far end
  candidates.push(listLatex(terms), listLatex(terms.slice(1, -1).reverse()));
  const wholeAnswer = !answerLatex(k).includes("\\frac");
  return distinctHints(
    answerLatex(k),
    candidates.filter((c) => c && !(wholeAnswer && c.includes("\\frac"))),
  );
}

/** The real e-th root of a rational when it is rational (small numbers only), else null. */
function exactRoot(x: Rat, e: number): Rat | null {
  const root = (v: number): number | null => {
    const r = Math.round(Math.sign(v) * Math.abs(v) ** (1 / e));
    return r ** e === v ? r : null;
  };
  if (e % 2 === 0 && x.n < 0) return null;
  const n = root(x.n);
  const d = root(x.d);
  return n === null || d === null ? null : rat(n, d);
}

export const generator: Generator = {
  id: SEQUENCE_MEANS_ID,
  title: "Arithmetic and geometric means",
  defaultDirections: "Fill in the blanks so that each sequence is arithmetic or geometric, as labelled.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: SEQUENCE_MEANS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};

