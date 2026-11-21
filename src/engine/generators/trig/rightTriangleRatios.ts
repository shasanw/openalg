// "Right-triangle trig: finding ratios": a right triangle with its sides
// labelled and an acute angle θ marked; find sin θ, cos θ and tan θ (or one of
// them, or all six) as exact fractions in simplest form. Optionally one side
// is a radical (legs 2 and 3, hypotenuse √13), and optionally one side is
// marked x, to be found first with the Pythagorean theorem.
//
// Built ANSWER-FROM-CONSTRUCTION: the three sides are chosen first, as a
// scaled Pythagorean triple or as two whole sides whose third side is a
// radical (never solved: its square is a sum or difference of whole squares,
// simplified). Every ratio is then one side over another, divided and
// rationalized exactly (surdDiv). The triangle is drawn to scale from those
// sides, legs along the axes, so the picture never contradicts its labels.
//
// The student's triangle is the question (the given sides, θ, the right-angle
// mark, and "x" on a side to find first). When there is an x, the answer
// graph is the same triangle with x replaced by that side's length.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { ANSWER_PART_SEPARATOR } from "../../format";
import type { TriangleCorner, TriangleSpec } from "../../plot";
import { distinctHints } from "../shared/equationKit";
import {
  PRIMARY_FNS,
  PYTHAGOREAN_TRIPLES,
  reciprocalFn,
  rightTriangleCorners,
  surd,
  surdDiv,
  surdLatex,
  surdText,
  surdValue,
  TRIG_FNS,
  trigOf,
  type RightSide,
  type Surd,
  type TrigFn,
} from "./trigKit";

export const RIGHT_TRIANGLE_RATIOS_ID = "right-triangle-ratios";

export type Functions = "one" | "primary" | "all";
export type Sides = "whole" | "radical" | "mixed";
export type MissingSide = "none" | "mixed" | "always";

export const schema = [
  {
    type: "enum",
    key: "functions",
    label: "Find",
    default: "primary",
    options: [
      { value: "one", label: "One of sin, cos or tan" },
      { value: "primary", label: "sin, cos and tan" },
      { value: "all", label: "All six trig ratios" },
    ],
  },
  {
    type: "enum",
    key: "sides",
    label: "Side lengths",
    default: "whole",
    options: [
      { value: "whole", label: "Whole numbers (Pythagorean triples)" },
      { value: "radical", label: "One side a radical, like √13" },
      { value: "mixed", label: "A mix of both" },
    ],
  },
  {
    type: "enum",
    key: "missingSide",
    label: "Missing side",
    default: "none",
    options: [
      { value: "none", label: "All three sides given" },
      { value: "mixed", label: "Some with a side to find first" },
      { value: "always", label: "Always a side to find first" },
    ],
  },
  {
    type: "int",
    key: "maxSide",
    label: "Longest side (hypotenuse) at most",
    min: 5,
    max: 60,
    default: 30,
  },
] as const satisfies ParamSchema;

/**
 * Triples drawn: 9-40-41 is left out, since its 12.7° angle is too thin to
 * label clearly.
 */
const TRIPLES = PYTHAGOREAN_TRIPLES.filter(([a, b]) => b / a <= 3.5);

/** Legs of the radical triangles stay within a 3:1 ratio, so no angle is under 18°. */
const MAX_LEG_RATIO = 3;

/** The construction, exposed for property tests. */
export interface RatiosConstruction {
  /** The horizontal leg, the vertical leg and the hypotenuse. */
  run: Surd;
  rise: Surd;
  hyp: Surd;
  /** Where θ is: at the far end of the horizontal leg, or at the top of the vertical one. */
  thetaAt: "run" | "rise";
  /** The right angle at the bottom right instead of the bottom left. */
  flip: boolean;
  /** The side marked x, named from θ, or null when all three are given. */
  missing: RightSide | null;
  fns: TrigFn[];
}

/** The sides named from θ. */
export function roles(k: RatiosConstruction): Record<RightSide, Surd> {
  return k.thetaAt === "run" ? { opp: k.rise, adj: k.run, hyp: k.hyp } : { opp: k.run, adj: k.rise, hyp: k.hyp };
}

