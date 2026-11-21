// The printed-Answer checker for fundamental-identities: reads only the
// printed prompt and Answer (see identities.testkit.ts). A simplification's
// Answer must equal the expression at several x and be a single function
// (maybe squared, maybe negated) or ±1; a value's Answer must equal the asked
// function at the one angle the stated value and quadrant pin down, in
// simplest exact form.

import { expect } from "vitest";
import type { Problem } from "../../types";
import { expectPrintedValues, expectSimplestExact, trigNames } from "./identities.testkit";

export function fundamentalIdentities(p: Problem): void {
  const printed = expectPrintedValues(p);
  if (printed.inX) {
    expect(printed.givens).toEqual([]);
    expect(p.answer, p.prompt).toMatch(/^-?(?:1|\\(?:sin|cos|tan|csc|sec|cot)(?:\^\{2\})? x)$/);
    // not already simplified: at least two functions to combine (or a binomial)
    expect(trigNames(p.prompt).length, p.prompt).toBeGreaterThanOrEqual(2);
    return;
  }
  expect(printed.givens.length, p.prompt).toBe(1);
  const given = trigNames(printed.givens[0])[0];
  for (const [i, asked] of printed.asked.entries()) {
    expect(asked, p.prompt).toMatch(/^\\(?:sin|cos|tan|csc|sec|cot) \\theta$/);
    expect(trigNames(asked)[0], `${p.prompt}: asks for the given function`).not.toBe(given);
    expectSimplestExact(printed.answers[i]);
  }
  expect(new Set(printed.asked).size).toBe(printed.asked.length);
}
