// "Sample spaces and the Fundamental Counting Principle": count the outcomes
// of a multi-stage choice or experiment by multiplying the number of ways
// each stage can go. Word problems in three flavours: choosing one of each
// (outfits, meals, routes), experiments (the size of the sample space when
// coins, dice and spinners are combined) and codes where symbols may repeat
// (PINs, license plates, quizzes).
//
// Built ANSWER-FROM-CONSTRUCTION: the stages and how many ways each can go
// are chosen first; the Answer is their product, and the word problem is
// written around them. Nothing is solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { prose } from "../../format";
import { distinctHints } from "../shared/equationKit";
import { countLatex, listWords } from "./countingKit";

export const COUNTING_PRINCIPLE_ID = "counting-principle";

export type Context = "choices" | "experiments" | "codes";

export const schema = [
  {
    type: "enum",
    key: "context",
    label: "Problems about",
    default: "mixed",
    options: [
      { value: "choices", label: "Choosing one of each (outfits, meals, routes)" },
      { value: "experiments", label: "Sample spaces (coins, dice, spinners)" },
      { value: "codes", label: "Codes where symbols may repeat" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "int",
    key: "maxStages",
    label: "Most stages",
    min: 2,
    max: 4,
    default: 3,
  },
] as const satisfies ParamSchema;

/**
 * One stage of the count: how many ways it can go, and how many times it
 * repeats (a coin tossed 4 times is one stage of 2 ways, repeated 4 times).
 */
export interface Stage {
  ways: number;
  times: number;
}

/** The structured construction. Exposed for property tests. */
export interface CountingConstruction {
  context: Context;
  text: string;
  stages: Stage[];
}

/** The Answer: the product of every stage's ways, each to its repeats. */
export const countOf = (k: CountingConstruction): number =>
  k.stages.reduce((p, s) => p * s.ways ** s.times, 1);

/** How many separate choices (stage repeats counted) the count multiplies. */
export const positions = (k: CountingConstruction): number => k.stages.reduce((t, s) => t + s.times, 0);

const once = (ways: number): Stage => ({ ways, times: 1 });

/** n distinct whole numbers in [lo, hi], in random order (n <= hi - lo + 1). */
function distinctInts(rng: Rng, n: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const v = rng.int(lo, hi);
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

// ------------------------------------------------------------------ choices

interface ChoiceTheme {
  items: readonly string[];
  write: (parts: string[]) => string;
}

const CHOICE_THEMES: readonly ChoiceTheme[] = [
  {
    items: ["shirts", "pairs of pants", "pairs of shoes", "hats"],
    write: (parts) => `A closet has ${listWords(parts)}. How many outfits of one of each are possible?`,
  },
  {
    items: ["sandwiches", "sides", "drinks", "desserts"],
    write: (parts) =>
      `A lunch special is one of each choice. There are ${listWords(parts)}. How many different lunches are possible?`,
  },
  {
    items: ["colors", "trim levels", "engines", "wheel styles"],
    write: (parts) => `A new car comes in ${listWords(parts)}. How many different cars can be ordered?`,
  },
];

const TOWNS = ["A", "B", "C", "D", "E"] as const;

function choices(rng: Rng, stages: number): CountingConstruction {
  if (rng.bool(0.25)) {
    // routes through towns: one stage per leg
    const ways = distinctInts(rng, stages, 2, 6);
    const legs = ways.map((w, i) => `${w} roads from town ${TOWNS[i]} to town ${TOWNS[i + 1]}`);
    const via = TOWNS.slice(1, stages);
    return {
      context: "choices",
      text: `There are ${listWords(legs)}. How many routes go from town A to town ${TOWNS[stages]} through ${listWords(via.map((t) => `town ${t}`))}?`,
      stages: ways.map(once),
    };
  }
  const theme = rng.pick(CHOICE_THEMES);
  const ways = distinctInts(rng, stages, 2, 9);
  const parts = ways.map((w, i) => `${w} ${theme.items[i]}`);
  return { context: "choices", text: theme.write(parts), stages: ways.map(once) };
}

// ------------------------------------------------------------------ experiments

interface Device {
  ways: number;
  phrase: string;
}

const devices = (rng: Rng): Device[] => {
  const spinner = rng.int(3, 8);
  return [
    { ways: 2, phrase: "a coin is tossed" },
    { ways: 6, phrase: "a six-sided die is rolled" },
    { ways: spinner, phrase: `a spinner with ${spinner} equal sections is spun` },
    { ways: 5, phrase: "a vowel is chosen from A, E, I, O and U" },
  ];
};

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

function experiments(rng: Rng, stages: number): CountingConstruction {
  if (rng.bool(0.4)) {
    // one device repeated
    if (rng.bool(0.6)) {
      const times = rng.int(3, stages + 2);
      return {
        context: "experiments",
        text: `A coin is tossed ${times} times. How many outcomes are in the sample space?`,
        stages: [{ ways: 2, times }],
      };
    }
    const times = rng.int(2, Math.min(stages, 3));
    return {
      context: "experiments",
      text: `A six-sided die is rolled ${times} times. How many outcomes are in the sample space?`,
      stages: [{ ways: 6, times }],
    };
  }
  const all = devices(rng);
  const picked: Device[] = [];
  while (picked.length < stages) {
    const d = rng.pick(all);
    if (!picked.includes(d)) picked.push(d);
  }
  return {
    context: "experiments",
    text: `${capitalize(listWords(picked.map((d) => d.phrase)))}. How many outcomes are in the sample space?`,
    stages: picked.map((d) => once(d.ways)),
  };
}

// ------------------------------------------------------------------ codes

function codes(rng: Rng, stages: number): CountingConstruction {
  const kind = rng.int(0, 4);
  if (kind === 4) {
    const numbers = rng.pick([20, 30, 36, 40, 50]);
    const times = rng.int(3, Math.max(3, stages + 1));
    return {
      context: "codes",
      text: `A lock's dial has ${numbers} numbers. It opens with a sequence of ${times} of them, and numbers may repeat. How many sequences are possible?`,
      stages: [{ ways: numbers, times }],
    };
  }
  if (kind === 0) {
    const letters = rng.int(1, Math.min(stages, 3));
    const digits = rng.int(2, 4);
    return {
      context: "codes",
      text: `A license plate has ${letters === 1 ? "1 letter" : `${letters} letters`} followed by ${digits} digits, and letters and digits may repeat. How many license plates are possible?`,
      stages: [
        { ways: 26, times: letters },
        { ways: 10, times: digits },
      ],
    };
  }
  if (kind === 1) {
    const digits = rng.int(3, stages + 3);
    return {
      context: "codes",
      text: `A PIN is ${digits} digits long, and digits may repeat. How many PINs are possible?`,
      stages: [{ ways: 10, times: digits }],
    };
  }
  if (kind === 2) {
    const questions = rng.int(4, stages + 5);
    const options = rng.int(3, 5);
    return {
      context: "codes",
      text: `A quiz has ${questions} multiple-choice questions with ${options} choices each. In how many ways can the quiz be answered?`,
      stages: [{ ways: options, times: questions }],
    };
  }
  const questions = rng.int(4, stages + 6);
  return {
    context: "codes",
    text: `A quiz has ${questions} true-or-false questions. In how many ways can the quiz be answered?`,
    stages: [{ ways: 2, times: questions }],
  };
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): CountingConstruction {
  const p = resolveParams(schema, params);
  const contexts: Context[] = p.context === "mixed" ? ["choices", "experiments", "codes"] : [p.context as Context];
  const context = rng.pick(contexts);
  const stages = rng.int(2, p.maxStages as number);
  if (context === "choices") return choices(rng, stages);
  if (context === "experiments") return experiments(rng, stages);
  return codes(rng, stages);
}

export const promptLatex = (k: CountingConstruction): string => prose(k.text);
export const answerLatex = (k: CountingConstruction): string => countLatex(countOf(k));

/**
 * Mistake-based Distractors, most common first: adding the stages instead of
 * multiplying; multiplying each stage's ways by its repeats instead of
 * raising to them (a coin tossed 4 times as 2 times 4); raising the repeats
 * to the ways (4^2 for 2^4); not letting symbols repeat (10 times 9 times 8
 * ...); and leaving out one stage.
 */
export function distractors(k: CountingConstruction): string[] {
  const values: number[] = [];
  const sum = k.stages.reduce((t, s) => t + s.ways * s.times, 0);
  values.push(sum);
  values.push(k.stages.reduce((p, s) => p * s.ways * s.times, 1));
  if (k.stages.length === 1) {
    const { ways, times } = k.stages[0];
    values.push(times ** ways);
    values.push(ways ** (times - 1), ways ** (times + 1));
  }
  // no repetition: ways, ways - 1, ... for each repeated stage
  if (k.stages.some((s) => s.times > 1)) {
    let p = 1;
    for (const s of k.stages) for (let i = 0; i < s.times; i++) p *= Math.max(s.ways - i, 1);
    values.push(p);
  }
  for (let i = k.stages.length - 1; i >= 0 && k.stages.length > 1; i--) {
    values.push(countOf({ ...k, stages: k.stages.filter((_, j) => j !== i) }));
  }
  const factor = (s: Stage) => s.ways ** s.times;
  const others = (skip: number[]) => k.stages.reduce((p, s, j) => (skip.includes(j) ? p : p * factor(s)), 1);
  k.stages.forEach((s, i) => {
    if (s.times > 1) {
      // exponent slips in one stage: ways + times (adding base and exponent), times^ways (base and exponent swapped)
      values.push(others([i]) * (s.ways + s.times), others([i]) * s.times ** s.ways);
    }
  });
  // two stages that each go once: ways^other (an exponent instead of a product)
  if (k.stages.length === 2 && k.stages.every((s) => s.times === 1)) {
    const [a, b] = k.stages;
    values.push(a.ways ** b.ways, b.ways ** a.ways);
    // Treat the outcomes as unordered pairs or as draws without replacement.
    if ((a.ways * b.ways) % 2 === 0) values.push((a.ways * b.ways) / 2);
    values.push(a.ways * (b.ways - 1));
  }
  // added two stages and multiplied the rest (a + b) * c, for each adjacent pair
  if (k.stages.length >= 3) {
    for (let i = 0; i + 1 < k.stages.length; i++) {
      const pair = k.stages[i].ways * k.stages[i].times + k.stages[i + 1].ways * k.stages[i + 1].times;
      values.push(pair * others([i, i + 1]));
    }
  }
  return distinctHints(
    answerLatex(k),
    values.filter((v) => v > 0 && Number.isSafeInteger(v)).map(countLatex),
  );
}

export const generator: Generator = {
  id: COUNTING_PRINCIPLE_ID,
  title: "Sample spaces and the Fundamental Counting Principle",
  defaultDirections: "Find the number of possible outcomes.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: COUNTING_PRINCIPLE_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
