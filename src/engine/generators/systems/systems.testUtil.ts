// Test helpers for the Systems of Equations Topics: read a BAKED system and a
// baked Answer back from their LaTeX, independently of how systemsKit writes
// them, and classify the system from the printed equations alone.

import { evalLatex, splitEquation } from "../shared/latexEval.testkit";
import { systemEquations } from "../shared/systemsKit";

/** A x + B y = C read off a printed equation by evaluating it at three points. */
export function coefficients(eq: string): [number, number, number] {
  const [lhs, rhs] = splitEquation(eq);
  const f = (x: number, y: number) => evalLatex(lhs, { x, y }) - evalLatex(rhs, { x, y });
  const c = -f(0, 0);
  return [f(1, 0) + c, f(0, 1) + c, c];
}

export function printedSystem(prompt: string): [[number, number, number], [number, number, number]] {
  const [e1, e2] = systemEquations(prompt);
  return [coefficients(e1), coefficients(e2)];
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** What the printed system's solution set is, worked out numerically from the prompt. */
export function classify(prompt: string): { kind: "point"; x: number; y: number } | { kind: "none" | "infinite" } {
  const [[a1, b1, c1], [a2, b2, c2]] = printedSystem(prompt);
  const d = a1 * b2 - a2 * b1;
  if (!near(d, 0)) return { kind: "point", x: (c1 * b2 - c2 * b1) / d, y: (a1 * c2 - a2 * c1) / d };
  // parallel: the same line exactly when the constants are in the same ratio too
  const same = near(a1 * c2 - a2 * c1, 0) && near(b1 * c2 - b2 * c1, 0);
  return { kind: same ? "infinite" : "none" };
}

/** A baked point Answer "(2, -3)" as numbers, or null when it is not a point. */
export function parsePoint(answer: string): [number, number] | null {
  const m = answer.match(/^\((-?\d+), (-?\d+)\)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Whether the baked Answer states exactly what the printed system's solution set is. */
export function answerMatchesPrompt(prompt: string, answer: string): boolean {
  const s = classify(prompt);
  if (s.kind !== "point") {
    return answer === (s.kind === "none" ? "\\text{no solution}" : "\\text{infinitely many solutions}");
  }
  const pt = parsePoint(answer);
  return pt !== null && near(pt[0], s.x) && near(pt[1], s.y);
}
