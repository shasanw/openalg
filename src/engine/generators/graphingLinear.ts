// "Graphing linear equations": given a line's equation in slope-intercept,
// standard or point-slope form, graph it.
//
// Built ANSWER-FROM-CONSTRUCTION: the slope (a reduced rise/run) and a whole-
// number y-intercept are chosen first, along with a second lattice point one
// rise/run step away, so a student can plot the intercept and count to the
// next point. Only then is the equation written out in the requested form
// (see lines.ts), never solved. A point-slope equation is written through a
// lattice point of the line other than its y-intercept.
//
// The student's grid is BLANK and the same window (-10..10 both ways) for every
// Problem, so it gives nothing away; the Answer Key's graph (`answerGraph`)
// draws the line on that same window with the two points it was built from.
// The text Answer states the slope and y-intercept (x-intercept for a vertical
// line), which is what multiple choice offers: graphs as choices would not fit
// a column and would show the student the line they are asked to draw.

import { createRng, type Rng } from "../rng";
import {
  resolveParams,
  type Generator,
  type ParamSchema,
  type ParamValues,
  type Problem,
} from "../types";
import { ANSWER_PART_SEPARATOR, fractionToLatex } from "../format";
import {
  Distractors,
  equationLatex,
  isVertical,
  lineGraph,
  lineGrid,
  pickSlope,
  slope,
  slopeLatex,
  standardCoefficients,
  type EquationForm,
  type Line,
  type Slope,
} from "./lines";
import type { CoordinatePlaneSpec } from "../plot";

export const GRAPHING_LINEAR_ID = "graphing-linear-equations";

export type GraphLinearForm = EquationForm | "mixed";

/** The y-intercept (or a vertical line's x) stays within this; marked points within GRID_LIMIT. */
export const INTERCEPT_LIMIT = 6;

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Equation given in",
    default: "slopeIntercept",
    options: [
      { value: "slopeIntercept", label: "Slope-intercept form" },
      { value: "standard", label: "Standard form" },
      { value: "pointSlope", label: "Point-slope form" },
      { value: "mixed", label: "A mix of all three" },
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
  {
    type: "enum",
    key: "workSpace",
    label: "Work space",
    default: "grid",
    options: [
      { value: "grid", label: "Blank coordinate grid" },
      { value: "none", label: "None (students use their own graph paper)" },
    ],
  },
] as const satisfies ParamSchema;

/** The construction, exposed for property tests. */
export interface GraphingLinearConstruction {
  form: EquationForm;
  slope: Slope;
  /** The y-intercept, or the x of a vertical line. */
  c: number;
  /** Two lattice points of the line, both marked on the answer graph. For
   * point-slope form the second is the point the equation is written through. */
  points: [[number, number], [number, number]];
}

export function lineOf(k: GraphingLinearConstruction): Line {
  return isVertical(k.slope)
    ? { vertical: true, x: { n: k.c, d: 1 } }
    : { vertical: false, m: { n: k.slope.rise, d: k.slope.run }, b: { n: k.c, d: 1 } };
}

const fits = (v: number) => Math.abs(v) <= 9;

export function construct(params: ParamValues, rng: Rng): GraphingLinearConstruction {
  const p = resolveParams(schema, params);
  const formParam = p.form as GraphLinearForm;
  const form: EquationForm =
    formParam === "mixed" ? rng.pick<EquationForm>(["slopeIntercept", "standard", "pointSlope"]) : formParam;
  const nonzero = () => rng.pick([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]);

  if ((p.includeSpecial as boolean) && rng.bool(0.25)) {
    const c = nonzero();
    const t = rng.int(-INTERCEPT_LIMIT, INTERCEPT_LIMIT);
    return rng.bool()
      ? { form, slope: slope(0, 1), c, points: [[0, c], [t === 0 ? 3 : t, c]] }
      : { form, slope: slope(1, 0), c, points: [[c, 0], [c, t === 0 ? 3 : t]] };
  }

  const s = pickSlope(rng, p.fractions as boolean);
  const b = rng.int(-INTERCEPT_LIMIT, INTERCEPT_LIMIT);
  // whole steps of rise/run from the intercept that stay on the grid
  const steps = [1, -1, 2, -2].filter((k) => fits(k * s.run) && fits(b + k * s.rise));
  // a point-slope equation is written through a point other than the intercept,
  // so it shows a real (x - x1); otherwise one step is enough
  const k = form === "pointSlope" ? rng.pick(steps) : rng.pick(steps.filter((j) => Math.abs(j) === 1));
  return { form, slope: s, c: b, points: [[0, b], [k * s.run, b + k * s.rise]] };
}

