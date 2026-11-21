// "Trig functions of any angle": the exact value of a trig function at a
// standard angle written in any form (\sin \frac{20\pi}{12}, \cos(-210^{\circ}),
// \tan 585^{\circ}); the trig functions of θ from a point on its terminal side
// ((-3, 4): \sin\theta = \frac{4}{5}, ...); and one function's value from
// another's plus the quadrant (\sin\theta = \frac{3}{5} in Quadrant II, so
// \cos\theta = -\frac{4}{5}).
//
// Built ANSWER-FROM-CONSTRUCTION: a standard angle is chosen, then the form it
// is written in, and the value is a table lookup. For a point, the point is
// chosen first (a Pythagorean triple, signed by its quadrant), and
// every value is a ratio of x, y and r; a given value and its quadrant are
// printed from that same point.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { ANSWER_PART_SEPARATOR, prose } from "../../format";
import { distinctHints, rat } from "../shared/equationKit";
import {
  angleLatex,
  exactValue,
  fromReference,
  quadrant,
  pickWritten,
  pointValue,
  pointValueMistakes,
  PRIMARY_FNS,
  PYTHAGOREAN_TRIPLES,
  reciprocalFn,
  REFERENCE_ANGLES,
  STANDARD_ANGLES,
  surd,
  TRIG_FNS,
  trigOf,
  trigValueLatex,
  valueMistakes,
  writtenLatex,
  type Angle,
  type AngleUnit,
  type Quadrant,
  type TrigFn,
  type TrigValue,
  type WrittenAngle,
} from "./trigKit";

export const TRIG_ANY_ANGLE_ID = "trig-any-angle";

export type AnyAngleProblem = "exact" | "point" | "fromValue";

