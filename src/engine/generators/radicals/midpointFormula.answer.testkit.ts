import type { Problem } from "../../types";
import { expect } from "vitest";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { evalLatex } from "../shared/latexEval.testkit";

/** The points printed in a prompt or Answer, in order, as numbers. */
export function points(latex: string): [number, number][] {
  const out: [number, number][] = [];
  const body = latex.replace(/\\left\(/g, "(").replace(/\\right\)/g, ")");
  for (const m of body.matchAll(/\(([^,()]+), ([^()]+)\)/g)) out.push([evalLatex(m[1]), evalLatex(m[2])]);
  return out;
}

export function midpointFormula(p: Problem): void {
  const [[ax, ay], [bx, by]] = points(p.prompt);
  const [[x, y]] = points(p.answer);
  if (p.prompt.includes("midpoint")) {
    expect(p.prompt).toContain(ANSWER_PART_SEPARATOR);
    expect((ax + x) / 2).toBeCloseTo(bx, 12);
    expect((ay + y) / 2).toBeCloseTo(by, 12);
  } else {
    expect(x).toBeCloseTo((ax + bx) / 2, 12);
    expect(y).toBeCloseTo((ay + by) / 2, 12);
  }
}
