// "Solving multi-step inequalities": the distributive property, combining like
// terms and variables on both sides, alone or together, with optional
// no-solution and all-real-numbers inequalities.
//
// Built ANSWER-FROM-CONSTRUCTION on top of the multi-step equations Topic: its
// construction picks the shape and the boundary x0 first and computes one
// constant so that both sides agree at x0 (multiStepEquations.ts). Writing
// both sides as Kx + kL and kR, with K the net coefficient of x, the
// inequality "left op right" says K(x - x0) op 0, so its solution set is
// x op x0, flipped when K is negative. For the special cases x cancels
// (K = 0) and "left op right" says d op 0 for the leftover constant d, which
// is simply true (all real numbers) or false (no solution). Nothing is ever
// solved.

import { createRng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { div, rat, type Rat } from "./equationKit";
import {
  construct as constructEquation,
  schema as equationSchema,
  sideLatex,
  sideParts,
  type MultiStepConstruction,
  type Piece,
} from "./multiStepEquations";
import {
  ALL,
  flipped,
  holds,
  negated,
  NONE,
  notationField,
  OP_LATEX,
  OPS,
  ray,
  rayFor,
  showNumberLineField,
  solvedProblem,
  toggled,
  type Op,
  type SolutionSet,
} from "./inequalityKit";

export const MULTI_STEP_INEQUALITIES_ID = "multi-step-inequalities";

/** The multi-step equations options, minus the variable letter, in their order. */
const shared = equationSchema.filter((f) => f.key !== "varyVariable").map((f) =>
  f.key === "specialCases" ? { ...f, label: "Include no-solution and all-real-numbers inequalities" } : f,
);

export const schema = [
  ...shared,
  notationField,
  showNumberLineField,
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface MultiStepInequality {
  eq: MultiStepConstruction;
  op: Op;
  solution: SolutionSet;
}

/** Pure construction from params + a seed. */
export function construct(params: ParamValues, seed: number): MultiStepInequality {
  const p = resolveParams(schema, params);
  const rng = createRng(seed);
  const eq = constructEquation({ ...p, varyVariable: false }, rng);
  const op = rng.pick(OPS);
  const l = sideParts(eq.eq.left);
  const r = sideParts(eq.eq.right);
  const K = l.xc - r.xc;
  let solution: SolutionSet;
  if (eq.outcome === "one") solution = rayFor(eq.x!, op, K);
  // x cancels: left op right is the constant comparison kL op kR
  else solution = holds(l.k, op, r.k) ? ALL : NONE;
  return { eq, op, solution };
}

export function promptLatex(k: MultiStepInequality): string {
  return `${sideLatex(k.eq.eq.left, "x")} ${OP_LATEX[k.op]} ${sideLatex(k.eq.eq.right, "x")}`;
}

// ------------------------------------------------------------------ mistakes

type Mistake = "partial" | "negSign" | "absCombine";

/**
 * A side's x-coefficient and constant as a student making `mistake` gets them
 * (the same slips the multi-step equations Topic models).
 */
function mistakenParts(side: Piece[], mistake: Mistake): { xc: number; k: number } {
  let xc = 0;
  let k = 0;
  const hasNegativeX = side.some((p) => (p.kind === "term" ? p.x && p.coef < 0 : p.mult * p.p < 0));
  const xCount = side.filter((p) => p.kind === "group" || p.x).length;
  const absX = mistake === "absCombine" && hasNegativeX && xCount >= 2;
  for (const p of side) {
    if (p.kind === "term") {
      if (!p.x) k += p.coef;
      else xc += absX ? Math.abs(p.coef) : p.coef;
    } else {
      const px = p.mult * p.p;
      xc += absX ? Math.abs(px) : px;
      if (mistake === "partial") k += p.q; // multiplied only the first term
      else if (mistake === "negSign" && p.mult < 0) k -= p.mult * p.q; // -2(x - 4) -> -2x - 8
      else k += p.mult * p.q;
    }
  }
  return { xc, k };
}

/** The set a student gets from "xc x + k op ..." solved correctly from mistaken parts. */
function fromParts(l: { xc: number; k: number }, r: { xc: number; k: number }, op: Op): SolutionSet | null {
  const K = l.xc - r.xc;
  if (K === 0) return null;
  return rayFor(div(rat(r.k - l.k), rat(K))!, op, K);
}

/**
 * Mistake-based Distractors, each the solution set of a mis-solved
 * inequality, most common first:
 * - with a negative net coefficient, forgot to flip the symbol; with a
 *   positive one, flipped it anyway;
 * - distributed to the first term only, or dropped the sign distributing a
 *   negative; combined like terms ignoring a minus sign;
 * - moved a constant across without changing its sign;
 * - wrong endpoint inclusion, and the boundary's sign changed.
 * For no solution and all real numbers: the other one, then reading the
 * leftover d op 0 as x op d.
 */
export function mistakes(k: MultiStepInequality): (SolutionSet | null)[] {
  const { left, right } = k.eq.eq;
  const { op } = k;
  const answer = k.solution;
  const l = sideParts(left);
  const r = sideParts(right);
  if (k.eq.outcome !== "one") {
    return [flipped(answer), ray(rat(r.k - l.k), op), ray(rat(l.k - r.k), op)];
  }
  const x0: Rat = k.eq.x!;
  const K = l.xc - r.xc;
  const out: (SolutionSet | null)[] = [];
  out.push(K < 0 ? ray(x0, op) : null);
  const pieces = [...left, ...right];
  if (pieces.some((p) => p.kind === "group" && p.mult < 0)) {
    out.push(fromParts(mistakenParts(left, "negSign"), mistakenParts(right, "negSign"), op));
  }
  if (pieces.some((p) => p.kind === "group")) {
    out.push(fromParts(mistakenParts(left, "partial"), mistakenParts(right, "partial"), op));
  }
  out.push(fromParts(mistakenParts(left, "absCombine"), mistakenParts(right, "absCombine"), op));
  if (l.k !== 0 && r.k !== 0) out.push(rayFor(div(rat(r.k + l.k), rat(K))!, op, K));
  out.push(toggled(answer));
  if (K > 0) out.push(flipped(answer));
  out.push(negated(answer));
  return out;
}

export const generator: Generator = {
  id: MULTI_STEP_INEQUALITIES_ID,
  title: "Solving multi-step inequalities",
  defaultDirections: "Solve each inequality.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, seed);
    return solvedProblem(
      { generatorId: MULTI_STEP_INEQUALITIES_ID, params: resolved, seed, prompt: promptLatex(k) },
      k.solution,
      mistakes(k),
    );
  },
};
