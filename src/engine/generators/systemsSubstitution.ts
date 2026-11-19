// "Solving systems by substitution": one equation already solved for a
// variable (y = 3x - 4, or x = -2y + 5), the other in standard form; the
// student substitutes the first into the second. Harder: neither equation is
// solved, but one has a variable with coefficient 1 or -1 to isolate first.
//
// Built ANSWER-FIRST: the solution (x0, y0) is chosen first. The solved
// equation s = m t + b takes a whole-number slope m and gets b = s0 - m t0;
// the other equation takes its coefficients and gets C = A x0 + B y0. The
// special cases pair the solved equation with a multiple of its own standard
// form (infinitely many solutions), or of its left side with another constant
// (no solution).

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { renderPolynomial } from "../format";
import { div, rat } from "./equationKit";
import { Distractors } from "./lines";
import {
  det,
  eqThrough,
  intPoint,
  isReduced,
  mostlyLeadPositive,
  pickSolution,
  pickSpecial,
  pointSlips,
  sample,
  scaleEq,
  signedInt,
  solutionLatex,
  specialDistractors,
  specialField,
  stdEqLatex,
  systemLatex,
  type StdEq,
  type SystemSolution,
} from "./systemsKit";

export const SYSTEMS_SUBSTITUTION_ID = "systems-substitution";

export type Isolated = "y" | "x" | "none";

export const SOLUTION_LIMIT = 9;
/** The solved equation's constant stays within this. */
export const CONSTANT_LIMIT = 15;

export const schema = [
  {
    type: "enum",
    key: "isolated",
    label: "Already solved for",
    default: "mixed",
    options: [
      { value: "y", label: "y, like y = 3x - 4" },
      { value: "x", label: "x, like x = 2y + 5" },
      { value: "mixed", label: "A mix of y and x" },
      { value: "none", label: "Neither (isolate a variable with coefficient 1 first)" },
    ],
  },
  specialField,
] as const satisfies ParamSchema;

/** The construction, exposed for property tests. */
export interface SystemsSubstitutionConstruction {
  /** The variable the solved equation is solved for (or, for "none", the one to isolate). */
  solvedFor: "x" | "y";
  /** solvedFor = m * other + b. */
  m: number;
  b: number;
  /** Whether the solved equation prints as s = m t + b (else in standard form). */
  printSolved: boolean;
  /** The other equation, A x + B y = C. */
  other: StdEq;
  /** Whether the solved equation prints first. */
  solvedFirst: boolean;
  solution: SystemSolution;
}

/** The solved equation s = m t + b in standard form. */
export function solvedStd(k: Pick<SystemsSubstitutionConstruction, "solvedFor" | "m" | "b">): StdEq {
  return k.solvedFor === "y" ? { a: -k.m + 0, b: 1, c: k.b } : { a: 1, b: -k.m + 0, c: k.b };
}

export function construct(params: ParamValues, rng: Rng): SystemsSubstitutionConstruction {
  const p = resolveParams(schema, params);
  const iso = p.isolated as Isolated | "mixed";
  const solvedFor: "x" | "y" = iso === "x" || iso === "y" ? iso : rng.pick<"x" | "y">(["y", "x"]);
  const printSolved = iso !== "none";
  const solvedFirst = rng.bool();
  const special = pickSpecial(rng, p.includeSpecial as boolean);
  const [x0, y0] = pickSolution(rng, SOLUTION_LIMIT);
  const [s0, t0] = solvedFor === "y" ? [y0, x0] : [x0, y0];

  // s = m t + b through the solution, with a constant that stays small
  const m = sample(
    () => signedInt(rng, 1, 5),
    (mm) => Math.abs(s0 - mm * t0) <= CONSTANT_LIMIT,
    s0 * t0 > 0 ? 1 : -1,
  );
  const b = s0 - m * t0;
  const base = { solvedFor, m, b, printSolved, solvedFirst };

  if (special) {
    // a multiple of the solved equation's standard form, leading with a positive x term
    const std = solvedStd(base);
    // (printed in standard form too, the solved equation times 1 would be the very same equation)
    const factors = special === "infinite" && !printSolved ? [2, 3] : [1, 2, 3];
    const k = rng.pick(factors) * (std.a < 0 ? -1 : 1);
    let other = scaleEq(std, k);
    if (special === "none") other = { ...other, c: other.c + signedInt(rng, 1, 6) };
    return { ...base, other, solution: { kind: special } };
  }

  const solved = solvedStd(base);
  const fallback = eqThrough(2, 3, x0, y0);
  const other = sample(
    () => eqThrough(signedInt(rng, 1, 7), signedInt(rng, 1, 7), x0, y0),
    // the substituted variable's coefficient is not 1 (or it too is solved for
    // in one step), and the system has one solution
    (e) => isReduced(e) && Math.abs(solvedFor === "y" ? e.b : e.a) > 1 && det(solved, e) !== 0,
    fallback,
  );
  return { ...base, other: mostlyLeadPositive(rng, other), solution: { kind: "point", x: x0, y: y0 } };
}

