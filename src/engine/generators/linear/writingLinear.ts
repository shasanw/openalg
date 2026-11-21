// "Writing linear equations": write an equation of a line given its slope and
// a point, two points on it, or its graph.
//
// Built ANSWER-FROM-CONSTRUCTION: the line itself (the Answer) is chosen
// first, as a slope (a reduced rise/run) and a whole-number y-intercept. The
// points the Problem gives are then lattice points of that line, whole
// rise/run steps from the y-intercept, so every given number is exact and
// nothing is ever solved. The Answer is the chosen line written in the
// requested form (see lines.ts); point-slope form is written through the given
// point (the first of two points, or the marked point off the y-axis on a
// graph).
//
// From a graph, the line is drawn through the whole grid with its y-intercept
// and one more lattice point marked, and nothing labelled: the graph is the
// question (there is no answer graph), so it shows the line, never its
// equation.

import { createRng, type Rng } from "../../rng";
import {
  resolveParams,
  type Generator,
  type ParamSchema,
  type ParamValues,
  type Problem,
} from "../../types";
import {
  Distractors,
  equationLatex,
  GRID_LIMIT,
  isVertical,
  lineGraph,
  lineThrough,
  perpendicular,
  pickSlope,
  pointLatex,
  q,
  slope,
  slopeEquation,
  slopeInterceptLatex,
  slopeQ,
  type EquationForm,
  type Line,
  type Slope,
} from "../shared/lines";
import type { CoordinatePlaneSpec } from "../../plot";

export const WRITING_LINEAR_ID = "writing-linear-equations";

export type WritingSource = "slopePoint" | "twoPoints" | "graph";

/** The y-intercept (or a vertical line's x) stays within this. */
export const INTERCEPT_LIMIT = 6;

