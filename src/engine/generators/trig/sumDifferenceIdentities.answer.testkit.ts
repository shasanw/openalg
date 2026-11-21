// The printed-Answer checker for sum-difference-identities: reads only the
// printed prompt and Answer (see identities.testkit.ts). Every Answer is a
// number equal to the printed expression (evaluated with Math at the printed
// angles, or at the angles the stated values and quadrants pin down), in
// simplest exact form; the angles printed need an identity (none is a
// multiple of 30° or 45°).

import { expect } from "vitest";
import type { Problem } from "../../types";
import { expectPrintedValues, expectSimplestExact, isStandardAngle, printedAngles } from "./identities.testkit";

export function sumDifferenceIdentities(p: Problem): void {
  const printed = expectPrintedValues(p);
  expect(printed.inX, p.prompt).toBe(false);
  expect(printed.answers.length).toBe(1);
  expectSimplestExact(printed.answers[0]);
  if (printed.givens.length > 0) {
    expect(printed.givens.length).toBe(2);
    expect(printed.asked[0], p.prompt).toMatch(/^\\(?:sin|cos|tan)\\left\(\\alpha [+-] \\beta\\right\)$/);
    // not a quadrantal α ± β, where every value is 0, ±1 or undefined
    expect(["0", "1", "-1"], p.prompt).not.toContain(p.answer);
    return;
  }
  const angles = printedAngles(p.prompt);
  expect(angles.length === 1 || angles.length === 4 || angles.length === 6, p.prompt).toBe(true);
  for (const a of angles) expect(isStandardAngle(a), `${p.prompt}: a table angle`).toBe(false);
}
