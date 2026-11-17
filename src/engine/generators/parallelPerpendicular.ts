// "Parallel and perpendicular slopes": find the slope of a line parallel or
// perpendicular to a given line, or tell whether two lines are parallel,
// perpendicular, or neither.
//
// Built ANSWER-FROM-CONSTRUCTION:
// - finding a slope: the given line's slope is chosen first, and the Answer is
//   that slope (parallel) or its negative reciprocal (perpendicular), with
//   horizontal and vertical lines swapping;
// - classifying: the relationship is chosen first, then a second slope that
//   has it: the same slope with a different intercept (parallel, so never the
//   same line), the negative reciprocal (perpendicular), or a near miss such
//   as the reciprocal or the opposite (neither).
// Only then is each line written out, in slope-intercept or standard form or
// as its bare slope. Standard form is read off the chosen slope and intercept
// (see lines.ts), never solved.

import { createRng, type Rng } from "../rng";
import {
  resolveParams,
  type Generator,
  type ParamSchema,
  type ParamValues,
  type Problem,
} from "../types";
import { fractionToLatex } from "../format";
import {
  Distractors,
  isVertical,
  lineSlope,
  perpendicular,
  pickSlope,
  q,
  qLatex,
  slope,
  slopeInterceptLatex,
  slopeLatex,
  standardCoefficients,
  standardLatex,
  type Line,
  type Slope,
} from "./lines";

export const PARALLEL_PERPENDICULAR_ID = "parallel-perpendicular-slopes";

export type PPAsk = "slope" | "classify" | "mixed";
export type PPRelationParam = "both" | "parallel" | "perpendicular";
export type Relation = "parallel" | "perpendicular" | "neither";
export type GivenForm = "slopeIntercept" | "standard" | "slope";