/** "y = 3x - 4", "x = -y + 2", "y = 5x". */
export function solvedLatex(k: SystemsSubstitutionConstruction): string {
  const t = k.solvedFor === "y" ? "x" : "y";
  const rhs = renderPolynomial([
    { coef: k.m, variable: t },
    { coef: k.b, variable: "" },
  ]);
  return `${k.solvedFor} = ${rhs}`;
}

export function promptLatex(k: SystemsSubstitutionConstruction): string {
  const solved = k.printSolved ? solvedLatex(k) : stdEqLatex(leadPositive(solvedStd(k)));
  const other = stdEqLatex(k.other);
  return k.solvedFirst ? systemLatex(solved, other) : systemLatex(other, solved);
}

const leadPositive = (e: StdEq): StdEq => (e.a < 0 ? scaleEq(e, -1) : e);

export function answerLatex(k: SystemsSubstitutionConstruction): string {
  return solutionLatex(k.solution);
}

/** Mistake-based Distractors, most common first. */
export function distractors(k: SystemsSubstitutionConstruction): string[] {
  if (k.solution.kind !== "point") return specialDistractors(k.solution.kind, solvedStd(k), k.other);
  const { x, y } = k.solution;
  const d = new Distractors(answerLatex(k));
  const { m, b } = k;
  // substitute s = m t + b into A x + B y = C: (cT + cS m) t + cS b = C
  const [cS, cT] = k.solvedFor === "y" ? [k.other.b, k.other.a] : [k.other.a, k.other.b];
  const P = cT + cS * m;
  const t = k.solvedFor === "y" ? "x" : "y";
  const t0 = k.solvedFor === "y" ? x : y;
  /** The point reached from a mistaken value of t, substituted back correctly. */
  const from = (tNum: number) => {
    const tv = div(rat(tNum), rat(P));
    if (!tv) return null;
    const sv = rat(m * tv.n + b * tv.d, tv.d);
    return k.solvedFor === "y" ? intPoint(tv, sv) : intPoint(sv, tv);
  };
  const point = (tv: number, sv: number) => (k.solvedFor === "y" ? intPoint(tv, sv) : intPoint(sv, tv));
  const [swapped, ...signs] = pointSlips(x, y);
  // distributed B over m t but not over b: P t + b = C
  if (cS !== 1) d.add(from(k.other.c - b));
  d.add(swapped);
  // moved B b across without changing its sign: P t = C + B b
  if (b !== 0) d.add(from(k.other.c + cS * b));
  // t right, then the constant's sign slipped substituting back: s = m t - b
  if (b !== 0) d.add(point(t0, m * t0 - b));
  // stopped after one variable
  d.add(`${t} = ${t0}`);
  d.add(...signs);
  return d.list;
}

export const generator: Generator = {
  id: SYSTEMS_SUBSTITUTION_ID,
  title: "Solving systems by substitution",
  defaultDirections: "Solve each system by substitution.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: SYSTEMS_SUBSTITUTION_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
