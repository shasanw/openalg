// "Solving compound inequalities": "and" inequalities, written as one
// three-part inequality (-3 < 2x + 1 <= 7) or as two joined by "and", and
// "or" inequalities, with optional special cases ("and" with no overlap: no
// solution; "or" covering the line: all real numbers).
//
// Built ANSWER-FROM-CONSTRUCTION: the boundaries p < q and their inclusion are
// chosen first, which fixes the two rays x > p (or >=) and x < q (or <=); for
// "or" (and the special cases) the rays point the other way. Each ray is then
// dressed up as a one- or two-step inequality ax + b op c with c computed from
// the boundary (the symbol flipped when a is negative). The solution set is
// the rays joined by "and" or "or", which is set logic, not algebra. Nothing
// is ever solved.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { add, div, linearLatex, mul, nonzeroInt, numLatex, rat, type Rat } from "./equationKit";
import {
  combine,
  FLIP,
  flipped,
  negated,
  notationField,
  OP_LATEX,
  opOf,
  showNumberLineField,
  solvedProblem,
  toggled,
  type Op,
  type Ray,
  type SolutionSet,
} from "./inequalityKit";

export const COMPOUND_INEQUALITIES_ID = "compound-inequalities";

export type Join = "and" | "or";
export type Types = Join | "mixed";

export const schema = [
  {
    type: "enum",
    key: "types",
    label: "Compound inequalities",
    default: "mixed",
    options: [
      { value: "and", label: "\"And\" only" },
      { value: "or", label: "\"Or\" only" },
      { value: "mixed", label: "\"And\" and \"or\"" },
    ],
  },
  {
    type: "boolean",
    key: "threePart",
    label: "Write \"and\" inequalities as one three-part inequality, like -3 < 2x + 1 < 7",
    default: true,
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative numbers (negative coefficients flip the symbol)",
    default: true,
  },
  {
    type: "boolean",
    key: "specialCases",
    label: "Include no-solution and all-real-numbers compound inequalities",
    default: false,
  },
  {
    type: "int",
    key: "maxSolution",
    label: "Largest boundary value",
    min: 2,
    max: 20,
    default: 8,
  },
  {
    type: "int",
    key: "maxCoefficient",
    label: "Largest coefficient or constant",
    min: 2,
    max: 12,
    default: 6,
  },
  notationField,
  showNumberLineField,
] as const satisfies ParamSchema;

/** A linear expression ax + b (a != 0) standing for x in one part of the inequality. */
export interface Linear {
  a: number;
  b: number;
}

/** One ray dressed as "ax + b op c". */
export interface Part {
  ray: Ray;
  expr: Linear;
}

/** The structured construction. Exposed for property tests. */
export type CompoundConstruction =
  | { form: "threePart"; join: "and"; lo: Ray; hi: Ray; expr: Linear; solution: SolutionSet }
  | { form: "two"; join: Join; parts: [Part, Part]; solution: SolutionSet };

const at = (e: Linear, x: Rat) => add(mul(rat(e.a), x), rat(e.b));

/** An expression for one part: ax + b, ax or x + b, never 1x, never + 0. */
function pickExpr(rng: Rng, C: number, negOk: boolean): Linear {
  const shape = rng.pick(["ab", "ab", "a", "b"] as const);
  const a = shape === "b" ? 1 : nonzeroInt(rng, 2, C, negOk && rng.bool(0.8));
  const b = shape === "a" ? 0 : nonzeroInt(rng, 1, C, true);
  return { a, b };
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): CompoundConstruction {
  const p = resolveParams(schema, params);
  const S = p.maxSolution as number;
  const C = p.maxCoefficient as number;
  const negOk = p.allowNegatives as boolean;
  const types = p.types as Types;
  const join: Join = types === "mixed" ? (rng.bool() ? "and" : "or") : types;
  const special = (p.specialCases as boolean) && rng.bool(0.25);

  // boundaries p < q, at least 2 apart so the shading reads clearly
  const lowest = negOk ? -S : 1;
  const lo = rng.int(lowest, Math.max(lowest, S - 2));
  const hi = rng.int(lo + 2, Math.max(lo + 2, S));
  const loRay: Ray = { at: rat(lo), dir: "above", closed: rng.bool() };
  const hiRay: Ray = { at: rat(hi), dir: "below", closed: rng.bool() };

  if (join === "and" && !special && p.threePart && rng.bool(0.6)) {
    const expr = pickExpr(rng, C, negOk);
    // keep the outer numbers positive when negatives are off
    if (!negOk && at(expr, rat(lo)).n <= 0) expr.b = Math.abs(expr.b) + C;
    return { form: "threePart", join, lo: loRay, hi: hiRay, expr, solution: combine(loRay, hiRay, "and") };
  }
  // "or" points the rays outward; the special cases point them the other way
  // round from their join's usual shape
  const outward = (join === "or") !== special;
  const rays: [Ray, Ray] = outward
    ? [
        { ...hiRay, at: rat(lo) },
        { ...loRay, at: rat(hi) },
      ]
    : [loRay, hiRay];
  const parts = rays.map((ray) => {
    const expr = pickExpr(rng, C, negOk);
    if (!negOk && at(expr, ray.at).n <= 0) expr.b = Math.abs(expr.b) + C;
    return { ray, expr };
  }) as [Part, Part];
  if (rng.bool(0.3)) parts.reverse();
  return { form: "two", join, parts, solution: combine(parts[0].ray, parts[1].ray, join) };
}

