// "Solving systems by elimination": two equations in standard form, solved by
// adding or subtracting them (after multiplying one or both, if needed) so one
// variable drops out.
//
// Built ANSWER-FIRST: the solution (x0, y0) is chosen, then the four
// coefficients, and each constant is computed from them (C = A x0 + B y0). The
// coefficients are drawn until the system needs exactly the requested work:
// a variable whose coefficients already match up to sign can be eliminated as
// given; one whose coefficients divide one another needs one equation
// multiplied; otherwise both equations must be. The special cases are one
// equation and a multiple of it (infinitely many solutions) or of its left
// side with a different constant (no solution).

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { gcd } from "../../format";
import { add, div, mul, rat, sub } from "../shared/equationKit";
import { Distractors } from "../shared/lines";
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
} from "../shared/systemsKit";

export const SYSTEMS_ELIMINATION_ID = "systems-elimination";

/** How much work a system needs before adding or subtracting eliminates a variable. */
export type Steps = "addSubtract" | "multiplyOne" | "multiplyBoth";

export const SOLUTION_LIMIT = 9;

export const schema = [
  {
    type: "enum",
    key: "steps",
    label: "Before adding or subtracting",
    default: "mixed",
    options: [
      { value: "addSubtract", label: "Nothing: add or subtract the equations as given" },
      { value: "multiplyOne", label: "Multiply one equation first" },
      { value: "multiplyBoth", label: "Multiply both equations first" },
      { value: "mixed", label: "A mix of all three" },
    ],
  },
  specialField,
] as const satisfies ParamSchema;

/** The construction, exposed for property tests. */
export interface SystemsEliminationConstruction {
  equations: [StdEq, StdEq];
  solution: SystemSolution;
  /** The work the system needs (special systems are a multiple of one equation). */
  steps: Steps | null;
}

/** 0: coefficients match up to sign; 1: one divides the other; 2: neither. */
export function pairLevel(p: number, q: number): 0 | 1 | 2 {
  if (Math.abs(p) === Math.abs(q)) return 0;
  return p % q === 0 || q % p === 0 ? 1 : 2;
}

/** The least work that eliminates a variable of e1, e2, as Steps. */
export function stepsOf(e1: StdEq, e2: StdEq): Steps {
  const level = Math.min(pairLevel(e1.a, e2.a), pairLevel(e1.b, e2.b));
  return (["addSubtract", "multiplyOne", "multiplyBoth"] as const)[level];
}

export function construct(params: ParamValues, rng: Rng): SystemsEliminationConstruction {
  const p = resolveParams(schema, params);
  const stepsParam = p.steps as Steps | "mixed";
  const [x0, y0] = pickSolution(rng, SOLUTION_LIMIT);
  const special = pickSpecial(rng, p.includeSpecial as boolean);

  if (special) {
    const base = sample(
      () => eqThrough(signedInt(rng, 1, 6), signedInt(rng, 1, 6), x0, y0),
      isReduced,
      eqThrough(2, 3, x0, y0),
    );
    const e1 = mostlyLeadPositive(rng, base);
    const k = rng.pick(special === "infinite" ? [-1, 2, -2, 3, -3] : [1, -1, 2, -2, 3]);
    let e2 = scaleEq(e1, k);
    if (special === "none") e2 = { ...e2, c: e2.c + signedInt(rng, 1, 6) };
    const equations: [StdEq, StdEq] = rng.bool() ? [e1, e2] : [e2, e1];
    return { equations, solution: { kind: special }, steps: null };
  }

  const steps: Steps =
    stepsParam === "mixed" ? rng.pick<Steps>(["addSubtract", "multiplyOne", "multiplyBoth"]) : stepsParam;
  const lo = steps === "multiplyBoth" ? 2 : 1;
  const hi = steps === "multiplyBoth" ? 7 : 6;
  const fallbacks: Record<Steps, [StdEq, StdEq]> = {
    addSubtract: [eqThrough(2, 1, x0, y0), eqThrough(3, -1, x0, y0)],
    multiplyOne: [eqThrough(2, 3, x0, y0), eqThrough(5, -6, x0, y0)],
    multiplyBoth: [eqThrough(2, 3, x0, y0), eqThrough(5, -7, x0, y0)],
  };
  const [e1, e2] = sample<[StdEq, StdEq]>(
    () => [
      eqThrough(signedInt(rng, lo, hi), signedInt(rng, lo, hi), x0, y0),
      eqThrough(signedInt(rng, lo, hi), signedInt(rng, lo, hi), x0, y0),
    ],
    ([e1, e2]) => det(e1, e2) !== 0 && isReduced(e1) && isReduced(e2) && stepsOf(e1, e2) === steps,
    fallbacks[steps],
  );
  // negating a whole equation changes neither its solutions nor the work needed
  const equations: [StdEq, StdEq] = [mostlyLeadPositive(rng, e1), mostlyLeadPositive(rng, e2)];
  return { equations, solution: { kind: "point", x: x0, y: y0 }, steps };
}