export const schema = [
  {
    type: "enum",
    key: "given",
    label: "Line given by",
    default: "slopePoint",
    options: [
      { value: "slopePoint", label: "Its slope and a point" },
      { value: "twoPoints", label: "Two points" },
      { value: "graph", label: "A graphed line" },
      { value: "mixed", label: "A mix of all three" },
    ],
  },
  {
    type: "enum",
    key: "answerForm",
    label: "Answer in",
    default: "slopeIntercept",
    options: [
      { value: "slopeIntercept", label: "Slope-intercept form" },
      { value: "pointSlope", label: "Point-slope form" },
      { value: "standard", label: "Standard form" },
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

type Point = [number, number];

/** The construction, exposed for property tests. */
export interface WritingConstruction {
  given: WritingSource;
  form: EquationForm;
  slope: Slope;
  /** The y-intercept, or the x of a vertical line. */
  c: number;
  /**
   * The given points: one (with the slope), two, or on a graph the two marked
   * points. The first is the one a point-slope Answer is written through.
   */
  points: Point[];
}

export function lineOf(k: Pick<WritingConstruction, "slope" | "c">): Line {
  return isVertical(k.slope)
    ? { vertical: true, x: q(k.c) }
    : { vertical: false, m: slopeQ(k.slope), b: q(k.c) };
}

const fits = ([x, y]: Point) => Math.abs(x) <= GRID_LIMIT && Math.abs(y) <= GRID_LIMIT;
const nonzero = (rng: Rng) => rng.pick([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]);

/** Two different values from -limit..limit, in random order. */
function twoDistinct(rng: Rng, limit: number): [number, number] {
  const a = rng.int(-limit, limit);
  let b = rng.int(-limit, limit - 1);
  if (b >= a) b++;
  return [a, b];
}

export function construct(params: ParamValues, rng: Rng): WritingConstruction {
  const p = resolveParams(schema, params);
  const givenParam = p.given as WritingSource | "mixed";
  const given: WritingSource =
    givenParam === "mixed" ? rng.pick<WritingSource>(["slopePoint", "twoPoints", "graph"]) : givenParam;
  const form = p.answerForm as EquationForm;
  const count = given === "slopePoint" ? 1 : 2;

  if ((p.includeSpecial as boolean) && rng.bool(0.25)) {
    const c = nonzero(rng);
    const [u, v] = twoDistinct(rng, INTERCEPT_LIMIT);
    const vertical = rng.bool();
    const s = vertical ? slope(1, 0) : slope(0, 1);
    const pts: Point[] = vertical ? [[c, u], [c, v]] : [[u, c], [v, c]];
    return { given, form, slope: s, c, points: pts.slice(0, count) };
  }

  const s = pickSlope(rng, p.fractions as boolean);
  const b = rng.int(-INTERCEPT_LIMIT, INTERCEPT_LIMIT);
  const at = (t: number): Point => [t * s.run, b + t * s.rise];
  // whole rise/run steps off the y-axis that stay on the grid (one always
  // does: a step toward the x-axis from an intercept within 6)
  const steps = [-3, -2, -1, 1, 2, 3].filter((t) => fits(at(t)));
  let points: Point[];
  if (given === "graph") {
    // the marked point off the y-axis first (a point-slope Answer uses it), then the intercept
    points = [at(rng.pick(steps.filter((t) => Math.abs(t) <= 2))), at(0)];
  } else {
    const t1 = rng.pick(steps);
    const rest = steps.filter((t) => t !== t1);
    points = given === "twoPoints" ? [at(t1), at(rng.pick(rest))] : [at(t1)];
  }
  return { given, form, slope: s, c: b, points };
}

export function promptLatex(k: WritingConstruction): string {
  if (k.given === "graph") return "\\text{The line shown}";
  const [p1, p2] = k.points;
  if (k.given === "twoPoints") return `\\text{Through } ${pointLatex(p1)} \\text{ and } ${pointLatex(p2)}`;
  const s = isVertical(k.slope) ? "\\text{ with undefined slope}" : `\\text{ with } ${slopeEquation(k.slope)}`;
  return `\\text{Through } ${pointLatex(p1)} ${s}`;
}

export function answerLatex(k: WritingConstruction): string {
  return equationLatex(lineOf(k), k.form, k.points[0]);
}

export function graphOf(k: WritingConstruction): CoordinatePlaneSpec {
  return lineGraph(lineOf(k), k.points);
}

/** Mistake-based Distractors: the Answer's form, one classic error each, most common first. */
export function distractors(k: WritingConstruction): string[] {
  const d = new Distractors(answerLatex(k));
  const [x1, y1] = k.points[0];
  const s = k.slope;
  // A different point on the same line gives another correct point-slope equation.
  const correctLine = slopeInterceptLatex(lineOf(k));
  const write = (l: Line, through: Point) =>
    slopeInterceptLatex(l) === correctLine ? null : equationLatex(l, k.form, through);
  const horizontal = (c: number): Line => ({ vertical: false, m: q(0), b: q(c) });
  const vertical = (c: number): Line => ({ vertical: true, x: q(c) });

  if (isVertical(s) || s.rise === 0) {
    // x = c and y = c mixed up, or written with a point's other coordinate,
    // or the line taken to be an axis (y = 0 or x = 0)
    const [same, other] = isVertical(s) ? [vertical, horizontal] : [horizontal, vertical];
    const c = isVertical(s) ? x1 : y1;
    d.add(write(other(c), [x1, y1]));
    for (const [x, y] of k.points) {
      const free = isVertical(s) ? y : x;
      d.add(write(same(free), [x, y]), write(other(free), [x, y]));
    }
    d.add(write(same(0), [x1, y1]));
    d.add(write(same(-c), [x1, y1]));
    return d.list;
  }
  const at = (t: Slope, p: Point) => write(lineThrough(t, p[0], p[1]), p);
  const m = slopeQ(s);
  // the slope's sign, or rise and run swapped
  d.add(at(slope(-s.rise, s.run), [x1, y1]));
  if (Math.abs(s.rise) !== s.run) d.add(at(slope(s.run, s.rise), [x1, y1]));
  if (k.form === "pointSlope") {
    // the point's signs not flipped: y + y1 = m(x + x1)
    d.add(write(lineThrough(s, -x1, -y1), [-x1, -y1]));
  } else {
    // b = y1 + m x1 (a sign slip solving for b), and b taken as the point's y
    const b1 = q(y1 * m.d + m.n * x1, m.d);
    d.add(write({ vertical: false, m, b: b1 }, [x1, y1]));
    d.add(write({ vertical: false, m, b: q(y1) }, [x1, y1]));
  }
  // the point's coordinates swapped, then the negative reciprocal
  if (x1 !== y1) d.add(at(s, [y1, x1]));
  d.add(at(perpendicular(s), [x1, y1]));
  // two points' coordinates mixed: x from one, y from the other
  if (k.points.length === 2) d.add(at(s, [k.points[1][0], y1]));
  // the rise miscounted by one
  d.add(at(slope(s.rise + (s.rise > 0 ? 1 : -1), s.run), [x1, y1]));
  // When several of those land on the Answer's own line (a slope of -1
  // through a point on y = -x, say), the run miscounted by one, then the
  // rise miscounted the other way.
  if (d.list.length < 3) d.add(at(slope(s.rise, s.run + 1), [x1, y1]));
  if (d.list.length < 3 && Math.abs(s.rise) > 1) d.add(at(slope(s.rise - (s.rise > 0 ? 1 : -1), s.run), [x1, y1]));
  return d.list;
}

export const generator: Generator = {
  id: WRITING_LINEAR_ID,
  title: "Writing linear equations",
  defaultDirections: "Write an equation of each line.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    const problem: Problem = {
      kind: "generated",
      generatorId: WRITING_LINEAR_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
    if (k.given === "graph") problem.graph = graphOf(k);
    return problem;
  },
};
