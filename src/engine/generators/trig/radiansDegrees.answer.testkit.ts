import { expect } from "vitest";
import type { Problem } from "../../types";
import { close } from "../shared/latexEval.testkit";
import { evalTrig, expectLowestTerms } from "./trig.testkit";

/** "2.5 \textnormal{radians}" -> 2.5, or null for an angle printed with π or degrees. */
const decimalRadians = (prompt: string): number | null => {
  const m = prompt.match(/^(-?[\d.]+) \\textnormal\{radians\}$/);
  return m ? Number(m[1]) : null;
};

/** The degrees an angle printed in degrees or radians stands for. */
const degreesOf = (tex: string) => (evalTrig(tex) * 180) / Math.PI;

export function radiansDegrees(p: Problem): void {
  const r = decimalRadians(p.prompt);
  if (r !== null) {
    const deg = (r * 180) / Math.PI;
    expect(p.answer).toMatch(/^-?\d+(\.\d)?\^\{\\circ\}$/);
    expect(Math.abs(degreesOf(p.answer) - deg)).toBeLessThanOrEqual(0.05);
    return;
  }
  expect(close(evalTrig(p.prompt), evalTrig(p.answer), 1e-9)).toBe(true);
  const toRadians = p.prompt.includes("\\circ");
  expect(p.answer.includes("\\pi")).toBe(toRadians);
  expect(p.answer.includes("\\circ")).toBe(!toRadians);
  expect(p.prompt).not.toBe("0^{\\circ}");
  expectLowestTerms(p.answer);
  expectLowestTerms(p.prompt);
}
