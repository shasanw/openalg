import type { Problem } from "../../types";
import { expect } from "vitest";
import { evalLatex, splitEquation } from "../shared/latexEval.testkit";

import { equations } from "../systems/systems.testUtil";
import { leibnizDet } from "../shared/matrices.testkit";

/** "(3, -2)", "\left(\frac{1}{2}, 4\right)" -> numbers */
export function readTuple(latex: string): number[] {
  const m = latex.match(/^(?:\\left)?\((.*?)(?:\\right)?\)$/);
  if (!m) throw new Error(`not a tuple: ${latex}`);
  return m[1].split(", ").map((v) => evalLatex(v));
}

export function cramersRule(p: Problem): void {
  const values = readTuple(p.answer);
  const eqs = equations(p.prompt);
  expect(eqs).toHaveLength(values.length);
  const env = Object.fromEntries(values.map((v, i) => [["x", "y", "z"][i], v]));
  const variables = Object.keys(env);
  const zero = Object.fromEntries(variables.map((v) => [v, 0]));
  const matrix = eqs.map((eq) => {
    const [lhs, rhs] = splitEquation(eq);
    const residual = (at: Record<string, number>) => evalLatex(lhs, at) - evalLatex(rhs, at);
    return variables.map((v) => residual({ ...zero, [v]: 1 }) - residual(zero));
  });
  expect(Math.abs(leibnizDet(matrix))).toBeGreaterThan(1e-9);
  for (const eq of eqs) {
    const [lhs, rhs] = splitEquation(eq);
    expect(Math.abs(evalLatex(lhs, env) - evalLatex(rhs))).toBeLessThan(1e-9);
  }
}
