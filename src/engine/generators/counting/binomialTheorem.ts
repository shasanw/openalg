// "The Binomial Theorem": expand (ax + by)^n or (ax + b)^n, find one term of
// the expansion (the 4th term of (2x - 3y)^5), or the coefficient of one
// power (the coefficient of x^2 y^3).
//
// Built ANSWER-FROM-CONSTRUCTION: a, b and n are chosen first; each term
// C(n, k) (ax)^(n - k) (by)^k is evaluated forwards from them. Nothing is
// solved or expanded symbolically.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { prose, renderPolynomial } from "../../format";
import { distinctHints } from "../shared/equationKit";
import { comb, countLatex } from "./countingKit";

export const BINOMIAL_THEOREM_ID = "binomial-theorem";

export type Task = "expand" | "term" | "coefficient";

export const schema = [
  {
    type: "enum",
    key: "task",
    label: "Task",
    default: "mixed",
    options: [
      { value: "expand", label: "Expand the power" },
      { value: "term", label: "Find one term" },
      { value: "coefficient", label: "Find a coefficient" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "int",
    key: "maxPower",
    label: "Highest power",
    min: 3,
    max: 8,
    default: 5,
  },
  {
    type: "boolean",
    key: "twoVariables",
    label: "Two variables, like (2x - 3y)",
    default: true,
  },
] as const satisfies ParamSchema;

/** Expansions print at most this power (longer ones crowd a column). */
export const MAX_EXPAND_POWER = 6;
/** No printed coefficient exceeds this in size. */
export const MAX_COEFFICIENT = 100000;

/** The structured construction. Exposed for property tests. */
export interface BinomialConstruction {
  task: Task;
  /** (a x + b y)^n, or (a x + b)^n without a second variable */
  a: number;
  b: number;
  n: number;
  twoVariables: boolean;
  /** term and coefficient tasks: the power of the second factor (the (k + 1)th term) */
  k: number;
}

/** The coefficient of the (k + 1)th term: C(n, k) a^(n - k) b^k. */
export const termCoefficient = (a: number, b: number, n: number, k: number): number =>
  comb(n, k) * a ** (n - k) * b ** k + 0;

/** "x^{3}y^{2}", "x", "y^{4}", "" */
function variablePart(xPower: number, yPower: number, twoVariables: boolean): string {
  const power = (v: string, p: number) => (p === 0 ? "" : p === 1 ? v : `${v}^{${p}}`);
  return power("x", xPower) + (twoVariables ? power("y", yPower) : "");
}

/** A polynomial from coefficients c_k on x^(n - k) y^k. */
function polynomialLatex(coefs: number[], n: number, twoVariables: boolean): string {
  return renderPolynomial(coefs.map((coef, k) => ({ coef, variable: variablePart(n - k, k, twoVariables) })));
}

/** "(2x - 3y)^{5}" */
export function binomialLatex(k: Pick<BinomialConstruction, "a" | "b" | "n" | "twoVariables">): string {
  const inner = renderPolynomial([
    { coef: k.a, variable: "x" },
    { coef: k.b, variable: k.twoVariables ? "y" : "" },
  ]);
  return `(${inner})^{${k.n}}`;
}

const ordinal = (j: number): string => {
  const s = j % 100 >= 11 && j % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[j % 10] ?? "th";
  return `${j}${s}`;
};

const expansionCoefs = (k: BinomialConstruction): number[] =>
  Array.from({ length: k.n + 1 }, (_, i) => termCoefficient(k.a, k.b, k.n, i));

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): BinomialConstruction {
  const p = resolveParams(schema, params);
  const tasks: Task[] = p.task === "mixed" ? ["expand", "term", "coefficient"] : [p.task as Task];
  const task = rng.pick(tasks);
  const twoVariables = p.twoVariables as boolean;
  const top = task === "expand" ? Math.min(p.maxPower as number, MAX_EXPAND_POWER) : (p.maxPower as number);
  for (;;) {
    const n = rng.int(3, top);
    const a = rng.pick([1, 1, 1, 2, 2, 3]);
    const b = (rng.bool() ? 1 : -1) * rng.int(1, 4);
    // (x + y)^n and (x - 1)^n hide most slips: one of a, b is at least 2
    if (Math.abs(a) + Math.abs(b) < 3) continue;
    const k = rng.int(1, n - 1);
    const coefs = Array.from({ length: n + 1 }, (_, i) => termCoefficient(a, b, n, i));
    if (coefs.some((c) => Math.abs(c) > MAX_COEFFICIENT)) continue;
    return { task, a, b, n, twoVariables, k };
  }
}

export function promptLatex(k: BinomialConstruction): string {
  const power = binomialLatex(k);
  if (k.task === "expand") return `${prose("Expand")} ${power}`;
  if (k.task === "term") return `${prose(`Find the ${ordinal(k.k + 1)} term of`)} ${power}`;
  const target = variablePart(k.n - k.k, k.k, k.twoVariables);
  return `${prose("Find the coefficient of")} ${target} ${prose("in")} ${power}`;
}

export function answerLatex(k: BinomialConstruction): string {
  if (k.task === "expand") return polynomialLatex(expansionCoefs(k), k.n, k.twoVariables);
  const c = termCoefficient(k.a, k.b, k.n, k.k);
  if (k.task === "coefficient") return countLatex(c);
  return renderPolynomial([{ coef: c, variable: variablePart(k.n - k.k, k.k, k.twoVariables) }]);
}

/**
 * Mistake-based Distractors, most common first. The same slips for every
 * task, each applied to the coefficient(s): leaving out the binomial
 * coefficient C(n, k); not raising b (or a) to its power; the sign of b
 * dropped; the powers of a and b swapped; for one term, the term one place
 * off (k for k - 1, the usual "the 4th term has k = 4" slip); and for an
 * expansion, the "freshman's dream" (ax)^n + (by)^n.
 */
export function distractors(k: BinomialConstruction): string[] {
  const { a, b, n } = k;
  type Slip = (i: number) => number;
  const slips: Slip[] = [
    (i) => a ** (n - i) * b ** i, // no binomial coefficient
    (i) => comb(n, i) * a ** (n - i) * b, // b not raised
    (i) => comb(n, i) * a * b ** i, // a not raised
    (i) => comb(n, i) * a ** (n - i) * Math.abs(b) ** i, // sign of b dropped
    (i) => comb(n, i) * a ** i * b ** (n - i), // powers of a and b swapped
  ];
  const fix = (v: number) => v + 0;
  const values: string[] = [];
  if (k.task === "expand") {
    values.push(
      renderPolynomial([
        { coef: a ** n, variable: variablePart(n, 0, k.twoVariables) },
        { coef: b ** n, variable: variablePart(0, n, k.twoVariables) },
      ]),
    );
    for (const slip of slips) {
      values.push(polynomialLatex(Array.from({ length: n + 1 }, (_, i) => fix(slip(i))), n, k.twoVariables));
    }
  } else {
    const at = (i: number, c: number) =>
      k.task === "coefficient"
        ? countLatex(c)
        : renderPolynomial([{ coef: c, variable: variablePart(n - i, i, k.twoVariables) }]);
    // the (k + 1)th term read as k = its place: one term further along
    if (k.task === "term") values.push(at(k.k + 1, termCoefficient(a, b, n, k.k + 1)));
    for (const slip of slips) values.push(at(k.k, fix(slip(k.k))));
    values.push(at(k.k, -termCoefficient(a, b, n, k.k)));
    if (k.task === "term") values.push(at(k.k - 1, termCoefficient(a, b, n, k.k - 1)));
    // the coefficient of the other variable's power: C(n, k) with a and b's powers mixed up
    if (k.task === "coefficient") values.push(at(k.k, termCoefficient(a, b, n, n - k.k)));
  }
  return distinctHints(answerLatex(k), values);
}

export const generator: Generator = {
  id: BINOMIAL_THEOREM_ID,
  title: "The Binomial Theorem",
  defaultDirections: "Use the Binomial Theorem to answer each question.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: BINOMIAL_THEOREM_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
