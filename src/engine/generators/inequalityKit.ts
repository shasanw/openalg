// Shared pieces for the Algebra 1 Inequalities Topics (graphing, one-step,
// two-step, multi-step, compound, absolute value): the inequality symbols,
// a solution set of a linear inequality with exact rational endpoints, its
// printing in inequality or interval notation, its number line, and the
// mistakes students make with it (flipping the wrong way, wrong endpoint
// inclusion, and/or confusion, sign errors).
//
// Nothing here solves an inequality. Generators choose the solution set (or
// the boundary point and the direction) first and build the printed Problem
// around it; this kit only prints and draws what was chosen, and combines
// rays the way "and" and "or" do, which is set logic, not algebra.

import type { ParamField, Problem } from "../types";
import {
  blankGraph,
  isLabelledTick,
  numberLineWindow,
  type NumberLinePoint,
  type NumberLineSpec,
  type ShadedInterval,
} from "../plot";
import { distinctHints, numLatex, rat, ratEq, ratValue, type Rat } from "./equationKit";

// ------------------------------------------------------------------ symbols

export type Op = "<" | ">" | "<=" | ">=";

export const OPS: readonly Op[] = ["<", ">", "<=", ">="];

export const OP_LATEX: Record<Op, string> = { "<": "<", ">": ">", "<=": "\\le", ">=": "\\ge" };

/** The symbol after multiplying or dividing both sides by a negative. */
export const FLIP: Record<Op, Op> = { "<": ">", ">": "<", "<=": ">=", ">=": "<=" };

/** The same direction with the other endpoint inclusion. */
export const TOGGLE: Record<Op, Op> = { "<": "<=", "<=": "<", ">": ">=", ">=": ">" };

export const isStrict = (op: Op) => op === "<" || op === ">";
export const pointsDown = (op: Op) => op === "<" || op === "<=";

/** The op that says "x is below (or above) the boundary", closed or open. */
export function opOf(dir: Dir, closed: boolean): Op {
  return dir === "below" ? (closed ? "<=" : "<") : closed ? ">=" : ">";
}

/** Whether `l op r` holds. */
export function holds(l: number, op: Op, r: number): boolean {
  switch (op) {
    case "<":
      return l < r;
    case ">":
      return l > r;
    case "<=":
      return l <= r;
    case ">=":
      return l >= r;
  }
}

// ------------------------------------------------------------- solution sets

export type Dir = "below" | "above";

/** x < at, x <= at (below) or x > at, x >= at (above). */
export interface Ray {
  at: Rat;
  dir: Dir;
  closed: boolean;
}

/** The solution set of a one-variable linear inequality (or a compound or absolute value one). */
export type SolutionSet =
  | ({ kind: "ray" } & Ray)
  | { kind: "between"; lo: Rat; hi: Rat; loClosed: boolean; hiClosed: boolean }
  | { kind: "outside"; lo: Rat; hi: Rat; loClosed: boolean; hiClosed: boolean }
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "point"; at: Rat }
  | { kind: "allBut"; at: Rat };

export const ALL: SolutionSet = { kind: "all" };
export const NONE: SolutionSet = { kind: "none" };

export function ray(at: Rat, op: Op): SolutionSet {
  return { kind: "ray", at, dir: pointsDown(op) ? "below" : "above", closed: !isStrict(op) };
}

/** The ray "x op at" when the variable's coefficient has sign `sign`: a negative one flips it. */
export function rayFor(at: Rat, op: Op, sign: number): SolutionSet {
  return ray(at, sign < 0 ? FLIP[op] : op);
}

const cmp = (a: Rat, b: Rat) => ratValue(a) - ratValue(b);

/** Whether `x` is in the set (tests and number lines). */
export function contains(s: SolutionSet, x: number): boolean {
  switch (s.kind) {
    case "ray":
      return holds(x, opOf(s.dir, s.closed), ratValue(s.at));
    case "between":
      return holds(ratValue(s.lo), s.loClosed ? "<=" : "<", x) && holds(x, s.hiClosed ? "<=" : "<", ratValue(s.hi));
    case "outside":
      return holds(x, s.loClosed ? "<=" : "<", ratValue(s.lo)) || holds(x, s.hiClosed ? ">=" : ">", ratValue(s.hi));
    case "all":
      return true;
    case "none":
      return false;
    case "point":
      return x === ratValue(s.at);
    case "allBut":
      return x !== ratValue(s.at);
  }
}

