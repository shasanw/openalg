// The printed-Answer checker for "Evaluating inverse trig functions": reads
// only the BAKED prompt and Answer. The prompt is evaluated numerically
// (latexEval reads \arcsin, \sin^{-1} and \operatorname{arcsec} through
// Math.asin, Math.acos and Math.atan with the usual principal ranges), and
// the Answer must have that value, or be "undefined" exactly when the value
// is. An angle must be exact and in the unit asked for (degrees when the
// prompt says so or measures its angle in degrees); a ratio has no unit.
// Shared by the Topic's tests and the every-Topic Answer suite.

import { expect } from "vitest";
import type { Problem } from "../../types";
import { close, evalLatex } from "../shared/latexEval.testkit";
import { UNDEFINED_LATEX } from "./trigKit";

export const DEGREES_NOTE = ",\\quad \\text{in degrees}";

/** The prompt without its "in degrees" note, and whether it had one. */
export function readPrompt(prompt: string): { expression: string; degrees: boolean } {
  const noted = prompt.endsWith(DEGREES_NOTE);
  const expression = noted ? prompt.slice(0, -DEGREES_NOTE.length) : prompt;
  return { expression, degrees: noted || expression.includes("\\circ") };
}

/** The outermost function is an inverse, so the value is an angle. */
export const isAngle = (expression: string): boolean => /^\\(arc|operatorname\{arc|(sin|cos|tan|sec|csc|cot)\^\{-1\})/.test(expression);

export function inverseTrig(p: Problem): void {
  const { expression, degrees } = readPrompt(p.prompt);
  const value = evalLatex(expression);
  if (Number.isNaN(value)) {
    expect(p.answer, `${p.prompt} is undefined`).toBe(UNDEFINED_LATEX);
    return;
  }
  expect(p.answer).not.toBe(UNDEFINED_LATEX);
  expect(p.answer, "exact").not.toMatch(/\d\.\d/);
  if (isAngle(expression)) {
    if (degrees) expect(p.answer, `${p.prompt}: degrees`).toMatch(/\^\{\\circ\}$/);
    else expect(p.answer, `${p.prompt}: radians`).not.toMatch(/circ/);
  } else expect(p.answer, `${p.prompt}: a ratio`).not.toMatch(/circ|pi/);
  expect(close(evalLatex(p.answer), value, 1e-9), `${p.prompt} = ${value}, not ${p.answer}`).toBe(true);
}
