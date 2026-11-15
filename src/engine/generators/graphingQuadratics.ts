// "Graphing quadratics": given y = f(x) in vertex or standard form, graph the
// parabola and label its vertex, axis of symmetry and intercepts.
//
// Built ANSWER-FROM-CONSTRUCTION, picking the graph's features first:
// - a nonzero integer a (the shape) and an integer vertex (h, k);
// - when the parabola crosses the x-axis, k = -a m^2 for a whole m >= 1, so its
//   x-intercepts are exactly h - m and h + m (integers a student can plot);
//   when it misses the axis, k has the sign of a;
// - only then is it expanded: b = -2ah, c = ah^2 + k (the y-intercept).
// Every printed fact is read off these integers by parabolaProperties'
// factsFrom, never solved. Draws whose features would not all sit inside the
// fixed -9..9 working area are redrawn, so every graph fits the same grid.
//
// The student's grid is BLANK and the same window (-10..10 both ways) for every
// Problem, so its size and position give nothing away; the Answer Key's graph
// (`answerGraph`) uses that same window with the parabola, its dashed axis of
// symmetry and its vertex and intercepts drawn in.
//
// Multiple choice: the choices are text (the Answer's vertex / axis /
// intercepts with one classic mistake each, from parabolaProperties), not
// graphs. Four 2.5in graphs per Problem would not fit a half-page column, and a
// graph choice would show the student the shape they are asked to draw.

import { createRng, type Rng } from "../rng";
import {
  resolveParams,
  type Generator,
  type ParamSchema,
  type ParamValues,
  type Problem,
} from "../types";
import { quadraticToLatex } from "../format";
import {
  answerToLatex,
  distractors as propertyDistractors,
  factsFrom,
  vertexFormToLatex,
  type ParabolaConstruction,
} from "./parabolaProperties";
import {
  symmetricWindow,
  type CoordinatePlaneSpec,
  type PlotPoint,
} from "../plot";

export const GRAPHING_QUADRATICS_ID = "graphing-quadratics";

export type GraphForm = "vertex" | "standard" | "mixed";
export type WorkSpace = "grid" | "none";