export function promptLatex(k: SystemsEliminationConstruction): string {
  return systemLatex(stdEqLatex(k.equations[0]), stdEqLatex(k.equations[1]));
}

export function answerLatex(k: SystemsEliminationConstruction): string {
  return solutionLatex(k.solution);
}

/** Coefficients of e by variable. */
const coef = (e: StdEq, v: "x" | "y") => (v === "x" ? e.a : e.b);

/**
 * Where a student lands who eliminates `v` with multipliers m1, m2 but
 * combines the constants as `c` (a mistake), then substitutes back into the
 * first equation correctly: the other variable is c / (m1 u1 + m2 u2).
 */
function afterCombining(e1: StdEq, e2: StdEq, v: "x" | "y", m1: number, m2: number, c: number): string | null {
  const u: "x" | "y" = v === "x" ? "y" : "x";
  const uVal = div(rat(c), rat(m1 * coef(e1, u) + m2 * coef(e2, u)));
  if (!uVal) return null;
  const vVal = div(sub(rat(e1.c), mul(rat(coef(e1, u)), uVal)), rat(coef(e1, v)));
  return u === "x" ? intPoint(uVal, vVal) : intPoint(vVal, uVal);
}

/** Mistake-based Distractors, most common first. */
export function distractors(k: SystemsEliminationConstruction): string[] {
  const [e1, e2] = k.equations;
  if (k.solution.kind !== "point") return specialDistractors(k.solution.kind, e1, e2);
  const { x, y } = k.solution;
  const d = new Distractors(answerLatex(k));
  // eliminate the variable needing the least work (y on a tie), as a student would
  const v: "x" | "y" = pairLevel(e1.a, e2.a) < pairLevel(e1.b, e2.b) ? "x" : "y";
  const u: "x" | "y" = v === "x" ? "y" : "x";
  const p = coef(e1, v);
  const q = coef(e2, v);
  const g = gcd(p, q);
  // m1 e1 + m2 e2 eliminates v
  const m1 = q / g;
  const m2 = -p / g;
  const right = m1 * e1.c + m2 * e2.c;
  const [swapped, ...signs] = pointSlips(x, y);
  // added the equations' constants where they should be subtracted (or the reverse)
  d.add(afterCombining(e1, e2, v, m1, m2, m1 * e1.c - m2 * e2.c));
  d.add(swapped);
  // multiplied an equation's left side but not its constant
  if (Math.abs(m1) !== 1) d.add(afterCombining(e1, e2, v, m1, m2, right - m1 * e1.c + e1.c));
  if (Math.abs(m2) !== 1) d.add(afterCombining(e1, e2, v, m1, m2, right - m2 * e2.c + e2.c));
  // the first variable right, the second with a sign slip substituting back: B v = C + A u
  const uVal = u === "x" ? x : y;
  const slip = div(add(rat(e1.c), rat(coef(e1, u) * uVal)), rat(coef(e1, v)));
  d.add(u === "x" ? intPoint(uVal, slip) : intPoint(slip, uVal));
  d.add(...signs);
  // stopped after one variable
  d.add(`${u} = ${uVal}`);
  return d.list;
}

export const generator: Generator = {
  id: SYSTEMS_ELIMINATION_ID,
  title: "Solving systems by elimination",
  defaultDirections: "Solve each system by elimination.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: SYSTEMS_ELIMINATION_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