const isSquare = (n: number) => Number.isInteger(Math.sqrt(n));

/** Sides (two legs and the hypotenuse, legs in random order) from a scaled triple. */
function wholeSides(rng: Rng, maxSide: number): [Surd, Surd, Surd] {
  const fits = TRIPLES.filter(([, , c]) => c <= maxSide);
  const [a, b, c] = rng.pick(fits);
  const k = rng.int(1, Math.floor(maxSide / c));
  const legs = rng.bool() ? [a, b] : [b, a];
  return [surd(k * legs[0]), surd(k * legs[1]), surd(k * c)];
}

/** Two whole sides and a radical third: two whole legs, or a whole leg and hypotenuse. */
function radicalSides(rng: Rng, maxSide: number): [Surd, Surd, Surd] {
  const L = Math.min(12, maxSide);
  for (;;) {
    if (rng.bool()) {
      const p = rng.int(1, L);
      const q = rng.int(1, L);
      const h2 = p * p + q * q;
      if (p === q || Math.max(p, q) / Math.min(p, q) > MAX_LEG_RATIO || isSquare(h2) || h2 > maxSide * maxSide) continue;
      return [surd(p), surd(q), surd(1, h2)];
    }
    const c = rng.int(3, Math.min(15, maxSide));
    const p = rng.int(1, c - 1);
    const q2 = c * c - p * p;
    const q = Math.sqrt(q2);
    if (isSquare(q2) || Math.max(p, q) / Math.min(p, q) > MAX_LEG_RATIO) continue;
    const legs = rng.bool() ? [surd(p), surd(1, q2)] : [surd(1, q2), surd(p)];
    return [legs[0], legs[1], surd(c)];
  }
}

export function construct(params: ParamValues, rng: Rng): RatiosConstruction {
  const p = resolveParams(schema, params);
  const maxSide = p.maxSide as number;
  const sides = p.sides as Sides;
  const radical = sides === "radical" || (sides === "mixed" && rng.bool());
  const [run, rise, hyp] = radical ? radicalSides(rng, maxSide) : wholeSides(rng, maxSide);
  const thetaAt = rng.bool() ? "run" : "rise";
  const flip = rng.bool();
  const ms = p.missingSide as MissingSide;
  const missing = ms === "always" || (ms === "mixed" && rng.bool()) ? rng.pick<RightSide>(["opp", "adj", "hyp"]) : null;
  const f = p.functions as Functions;
  // A single requested ratio must use the side the student has to find.
  const eligible = PRIMARY_FNS.filter((fn) =>
    fn === "sin" ? missing !== "adj" : fn === "cos" ? missing !== "opp" : missing !== "hyp",
  );
  const fns = f === "one" ? [rng.pick(eligible)] : f === "primary" ? [...PRIMARY_FNS] : [...TRIG_FNS];
  return { run, rise, hyp, thetaAt, flip, missing, fns };
}

/** fn θ for a triangle with these sides opposite, adjacent to and across from θ. */
export function ratio(fn: TrigFn, s: Record<RightSide, Surd>): Surd {
  const [num, den] = {
    sin: [s.opp, s.hyp],
    cos: [s.adj, s.hyp],
    tan: [s.opp, s.adj],
    csc: [s.hyp, s.opp],
    sec: [s.hyp, s.adj],
    cot: [s.adj, s.opp],
  }[fn];
  return surdDiv(num, den)!;
}

const THETA = "\\theta";

/** "\sin \theta = \frac{3}{5};\quad \cos \theta = ..." with fn θ's value given by `value`. */
function valuesLatex(fns: readonly TrigFn[], value: (fn: TrigFn) => Surd): string {
  return fns.map((fn) => `${trigOf(fn, THETA)} = ${surdLatex(value(fn))}`).join(ANSWER_PART_SEPARATOR);
}

export const answerLatex = (k: RatiosConstruction): string => valuesLatex(k.fns, (fn) => ratio(fn, roles(k)));

