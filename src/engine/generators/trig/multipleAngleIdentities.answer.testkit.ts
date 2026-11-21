// The printed-Answer checker for multiple-angle-identities: reads only the
// printed prompt and Answer (see identities.testkit.ts). Values (double- and
// half-angle, from a stated value and quadrant or range, or at a printed
// angle) must match Math and be in simplest exact form, a nested radical only
// when it does not denest; a rewrite's Answer must equal the expression at
// several x and be one function, c\sin kx, \cos kx or \tan kx.

import { expect } from "vitest";
import type { Problem } from "../../types";
import { expectPrintedValues, expectSimplestExact, isStandardAngle, printedAngles, trigNames } from "./identities.testkit";

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function multipleAngleIdentities(p: Problem): void {
  const printed = expectPrintedValues(p);
  if (printed.inX) {
    const m = /^-?(?:(\d+)|\\frac\{(\d+)\}\{(\d+)\})?\\(sin|cos|tan) (\d*)x$/.exec(p.answer);
    expect(m, `${p.prompt}: ${p.answer} is not one function`).not.toBeNull();
    if (m![1]) expect(Number(m![1]), p.answer).toBeGreaterThan(1);
    if (m![2]) expect(gcd(Number(m![2]), Number(m![3])) === 1 && Number(m![3]) > 1, p.answer).toBe(true);
    if (m![5]) expect(Number(m![5]), p.answer).toBeGreaterThan(1);
    // the prompt really is a double- or half-angle expression: a square or two functions
    expect(trigNames(p.prompt).length >= 2 || p.prompt.includes("^{2}"), p.prompt).toBe(true);
    return;
  }
  for (const v of printed.answers) expectSimplestExact(v);
  if (printed.givens.length > 0) {
    expect(printed.givens.length).toBe(1);
    for (const a of printed.asked) expect(a, p.prompt).toMatch(/^\\(?:sin|cos|tan) (?:2\\theta|\\frac\{\\theta\}\{2\})$/);
    return;
  }
  // a value at a printed angle: one function needs an angle off the table
  // (\sin 22.5^{\circ}); an identity's side (1 - 2\sin^{2} 15^{\circ},
  // \frac{1 - \cos 30^{\circ}}{\sin 30^{\circ}}) has two functions or a square to combine
  const angles = printedAngles(p.prompt);
  expect(angles.length, p.prompt).toBeGreaterThanOrEqual(1);
  if (trigNames(p.prompt).length === 1 && !p.prompt.includes("^{2}"))
    for (const a of angles) expect(isStandardAngle(a), `${p.prompt}: a table angle`).toBe(false);
}
