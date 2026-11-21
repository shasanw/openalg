// "Percents": the three percent questions. Find the part (What is 30% of
// 80?), the percent (12 is what percent of 48?) or the whole (15 is 25% of
// what number?).
//
// Built ANSWER-FIRST: the Answer (the part, the percent or the whole) is
// drawn first, then the percent or the whole that goes with it, and the
// remaining number is computed exactly from part = percent / 100 \cdot whole.
// A draw is kept only when every printed number is a whole number (or, with
// decimals allowed, a short terminating decimal).

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { add, distinctHints, div, isInt, mul, rat, sub, type Rat } from "../shared/equationKit";
import { amountLatex, drawPercent, percentLatex, plausibleAmount, terminates, type PercentRange } from "./percentKit";

export const PERCENTS_ID = "percents";

export type Find = "part" | "percent" | "whole";

export const schema = [
  {
    type: "enum",
    key: "find",
    label: "Find",
    default: "all",
    options: [
      { value: "all", label: "A mix of all three" },
      { value: "part", label: "The part (30% of 80)" },
      { value: "percent", label: "The percent (12 is what percent of 48)" },
      { value: "whole", label: "The whole (15 is 25% of what)" },
    ],
  },
  {
    type: "enum",
    key: "percents",
    label: "Percents",
    default: "whole",
    options: [
      { value: "whole", label: "Whole-number percents up to 100%" },
      { value: "any", label: "Also over 100% and decimal percents" },
    ],
  },
  {
    type: "boolean",
    key: "decimals",
    label: "Allow decimal Answers",
    default: false,
  },
  {
    type: "int",
    key: "maxWhole",
    label: "Largest whole amount",
    min: 20,
    max: 1000,
    default: 200,
  },
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface PercentConstruction {
  find: Find;
  /** the percent, e.g. 30 for 30% */
  percent: Rat;
  part: Rat;
  whole: Rat;
  /** which wording to print */
  phrasing: number;
}

/** An amount the sheet may print: whole, or (with decimals) up to two places. */
const printable = (r: Rat, decimals: boolean) => r.n > 0 && (isInt(r) || (decimals && terminates(r, 2)));

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): PercentConstruction {
  const p = resolveParams(schema, params);
  const findOpt = p.find as Find | "all";
  const range = p.percents as PercentRange;
  const decimals = p.decimals as boolean;
  const W = p.maxWhole as number;
  const find: Find = findOpt === "all" ? rng.pick(["part", "percent", "whole"] as const) : findOpt;
  const phrasing = rng.int(0, find === "part" ? 2 : 1);

  for (let attempt = 0; attempt < 3000; attempt++) {
    const percent = drawPercent(rng, range, range === "any" ? 250 : 100);
    const fraction = div(percent, rat(100))!;
    let part: Rat;
    let whole: Rat;
    if (find === "part") {
      // the Answer: a part no bigger than the whole allows (tenths when decimals are on)
      const scale = decimals && rng.bool(0.5) ? 10 : 1;
      const most = Math.max(1, Math.floor(((percent.n / percent.d) * W * scale) / 100));
      part = rat(rng.int(1, most), scale);
      whole = div(part, fraction)!;
      if (!isInt(whole) || whole.n < 2 || whole.n > W) continue;
    } else {
      // the Answer is the percent (already drawn) or the whole: draw the whole
      whole = rat(rng.int(find === "whole" ? 10 : 2, W));
      part = mul(fraction, whole);
    }
    if (!printable(part, decimals) || !printable(whole, false)) continue;
    // a percent of exactly 100 asks nothing; and part = whole likewise
    if (percent.n === 100 && percent.d === 1) continue;
    return { find, percent, part, whole, phrasing };
  }
  // Practically unreachable: 25% of 80 is 20.
  return { find, percent: rat(25), part: rat(20), whole: rat(80), phrasing };
}

