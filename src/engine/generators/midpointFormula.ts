// "The midpoint formula": the midpoint of (2, -5) and (8, 3) is (5, -1); or,
// given one endpoint (2, -5) and the midpoint (5, -1), the other endpoint is
// (8, 3). Opt-in halves: the midpoint of (1, 4) and (4, -3) is
// (\frac{5}{2}, \frac{1}{2}).
//
// Built ANSWER-FROM-CONSTRUCTION:
// - midpoint: the coordinate sums sx and sy are chosen (even unless halves
//   are on), so the Answer is (sx/2, sy/2); then x1 is placed so that both
//   x1 and x2 = sx - x1 sit inside the coordinate limit, and likewise y;
// - missing endpoint: the two endpoints are chosen (the second is the
//   Answer) and the midpoint printed from them.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { ANSWER_PART_SEPARATOR } from "../format";
import { distinctHints, numLatex, rat, type Rat } from "./equationKit";

export const MIDPOINT_FORMULA_ID = "midpoint-formula";

export type TaskMode = "midpoint" | "endpoint" | "mixed";

export const schema = [
  {
    type: "enum",
    key: "task",
    label: "Find",
    default: "midpoint",
    options: [
      { value: "midpoint", label: "The midpoint" },
      { value: "endpoint", label: "A missing endpoint" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "boolean",
    key: "fractions",
    label: "Allow midpoints with halves",
    default: false,
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

type Pt = [number, number];

export interface MidpointConstruction {
  task: "midpoint" | "endpoint";
  a: Pt;
  b: Pt;
}

/** Two coordinates u, v in [-M, M], u != v, whose sum is even unless `half`. */
function pair(rng: Rng, M: number, half: boolean): [number, number] {
  for (;;) {
    const s = half ? rng.int(-M, M - 1) * 2 + 1 : rng.int(-M, M) * 2;
    const u = rng.int(Math.max(-M, s - M), Math.min(M, s + M));
    const v = s - u;
    if (u !== v && Math.abs(u) <= M && Math.abs(v) <= M) return [u, v];
  }
}

export function construct(params: ParamValues, rng: Rng): MidpointConstruction {
  const p = resolveParams(schema, params);
  const M = p.maxCoordinate as number;
  const mode = p.task as TaskMode;
  const task = mode === "mixed" ? rng.pick(["midpoint", "endpoint"] as const) : mode;
  // With halves on, most midpoints have at least one half.
  const halfX = (p.fractions as boolean) && rng.bool(0.6);
  const halfY = (p.fractions as boolean) && rng.bool(halfX ? 0.4 : 0.6);
  // A missing endpoint is twice the midpoint less the given endpoint, so its
  // own coordinates must stay inside the limit too: draw both endpoints.
  const [x1, x2] = pair(rng, M, halfX);
  const [y1, y2] = pair(rng, M, halfY);
  return { task, a: [x1, y1], b: [x2, y2] };
}

export const midpointOf = (a: Pt, b: Pt): [Rat, Rat] => [rat(a[0] + b[0], 2), rat(a[1] + b[1], 2)];

/** "(5, -1)", "\left(\frac{5}{2}, 3\right)" */
export function pointLatex(x: Rat, y: Rat): string {
  const xs = numLatex(x);
  const ys = numLatex(y);
  return x.d !== 1 || y.d !== 1 ? `\\left(${xs}, ${ys}\\right)` : `(${xs}, ${ys})`;
}

const intPoint = (p: Pt) => pointLatex(rat(p[0]), rat(p[1]));

export function promptLatex(k: MidpointConstruction): string {
  if (k.task === "midpoint") return `${intPoint(k.a)} \\text{ and } ${intPoint(k.b)}`;
  const [mx, my] = midpointOf(k.a, k.b);
  // in two parts, so the print can wrap between them
  return `\\text{endpoint } ${intPoint(k.a)}${ANSWER_PART_SEPARATOR}\\text{midpoint } ${pointLatex(mx, my)}`;
}

export function answerLatex(k: MidpointConstruction): string {
  if (k.task === "endpoint") return intPoint(k.b);
  const [mx, my] = midpointOf(k.a, k.b);
  return pointLatex(mx, my);
}

/**
 * Mistake-based Distractors.
 * Midpoint:
 * - half the difference instead of half the sum, both ways round;
 * - forgot to divide by 2;
 * - x and y swapped;
 * - averaged each point's own coordinates: ((x1 + y1)/2, (x2 + y2)/2).
 * Missing endpoint:
 * - took the midpoint of the given endpoint and the midpoint;
 * - added the given endpoint to the midpoint, or subtracted it;
 * - doubled the endpoint instead of the midpoint: 2A - M;
 * - x and y swapped.
 */
export function distractors(k: MidpointConstruction): string[] {
  const [x1, y1] = k.a;
  const [x2, y2] = k.b;
  const answer = answerLatex(k);
  const P = (x: Rat, y: Rat) => pointLatex(x, y);
  if (k.task === "midpoint") {
    return distinctHints(answer, [
      P(rat(x2 - x1, 2), rat(y2 - y1, 2)),
      P(rat(x1 + x2), rat(y1 + y2)),
      P(rat(y1 + y2, 2), rat(x1 + x2, 2)),
      P(rat(x1 + y1, 2), rat(x2 + y2, 2)),
      P(rat(x1 - x2, 2), rat(y1 - y2, 2)),
      P(rat(x1 + x2 + 2, 2), rat(y1 + y2, 2)),
    ]).slice(0, 6);
  }
  return distinctHints(answer, [
    P(rat(3 * x1 + x2, 4), rat(3 * y1 + y2, 4)),
    P(rat(3 * x1 + x2, 2), rat(3 * y1 + y2, 2)),
    P(rat(x2 - x1, 2), rat(y2 - y1, 2)),
    P(rat(3 * x1 - x2, 2), rat(3 * y1 - y2, 2)),
    P(rat(y2), rat(x2)),
    P(rat(-x2), rat(-y2)),
  ]).slice(0, 6);
}

export const generator: Generator = {
  id: MIDPOINT_FORMULA_ID,
  title: "The midpoint formula",
  defaultDirections: "Find the midpoint of each segment, or its missing endpoint.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: MIDPOINT_FORMULA_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