// ------------------------------------------------------------------ printing

const exprLatex = (e: Linear) => linearLatex([{ coef: rat(e.a), v: "x" }, { coef: rat(e.b), v: "" }]);

/** The printed symbol for "expr op c" standing for the ray: flipped for a negative a. */
const partOp = (ray: Ray, e: Linear): Op => (e.a < 0 ? FLIP : IDENTITY)[opOf(ray.dir, ray.closed)];
const IDENTITY: Record<Op, Op> = { "<": "<", ">": ">", "<=": "<=", ">=": ">=" };

function partLatex(part: Part): string {
  return `${exprLatex(part.expr)} ${OP_LATEX[partOp(part.ray, part.expr)]} ${numLatex(at(part.expr, part.ray.at))}`;
}

export function promptLatex(k: CompoundConstruction): string {
  if (k.form === "two") {
    // a minus right after the word would print as subtraction ("and − 9x"),
    // in KaTeX and Typst alike, so a leading one is marked as a sign
    const [first, second] = k.parts.map(partLatex);
    const signed = second.startsWith("-") ? `\\mathord{-}${second.slice(1)}` : second;
    return `${first} \\text{ ${k.join} } ${signed}`;
  }
  const { lo, hi, expr } = k;
  // reading left to right the smaller value comes first; a negative a swaps the ends
  const [left, right] = expr.a > 0 ? [lo, hi] : [hi, lo];
  const lt = (r: Ray) => (r.closed ? "\\le" : "<");
  return `${numLatex(at(expr, left.at))} ${lt(left)} ${exprLatex(expr)} ${lt(right)} ${numLatex(at(expr, right.at))}`;
}

// ------------------------------------------------------------------ mistakes

const reversed = (r: Ray): Ray => ({ ...r, dir: r.dir === "below" ? "above" : "below" });

/**
 * Mistake-based Distractors, each the solution set of a mis-solved
 * inequality, most common first:
 * - "and" and "or" mixed up: shaded outside the dots instead of between
 *   them (or the reverse), or the same rays joined with the other word;
 * - forgot to flip a part's symbol after dividing by a negative;
 * - in a three-part inequality with a negative coefficient, swapped the ends
 *   but not their inclusion;
 * - moved a constant with the wrong sign;
 * - wrong endpoint inclusion, and the boundaries' signs changed.
 */
export function mistakes(k: CompoundConstruction): (SolutionSet | null)[] {
  const answer = k.solution;
  const out: (SolutionSet | null)[] = [];
  if (k.form === "threePart") {
    const { lo, hi, expr } = k;
    out.push(flipped(answer));
    if (expr.a < 0 && lo.closed !== hi.closed) {
      out.push(combine({ ...lo, closed: hi.closed }, { ...hi, closed: lo.closed }, "and"));
    }
    if (expr.b !== 0) {
      const moved = (r: Ray): Ray => {
        const c = at(expr, r.at);
        return { ...r, at: div(add(c, rat(expr.b)), rat(expr.a))! };
      };
      out.push(combine(moved(lo), moved(hi), "and"));
    }
  } else {
    const [p1, p2] = k.parts;
    const other: Join = k.join === "and" ? "or" : "and";
    out.push(flipped(answer), combine(p1.ray, p2.ray, other));
    const negIdx = k.parts.findIndex((q) => q.expr.a < 0);
    if (negIdx >= 0) {
      const rays = k.parts.map((q, i) => (i === negIdx ? reversed(q.ray) : q.ray));
      out.push(combine(rays[0], rays[1], k.join));
    }
    const movedIdx = k.parts.findIndex((q) => q.expr.b !== 0);
    if (movedIdx >= 0) {
      const rays = k.parts.map((q, i) => {
        if (i !== movedIdx) return q.ray;
        const c = at(q.expr, q.ray.at);
        return { ...q.ray, at: div(add(c, rat(q.expr.b)), rat(q.expr.a))! };
      });
      out.push(combine(rays[0], rays[1], k.join));
    }
  }
  out.push(toggled(answer), negated(answer));
  return out;
}

export const generator: Generator = {
  id: COMPOUND_INEQUALITIES_ID,
  title: "Solving compound inequalities",
  defaultDirections: "Solve each compound inequality.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return solvedProblem(
      { generatorId: COMPOUND_INEQUALITIES_ID, params: resolved, seed, prompt: promptLatex(k) },
      k.solution,
      mistakes(k),
    );
  },
};
