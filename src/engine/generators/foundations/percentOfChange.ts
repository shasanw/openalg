// "Percent of change": find the percent of increase or decrease from one
// amount to another (40 to 52 is a 30% increase), or the new amount after a
// percent of change (40 increased by 30% is 52).
//
// Built ANSWER-FIRST: for a percent of change, the percent and its direction
// are the Answer; the original amount is drawn and the new amount computed
// exactly. For a new amount, the new amount is the Answer; the percent is
// drawn and the original amount computed exactly (new / (1 \pm p/100)). A
// draw is kept only when every printed amount is whole (or, with decimals
// allowed, a short terminating decimal).

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { add, distinctHints, div, isInt, mul, neg, rat, sub, type Rat } from "../shared/equationKit";
import { amountLatex, drawPercent, percentLatex, plausibleAmount, terminates, type PercentRange } from "./percentKit";

export const PERCENT_OF_CHANGE_ID = "percent-of-change";

export type Find = "percent" | "amount";
export type Direction = "increase" | "decrease";

export const schema = [
  {
    type: "enum",
    key: "find",
    label: "Find",
    default: "percent",
    options: [
      { value: "percent", label: "The percent of change" },
      { value: "amount", label: "The new amount" },
      { value: "both", label: "A mix of both" },
    ],
  },
  {
    type: "enum",
    key: "direction",
    label: "Changes",
    default: "both",
    options: [
      { value: "both", label: "Increases and decreases" },
      { value: "increase", label: "Increases only" },
      { value: "decrease", label: "Decreases only" },
    ],
  },
  {
    type: "enum",
    key: "percents",
    label: "Percents",
    default: "whole",
    options: [
      { value: "whole", label: "Whole-number percents" },
      { value: "any", label: "Also decimal percents and increases over 100%" },
    ],
  },
  {
    type: "boolean",
    key: "decimals",
    label: "Allow decimal amounts",
    default: false,
  },
  {
    type: "int",
    key: "maxAmount",
    label: "Largest original amount",
    min: 20,
    max: 1000,
    default: 200,
  },
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface ChangeConstruction {
  find: Find;
  direction: Direction;
  /** the percent of change, e.g. 30 for 30% */
  percent: Rat;
  original: Rat;
  /** original \cdot (1 \pm percent / 100) */
  updated: Rat;
}

const printable = (r: Rat, decimals: boolean) => r.n > 0 && (isInt(r) || (decimals && terminates(r, 2)));

/** The multiplier 1 \pm p/100. */
const factor = (direction: Direction, percent: Rat) =>
  (direction === "increase" ? add : sub)(rat(1), div(percent, rat(100))!);

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): ChangeConstruction {
  const p = resolveParams(schema, params);
  const findOpt = p.find as Find | "both";
  const dirOpt = p.direction as Direction | "both";
  const range = p.percents as PercentRange;
  const decimals = p.decimals as boolean;
  const M = p.maxAmount as number;
  const find: Find = findOpt === "both" ? rng.pick(["percent", "amount"] as const) : findOpt;
  const direction: Direction = dirOpt === "both" ? rng.pick(["increase", "decrease"] as const) : dirOpt;

  for (let attempt = 0; attempt < 3000; attempt++) {
    // a decrease stays under 100%; an increase may pass it
    const percent = drawPercent(rng, range, direction === "decrease" ? 95 : range === "any" ? 250 : 100);
    if (percent.n === 0) continue;
    const f = factor(direction, percent);
    let original: Rat;
    let updated: Rat;
    if (find === "percent") {
      // the Answer is the percent (drawn above): draw the original, compute the new amount
      original = rat(rng.int(10, M));
      updated = mul(original, f);
      // the new amount is a given here: whole unless decimals are on
      if (!printable(updated, decimals)) continue;
    } else {
      // the Answer is the new amount: draw it, compute the original
      const scale = decimals && rng.bool(0.5) ? 10 : 1;
      updated = rat(rng.int(1, Math.floor(M * (f.n / f.d) * scale)), scale);
      original = div(updated, f)!;
      if (!isInt(original) || original.n < 10 || original.n > M) continue;
      if (!printable(updated, decimals)) continue;
    }
    return { find, direction, percent, original, updated };
  }
  // Practically unreachable: 40 to 52 is a 30% increase.
  return { find, direction: "increase", percent: rat(30), original: rat(40), updated: rat(52) };
}