export function promptLatex(k: GraphingLinearConstruction): string {
  return equationLatex(lineOf(k), k.form, k.points[1]);
}

/** A point, with \left( \right) around fractions. */
function pointLatex(x: string, y: string): string {
  return x.includes("\\frac") || y.includes("\\frac") ? `\\left(${x}, ${y}\\right)` : `(${x}, ${y})`;
}

/** Slope and an intercept: the y-intercept, or for a vertical line (`x`) the x-intercept. */
export function factsLatex(s: Slope, intercept: string, vertical = isVertical(s)): string {
  const slopePart = `\\text{Slope: } ${slopeLatex(s)}`;
  const interceptPart = vertical
    ? `\\text{$x$-intercept: } ${pointLatex(intercept, "0")}`
    : `\\text{$y$-intercept: } ${pointLatex("0", intercept)}`;
  return slopePart + ANSWER_PART_SEPARATOR + interceptPart;
}

export function answerLatex(k: GraphingLinearConstruction): string {
  return factsLatex(k.slope, String(k.c));
}

export function graphWindow(): CoordinatePlaneSpec {
  return lineGrid();
}

export function answerGraph(k: GraphingLinearConstruction): CoordinatePlaneSpec {
  return lineGraph(lineOf(k), k.points);
}

/** Mistake-based Distractors: the Answer with one classic error each, most common first. */
export function distractors(k: GraphingLinearConstruction): string[] {
  const d = new Distractors(answerLatex(k));
  const s = k.slope;
  const c = String(k.c);
  if (isVertical(s)) {
    // x = c read as a horizontal line, or its x-intercept as a y-intercept
    d.add(factsLatex(slope(0, 1), c), factsLatex(s, c, false), factsLatex(slope(0, 1), "0"));
    d.add(factsLatex(s, String(-k.c)));
    return d.list;
  }
  if (s.rise === 0) {
    // y = c read as a vertical line, or as a slope of c
    d.add(factsLatex(slope(1, 0), c), factsLatex(slope(k.c, 1), "0"), factsLatex(slope(0, 1), String(-k.c)));
    d.add(factsLatex(slope(1, 0), c, false));
    return d.list;
  }
  const [x1, y1] = k.points[1];
  // slope sign, rise and run swapped, intercept sign
  d.add(factsLatex(slope(-s.rise, s.run), c));
  if (Math.abs(s.rise) !== s.run) d.add(factsLatex(slope(s.run, s.rise), c));
  if (k.c !== 0) d.add(factsLatex(s, String(-k.c)));
  if (k.form === "standard") {
    // the x-intercept (C/A) taken for the y-intercept
    const [A, , C] = standardCoefficients(lineOf(k));
    d.add(factsLatex(s, fractionToLatex(C, A)));
  } else if (k.form === "pointSlope") {
    // the point's y taken for the intercept, or the point's signs not flipped
    d.add(factsLatex(s, String(y1)));
    d.add(factsLatex(s, fractionToLatex(-y1 * s.run + s.rise * x1, s.run)));
  }
  // slope and intercept swapped
  if (s.run === 1) d.add(factsLatex(slope(k.c, 1), String(s.rise)));
  // the x-intercept plotted as the y-intercept
  d.add(factsLatex(s, fractionToLatex(-k.c * s.run, s.rise)));
  // the negative reciprocal, then the rise miscounted by one
  d.add(factsLatex(slope(-s.run, s.rise), c));
  d.add(factsLatex(slope(s.rise + (s.rise > 0 ? 1 : -1), s.run), c));
  return d.list;
}

export const generator: Generator = {
  id: GRAPHING_LINEAR_ID,
  title: "Graphing linear equations",
  defaultDirections: "Graph each line.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    const problem: Problem = {
      kind: "generated",
      generatorId: GRAPHING_LINEAR_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
      answerGraph: answerGraph(k),
    };
    if (resolved.workSpace === "grid") problem.graph = graphWindow();
    return problem;
  },
};
