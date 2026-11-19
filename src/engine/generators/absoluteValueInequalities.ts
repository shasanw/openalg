// "Solving absolute value inequalities": |ax + b| < c (an "and" inequality,
// shaded between) and |ax + b| > c (an "or" inequality, shaded outside),
// optionally with the absolute value to isolate first (2|x - 1| + 3 > 11,
// including negative multipliers that flip the symbol), and optional special
// cases with c <= 0 (no solution, all real numbers, one point, all but one
// point).
//
// Built ANSWER-FROM-CONSTRUCTION: the centre m and the half-width h of the
// solution are chosen first, so the boundaries are m - h and m + h; then
// b = -am and c = ah make |ax + b| op c say |x - m| op h, which is between
// (for < and <=) or outside (for > and >=) those boundaries. Isolating adds
// a multiplier k and a constant d around the bars, with the other side
// computed as kc + d. The special cases choose c <= 0 first, which decides the
// set by sign logic alone (an absolute value is never negative). Nothing is
// ever solved.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { div, linearLatex, nonzeroInt, rat, type Rat } from "./equationKit";
import {
  ALL,
  FLIP,
  flipped,
  isStrict,
  negated,
  NONE,
  notationField,
  OP_LATEX,
  pointsDown,
  ray,
  showNumberLineField,
  solvedProblem,
  toggled,
  type Op,
  type SolutionSet,
} from "./inequalityKit";

export const ABSOLUTE_VALUE_INEQUALITIES_ID = "absolute-value-inequalities";

export type Types = "less" | "greater" | "mixed";
export type Isolate = "no" | "yes" | "withNegative";

