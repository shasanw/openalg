// "Solve quadratic inequalities", answered in interval or inequality notation.
//
// Built ANSWER-FROM-CONSTRUCTION: we choose the critical points (the zeros of
// the quadratic) and the sign of the leading coefficient first, which fixes the
// sign of the quadratic on every region of the number line. Picking an
// inequality symbol then determines the solution set outright: the regions
// where the quadratic has the requested sign, with the critical points included
// exactly when the symbol is non-strict. Only then is the quadratic expanded
// into the printed inequality. Nothing is ever solved.
//
// Constructions:
// - two distinct critical points r1 < r2:  a(x - r1)(x - r2), with r1, r2
//   integers, reduced fractions (from (d1 x - n1)(d2 x - n2)), or the
//   conjugate surds h ± √s (from x^2 - 2hx + h^2 - s);
// - special cases (opt-in): a double root a(x - h)^2, or no real zeros
//   a((x - h)^2 + m) with m > 0, giving "all reals", "no solution", a single
//   point, or "all reals except one point".
//
// Number lines: the issue asks for number-line graphics via the shared SVG
// plotter (#9), which does not exist yet. The `SolutionSet` below already holds
// everything a number line needs (endpoints, which are open/closed, and the
// shaded regions); see `numberLineSeam` for where the graph `spec` attaches.

import { createRng, type Rng } from "../rng";
import {
  resolveParams,
  type Generator,
  type ParamSchema,
  type ParamValues,
  type Problem,
} from "../types";
import { fractionToLatex, gcd, quadraticToLatex } from "../format";

export const QUADRATIC_INEQUALITIES_ID = "quadratic-inequalities";

export type Notation = "interval" | "inequality";
export type CriticalPointType = "integer" | "rational" | "irrational";
export type SymbolMode = "mixed" | "strict" | "nonStrict";
export type Op = "<" | ">" | "<=" | ">=";

export const schema = [
  {
    type: "enum",
    key: "notation",
    label: "Answer notation",
    default: "interval",
    options: [
      { value: "interval", label: "Interval notation" },
      { value: "inequality", label: "Inequality notation" },
    ],
  },
  {
    type: "enum",
    key: "criticalPoints",
    label: "Critical points",
    default: "integer",
    options: [
      { value: "integer", label: "Integers" },
      { value: "rational", label: "Fractions" },
      { value: "irrational", label: "Irrational (radicals)" },
    ],
  },
  {
    type: "enum",
    key: "symbols",
    label: "Inequality symbols",
    default: "mixed",
    options: [
      { value: "mixed", label: "Strict and non-strict" },
      { value: "strict", label: "Strict only (<, >)" },
      { value: "nonStrict", label: "Non-strict only (≤, ≥)" },
    ],
  },
  {
    type: "boolean",
    key: "allowNegativeLeading",
    label: "Allow a negative leading coefficient",
    default: false,
  },
  {
    type: "boolean",
    key: "allowLeadingCoefficient",
    label: "Allow a leading coefficient (|a| > 1)",
    default: false,
  },
  {
    type: "boolean",
    key: "allowSpecialCases",
    label: "Include special cases (all reals, no solution, one point)",
    default: false,
  },
  {
    type: "boolean",
    key: "standardForm",
    label: "Zero on one side",
    default: true,
  },
  {
    type: "int",
    key: "maxCriticalPoint",
    label: "Largest critical point magnitude",
    min: 2,
    max: 12,
    default: 6,
  },
] as const satisfies ParamSchema;

/**
 * An exact real number (p + q√s) / r with r > 0 and s square-free (s === 1 and
 * q === 0 for a rational). Critical points never need anything richer.
 */
export interface ExactNum {
  p: number;
  q: number;
  s: number;
  r: number;
}

export function exactValue({ p, q, s, r }: ExactNum): number {
  return (p + q * Math.sqrt(s)) / r;
}

function rational(n: number, d = 1): ExactNum {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return { p: n / g, q: 0, s: 1, r: d / g };
}

function negate(x: ExactNum): ExactNum {
  return { p: -x.p, q: -x.q, s: x.s, r: x.r };
}

/**
 * The solution set of the inequality, known by construction. This is also the
 * whole of what a number line needs, so #9's plotter can draw from it directly.
 */
export type SolutionSet =
  | { kind: "between"; lo: ExactNum; hi: ExactNum; closed: boolean }
  | { kind: "outside"; lo: ExactNum; hi: ExactNum; closed: boolean }
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "point"; at: ExactNum }
  | { kind: "allBut"; at: ExactNum };

