// "Cramer's Rule": solve a system of two or three linear equations with
// determinants (x = D_x / D, ...).
//
// Built ANSWER-FIRST: the solution is chosen first (whole numbers, or
// fractions with a small common denominator), then a coefficient matrix with
// a nonzero determinant, and each equation's constant is computed from the
// solution, so the printed system is satisfied by the Answer by
// construction. With fractions, each equation's coefficients are drawn until
// its constant comes out whole. Nothing is solved; the determinants are only
// used to model a student's slips.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { renderPolynomial } from "../format";
import { add, distinctHints, mul, numLatex, rat, type Rat } from "./equationKit";
import { det, mapEntries, type Matrix } from "./matrixKit";
import { systemLatex } from "./systemsKit";

export const CRAMERS_RULE_ID = "cramers-rule";

export const VARIABLES = ["x", "y", "z"] as const;

export const schema = [
  {
    type: "enum",
    key: "variables",
    label: "Variables",
    default: "2",
    options: [
      { value: "2", label: "Two (x and y)" },
      { value: "3", label: "Three (x, y and z)" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "boolean",
    key: "fractions",
    label: "Allow fraction solutions",
    default: false,
  },
] as const satisfies ParamSchema;

export interface CramerConstruction {
  /** whole-number coefficients, one row per equation */
  a: number[][];
  /** the solution, one value per variable */
  solution: Rat[];
  /** each equation's constant: the row times the solution */
  b: number[];
}

const signed = (rng: Rng, lo: number, hi: number) => (rng.bool() ? 1 : -1) * rng.int(lo, hi);

/** A coefficient: mostly nonzero; in three variables now and then 0 (a missing term). */
const coefficient = (rng: Rng, n: number): number => (n === 3 && rng.bool(0.12) ? 0 : signed(rng, 1, n === 2 ? 7 : 5));

const dot = (row: readonly number[], s: readonly Rat[]): Rat => row.reduce((t, c, i) => add(t, mul(rat(c), s[i])), rat(0));

const asMatrix = (a: number[][]): Matrix => a.map((r) => r.map((v) => rat(v)));

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): CramerConstruction {
  const p = resolveParams(schema, params);
  const n = p.variables === "mixed" ? rng.pick([2, 3]) : Number(p.variables);
  const fractions = (p.fractions as boolean) && rng.bool(0.6);
  for (;;) {
    const den = fractions ? rng.pick([2, 3, 4, 5]) : 1;
    // a coordinate of 0 now and then, not often
    const solution = Array.from({ length: n }, () => rat(rng.bool(0.08) ? 0 : signed(rng, 1, n === 2 ? 9 : 6), den));
    if (fractions && solution.every((s) => s.d === 1)) continue;
    // no two coordinates equal (so swapping them is a real slip), and not all zero
    if (new Set(solution.map((s) => `${s.n}/${s.d}`)).size < n) continue;
    const a: number[][] = [];
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 200; t++) {
        const row = Array.from({ length: n }, () => coefficient(rng, n));
        if (row.filter((c) => c !== 0).length < 2) continue;
        if (dot(row, solution).d === 1) {
          a.push(row);
          break;
        }
      }
    }
    if (a.length < n) continue;
    if (det(asMatrix(a)).n === 0) continue;
    const b = a.map((row) => dot(row, solution).n);
    if (b.some((v) => Math.abs(v) > 60)) continue;
    return { a, solution, b };
  }
}

function equationLatex(row: number[], c: number): string {
  const lhs = renderPolynomial(row.map((coef, i) => ({ coef, variable: VARIABLES[i] })));
  return `${lhs} = ${c}`;
}

/** Three equations behind a left brace, their equals signs aligned (as systemLatex does for two). */
function system3Latex(eqs: string[]): string {
  const body = eqs.map((eq) => eq.replace(" = ", " &= ")).join(" \\\\ ");
  return `\\left\\{ \\begin{aligned} ${body} \\end{aligned} \\right.`;
}

export function promptLatex(k: CramerConstruction): string {
  const eqs = k.a.map((row, i) => equationLatex(row, k.b[i]));
  return eqs.length === 2 ? systemLatex(eqs[0], eqs[1]) : system3Latex(eqs);
}

/** "(3, -2)", "\left(\frac{1}{2}, 4\right)" */
export function tupleLatex(values: readonly Rat[]): string {
  const body = values.map((v) => numLatex(v)).join(", ");
  return values.some((v) => v.d !== 1) ? `\\left(${body}\\right)` : `(${body})`;
}

export const answerLatex = (k: CramerConstruction): string => tupleLatex(k.solution);

/** D and each D_i (the coefficient matrix with column i replaced by the constants). */
export function determinants(k: CramerConstruction): { D: Rat; Di: Rat[] } {
  const m = asMatrix(k.a);
  const D = det(m);
  const Di = k.a.map((_, col) => det(mapEntries(m, (x, i, j) => (j === col ? rat(k.b[i]) : x))));
  return { D, Di };
}

/**
 * Mistake-based Distractors, most common first: the coordinates swapped (the
 * constants put in the wrong column, so D_y / D lands on x); D divided by
 * D_i instead (the fraction upside down); the determinants left undivided
 * (D_x, D_y); the sign of D dropped (every coordinate negated); and in three
 * variables, the coordinates rotated.
 */
export function distractors(k: CramerConstruction): string[] {
  const s = k.solution;
  const { D, Di } = determinants(k);
  const candidates: (string | null)[] = [];
  candidates.push(tupleLatex([s[1], s[0], ...s.slice(2)]));
  candidates.push(Di.every((d) => d.n !== 0) ? tupleLatex(Di.map((d) => rat(D.n * d.d, d.n * D.d))) : null);
  candidates.push(D.n !== 1 || D.d !== 1 ? tupleLatex(Di) : null);
  candidates.push(tupleLatex(s.map((v) => mul(rat(-1), v))));
  if (s.length === 3) candidates.push(tupleLatex([s[1], s[2], s[0]]), tupleLatex([s[0], s[2], s[1]]));
  candidates.push(tupleLatex([mul(rat(-1), s[0]), ...s.slice(1)]));
  return distinctHints(answerLatex(k), candidates);
}

export const generator: Generator = {
  id: CRAMERS_RULE_ID,
  title: "Cramer's Rule",
  defaultDirections: "Solve each system using Cramer's Rule.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: CRAMERS_RULE_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
