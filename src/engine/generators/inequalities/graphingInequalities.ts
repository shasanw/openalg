// "Graphing one-variable inequalities": graph x > -3, 4 >= x or -2 <= x < 4 on
// a number line, or (the reverse task) write the inequality a number line
// shows.
//
// Built ANSWER-FROM-CONSTRUCTION: the solution set (a ray, a segment between
// two boundaries, or the two rays outside them, each boundary open or closed)
// is chosen first, and the printed inequality or the given number line is
// made from it. Nothing is ever solved.
//
// Graphing: the Answer Key draws the set on a number line (`answerGraph`),
// under a text Answer that describes it (where the circles go, open or
// closed, and which way to shade), which is also what multiple-choice
// Distractors vary. The student copy gets a blank number line over the same
// window, symmetric about 0 (numberLineWindow), so it shows the scale only.
//
// Writing: the student copy shows the graph (`graph`), which is the question
// itself, so it has no answer graph. Its window is ten units with every tick
// labelled, placed around the boundaries, which are always whole numbers on
// labelled ticks, so the circles need no labels of their own (a given graph
// labels nothing). The Answer is the inequality, in inequality or interval
// notation.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { blankGraph, type NumberLineSpec } from "../../plot";
import { numLatex, rat, ratValue, type Rat } from "../shared/equationKit";
import {
  distinctSets,
  drawSet,
  fallbackSets,
  FLIP,
  flipped,
  MAX_HINTS,
  negated,
  notationField,
  numberLine,
  OP_LATEX,
  opOf,
  setLatex,
  toggled,
  type Notation,
  type SolutionSet,
} from "./inequalityKit";

export const GRAPHING_INEQUALITIES_ID = "graphing-inequalities";

export type Task = "graph" | "write" | "mixed";
export type Kinds = "simple" | "compound" | "mixed";