/** The shape of the quadratic's zeros, chosen before anything else. */
export type Zeros =
  | { kind: "two"; lo: ExactNum; hi: ExactNum }
  | { kind: "double"; at: ExactNum }
  | { kind: "none" };

/** The structured construction. Exposed for property tests. */
export interface InequalityConstruction {
  a: number;
  b: number;
  c: number;
  op: Op;
  zeros: Zeros;
  solution: SolutionSet;
}

const isStrict = (op: Op) => op === "<" || op === ">";
const wantsPositive = (op: Op) => op === ">" || op === ">=";

/**
 * The solution set of `q(x) op 0` where q has leading sign `sign` and the given
 * zeros. Pure sign logic: q has the sign of its leading coefficient outside its
 * zeros (and everywhere if it has none) and the opposite sign between them.
 */
export function solutionFor(zeros: Zeros, sign: 1 | -1, op: Op): SolutionSet {
  // Normalize to "positive leading coefficient": q op 0 with a < 0 is -q op' 0.
  const positive = wantsPositive(op) === (sign > 0);
  const closed = !isStrict(op);
  switch (zeros.kind) {
    case "two":
      return {
        kind: positive ? "outside" : "between",
        lo: zeros.lo,
        hi: zeros.hi,
        closed,
      };
    case "double":
      // (x - h)^2 is positive except at h, where it is 0.
      if (positive) return closed ? { kind: "all" } : { kind: "allBut", at: zeros.at };
      return closed ? { kind: "point", at: zeros.at } : { kind: "none" };
    case "none":
      return positive ? { kind: "all" } : { kind: "none" };
  }
}

/** Polynomial a x^2 + b x + c, kept in lowest terms with gcd 1 (times k). */
function primitive(a: number, b: number, c: number): [number, number, number] {
  const g = gcd(gcd(a, b), c) || 1;
  return [a / g, b / g, c / g];
}

function pickOp(rng: Rng, mode: SymbolMode): Op {
  const ops: Op[] =
    mode === "strict" ? ["<", ">"] : mode === "nonStrict" ? ["<=", ">="] : ["<", ">", "<=", ">="];
  return rng.pick(ops);
}

/** Two distinct integers in [-M, M]. */
function twoIntegers(rng: Rng, M: number): [number, number] {
  const r1 = rng.int(-M, M);
  let r2 = rng.int(-M, M - 1);
  if (r2 >= r1) r2 += 1;
  return r1 < r2 ? [r1, r2] : [r2, r1];
}

/** A reduced fraction n/d with d in {2, 3, 4} and |n/d| <= M. */
function properFraction(rng: Rng, M: number): [number, number] {
  const d = rng.pick([2, 3, 4]);
  // Keep numerators small so the expanded coefficients stay readable.
  const maxN = Math.min(M * d, 2 * d + 1);
  for (;;) {
    const n = rng.int(-maxN, maxN);
    if (n !== 0 && gcd(n, d) === 1) return [n, d];
  }
}