export function promptLatex(k: PercentConstruction): string {
  const pc = percentLatex(k.percent);
  const P = amountLatex(k.part);
  const W = amountLatex(k.whole);
  switch (k.find) {
    case "part":
      return [
        `\\text{What is } ${pc} \\text{ of } ${W}?`,
        `\\text{Find } ${pc} \\text{ of } ${W}.`,
        `${pc} \\text{ of } ${W} \\text{ is what number?}`,
      ][k.phrasing];
    case "percent":
      return [`${P} \\text{ is what percent of } ${W}?`, `\\text{What percent of } ${W} \\text{ is } ${P}?`][
        k.phrasing
      ];
    case "whole":
      return [`${P} \\text{ is } ${pc} \\text{ of what number?}`, `${pc} \\text{ of what number is } ${P}?`][
        k.phrasing
      ];
  }
}

export function answerOf(k: PercentConstruction): Rat {
  return k.find === "part" ? k.part : k.find === "percent" ? k.percent : k.whole;
}

export function answerLatex(k: PercentConstruction, r: Rat = answerOf(k)): string {
  return k.find === "percent" ? percentLatex(r) : amountLatex(r);
}

/**
 * Mistake-based Distractors:
 * - part: divided by the percent instead of multiplying (found the whole),
 *   misplaced the decimal point in the percent (0.03 or 3 for 30%), found
 *   the rest of the whole (70% of 80), or never divided by 100 (2400);
 * - percent: the ratio upside down (48 / 12), forgot to multiply by 100
 *   ("0.25%"), the rest (75%), or the part read as the percent (12%);
 * - whole: multiplied instead of dividing (found the part), misplaced the
 *   decimal point, doubled the part, or multiplied by the percent itself.
 */
export function distractors(k: PercentConstruction, decimals = true): string[] {
  const { percent, part, whole } = k;
  const f = div(percent, rat(100))!;
  let values: (Rat | null)[];
  switch (k.find) {
    case "part":
      // ... and the percent multiplied in without dividing by 100
      values = [div(whole, f), mul(whole, div(percent, rat(1000))!), mul(whole, div(percent, rat(10))!), mul(whole, sub(rat(1), f)), mul(whole, percent)];
      break;
    case "percent":
      // ... and the part read as the percent (12 is 12%)
      values = [mul(div(whole, part)!, rat(100)), div(part, whole), sub(rat(100), percent), mul(div(part, whole)!, rat(10)), part];
      break;
    case "whole":
      // ... and the percent multiplied in without dividing by 100
      values = [mul(part, f), div(part, div(percent, rat(10))!), div(part, div(percent, rat(1000))!), mul(part, rat(2)), mul(part, percent)];
      break;
  }
  // Added the percent (or the part) onto the whole instead of finding a part of it.
  if (k.find === "part") values.push(add(whole, part), add(whole, percent), sub(whole, percent));
  // Over 100%: counted only the part above the whole (175% of 100 as 75, forgetting the 100%).
  if (k.find === "part" && percent.n > 100 * percent.d) values.push(mul(whole, sub(f, rat(1))));
  if (k.find === "whole") values.push(add(part, percent), add(whole, part), sub(whole, part), div(part, percent));
  // Used the whole as a percentage, used the remaining part as the base,
  // or reported the percent after an increase instead of the part's percent.
  if (k.find === "percent") {
    const ratio = div(part, sub(whole, part));
    values.push(whole, ratio && mul(ratio, rat(100)), add(rat(100), percent), mul(percent, rat(10)));
  }
  const answer = answerOf(k);
  return distinctHints(
    answerLatex(k),
    values
      .filter((r): r is Rat => plausibleAmount(r, answer, decimals || k.find === "percent"))
      .map((r) => answerLatex(k, r)),
  );
}

export const generator: Generator = {
  id: PERCENTS_ID,
  title: "Percents",
  defaultDirections: "Answer each question.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: PERCENTS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k, resolved.decimals as boolean),
    };
  },
};