export function promptLatex(k: RatiosConstruction): string {
  const asked = k.fns.map((fn) => trigOf(fn, THETA));
  if (asked.length <= 3) return asked.join(", ");
  return `${asked.slice(0, 3).join(", ")}${ANSWER_PART_SEPARATOR}${asked.slice(3).join(", ")}`;
}

/** The square of a side n√r: n²r. */
const squareOf = (s: Surd) => s.n * s.n * s.r;

/**
 * Mistake-based Distractors, most common first: the ratios of the other acute
 * angle (opposite and adjacent swapped), the hypotenuse mistaken for the
 * adjacent or the opposite side, every ratio upside down (the reciprocal
 * function), tan and cot (and csc and sec) swapped, and, when a side was found
 * first, the Pythagorean theorem used the wrong way round (squares added for a
 * leg, subtracted for the hypotenuse). With one ratio asked, the values of the
 * other ratios follow.
 */
export function distractors(k: RatiosConstruction): string[] {
  const s = roles(k);
  const swaps: Partial<Record<TrigFn, TrigFn>>[] = [{ tan: "cot", cot: "tan" }, { csc: "sec", sec: "csc" }];
  const candidates: string[] = [
    valuesLatex(k.fns, (fn) => ratio(fn, { opp: s.adj, adj: s.opp, hyp: s.hyp })),
    valuesLatex(k.fns, (fn) => ratio(fn, { opp: s.opp, adj: s.hyp, hyp: s.adj })),
    valuesLatex(k.fns, (fn) => ratio(fn, { opp: s.hyp, adj: s.adj, hyp: s.opp })),
    valuesLatex(k.fns, (fn) => ratio(reciprocalFn(fn), s)),
    ...swaps.map((m) => valuesLatex(k.fns, (fn) => ratio(m[fn] ?? fn, s))),
  ];
  if (k.missing) {
    const others = (["opp", "adj", "hyp"] as const).filter((r) => r !== k.missing).map((r) => squareOf(s[r]));
    const wrongSq = k.missing === "hyp" ? Math.abs(others[0] - others[1]) : others[0] + others[1];
    if (wrongSq > 0) candidates.splice(1, 0, valuesLatex(k.fns, (fn) => ratio(fn, { ...s, [k.missing!]: surd(1, wrongSq) })));
  }
  if (k.fns.length === 1) for (const other of TRIG_FNS) candidates.push(valuesLatex(k.fns, () => ratio(other, s)));
  return distinctHints(answerLatex(k), candidates);
}

/** The side lengths as labels: the missing one "x" on the student's copy, its length on the key's. */
export function graphOf(k: RatiosConstruction, answered: boolean): TriangleSpec {
  const s = roles(k);
  const label = (role: RightSide) =>
    role !== k.missing ? { text: surdText(s[role]) } : answered ? { text: surdText(s[role]), answer: true } : { text: "x" };
  const [R, H, V] = rightTriangleCorners(surdValue(k.run), surdValue(k.rise), k.flip);
  // The side opposite H is the vertical leg, opposite V the horizontal one.
  const riseRole: RightSide = k.thetaAt === "run" ? "opp" : "adj";
  const runRole: RightSide = k.thetaAt === "run" ? "adj" : "opp";
  const theta = { text: "θ" };
  const corners: [TriangleCorner, TriangleCorner, TriangleCorner] = [
    { ...R, rightAngle: true, opposite: label("hyp") },
    { ...H, opposite: label(riseRole), ...(k.thetaAt === "run" ? { angle: theta } : {}) },
    { ...V, opposite: label(runRole), ...(k.thetaAt === "rise" ? { angle: theta } : {}) },
  ];
  return { kind: "triangle", corners };
}

export const generator: Generator = {
  id: RIGHT_TRIANGLE_RATIOS_ID,
  title: "Right-triangle trig: finding ratios",
  defaultDirections: "Find each trig ratio of θ. Give exact answers in simplest form.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: RIGHT_TRIANGLE_RATIOS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
      graph: graphOf(k, false),
      ...(k.missing ? { answerGraph: graphOf(k, true) } : {}),
    };
  },
};
