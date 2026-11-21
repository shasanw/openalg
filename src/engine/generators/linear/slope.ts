// "Slope": find the slope of a line through two points, or of a line graphed
// on a grid.
//
// Built ANSWER-FROM-CONSTRUCTION: the slope is chosen first as a reduced
// rise/run, then a whole multiple of that step (k * run across, k * rise up)
// is laid down from a first point chosen so both points fit the coordinate
// limit. The two points (or the graphed line through them) are the Problem;
// the chosen slope is the Answer.
//
// From a graph, the line is drawn through the whole grid with its two lattice
// points marked, so a student can count rise over run. The graph is the
// question itself (there is no answer graph): it shows the line, never its
// slope.

import { createRng, type Rng } from "../../rng";
import {
  resolveParams,
  type Generator,
  type ParamSchema,
  type ParamValues,
  type Problem,
} from "../../types";
import { fractionToLatex } from "../../format";
import {
  Distractors,
  GRID_LIMIT,
  lineGraph,
  lineThrough,
  pickSlope,
  pointLatex,
  slope,
  slopeLatex,
  type Slope,
} from "../shared/lines";
import type { CoordinatePlaneSpec } from "../../plot";

export const SLOPE_ID = "slope";

export type SlopeSource = "points" | "graph" | "mixed";

export const schema = [
  {
    type: "enum",
    key: "source",
    label: "Line given by",
    default: "points",
    options: [
      { value: "points", label: "Two points" },
      { value: "graph", label: "A graphed line" },
      { value: "mixed", label: "A mix of both" },
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
    label: "Include zero and undefined slopes",
    default: false,
  },
  {
    type: "int",
    key: "maxCoordinate",
    label: "Largest coordinate (graphs stay within 9)",
    min: 3,
    max: 12,
    default: 6,
  },
] as const satisfies ParamSchema;

/** The construction, exposed for property tests. */
export interface SlopeConstruction {
  source: "points" | "graph";
  /** The chosen slope (the Answer). */
  slope: Slope;
  /** The two points, in the order printed. */
  p1: [number, number];
  p2: [number, number];
}

/** Steps k * (run, rise) that fit between two points at most `span` apart each way, k <= 3. */
function multiples(s: Slope, span: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= 3; k++) if (k * s.run <= span && k * Math.abs(s.rise) <= span) out.push(k);
  return out;
}

export function construct(params: ParamValues, rng: Rng): SlopeConstruction {
  const p = resolveParams(schema, params);
  const sourceParam = p.source as SlopeSource;
  const source = sourceParam === "mixed" ? (rng.bool() ? "points" : "graph") : sourceParam;
  const M = source === "graph" ? Math.min(p.maxCoordinate as number, GRID_LIMIT) : (p.maxCoordinate as number);

  let s: Slope = slope(1, 1);
  let ks: number[] = [];
  for (let i = 0; i < 32 && ks.length === 0; i++) {
    if ((p.includeSpecial as boolean) && rng.bool(0.25)) s = rng.bool() ? slope(0, 1) : slope(1, 0);
    else s = pickSlope(rng, p.fractions as boolean);
    ks = multiples(s, 2 * M);
  }
  if (ks.length === 0) [s, ks] = [slope(1, 1), [1]];

  const k = rng.pick(ks);
  const dx = k * s.run;
  const dy = k * s.rise;
  const x1 = rng.int(-M, M - dx);
  const y1 = dy >= 0 ? rng.int(-M, M - dy) : rng.int(-M - dy, M);
  let p1: [number, number] = [x1, y1];
  let p2: [number, number] = [x1 + dx, y1 + dy];
  if (rng.bool()) [p1, p2] = [p2, p1];
  return { source, slope: s, p1, p2 };
}

export function promptLatex(k: SlopeConstruction): string {
  return k.source === "graph" ? "\\text{The line shown}" : `${pointLatex(k.p1)} \\text{ and } ${pointLatex(k.p2)}`;
}

export function graphOf(k: SlopeConstruction): CoordinatePlaneSpec {
  return lineGraph(lineThrough(k.slope, k.p1[0], k.p1[1]), [k.p1, k.p2]);
}

/** Mistake-based Distractors, most common first. */
export function distractors(k: SlopeConstruction): string[] {
  const [x1, y1] = k.p1;
  const [x2, y2] = k.p2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const frac = (n: number, d: number) => (d === 0 ? "\\text{undefined}" : fractionToLatex(n, d));
  const d = new Distractors(slopeLatex(k.slope));
  // run over rise (which also turns a zero slope into "undefined" and back)
  d.add(frac(dx, dy));
  // a sign error: subtracting the x's and y's in opposite orders
  if (dx !== 0 && dy !== 0) d.add(frac(-dy, dx), frac(-dx, dy));
  if (k.source === "points") {
    // added the coordinates instead of subtracting
    if (x1 + x2 !== 0) d.add(frac(y1 + y2, x1 + x2));
  } else if (dx !== 0) {
    // miscounted the rise by one square
    d.add(frac(dy + (dy >= 0 ? 1 : -1), dx));
  }
  // zero and undefined confused
  d.add("0", "\\text{undefined}");
  // a horizontal or vertical line's slope taken as the coordinate it sits at,
  // or as the one distance that changes
  if (dy === 0) d.add(String(y1), String(dx));
  if (dx === 0) d.add(String(x1), String(dy), String(-dy), "1");
  // Reported just the rise or run, or divided one point's y-coordinate by its x-coordinate.
  d.add(String(dy), String(dx), frac(y1, x1), frac(y2, x2));
  // Subtracted on one axis but added on the other.
  d.add(frac(y1 + y2, dx), frac(dy, x1 + x2));
  if (dy === 0) d.add("\\infty"); // inverted rise/run and interpreted division by zero as infinity
  if (dy === 0) d.add(String(x1), String(x2), String(-dx)); // used a horizontal distance as the slope
  if (dx === 0) d.add(String(y1), String(y2), "\\infty"); // treated division by zero as infinity
  // Counted the starting grid point as a unit of run.
  d.add(frac(dy, dx + Math.sign(dx)));
  // Read the equation x = c or y = c as having an implicit coefficient of one.
  if (dy === 0 || dx === 0) d.add("1");
  return d.list;
}

export const generator: Generator = {
  id: SLOPE_ID,
  title: "Finding slope",
  defaultDirections: "Find the slope of each line.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    const problem: Problem = {
      kind: "generated",
      generatorId: SLOPE_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: slopeLatex(k.slope),
      distractorHints: distractors(k),
    };
    if (k.source === "graph") problem.graph = graphOf(k);
    return problem;
  },
};