/** Two rays joined by "and" (both hold) or "or" (either holds). */
export function combine(a: Ray, b: Ray, join: "and" | "or"): SolutionSet {
  if (a.dir === b.dir) {
    const c = cmp(a.at, b.at);
    // "and" keeps the tighter ray, "or" the looser one
    const tighter = (a.dir === "below") === (join === "and") ? (c <= 0 ? a : b) : c >= 0 ? a : b;
    const closed = c === 0 ? (join === "and" ? a.closed && b.closed : a.closed || b.closed) : tighter.closed;
    return { kind: "ray", at: tighter.at, dir: a.dir, closed };
  }
  const up = a.dir === "above" ? a : b; // x > L
  const down = a.dir === "above" ? b : a; // x < U
  const c = cmp(up.at, down.at);
  if (join === "and") {
    if (c < 0) return { kind: "between", lo: up.at, hi: down.at, loClosed: up.closed, hiClosed: down.closed };
    if (c === 0 && up.closed && down.closed) return { kind: "point", at: up.at };
    return NONE;
  }
  if (c < 0) return ALL;
  if (c === 0) return up.closed || down.closed ? ALL : { kind: "allBut", at: up.at };
  return { kind: "outside", lo: down.at, hi: up.at, loClosed: down.closed, hiClosed: up.closed };
}

/** The boundary points of a set, ascending. */
export function endpoints(s: SolutionSet): Rat[] {
  switch (s.kind) {
    case "ray":
    case "point":
    case "allBut":
      return [s.at];
    case "between":
    case "outside":
      return [s.lo, s.hi];
    case "all":
    case "none":
      return [];
  }
}

// ------------------------------------------------------------------ mistakes

/** Shaded the other way: the ray reversed, "and" read as "or" and back. */
export function flipped(s: SolutionSet): SolutionSet {
  switch (s.kind) {
    case "ray":
      return { ...s, dir: s.dir === "below" ? "above" : "below" };
    case "between":
      return { ...s, kind: "outside" };
    case "outside":
      return { ...s, kind: "between" };
    case "all":
      return NONE;
    case "none":
      return ALL;
    case "point":
      return { kind: "allBut", at: s.at };
    case "allBut":
      return { kind: "point", at: s.at };
  }
}

/** Every endpoint's inclusion reversed (< read as <=, or the reverse). */
export function toggled(s: SolutionSet): SolutionSet {
  switch (s.kind) {
    case "ray":
      return { ...s, closed: !s.closed };
    case "between":
    case "outside":
      return { ...s, loClosed: !s.loClosed, hiClosed: !s.hiClosed };
    default:
      return s;
  }
}

/** Every endpoint's sign changed, keeping the shape (moved a term with the wrong sign). */
export function negated(s: SolutionSet): SolutionSet {
  const neg = (r: Rat) => rat(-r.n, r.d);
  switch (s.kind) {
    case "ray":
    case "point":
    case "allBut":
      return { ...s, at: neg(s.at) };
    case "between":
    case "outside":
      return { ...s, lo: neg(s.hi), hi: neg(s.lo), loClosed: s.hiClosed, hiClosed: s.loClosed };
    default:
      return s;
  }
}

export function sameSet(a: SolutionSet, b: SolutionSet): boolean {
  if (a.kind !== b.kind) return false;
  const ea = endpoints(a);
  const eb = endpoints(b);
  if (!ea.every((r, i) => ratEq(r, eb[i]))) return false;
  if (a.kind === "ray" && b.kind === "ray") return a.dir === b.dir && a.closed === b.closed;
  if ((a.kind === "between" || a.kind === "outside") && (b.kind === "between" || b.kind === "outside")) {
    return a.loClosed === b.loClosed && a.hiClosed === b.hiClosed;
  }
  return true;
}

// ------------------------------------------------------------------ printing