/** Square-free radicands for the irrational case. */
const RADICANDS = [2, 3, 5, 6, 7, 10, 11, 13];

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): InequalityConstruction {
  const p = resolveParams(schema, params);
  const pointType = p.criticalPoints as CriticalPointType;
  const symbols = p.symbols as SymbolMode;
  const allowNegative = p.allowNegativeLeading as boolean;
  const allowLeading = p.allowLeadingCoefficient as boolean;
  const allowSpecial = p.allowSpecialCases as boolean;
  const M = p.maxCriticalPoint as number;

  const op = pickOp(rng, symbols);
  const sign: 1 | -1 = allowNegative && rng.bool() ? -1 : 1;
  // An extra integer scale k (|a| > 1) is only drawn when requested; fractional
  // critical points carry their own leading coefficient d1·d2 regardless.
  const k = allowLeading && rng.bool(0.6) ? rng.int(2, 3) : 1;

  let zeros: Zeros;
  let base: [number, number, number]; // primitive polynomial with a > 0

  const special = allowSpecial && rng.bool(0.35) ? rng.pick(["double", "none"] as const) : null;

  if (special === "double") {
    const h = rng.int(-M, M);
    zeros = { kind: "double", at: rational(h) };
    base = [1, -2 * h, h * h];
  } else if (special === "none") {
    const h = rng.int(-Math.min(M, 5), Math.min(M, 5));
    const m = rng.int(1, 9);
    zeros = { kind: "none" };
    base = [1, -2 * h, h * h + m];
  } else if (pointType === "integer") {
    const [r1, r2] = twoIntegers(rng, M);
    zeros = { kind: "two", lo: rational(r1), hi: rational(r2) };
    base = [1, -(r1 + r2), r1 * r2];
  } else if (pointType === "rational") {
    const [n1, d1] = properFraction(rng, M);
    const integerSecond = rng.bool();
    let n2: number;
    let d2: number;
    do {
      [n2, d2] = integerSecond
        ? [rng.int(-Math.min(M, 5), Math.min(M, 5)), 1]
        : properFraction(rng, M);
    } while (n1 * d2 === n2 * d1); // redraw until the two points are distinct
    // (d1 x - n1)(d2 x - n2): primitive factors, so the product is primitive.
    base = [d1 * d2, -(d1 * n2 + d2 * n1), n1 * n2];
    const x1 = rational(n1, d1);
    const x2 = rational(n2, d2);
    const [lo, hi] = exactValue(x1) < exactValue(x2) ? [x1, x2] : [x2, x1];
    zeros = { kind: "two", lo, hi };
  } else {
    // Keep both surds within M: |h| + √s <= M (always feasible: s = 2, h = 0).
    const s = rng.pick(RADICANDS.filter((r) => Math.sqrt(r) < M));
    const hMax = Math.floor(M - Math.sqrt(s));
    const h = rng.int(-hMax, hMax);
    zeros = {
      kind: "two",
      lo: { p: h, q: -1, s, r: 1 },
      hi: { p: h, q: 1, s, r: 1 },
    };
    base = [1, -2 * h, h * h - s];
  }

  const [a0, b0, c0] = primitive(...base);
  const scale = sign * k;
  // `+ 0` turns any -0 (from h = 0) into 0 so recipes and bakes stay tidy.
  const a = a0 * scale + 0;
  const b = b0 * scale + 0;
  const c = c0 * scale + 0;

  return { a, b, c, op, zeros, solution: solutionFor(zeros, sign, op) };
}

// ---------------------------------------------------------------- rendering

/** Render an exact number as LaTeX: an integer, a reduced fraction, or
 * (p ± q√s)/r with unit coefficients hidden. */
export function numToLatex(x: ExactNum): string {
  if (x.q === 0 || x.s === 1) return fractionToLatex(x.p + x.q, x.r);
  const qa = Math.abs(x.q);
  const rad = `${qa === 1 ? "" : qa}\\sqrt{${x.s}}`;
  if (x.r === 1) {
    if (x.p === 0) return x.q < 0 ? `-${rad}` : rad;
    return `${x.p} ${x.q < 0 ? "-" : "+"} ${rad}`;
  }
  const numer = x.p === 0 ? (x.q < 0 ? `-${rad}` : rad) : `${x.p} ${x.q < 0 ? "-" : "+"} ${rad}`;
  return `\\frac{${numer}}{${x.r}}`;
}

const OP_LATEX: Record<Op, string> = { "<": "<", ">": ">", "<=": "\\le", ">=": "\\ge" };

function intervalLatex(s: SolutionSet): string {
  switch (s.kind) {
    case "between": {
      const [l, r] = s.closed ? ["[", "]"] : ["(", ")"];
      return `${l}${numToLatex(s.lo)}, ${numToLatex(s.hi)}${r}`;
    }
    case "outside": {
      const [l, r] = s.closed ? ["]", "["] : [")", "("];
      return `(-\\infty, ${numToLatex(s.lo)}${l} \\cup ${r}${numToLatex(s.hi)}, \\infty)`;
    }
    case "all":
      return "(-\\infty, \\infty)";
    case "none":
      return "\\varnothing";
    case "point":
      return `\\{${numToLatex(s.at)}\\}`;
    case "allBut": {
      const h = numToLatex(s.at);
      return `(-\\infty, ${h}) \\cup (${h}, \\infty)`;
    }
  }
}

function inequalityLatex(s: SolutionSet): string {
  switch (s.kind) {
    case "between": {
      const le = s.closed ? "\\le" : "<";
      return `${numToLatex(s.lo)} ${le} x ${le} ${numToLatex(s.hi)}`;
    }
    case "outside": {
      const [lt, gt] = s.closed ? ["\\le", "\\ge"] : ["<", ">"];
      return `x ${lt} ${numToLatex(s.lo)} \\text{ or } x ${gt} ${numToLatex(s.hi)}`;
    }
    case "all":
      return "\\text{all real numbers}";
    case "none":
      return "\\text{no solution}";
    case "point":
      return `x = ${numToLatex(s.at)}`;
    case "allBut":
      return `x \\ne ${numToLatex(s.at)}`;
  }
}

