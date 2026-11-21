import type { Problem } from "../../types";
import { expect } from "vitest";
import { evalLatex } from "../shared/latexEval.testkit";
import { expectSimplest } from "./radicals.testkit";

/** The two points of a printed prompt "(x1, y1) \text{ and } (x2, y2)". */
export function points(prompt: string): number[] {
  return [...prompt.matchAll(/-?\d+/g)].map((m) => Number(m[0]));
}

export const valueOf = (answer: string) => evalLatex(answer);

export function distanceFormula(p: Problem): void {
  const [x1, y1, x2, y2] = points(p.prompt);
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (p.params.answerForm === "rounded") {
    expect(Math.abs(valueOf(p.answer) - d)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(p.answer).toMatch(/^\d+(\.\d)?$/);
  } else {
    expect(valueOf(p.answer)).toBeCloseTo(d, 9);
    expectSimplest(p.answer);
  }
}