export const schema = [
  {
    type: "enum",
    key: "problems",
    label: "Problems",
    default: "mixed",
    options: [
      { value: "exact", label: "Exact values at standard angles" },
      { value: "point", label: "From a point on the terminal side" },
      { value: "fromValue", label: "From one value and the quadrant" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "enum",
    key: "functions",
    label: "Functions to find",
    default: "all",
    options: [
      { value: "primary", label: "sin, cos and tan" },
      { value: "all", label: "All six" },
      ...TRIG_FNS.map(fn => ({ value: fn, label: fn })),
    ],
  },
  {
    type: "enum",
    key: "units",
    label: "Units",
    default: "mixed",
    options: [
      { value: "degrees", label: "Degrees" },
      { value: "radians", label: "Radians" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "boolean",
    key: "otherForms",
    label: "Write angles in other forms (coterminal, negative, unreduced)",
    default: true,
  },
] as const satisfies ParamSchema;

export type TrigAnyAngleConstruction =
  | { problem: "exact"; fn: TrigFn; base: Angle; written: WrittenAngle; unit: AngleUnit }
  /** ask: every function in the set (in order), or just one */
  | { problem: "point"; x: number; y: number; ask: TrigFn[] }
  | {
      problem: "fromValue";
      x: number;
      y: number;
      given: TrigFn;
      asked: TrigFn;
      /** how the quadrant is stated: in words, or as an inequality in this unit */
      condition: "words" | AngleUnit;
    };

const QUADRANT_SIGNS: Record<Quadrant, [number, number]> = { 1: [1, 1], 2: [-1, 1], 3: [-1, -1], 4: [1, -1] };

export const quadrantOf = (x: number, y: number): Quadrant => (x > 0 ? (y > 0 ? 1 : 4) : y > 0 ? 2 : 3);

/** Pick signed legs that determine all six exact ratios. */
function pickPoint(rng: Rng): [number, number] {
  const [sx, sy] = QUADRANT_SIGNS[rng.pick([1, 2, 3, 4] as const)];
  const [a, b] = rng.pick(PYTHAGOREAN_TRIPLES);
  return rng.bool() ? [sx * a, sy * b] : [sx * b, sy * a];
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): TrigAnyAngleConstruction {
  const p = resolveParams(schema, params);
  // a mix leans on exact values, the heart of the Topic
  const mix: AnyAngleProblem[] = ["exact", "exact", "point", "fromValue"];
  const problem: AnyAngleProblem = p.problems === "mixed" ? rng.pick(mix) : (p.problems as AnyAngleProblem);
  const fns = p.functions === "primary" ? PRIMARY_FNS : p.functions === "all" ? TRIG_FNS : [p.functions as TrigFn];
  const unit: AngleUnit = p.units === "mixed" ? rng.pick(["degrees", "radians"] as const) : (p.units as AngleUnit);
  if (problem === "exact") {
    const a = rng.pick(STANDARD_ANGLES);
    const fn = rng.pick(fns);
    const other = p.otherForms && rng.bool(0.8);
    // never "3\pi/3": an unreduced whole multiple of π looks like a misprint
    const allowed = other ? { unreduced: a.d > 1, coterminal: true, negative: true } : {};
    return { problem, fn, base: a, written: pickWritten(rng, a, allowed, unit).written, unit };
  }
  if (problem === "point") {
    const [x, y] = pickPoint(rng);
    return { problem, x, y, ask: rng.bool(0.5) ? [...fns] : [rng.pick(fns)] };
  }
  const [x, y] = pickPoint(rng);
  const asked = rng.pick(fns);
  const givens = p.functions === "primary" ? PRIMARY_FNS : TRIG_FNS;
  const given = rng.pick(givens.filter(f => f !== asked && f !== reciprocalFn(asked)));
  return { problem, x, y, given, asked, condition: rng.bool() ? "words" : unit };
}

const THETA = "\\theta";
const ROMAN = ["", "I", "II", "III", "IV"];
const pointText = (x: number, y: number) => `\\left(${x}, ${y}\\right)`;
const theta = (fn: TrigFn) => trigOf(fn, THETA);

/** "\frac{\pi}{2} < \theta < \pi" or "90^{\circ} < \theta < 180^{\circ}". */
export function quadrantInterval(q: Quadrant, unit: AngleUnit): string {
  return `${angleLatex(rat(q - 1, 2), unit)} < ${THETA} < ${angleLatex(rat(q, 2), unit)}`;
}

export function promptLatex(k: TrigAnyAngleConstruction): string {
  if (k.problem === "exact") return trigOf(k.fn, writtenLatex(k.written, k.unit));
  if (k.problem === "point") {
    const given = `${prose("The point")} ${pointText(k.x, k.y)} ${prose("is on the terminal side of")} ${THETA}`;
    if (k.ask.length === 1) return `${given}${prose(". Find")} ${theta(k.ask[0])}`;
    if (k.ask.length === 6) return `${given}${prose(". Find all six trig functions of")} ${THETA}`;
    const [first, second, last] = k.ask.map(theta);
    return `${given}${prose(". Find")} ${first}, ${second}, ${prose("and")} ${last}`;
  }
  const value = `${theta(k.given)} = ${trigValueLatex(pointValue(k.given, k.x, k.y))}`;
  const q = quadrantOf(k.x, k.y);
  const where =
    k.condition === "words"
      ? `${prose("with")} ${THETA} ${prose(`in Quadrant ${ROMAN[q]}, find`)}`
      : `${prose("and")} ${quadrantInterval(q, k.condition)}${prose(", find")}`;
  return `${prose("Given")} ${value} ${where} ${theta(k.asked)}`;
}

const partsLatex = (k: { ask: TrigFn[] }, value: (fn: TrigFn) => TrigValue) =>
  k.ask.map((fn) => `${theta(fn)} = ${trigValueLatex(value(fn))}`).join(ANSWER_PART_SEPARATOR);

export function answerLatex(k: TrigAnyAngleConstruction): string {
  if (k.problem === "exact") return trigValueLatex(exactValue(k.fn, k.base));
  if (k.problem === "fromValue") return trigValueLatex(pointValue(k.asked, k.x, k.y));
  if (k.ask.length === 1) return trigValueLatex(pointValue(k.ask[0], k.x, k.y));
  return partsLatex(k, (fn) => pointValue(fn, k.x, k.y));
}

const SIMPLE_VALUES: readonly TrigValue[] = [surd(0), surd(1), surd(-1), "undefined"];

/**
 * Mistake-based Distractors, most common first.
 * - Exact values: the quadrant's sign ignored, sin and cos swapped, √3/2 and
 *   1/2 mixed up, the reciprocal function (valueMistakes); at a quadrantal
 *   angle, the other values a quadrantal angle takes (0, 1, -1, undefined);
 *   otherwise the value at another reference angle in the same quadrant.
 * - One value from a point or from a given value: the sign ignored, x and y
 *   swapped, the reciprocal, r taken as |x| + |y| (pointValueMistakes).
 * - Every function from a point: the same slip applied to every part: the
 *   signs dropped, x and y swapped, each paired with its reciprocal, and the
 *   point reflected through the origin or across the y-axis.
 */
export function distractors(k: TrigAnyAngleConstruction): string[] {
  const answer = answerLatex(k);
  if (k.problem === "exact") {
    const a = k.base;
    const q = quadrant(a);
    // the same quadrant with the reference angle mixed up (45° for 30° or 60°)
    const otherRefs = q === null ? [] : REFERENCE_ANGLES.slice(1, 4).map((ref) => exactValue(k.fn, fromReference(ref, q)));
    const wrong = [...valueMistakes(k.fn, a), ...otherRefs, ...SIMPLE_VALUES, exactValue(k.fn, rat(1, 4)), exactValue(k.fn, rat(1, 6))];
    return distinctHints(answer, wrong.map(trigValueLatex));
  }
  const { x, y } = k;
  if (k.problem === "fromValue") return distinctHints(answer, pointValueMistakes(k.asked, x, y).map(trigValueLatex));
  if (k.ask.length === 1) return distinctHints(answer, pointValueMistakes(k.ask[0], x, y).map(trigValueLatex));
  return distinctHints(answer, [
    partsLatex(k, (fn) => pointValue(fn, Math.abs(x), Math.abs(y))),
    partsLatex(k, (fn) => pointValue(fn, y, x)),
    partsLatex(k, (fn) => pointValue(reciprocalFn(fn), x, y)),
    partsLatex(k, (fn) => pointValue(fn, -x, -y)),
    partsLatex(k, (fn) => pointValue(fn, -x, y)),
  ]);
}

export const generator: Generator = {
  id: TRIG_ANY_ANGLE_ID,
  title: "Trig functions of any angle",
  defaultDirections: "Find the exact value of each trig function.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: TRIG_ANY_ANGLE_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