/** Render a solution set in the requested notation. Uses only constructs that
 * both KaTeX and mitex (the Typst bridge) convert: plain (mismatched)
 * delimiters, `\infty`, `\cup`, `\varnothing`, `\{ \}`, `\le`/`\ge`/`\ne`,
 * `\text{...}`. */
export function solutionToLatex(s: SolutionSet, notation: Notation): string {
  return notation === "interval" ? intervalLatex(s) : inequalityLatex(s);
}

/** The printed inequality. With `standardForm` off, the constant term moves to
 * the right-hand side (e.g. x^2 + 3x < 10), so students must rearrange first. */
export function promptLatex(k: InequalityConstruction, standardForm: boolean): string {
  const op = OP_LATEX[k.op];
  if (standardForm || k.c === 0) return `${quadraticToLatex(k.a, k.b, k.c)} ${op} 0`;
  return `${quadraticToLatex(k.a, k.b, 0)} ${op} ${-k.c}`;
}

// -------------------------------------------------------------- distractors

const FLIP: Record<Op, Op> = { "<": ">", ">": "<", "<=": ">=", ">=": "<=" };
const TOGGLE: Record<Op, Op> = { "<": "<=", "<=": "<", ">": ">=", ">=": ">" };

function negateZeros(z: Zeros): Zeros {
  switch (z.kind) {
    case "two":
      return { kind: "two", lo: negate(z.hi), hi: negate(z.lo) };
    case "double":
      return { kind: "double", at: negate(z.at) };
    case "none":
      return z;
  }
}

/**
 * Mistake-based distractors, each the exact solution set of a mis-solved
 * version of the problem (so they are well-formed answers, just wrong):
 * - the opposite region: testing the wrong intervals, or forgetting to flip
 *   the symbol after dividing by a negative leading coefficient;
 * - wrong endpoint inclusion: treating < as ≤ (or the reverse);
 * - both mistakes at once;
 * - sign error on the critical points (reading x = 3 from (x + 3));
 * - for two-sided answers, keeping only one of the two rays;
 * - with no real zeros, treating the vertex as a critical point.
 * Distinct, and never equal to the correct answer.
 */
export function distractors(k: InequalityConstruction, notation: Notation): string[] {
  const sign: 1 | -1 = k.a > 0 ? 1 : -1;
  const sets: SolutionSet[] = [
    solutionFor(k.zeros, sign, FLIP[k.op]),
    solutionFor(k.zeros, sign, TOGGLE[k.op]),
    solutionFor(k.zeros, sign, FLIP[TOGGLE[k.op]]),
    solutionFor(negateZeros(k.zeros), sign, k.op),
  ];
  if (k.zeros.kind === "none") {
    // used the vertex x = -b/2a as if it were a (double) critical point, with
    // and without the inclusion and region mistakes above
    const vertex: Zeros = { kind: "double", at: rational(-k.b, 2 * k.a) };
    for (const op of [k.op, TOGGLE[k.op], FLIP[k.op]]) {
      sets.push(solutionFor(vertex, sign, op));
    }
  }
  const tex = sets.map((s) => solutionToLatex(s, notation));
  const s = k.solution;
  if (s.kind === "outside") {
    // dropped the left ray
    const gt = s.closed ? "\\ge" : ">";
    tex.push(
      notation === "interval"
        ? `${s.closed ? "[" : "("}${numToLatex(s.hi)}, \\infty)`
        : `x ${gt} ${numToLatex(s.hi)}`,
    );
  }
  const correct = solutionToLatex(s, notation);
  const seen = new Set<string>([correct]);
  const out: string[] = [];
  for (const t of tex) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * SEAM for #9 (number lines). When the shared SVG plotter lands, build its
 * number-line spec here from `k.solution` (endpoints via `exactValue`, open vs
 * closed dots from `closed` / `kind`, shaded regions from `kind`) and attach it
 * to the Problem as its graph `spec`. Kept as a no-op so the generator's output
 * is stable until then.
 */
export function numberLineSeam(_k: InequalityConstruction): undefined {
  return undefined;
}

export const generator: Generator = {
  id: QUADRATIC_INEQUALITIES_ID,
  course: "Algebra 2",
  unit: "Quadratics",
  title: "Solving quadratic inequalities",
  defaultDirections: "Solve each inequality.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    const notation = resolved.notation as Notation;
    // #9: attach `spec: numberLineSeam(k)` here once Problem carries a graph spec.
    return {
      kind: "generated",
      generatorId: QUADRATIC_INEQUALITIES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k, resolved.standardForm as boolean),
      answer: solutionToLatex(k.solution, notation),
      distractorHints: distractors(k, notation),
    };
  },
};
