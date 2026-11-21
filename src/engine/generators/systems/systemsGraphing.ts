// "Solving systems by graphing": graph both lines of a system on one grid and
// read off where they cross.
//
// Built ANSWER-FIRST: the solution (x0, y0), a lattice point well inside the
// grid, is chosen first, then two different slopes, and each line is the line
// through (x0, y0) with its slope (see lines.ts). Both y-intercepts are whole
// numbers on the grid, so a student can plot each intercept and count rise
// over run. With the special cases on, a system may instead be two parallel
// lines (no solution) or one line written two ways (infinitely many).
//
// The student's grid is BLANK and the same window (-10..10 both ways) for every
// Problem; the Answer Key's graph draws both lines on that window and marks
// their intersection. The two slopes are at least MIN_CROSSING_DEGREES apart
// so the crossing can be read off a hand-drawn graph.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import type { CoordinatePlaneSpec, PlotPoint } from "../../plot";
import {
  Distractors,
  equationLatex,
  lineCurve,
  lineGrid,
  lineThrough,
  pickSlope,
  pointLatex,
  standardCoefficients,
  type EquationForm,
  type Line,
  type Slope,
} from "../shared/lines";
import {
  INFINITELY_MANY,
  NO_SOLUTION,
  pickSolution,
  pickSpecial,
  pointSlips,
  sample,
  scaleEq,
  solutionLatex,
  systemLatex,
  specialDistractors,
  specialField,
  stdEqLatex,
  type StdEq,
  type SystemSolution,
} from "../shared/systemsKit";

export const SYSTEMS_GRAPHING_ID = "systems-graphing";

export type SystemForm = "slopeIntercept" | "standard";

/** The solution's coordinates stay within this; every y-intercept within INTERCEPT_LIMIT. */
export const SOLUTION_LIMIT = 6;
export const INTERCEPT_LIMIT = 8;

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Equations given in",
    default: "slopeIntercept",
    options: [
      { value: "slopeIntercept", label: "Slope-intercept form" },
      { value: "standard", label: "Standard form" },
      { value: "mixed", label: "A mix of both" },
    ],
  },
  {
    type: "boolean",
    key: "fractions",
    label: "Allow fractional slopes",
    default: false,
  },
  specialField,
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
export interface SystemsGraphingConstruction {
  lines: [Line, Line];
  forms: [SystemForm, SystemForm];
  solution: SystemSolution;
  /** For infinitely many solutions, the second equation is the first one's standard form times this. */
  scale?: number;
}

const intercept = (l: Line): number => (l.vertical ? NaN : l.b.n / l.b.d);
/** Lines this many degrees apart or more cross clearly enough to read the crossing off a grid. */
export const MIN_CROSSING_DEGREES = 15;
export const crossingDegrees = (a: Slope, b: Slope) =>
  (Math.abs(Math.atan2(a.rise, a.run) - Math.atan2(b.rise, b.run)) * 180) / Math.PI;
const onGrid = (l: Line) => {
  const b = intercept(l);
  return Number.isInteger(b) && Math.abs(b) <= INTERCEPT_LIMIT;
};

export function construct(params: ParamValues, rng: Rng): SystemsGraphingConstruction {
  const p = resolveParams(schema, params);
  const formParam = p.form as SystemForm | "mixed";
  const pickForm = (): SystemForm => (formParam === "mixed" ? rng.pick<SystemForm>(["slopeIntercept", "standard"]) : formParam);
  const forms: [SystemForm, SystemForm] = [pickForm(), pickForm()];
  const fractions = p.fractions as boolean;
  const special = pickSpecial(rng, p.includeSpecial as boolean);

  if (special) {
    const s = pickSlope(rng, fractions);
    const b1 = rng.int(-6, 6);
    // a whole-number intercept: the line through (0, b1)
    const l1 = lineThrough(s, 0, b1);
    if (special === "infinite") {
      // one line, the second time as its standard form scaled up
      return { lines: [l1, l1], forms: [forms[0], "standard"], solution: { kind: "infinite" }, scale: rng.int(2, 3) };
    }
    let b2 = rng.int(-6, 5);
    if (b2 >= b1) b2++;
    return { lines: [l1, lineThrough(s, 0, b2)], forms, solution: { kind: "none" } };
  }

  const fallback: [[number, number], Slope, Slope] = [[2, 1], { rise: 1, run: 1 }, { rise: -1, run: 1 }];
  const [[x0, y0], s1, s2] = sample(
    () => [pickSolution(rng, SOLUTION_LIMIT), pickSlope(rng, fractions), pickSlope(rng, fractions)] as const,
    ([[x, y], a, b]) =>
      crossingDegrees(a, b) >= MIN_CROSSING_DEGREES && onGrid(lineThrough(a, x, y)) && onGrid(lineThrough(b, x, y)),
    fallback,
  );
  return {
    lines: [lineThrough(s1, x0, y0), lineThrough(s2, x0, y0)],
    forms,
    solution: { kind: "point", x: x0, y: y0 },
  };
}

function lineToStd(l: Line): StdEq {
  const [a, b, c] = standardCoefficients(l);
  return { a, b, c };
}

export function promptLatex(k: SystemsGraphingConstruction): string {
  const write = (l: Line, f: EquationForm) => equationLatex(l, f, [0, 0]);
  const first = write(k.lines[0], k.forms[0]);
  const second = k.scale ? stdEqLatex(scaleEq(lineToStd(k.lines[1]), k.scale)) : write(k.lines[1], k.forms[1]);
  return systemLatex(first, second);
}

export function answerLatex(k: SystemsGraphingConstruction): string {
  return solutionLatex(k.solution);
}

export function graphWindow(): CoordinatePlaneSpec {
  return lineGrid();
}

export function answerGraph(k: SystemsGraphingConstruction): CoordinatePlaneSpec {
  const curves = k.solution.kind === "infinite" ? [lineCurve(k.lines[0])] : k.lines.map(lineCurve);
  // the crossing is marked but not labelled: a label crowds the lines, and the text Answer prints beneath
  const points: PlotPoint[] = k.solution.kind === "point" ? [{ x: k.solution.x, y: k.solution.y }] : [];
  return { ...graphWindow(), curves, points };
}

/** Mistake-based Distractors, most common first. */
export function distractors(k: SystemsGraphingConstruction, includeSpecial: boolean): string[] {
  const [e1, e2] = k.lines.map(lineToStd);
  if (k.solution.kind !== "point") return specialDistractors(k.solution.kind, e1, e2);
  const { x, y } = k.solution;
  const d = new Distractors(answerLatex(k));
  const [swapped, ...signs] = pointSlips(x, y);
  // coordinates swapped; a y-intercept taken for the crossing; a sign misread
  d.add(swapped, pointLatex([0, intercept(k.lines[0])]), pointLatex([0, intercept(k.lines[1])]));
  d.add(...signs);
  // the crossing misread by one square
  d.add(pointLatex([x + (x > 0 ? -1 : 1), y]), pointLatex([x, y + (y > 0 ? -1 : 1)]));
  if (includeSpecial) d.add(NO_SOLUTION, INFINITELY_MANY);
  return d.list;
}

export const generator: Generator = {
  id: SYSTEMS_GRAPHING_ID,
  title: "Solving systems by graphing",
  defaultDirections: "Solve each system by graphing.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    const problem: Problem = {
      kind: "generated",
      generatorId: SYSTEMS_GRAPHING_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k, resolved.includeSpecial as boolean),
      answerGraph: answerGraph(k),
    };
    if (resolved.workSpace === "grid") problem.graph = graphWindow();
    return problem;
  },
};