/** How a solution set is written. */
export type Notation = "inequality" | "interval";

export const notationField = {
  type: "enum",
  key: "notation",
  label: "Answer notation",
  default: "inequality",
  options: [
    { value: "inequality", label: "Inequality notation" },
    { value: "interval", label: "Interval notation" },
  ],
} as const satisfies ParamField;

export const showNumberLineField = {
  type: "boolean",
  key: "showNumberLine",
  label: "Show a blank number line",
  default: false,
} as const satisfies ParamField;

const n = (r: Rat) => numLatex(r);

function inequalityLatex(s: SolutionSet, v: string): string {
  const lt = (closed: boolean) => (closed ? "\\le" : "<");
  const gt = (closed: boolean) => (closed ? "\\ge" : ">");
  switch (s.kind) {
    case "ray":
      return `${v} ${OP_LATEX[opOf(s.dir, s.closed)]} ${n(s.at)}`;
    case "between":
      return `${n(s.lo)} ${lt(s.loClosed)} ${v} ${lt(s.hiClosed)} ${n(s.hi)}`;
    case "outside":
      return `${v} ${lt(s.loClosed)} ${n(s.lo)} \\text{ or } ${v} ${gt(s.hiClosed)} ${n(s.hi)}`;
    case "all":
      return "\\text{all real numbers}";
    case "none":
      return "\\text{no solution}";
    case "point":
      return `${v} = ${n(s.at)}`;
    case "allBut":
      return `${v} \\ne ${n(s.at)}`;
  }
}

function intervalLatex(s: SolutionSet): string {
  const open = (closed: boolean) => (closed ? "[" : "(");
  const shut = (closed: boolean) => (closed ? "]" : ")");
  switch (s.kind) {
    case "ray":
      return s.dir === "below"
        ? `(-\\infty, ${n(s.at)}${shut(s.closed)}`
        : `${open(s.closed)}${n(s.at)}, \\infty)`;
    case "between":
      return `${open(s.loClosed)}${n(s.lo)}, ${n(s.hi)}${shut(s.hiClosed)}`;
    case "outside":
      return `(-\\infty, ${n(s.lo)}${shut(s.loClosed)} \\cup ${open(s.hiClosed)}${n(s.hi)}, \\infty)`;
    case "all":
      return "(-\\infty, \\infty)";
    case "none":
      return "\\varnothing";
    case "point":
      return `\\{${n(s.at)}\\}`;
    case "allBut":
      return `(-\\infty, ${n(s.at)}) \\cup (${n(s.at)}, \\infty)`;
  }
}

/**
 * A solution set in inequality or interval notation, using only constructs
 * quadraticInequalities already prints through both KaTeX and mitex: plain
 * (mismatched) delimiters, \infty, \cup, \varnothing, \{ \}, \le, \ge, \ne and
 * \text{...}.
 */
export function setLatex(s: SolutionSet, notation: Notation, v = "x"): string {
  return notation === "interval" ? intervalLatex(s) : inequalityLatex(s, v);
}

// --------------------------------------------------------------- number line

/** A rational as number-line label text: "3", "−3", "5/2", "−5/2". */
export function ratText(r: Rat): string {
  const sign = r.n < 0 ? "−" : "";
  const mag = Math.abs(r.n);
  return r.d === 1 ? `${sign}${mag}` : `${sign}${mag}/${r.d}`;
}

/**
 * The set drawn on a number line: a dot at each endpoint (filled when
 * included) and the set shaded, rays running off the ends. The window comes
 * from numberLineWindow, symmetric about 0, so a blank copy of it hints at the
 * scale only. A dot is labelled unless it sits on a labelled tick.
 */
export function numberLine(s: SolutionSet): NumberLineSpec {
  const window = numberLineWindow(endpoints(s).map(ratValue));
  return drawSet(s, window, true);
}