export const schema = [
  {
    type: "enum",
    key: "ask",
    label: "Question",
    default: "slope",
    options: [
      { value: "slope", label: "Find a parallel or perpendicular slope" },
      { value: "classify", label: "Parallel, perpendicular, or neither?" },
      { value: "mixed", label: "A mix of both" },
    ],
  },
  {
    type: "enum",
    key: "relation",
    label: "Slopes to find",
    default: "both",
    options: [
      { value: "both", label: "Parallel and perpendicular" },
      { value: "parallel", label: "Parallel only" },
      { value: "perpendicular", label: "Perpendicular only" },
    ],
  },
  {
    type: "enum",
    key: "given",
    label: "Lines given as",
    default: "slopeIntercept",
    options: [
      { value: "slopeIntercept", label: "Slope-intercept form" },
      { value: "standard", label: "Standard form" },
      { value: "slope", label: "Just the slope" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "boolean",
    key: "fractions",
    label: "Allow fractional slopes",
    default: false,
  },
  {
    type: "boolean",
    key: "includeSpecial",
    label: "Include horizontal and vertical lines",
    default: false,
  },
] as const satisfies ParamSchema;

/** One given line and how it is written. */
export interface GivenLine {
  line: Line;
  form: GivenForm;
}

/** The construction, exposed for property tests. */
export type PPConstruction =
  | { ask: "slope"; relation: "parallel" | "perpendicular"; given: GivenLine; answer: Slope }
  | { ask: "classify"; relation: Relation; given: [GivenLine, GivenLine] };

const ANSWER_TEXT: Record<Relation, string> = {
  parallel: "\\text{Parallel}",
  perpendicular: "\\text{Perpendicular}",
  neither: "\\text{Neither}",
};

const sameSlope = (a: Slope, b: Slope) => a.rise === b.rise && a.run === b.run;

/** A slope for a given line: ordinary, or (one time in four, when allowed) horizontal or vertical. */
function givenSlope(rng: Rng, p: ParamValues): Slope {
  if ((p.includeSpecial as boolean) && rng.bool(0.25)) return rng.bool() ? slope(0, 1) : slope(1, 0);
  return pickSlope(rng, p.fractions as boolean);
}

/** The line with slope `s` and intercept `c` (the y-intercept, or x = c when vertical). */
function lineOf(s: Slope, c: number): Line {
  return isVertical(s) ? { vertical: true, x: q(c) } : { vertical: false, m: q(s.rise, s.run), b: q(c) };
}

function intercept(rng: Rng): number {
  return rng.int(-8, 8);
}

function pickForm(rng: Rng, given: string, choices: GivenForm[]): GivenForm {
  return given === "mixed" ? rng.pick(choices) : (given as GivenForm);
}

/** A second slope that is neither parallel nor perpendicular to `s`, tempting first. */
function nearMiss(rng: Rng, s: Slope, fractions: boolean): Slope {
  const ok = (t: Slope) => !sameSlope(t, s) && !sameSlope(t, perpendicular(s));
  const tempting = isVertical(s) || s.rise === 0 ? [] : [slope(s.run, s.rise), slope(-s.rise, s.run)];
  const candidates = tempting.filter(ok);
  if (candidates.length && rng.bool(0.75)) return rng.pick(candidates);
  for (;;) {
    const t = pickSlope(rng, fractions);
    if (ok(t)) return t;
  }
}

export function construct(params: ParamValues, rng: Rng): PPConstruction {
  const p = resolveParams(schema, params);
  const askParam = p.ask as PPAsk;
  const ask = askParam === "mixed" ? (rng.bool() ? "slope" : "classify") : askParam;
  const s = givenSlope(rng, p);

  if (ask === "slope") {
    const rel = p.relation as PPRelationParam;
    const relation = rel === "both" ? (rng.bool() ? "parallel" : "perpendicular") : rel;
    const form = pickForm(rng, p.given as string, ["slopeIntercept", "standard", "slope"]);
    const given = { line: lineOf(s, intercept(rng)), form };
    return { ask, relation, given, answer: relation === "parallel" ? s : perpendicular(s) };
  }

  const relation = rng.pick<Relation>(["parallel", "perpendicular", "neither"]);
  const t =
    relation === "parallel" ? s : relation === "perpendicular" ? perpendicular(s) : nearMiss(rng, s, p.fractions as boolean);
  const c1 = intercept(rng);
  let c2 = intercept(rng);
  // parallel lines are two different lines
  if (relation === "parallel" && c2 === c1) c2 = c1 === 8 ? c1 - 1 : c1 + 1;
  const bareSlopes = p.given === "slope";
  const form = (): GivenForm => (bareSlopes ? "slope" : pickForm(rng, p.given as string, ["slopeIntercept", "standard"]));
  let given: [GivenLine, GivenLine] = [
    { line: lineOf(s, c1), form: form() },
    { line: lineOf(t, c2), form: form() },
  ];
  if (rng.bool()) given = [given[1], given[0]];
  return { ask, relation, given };
}

function givenLatex(g: GivenLine): string {
  if (g.form === "standard") return standardLatex(g.line);
  if (g.form === "slopeIntercept") return slopeInterceptLatex(g.line);
  const s = lineSlope(g.line);
  return isVertical(s) ? "\\text{a line with undefined slope}" : `\\text{a line with slope } ${slopeLatex(s)}`;
}

export function promptLatex(k: PPConstruction): string {
  if (k.ask === "slope") {
    return `\\text{${k.relation === "parallel" ? "Parallel" : "Perpendicular"} to } ${givenLatex(k.given)}`;
  }
  const [a, b] = k.given;
  if (a.form === "slope") return `\\text{Slopes } ${slopeLatex(lineSlope(a.line))} \\text{ and } ${slopeLatex(lineSlope(b.line))}`;
  return `${givenLatex(a)} \\text{ and } ${givenLatex(b)}`;
}

export function answerLatex(k: PPConstruction): string {
  return k.ask === "slope" ? slopeLatex(k.answer) : ANSWER_TEXT[k.relation];
}

/** Mistake-based Distractors, most common first. */
export function distractors(k: PPConstruction): string[] {
  const d = new Distractors(answerLatex(k));
  if (k.ask === "classify") {
    // the other two verdicts (reciprocal without the sign change reads as
    // perpendicular; equal slopes as the same line), then two weaker ones
    const others = (["parallel", "perpendicular", "neither"] as const).filter((r) => r !== k.relation);
    d.add(...others.map((r) => ANSWER_TEXT[r]), "\\text{The same line}", "\\text{Cannot be determined}");
    return d.list;
  }
  const s = lineSlope(k.given.line);
  const line = k.given.line;
  // the other relationship's slope: parallel and perpendicular mixed up
  d.add(slopeLatex(k.relation === "parallel" ? perpendicular(s) : s));
  if (!isVertical(s) && s.rise !== 0) {
    // only half the negative reciprocal: just flipped, or just the sign changed
    d.add(fractionToLatex(s.run, s.rise), fractionToLatex(-s.rise, s.run));
  }
  if (k.given.form === "standard") {
    // standard form: the slope read off as A (or A/B without the minus sign)
    const [A, B] = standardCoefficients(line);
    if (B !== 0) {
      const misread = slope(A, B);
      d.add(slopeLatex(k.relation === "parallel" ? misread : perpendicular(misread)));
      d.add(String(A));
    }
  }
  if (line.vertical) {
    // x = c read as a slope of c
    d.add(qLatex(line.x), line.x.n !== 0 ? fractionToLatex(-line.x.d, line.x.n) : null);
  } else if (k.given.form !== "slope") {
    // the intercept taken as the slope
    d.add(qLatex(line.b));
  }
  d.add("0", "\\text{undefined}", "1", "-1");
  return d.list;
}

export const generator: Generator = {
  id: PARALLEL_PERPENDICULAR_ID,
  title: "Slopes of parallel and perpendicular lines",
  defaultDirections:
    "Find the slope of each line described, or tell whether the lines are parallel, perpendicular, or neither.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: PARALLEL_PERPENDICULAR_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