export function promptLatex(k: ChangeConstruction): string {
  if (k.find === "percent") return `${amountLatex(k.original)} \\text{ to } ${amountLatex(k.updated)}`;
  return `${amountLatex(k.original)} \\text{ ${k.direction}d by } ${percentLatex(k.percent)}`;
}

const changeLatex = (percent: Rat, direction: Direction) => `${percentLatex(percent)} \\text{ ${direction}}`;

export function answerLatex(k: ChangeConstruction): string {
  return k.find === "percent" ? changeLatex(k.percent, k.direction) : amountLatex(k.updated);
}

const flip = (d: Direction): Direction => (d === "increase" ? "decrease" : "increase");

/**
 * Mistake-based Distractors:
 * - percent of change: divided the change by the new amount instead of the
 *   original, the right percent in the wrong direction, the amount of change
 *   taken as the percent, the new amount as a percent of the original
 *   (130% for a 30% increase), and forgetting to multiply by 100;
 * - new amount: just the change (not added on), the wrong direction, the
 *   percent added on as a number (40 + 30), and the decimal point one place
 *   off in the percent.
 */
export function distractors(k: ChangeConstruction, decimals = true): string[] {
  const { original, updated, percent, direction } = k;
  const change = sub(updated, original);
  const size = change.n < 0 ? neg(change) : change;
  if (k.find === "percent") {
    const wrongs: [Rat | null, Direction][] = [
      [mul(div(size, updated)!, rat(100)), direction],
      [percent, flip(direction)],
      [size, direction],
      [mul(div(updated, original)!, rat(100)), direction],
      [div(percent, rat(100)), direction],
      // Converted the ratio to percent by moving the decimal only one place.
      [div(percent, rat(10)), direction],
      // Moved it three places instead of two.
      [mul(percent, rat(10)), direction],
      // Gave what is left of the original (100% minus the change), in either direction.
      [sub(rat(100), percent), direction],
      [sub(rat(100), percent), flip(direction)],
      // Calculated the reverse change, using the new amount as the starting amount.
      [mul(div(size, updated)!, rat(100)), flip(direction)],
    ];
    return distinctHints(
      answerLatex(k),
      wrongs
        // a decrease of 100% or more is not a believable choice
        .filter(([r, d]) => r && r.n > 0 && terminates(r, 2) && (d === "increase" || r.n < 100 * r.d))
        .map(([r, d]) => changeLatex(r!, d)),
    );
  }
  const values: (Rat | null)[] = [
    size,
    mul(original, factor(flip(direction), percent)),
    (direction === "increase" ? add : sub)(original, percent),
    mul(original, factor(direction, div(percent, rat(10))!)),
    // Applied the change a second time to the new amount.
    (direction === "increase" ? add : sub)(updated, size),
    // Treated a percent as a whole-number multiplier.
    mul(original, percent),
    // Divided by the growth factor instead of multiplying by it.
    div(original, factor(direction, percent)),
    // Added the percent as a number whichever way the change went: 16 decreased by 50% as 16 + 50.
    add(original, percent),
  ];
  return distinctHints(
    answerLatex(k),
    values.filter((r): r is Rat => plausibleAmount(r, updated, decimals)).map(amountLatex),
  );
}

export const generator: Generator = {
  id: PERCENT_OF_CHANGE_ID,
  title: "Percent of change",
  defaultDirections: "Find each percent of change, or the new amount.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: PERCENT_OF_CHANGE_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k, resolved.decimals as boolean),
    };
  },
};