/** The set drawn on a given window, with or without labels on its dots. */
export function drawSet(
  s: SolutionSet,
  window: Pick<NumberLineSpec, "range" | "step" | "labelEvery">,
  labelDots: boolean,
): NumberLineSpec {
  const dot = (x: Rat, closed: boolean): NumberLinePoint => {
    const p: NumberLinePoint = { x: ratValue(x), closed };
    if (labelDots && !(x.d === 1 && isLabelledTick(window, p.x))) p.label = ratText(x);
    return p;
  };
  let points: NumberLinePoint[] = [];
  let shaded: ShadedInterval[] = [];
  switch (s.kind) {
    case "ray":
      points = [dot(s.at, s.closed)];
      shaded = [s.dir === "below" ? { from: null, to: ratValue(s.at) } : { from: ratValue(s.at), to: null }];
      break;
    case "between":
      points = [dot(s.lo, s.loClosed), dot(s.hi, s.hiClosed)];
      shaded = [{ from: ratValue(s.lo), to: ratValue(s.hi) }];
      break;
    case "outside":
      points = [dot(s.lo, s.loClosed), dot(s.hi, s.hiClosed)];
      shaded = [
        { from: null, to: ratValue(s.lo) },
        { from: ratValue(s.hi), to: null },
      ];
      break;
    case "all":
      shaded = [{ from: null, to: null }];
      break;
    case "none":
      break;
    case "point":
      points = [dot(s.at, true)];
      break;
    case "allBut":
      points = [dot(s.at, false)];
      shaded = [
        { from: null, to: ratValue(s.at) },
        { from: ratValue(s.at), to: null },
      ];
      break;
  }
  return { kind: "numberLine", ...window, points, shaded };
}

/**
 * The parts of a Problem every solving Topic shares: the Answer in the chosen
 * notation, its Distractors (each a mis-solved solution set, most common
 * mistake first, topped up with fallbackSets; deduplicated as printed and
 * never the Answer), the number line on the Answer Key, and a
 * blank copy of it on the student copy when asked for.
 */
/** Enough Distractors for the largest multiple-choice set, with one to spare. */
export const MAX_HINTS = 6;

export function solvedProblem(
  base: Pick<Problem, "generatorId" | "params" | "seed" | "prompt">,
  answer: SolutionSet,
  mistakes: readonly (SolutionSet | null)[],
  extraHints: readonly string[] = [],
): Problem {
  const notation = base.params.notation as Notation;
  const answerTex = setLatex(answer, notation);
  const line = numberLine(answer);
  const problem: Problem = {
    kind: "generated",
    ...base,
    answer: answerTex,
    distractorHints: distinctSets(answerTex, [
      ...mistakes.filter((m): m is SolutionSet => m !== null).map((m) => setLatex(m, notation)),
      ...extraHints,
      ...fallbackSets(answer).map((m) => setLatex(m, notation)),
    ]).slice(0, MAX_HINTS),
    answerGraph: line,
  };
  if (base.params.showNumberLine) problem.graph = blankGraph(line);
  return problem;
}

/** Distinct printed candidates, in order, never the Answer (as the assembler compares them). */
export function distinctSets(answer: string, candidates: readonly string[]): string[] {
  return distinctHints(answer, [...candidates]);
}

/**
 * Generic fallbacks that keep a multiple-choice set full of plausible choices
 * after the mistake-based ones: the set's shape shaded the other way with the
 * other inclusion, and nudged endpoints.
 */
export function fallbackSets(s: SolutionSet): SolutionSet[] {
  const nudge = (r: Rat, by: number) => rat(r.n + by * r.d, r.d);
  const out: SolutionSet[] = [toggled(flipped(s))];
  switch (s.kind) {
    case "ray":
      out.push({ ...s, at: nudge(s.at, 1) }, { ...s, at: nudge(s.at, -1) });
      break;
    case "between":
    case "outside":
      out.push({ ...s, lo: nudge(s.lo, -1), hi: nudge(s.hi, 1) }, { ...s, loClosed: !s.loClosed });
      break;
    case "point":
    case "allBut":
      out.push(ALL, NONE, { kind: "ray", at: s.at, dir: "above", closed: true });
      break;
    case "all":
    case "none":
      out.push(
        { kind: "ray", at: rat(0), dir: "above", closed: false },
        { kind: "ray", at: rat(0), dir: "below", closed: false },
        { kind: "point", at: rat(0) },
      );
      break;
  }
  return out;
}