/** Every feature stays within this many units of the origin (one square inside the grid). */
export const FEATURE_LIMIT = 9;

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Equation given in",
    default: "vertex",
    options: [
      { value: "vertex", label: "Vertex form" },
      { value: "standard", label: "Standard form" },
      { value: "mixed", label: "A mix of both" },
    ],
  },
  {
    type: "boolean",
    key: "allowLeadingCoefficient",
    label: "Allow a leading coefficient (|a| > 1)",
    default: true,
  },
  {
    type: "boolean",
    key: "allowOpensDown",
    label: "Allow parabolas that open downward (a < 0)",
    default: true,
  },
  {
    type: "boolean",
    key: "allowNoXIntercepts",
    label: "Include parabolas that miss the x-axis",
    default: false,
  },
  {
    type: "int",
    key: "maxValue",
    label: "Largest vertex / intercept magnitude",
    min: 2,
    max: FEATURE_LIMIT,
    default: 5,
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
export interface GraphingConstruction {
  form: "vertex" | "standard";
  a: number;
  h: number;
  k: number;
  b: number;
  c: number;
  /** x-intercepts h - m and h + m, or none (m === 0 means the parabola misses the axis). */
  m: number;
}

/** Feature values drawn on the graph: vertex, intercepts, and the origin. */
export function featurePoints(k: GraphingConstruction): { x: number; y: number }[] {
  const pts = [
    { x: k.h, y: k.k },
    { x: 0, y: k.c },
  ];
  if (k.m > 0) pts.push({ x: k.h - k.m, y: 0 }, { x: k.h + k.m, y: 0 });
  return pts;
}

function fits(k: GraphingConstruction, M: number): boolean {
  const roots = k.m > 0 ? [k.h - k.m, k.h + k.m] : [];
  return (
    Math.abs(k.h) <= M &&
    Math.abs(k.k) <= M &&
    roots.every((r) => Math.abs(r) <= M) &&
    Math.abs(k.c) <= FEATURE_LIMIT
  );
}

function draw(rng: Rng, p: ParamValues): GraphingConstruction {
  const M = p.maxValue as number;
  const mag = (p.allowLeadingCoefficient as boolean) ? rng.int(1, Math.min(3, M)) : 1;
  const a = (p.allowOpensDown as boolean) && rng.bool() ? -mag : mag;
  const formParam = p.form as GraphForm;
  const form = formParam === "mixed" ? (rng.bool() ? "vertex" : "standard") : formParam;
  const misses = (p.allowNoXIntercepts as boolean) && rng.bool(1 / 3);
  const h = rng.int(-M, M);
  let k: number;
  let m = 0;
  if (misses) {
    k = Math.sign(a) * rng.int(1, M);
  } else {
    // |k| = |a| m^2 <= M keeps the vertex inside the working area.
    m = rng.int(1, Math.max(1, Math.floor(Math.sqrt(M / Math.abs(a)))));
    k = -a * m * m;
  }
  // `+ 0` turns -0 into 0.
  return { form, a, h, k, b: -2 * a * h + 0, c: a * h * h + k + 0, m };
}

/**
 * Pure construction from params + an RNG. Redraws (deterministically) until
 * every feature fits; a vertex on the y-axis always fits (c = k), which is the
 * fallback so the loop always ends.
 */
export function construct(params: ParamValues, rng: Rng): GraphingConstruction {
  const p = resolveParams(schema, params);
  const M = Math.min(p.maxValue as number, FEATURE_LIMIT);
  let k = draw(rng, p);
  for (let i = 0; i < 64 && !fits(k, M); i++) k = draw(rng, p);
  if (!fits(k, M)) k = { ...k, h: 0, b: 0, c: k.k };
  return k;
}

/** The grid every Problem of this Topic is drawn on. */
export function graphWindow(k: GraphingConstruction): CoordinatePlaneSpec {
  const pts = featurePoints(k);
  const x = symmetricWindow(pts.map((q) => q.x));
  const y = symmetricWindow(pts.map((q) => q.y));
  return { kind: "plane", x: x.range, y: y.range, xStep: x.step, yStep: y.step, labelEvery: 2 };
}

/** The answer graph: the parabola, its dashed axis, and its vertex and intercepts marked. */
export function answerGraph(k: GraphingConstruction): CoordinatePlaneSpec {
  const seen = new Set<string>();
  const points: PlotPoint[] = [];
  for (const q of featurePoints(k)) {
    const key = `${q.x},${q.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(q);
  }
  return {
    ...graphWindow(k),
    curves: [{ kind: "parabola", form: "vertex", a: k.a, h: k.h, k: k.k }],
    lines: [{ x: k.h, dashed: true }],
    points,
  };
}

export function promptLatex(k: GraphingConstruction): string {
  return k.form === "vertex" ? vertexFormToLatex(k.a, k.h, k.k) : `y = ${quadraticToLatex(k.a, k.b, k.c)}`;
}

/** The construction in parabolaProperties' terms, for its answer and distractors. */
function asProperties(k: GraphingConstruction): ParabolaConstruction {
  return {
    form: k.form,
    a: k.a,
    b: k.b,
    c: k.c,
    D: k.b * k.b - 4 * k.a * k.c,
    h: k.h,
    k: k.k,
    facts: factsFrom(k.a, k.b, k.c),
  };
}

export const generator: Generator = {
  id: GRAPHING_QUADRATICS_ID,
  course: "Algebra 2",
  unit: "Quadratics",
  title: "Graphing quadratics",
  defaultDirections:
    "Graph each parabola. Label the vertex, axis of symmetry, and intercepts.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    const props = asProperties(k);
    const problem: Problem = {
      kind: "generated",
      generatorId: GRAPHING_QUADRATICS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerToLatex(props.facts, "all"),
      distractorHints: propertyDistractors(props, "all"),
      answerGraph: answerGraph(k),
    };
    if (resolved.workSpace === "grid") problem.graph = graphWindow(k);
    return problem;
  },
};