export const schema = [
  {
    type: "enum",
    key: "task",
    label: "Task",
    default: "graph",
    options: [
      { value: "graph", label: "Graph the inequality" },
      { value: "write", label: "Write the inequality from its graph" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "enum",
    key: "kinds",
    label: "Inequalities",
    default: "simple",
    options: [
      { value: "simple", label: "Simple, like x > -3" },
      { value: "compound", label: "Compound, like -2 ≤ x < 4" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "boolean",
    key: "reversed",
    label: "Include inequalities written number first, like 4 ≥ x",
    default: true,
  },
  {
    type: "boolean",
    key: "fractions",
    label: "Include fraction boundaries (graphing only)",
    default: false,
  },
  {
    type: "int",
    key: "maxValue",
    label: "Largest boundary value",
    min: 2,
    max: 20,
    default: 10,
  },
  { ...notationField, label: "Answer notation (writing from a graph)" },
  {
    type: "boolean",
    key: "showNumberLine",
    label: "Show a blank number line to graph on",
    default: true,
  },
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface GraphingInequalityConstruction {
  task: "graph" | "write";
  solution: SolutionSet;
  /** a simple inequality printed number first ("4 >= x") */
  reversed: boolean;
}

/** Most units between the two boundaries of a compound inequality to write from a graph. */
const WRITE_GAP = 8;

/**
 * A boundary: a whole number in [-M, M], or (when allowed) a fraction with
 * denominator 2, 3 or 4, kept small (within 5) so it is easy to place.
 */
function boundary(rng: Rng, M: number, fraction: boolean): Rat {
  if (!fraction) return rat(rng.int(-M, M));
  const d = rng.pick([2, 2, 3, 4]);
  const F = Math.min(M, 5);
  for (;;) {
    const n = rng.int(-F * d, F * d);
    if (n % d !== 0) return rat(n, d);
  }
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): GraphingInequalityConstruction {
  const p = resolveParams(schema, params);
  const M = p.maxValue as number;
  const taskParam = p.task as Task;
  const task = taskParam === "mixed" ? (rng.bool() ? "graph" : "write") : taskParam;
  const kinds = p.kinds as Kinds;
  const compound = kinds === "compound" || (kinds === "mixed" && rng.bool());
  const fractions = task === "graph" && (p.fractions as boolean);

  if (!compound) {
    const at = boundary(rng, M, fractions && rng.bool(0.5));
    const solution: SolutionSet = { kind: "ray", at, dir: rng.bool() ? "below" : "above", closed: rng.bool() };
    return { task, solution, reversed: task === "graph" && (p.reversed as boolean) && rng.bool(0.3) };
  }
  // two whole-number boundaries at least 2 apart (at most WRITE_GAP to fit a
  // written graph's window); with fractions, one of them may be a fraction
  const maxGap = task === "write" ? Math.min(WRITE_GAP, 2 * M) : 2 * M;
  const gap = rng.int(2, Math.max(2, maxGap));
  const loInt = rng.int(-M, Math.max(-M, M - gap));
  let lo = rat(loInt);
  let hi = rat(loInt + gap);
  if (fractions && rng.bool(0.5)) {
    // nudge one end by a half, staying strictly between the old ends' span
    if (rng.bool()) lo = rat(2 * lo.n + 1, 2);
    else hi = rat(2 * hi.n - 1, 2);
  }
  const loClosed = rng.bool();
  const hiClosed = rng.bool();
  const kind = rng.bool(0.6) ? "between" : "outside";
  return { task, solution: { kind, lo, hi, loClosed, hiClosed }, reversed: false };
}

// ------------------------------------------------------------------ printing

/** The inequality to graph, e.g. "x > -3", "4 \ge x", "-2 \le x < 4". */
export function inequalityLatex(k: GraphingInequalityConstruction): string {
  const s = k.solution;
  if (s.kind === "ray" && k.reversed) {
    return `${numLatex(s.at)} ${OP_LATEX[FLIP[opOf(s.dir, s.closed)]]} x`;
  }
  return setLatex(s, "inequality");
}

export function promptLatex(k: GraphingInequalityConstruction): string {
  return k.task === "graph" ? inequalityLatex(k) : "\\text{Write an inequality for the graph.}";
}

/** "open circle at x = -3; shade right": the graph in words, for the key and the choices. */
export function describeLatex(s: SolutionSet): string {
  const circle = (closed: boolean) => (closed ? "closed" : "open");
  // "at x = -7": after the words alone a minus prints as a binary "at − 7"
  const num = (r: Rat) => `x = ${numLatex(r)}`;
  const sep = ANSWER_PART_SEPARATOR;
  switch (s.kind) {
    case "ray":
      return `\\text{${circle(s.closed)} circle at } ${num(s.at)}${sep}\\text{shade ${s.dir === "below" ? "left" : "right"}}`;
    case "between":
    case "outside": {
      const shade = `\\text{shade ${s.kind === "between" ? "between" : "outside"}}`;
      return (
        `\\text{${circle(s.loClosed)} circle at } ${num(s.lo)}${sep}` +
        `\\text{${circle(s.hiClosed)} circle at } ${num(s.hi)}${sep}${shade}`
      );
    }
    default:
      throw new Error(`graphing-inequalities: no ${s.kind} sets`);
  }
}

/**
 * The number line a written Problem shows: ten units, every tick labelled,
 * placed so each boundary sits at least one tick in from the ends. The
 * circles carry no labels (a given graph labels nothing); their ticks do.
 */
export function givenGraph(s: SolutionSet): NumberLineSpec {
  const ends = s.kind === "ray" ? [s.at, s.at] : s.kind === "between" || s.kind === "outside" ? [s.lo, s.hi] : [];
  const centre = Math.floor((ratValue(ends[0]) + ratValue(ends[1])) / 2);
  return drawSet(s, { range: { min: centre - 5, max: centre + 5 }, step: 1, labelEvery: 1 }, false);
}

// ------------------------------------------------------------------ mistakes

/**
 * Mistake-based Distractors, most common first:
 * - shaded the wrong way (a reversed inequality like 4 >= x read left to
 *   right as "x >= 4", or "and" shaded like "or");
 * - wrong circle: open for <= and >=, or closed for < and >;
 * - both at once;
 * - for a compound inequality, only one circle wrong;
 * - the boundary's sign changed.
 */
export function mistakes(s: SolutionSet): SolutionSet[] {
  const out: SolutionSet[] = [flipped(s), toggled(s), toggled(flipped(s))];
  if (s.kind === "between" || s.kind === "outside") {
    out.push({ ...s, loClosed: !s.loClosed }, { ...s, hiClosed: !s.hiClosed });
  }
  out.push(negated(s));
  return out;
}

export const generator: Generator = {
  id: GRAPHING_INEQUALITIES_ID,
  title: "Graphing one-variable inequalities",
  defaultDirections: "Graph each inequality on a number line.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    const s = k.solution;
    const base = { kind: "generated" as const, generatorId: GRAPHING_INEQUALITIES_ID, params: resolved, seed };
    const wrong = [...mistakes(s), ...fallbackSets(s)];
    if (k.task === "write") {
      const notation = resolved.notation as Notation;
      const answer = setLatex(s, notation);
      return {
        ...base,
        prompt: promptLatex(k),
        answer,
        distractorHints: distinctSets(answer, wrong.map((m) => setLatex(m, notation))).slice(0, MAX_HINTS),
        graph: givenGraph(s),
      };
    }
    const answer = describeLatex(s);
    const line = numberLine(s);
    const problem: Problem = {
      ...base,
      prompt: promptLatex(k),
      answer,
      distractorHints: distinctSets(answer, wrong.map(describeLatex)).slice(0, MAX_HINTS),
      answerGraph: line,
    };
    if (resolved.showNumberLine) problem.graph = blankGraph(line);
    return problem;
  },
};