export const schema = [
  {
    type: "enum",
    key: "types",
    label: "Inequalities",
    default: "mixed",
    options: [
      { value: "less", label: "Less than: |ax + b| < c (and)" },
      { value: "greater", label: "Greater than: |ax + b| > c (or)" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "boolean",
    key: "coefficient",
    label: "Allow a coefficient on x inside the bars",
    default: true,
  },
  {
    type: "enum",
    key: "isolate",
    label: "Isolate the absolute value first",
    default: "no",
    options: [
      { value: "no", label: "No (|ax + b| alone on one side)" },
      { value: "yes", label: "Yes, like 2|x - 1| + 3 > 11" },
      { value: "withNegative", label: "Yes, including negative multipliers" },
    ],
  },
  {
    type: "boolean",
    key: "specialCases",
    label: "Include special cases (c ≤ 0: no solution, all real numbers, one point)",
    default: false,
  },
  {
    type: "int",
    key: "maxSolution",
    label: "Largest boundary value",
    min: 2,
    max: 20,
    default: 10,
  },
  notationField,
  showNumberLineField,
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface AbsConstruction {
  /** |ax + b| op c, before any isolating */
  a: number;
  b: number;
  op: Op;
  c: number;
  /** centre and half-width of the solution (h is 0 for the special cases) */
  m: number;
  h: number;
  /** print the inside constant first: |6 - 2x| for |2x - 6| */
  constantFirst: boolean;
  /** k|ax + b| + d op' e, when isolating (k = 1, d = 0 otherwise) */
  k: number;
  d: number;
  solution: SolutionSet;
}

/** The set |x - m| op h describes, for h >= 0 (sign logic only). */
export function absSet(m: number, op: Op, h: number): SolutionSet {
  const less = pointsDown(op);
  const closed = !isStrict(op);
  if (h < 0) return less ? NONE : ALL;
  if (h === 0) {
    if (less) return closed ? { kind: "point", at: rat(m) } : NONE;
    return closed ? ALL : { kind: "allBut", at: rat(m) };
  }
  const lo = rat(m - h);
  const hi = rat(m + h);
  return less
    ? { kind: "between", lo, hi, loClosed: closed, hiClosed: closed }
    : { kind: "outside", lo, hi, loClosed: closed, hiClosed: closed };
}

function pickOp(rng: Rng, types: Types): Op {
  if (types === "less") return rng.pick(["<", "<="] as const);
  if (types === "greater") return rng.pick([">", ">="] as const);
  return rng.pick(["<", "<=", ">", ">="] as const);
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): AbsConstruction {
  const p = resolveParams(schema, params);
  const S = p.maxSolution as number;
  const op = pickOp(rng, p.types as Types);
  const a = p.coefficient && rng.bool(0.5) ? rng.int(2, 4) : 1;
  const special = (p.specialCases as boolean) && rng.bool(0.3);

  // centre m != 0 (so the bars hold a real "+ b"), boundaries within S
  const m = nonzeroInt(rng, 1, S - 1, true);
  const h = special ? 0 : rng.int(1, Math.max(1, S - Math.abs(m)));
  // the special cases: c = 0, or a negative c
  const c = special ? (rng.bool(0.4) ? 0 : -rng.int(1, 9)) : a * h;
  const b = -a * m;

  const isolate = p.isolate as Isolate;
  let k = 1;
  let d = 0;
  if (isolate !== "no") {
    k = rng.int(2, 5);
    if (isolate === "withNegative" && rng.bool(0.4)) k = -k;
    d = nonzeroInt(rng, 1, 9, true);
  }
  return {
    a,
    b,
    op,
    c,
    m,
    h,
    constantFirst: a > 1 && b < 0 && rng.bool(0.3),
    k,
    d,
    solution: absSet(m, op, c < 0 ? -1 : h),
  };
}

// ------------------------------------------------------------------ printing

export function insideLatex(k: AbsConstruction): string {
  return k.constantFirst
    ? linearLatex([{ coef: rat(-k.b), v: "" }, { coef: rat(-k.a), v: "x" }])
    : linearLatex([{ coef: rat(k.a), v: "x" }, { coef: rat(k.b), v: "" }]);
}

export function promptLatex(k: AbsConstruction): string {
  const bars = `|${insideLatex(k)}|`;
  if (k.k === 1 && k.d === 0) return `${bars} ${OP_LATEX[k.op]} ${k.c}`;
  const mult = k.k === -1 ? "-" : String(k.k);
  const left = `${mult}${bars} ${k.d < 0 ? "-" : "+"} ${Math.abs(k.d)}`;
  // dividing by a negative multiplier flips the symbol, so it prints flipped
  const op = k.k < 0 ? FLIP[k.op] : k.op;
  return `${left} ${OP_LATEX[op]} ${k.k * k.c + k.d}`;
}

// ------------------------------------------------------------------ mistakes

/** |x - m| op r for a rational r, as a student who reached it would shade it. */
function shadeAround(m: number, op: Op, r: Rat | null): SolutionSet | null {
  if (!r || r.n <= 0) return null;
  const lo = rat(m * r.d - r.n, r.d);
  const hi = rat(m * r.d + r.n, r.d);
  const closed = !isStrict(op);
  return pointsDown(op)
    ? { kind: "between", lo, hi, loClosed: closed, hiClosed: closed }
    : { kind: "outside", lo, hi, loClosed: closed, hiClosed: closed };
}

/**
 * Mistake-based Distractors, each the solution set of a mis-solved
 * inequality, most common first:
 * - "and" and "or" mixed up (shaded outside instead of between, or the
 *   reverse), which is also what forgetting to flip after dividing by a
 *   negative multiplier gives;
 * - solved only the positive case (ax + b op c), giving a single ray;
 * - wrote the negative case without flipping (ax + b op -c), giving the
 *   other ray;
 * - when isolating: did not divide by the multiplier, or moved the constant
 *   with the wrong sign;
 * - wrong endpoint inclusion, and the boundaries' signs changed (b moved
 *   with the wrong sign).
 * For the special cases: the opposite outcome, the set the inequality would
 * have if c were positive (solving it anyway), and the one-point sets.
 */
export function mistakes(k: AbsConstruction): (SolutionSet | null)[] {
  const answer = k.solution;
  const { m, op } = k;
  const out: (SolutionSet | null)[] = [flipped(answer)];
  if (k.c < 0) {
    // solved as if c were |c|
    out.push(shadeAround(m, op, rat(-k.c, k.a)));
    out.push({ kind: "point", at: rat(m) }, { kind: "allBut", at: rat(m) });
    return out;
  }
  if (k.c === 0) {
    out.push(
      { kind: "point", at: rat(m) },
      { kind: "allBut", at: rat(m) },
      NONE,
      ALL,
      ray(rat(m), op),
    );
    return out;
  }
  out.push(ray(rat(m + k.h), op), ray(rat(m - k.h), op));
  if (k.k !== 1 || k.d !== 0) {
    const e = k.k * k.c + k.d;
    // |ax + b| op (e - d) without dividing by k, and (e + d)/k
    out.push(shadeAround(m, op, div(rat(Math.abs(e - k.d)), rat(k.a))));
    out.push(shadeAround(m, op, div(rat(e + k.d), rat(k.k * k.a))));
  }
  out.push(toggled(answer), negated(answer));
  return out;
}

export const generator: Generator = {
  id: ABSOLUTE_VALUE_INEQUALITIES_ID,
  title: "Solving absolute value inequalities",
  defaultDirections: "Solve each inequality.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return solvedProblem(
      { generatorId: ABSOLUTE_VALUE_INEQUALITIES_ID, params: resolved, seed, prompt: promptLatex(k) },
      k.solution,
      mistakes(k),
    );
  },
};
