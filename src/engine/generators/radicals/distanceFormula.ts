// "The distance formula": the distance between (-3, 4) and (5, -2) is
// \sqrt{8^{2} + 6^{2}} = 10, or 2\sqrt{10}, or 6.3 rounded to the nearest
// tenth.
//
// Built ANSWER-FROM-CONSTRUCTION: the horizontal and vertical legs are chosen
// first (from a Pythagorean triple for a whole-number distance, or any pair
// whose squares sum to a non-square for a radical one), so the Answer is the
// simplified \sqrt{dx^2 + dy^2}; then the first point is placed so that both
// points sit inside the coordinate limit.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { pointLatex } from "../shared/lines";
import { appendDistinct, mono, reduceFraction, valuedFraction, simplifyTerm, term, termLatex, type Valued } from "./radicalKit";

export const DISTANCE_FORMULA_ID = "distance-formula";

export type Distances = "mixed" | "whole" | "radical";
export type AnswerForm = "exact" | "rounded";

export const schema = [
  {
    type: "enum",
    key: "distances",
    label: "Distances",
    default: "mixed",
    options: [
      { value: "mixed", label: "Whole numbers and radicals" },
      { value: "whole", label: "Whole numbers only, like 13" },
      { value: "radical", label: "Radicals only, like 2√10" },
    ],
  },
  {
    type: "enum",
    key: "answerForm",
    label: "Answers",
    default: "exact",
    options: [
      { value: "exact", label: "Simplest radical form" },
      { value: "rounded", label: "Rounded to the nearest tenth" },
    ],
  },
  {
    type: "int",
    key: "maxCoordinate",
    label: "Largest coordinate",
    min: 4,
    max: 20,
    default: 10,
  },
] as const satisfies ParamSchema;

/** Legs of Pythagorean triples. */
const TRIPLES: readonly [number, number][] = [
  [3, 4],
  [6, 8],
  [5, 12],
  [9, 12],
  [8, 15],
  [12, 16],
  [7, 24],
  [15, 20],
  [10, 24],
  [20, 21],
  [12, 35],
  [18, 24],
];

export interface DistanceConstruction {
  p1: [number, number];
  p2: [number, number];
  /** dx^2 + dy^2 */
  squared: number;
  rounded: boolean;
}

const isSquare = (n: number) => Math.round(Math.sqrt(n)) ** 2 === n;

function legs(rng: Rng, kind: "whole" | "radical", span: number): [number, number] {
  if (kind === "whole") {
    const fit = TRIPLES.filter(([, b]) => b <= span);
    const [a, b] = rng.pick(fit.length > 0 ? fit : TRIPLES.slice(0, 1));
    return rng.bool() ? [a, b] : [b, a];
  }
  for (;;) {
    const a = rng.int(1, span);
    const b = rng.int(1, span);
    if (!isSquare(a * a + b * b)) return [a, b];
  }
}

export function construct(params: ParamValues, rng: Rng): DistanceConstruction {
  const p = resolveParams(schema, params);
  const M = p.maxCoordinate as number;
  const mode = p.distances as Distances;
  const kind = mode === "mixed" ? (rng.bool(0.4) ? "whole" : "radical") : mode;
  // Legs at most 2M fit between -M and M; keep them a little shorter so the
  // points are not always pinned to the edges.
  const [ax, ay] = legs(rng, kind, Math.max(4, Math.round(1.6 * M)));
  const dx = rng.bool() ? ax : -ax;
  const dy = rng.bool() ? ay : -ay;
  const place = (d: number) => rng.int(Math.max(-M, -M - d), Math.min(M, M - d));
  const x1 = place(dx);
  const y1 = place(dy);
  return {
    p1: [x1, y1],
    p2: [x1 + dx, y1 + dy],
    squared: dx * dx + dy * dy,
    rounded: p.answerForm === "rounded",
  };
}

export const promptLatex = (k: DistanceConstruction) => `${pointLatex(k.p1)} \\text{ and } ${pointLatex(k.p2)}`;

/** A distance \sqrt{s} printed as the Answer would be: simplest radical form, or to the nearest tenth. */
export function distanceLatex(s: number, rounded: boolean): string {
  if (rounded) {
    const tenths = Math.round(Math.sqrt(s) * 10);
    return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
  }
  return termLatex(simplifyTerm(term(1, 2, s)));
}

export const answerLatex = (k: DistanceConstruction) => distanceLatex(k.squared, k.rounded);

/**
 * Mistake-based Distractors (a distance \sqrt{s}, printed like the Answer):
 * - forgot the square root: dx^2 + dy^2;
 * - added the legs: |dx| + |dy|;
 * - subtracted the squares: \sqrt{|dx^2 - dy^2|};
 * - added a coordinate pair instead of subtracting: x1 + x2 for x2 - x1;
 * - forgot to square the differences: \sqrt{|dx| + |dy|};
 * - squared the sum of the differences: |dx + dy|.
 * Compared by value, so a rounded Distractor never ties the Answer.
 */
export function distractors(k: DistanceConstruction): string[] {
  const [x1, y1] = k.p1;
  const [x2, y2] = k.p2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const show = (s: number): Valued | null => {
    if (!(s > 0)) return null;
    const tex = distanceLatex(s, k.rounded);
    return { tex, value: k.rounded ? Number(tex) : Math.sqrt(s) };
  };
  const plain = (v: number): Valued | null => (v > 0 ? { tex: String(v), value: v } : null);
  const answer: Valued = { tex: answerLatex(k), value: k.rounded ? Number(answerLatex(k)) : Math.sqrt(k.squared) };
  const old = [
    plain(k.squared),
    plain(Math.abs(dx) + Math.abs(dy)),
    show(Math.abs(dx * dx - dy * dy)),
    show((x1 + x2) ** 2 + dy * dy),
    show(dx * dx + (y1 + y2) ** 2),
    show(Math.abs(dx) + Math.abs(dy)),
    plain(Math.abs(dx + dy)),
    show(k.squared + 1),
  ];
  const extra = [
    // divided by 2 as in the midpoint formula
    halved(k.squared, k.rounded),
    // squared only one of the differences
    show(dx * dx + Math.abs(dy)),
    show(Math.abs(dx) + dy * dy),
    // averaged the two differences, as if finding a midpoint
    halfOf(Math.abs(dx) + Math.abs(dy), k.rounded),
    // multiplied the two differences
    plain(Math.abs(dx * dy)),
  ];
  return appendDistinct(answer, old, extra);
}

/** v / 2 for a whole number v: a whole number, \frac{v}{2}, or a decimal when rounded. */
function halfOf(v: number, rounded: boolean): Valued | null {
  if (!(v > 0)) return null;
  if (rounded) return { tex: String(v / 2), value: v / 2 };
  return { tex: v % 2 === 0 ? String(v / 2) : `\\frac{${v}}{2}`, value: v / 2 };
}

/** The distance \sqrt{s} divided by 2, printed like the Answer. */
function halved(s: number, rounded: boolean): Valued | null {
  const value = Math.sqrt(s) / 2;
  if (rounded) {
    const tex = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return { tex, value: Number(tex) };
  }
  const t = simplifyTerm(term(1, 2, s));
  return valuedFraction(reduceFraction({ num: [t], den: mono(2) }));
}

export const generator: Generator = {
  id: DISTANCE_FORMULA_ID,
  title: "The distance formula",
  defaultDirections: "Find the distance between each pair of points.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: DISTANCE_FORMULA_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
