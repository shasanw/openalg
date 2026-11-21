// The printed-Answer checker for product-to-sum: reads only the printed
// prompt and Answer (see identities.testkit.ts). Every Answer must equal the
// prompt (at several x, or as a number), and be in the documented canonical
// form: a product becomes \frac{1}{2}(f ax ± f bx) (no ½ for a printed 2),
// one function, distinct positive arguments, the positive term first, the
// larger argument first when the signs agree; a sum becomes ±2 f px g qx with
// p the half-sum and q the half-difference (p > q ≥ 1); an exact value is in
// simplest exact form at angles that are not in the table.

import { expect } from "vitest";
import type { Problem } from "../../types";
import { expectPrintedValues, expectSimplestExact, isStandardAngle, printedAngles } from "./identities.testkit";

const arg = (k: string) => (k === "" ? 1 : Number(k));

export function productToSum(p: Problem): void {
  const printed = expectPrintedValues(p);
  expect(printed.givens).toEqual([]);
  if (!printed.inX) {
    expectSimplestExact(p.answer);
    const angles = printedAngles(p.prompt);
    expect(angles.length, p.prompt).toBe(2);
    for (const a of angles) expect(isStandardAngle(a), `${p.prompt}: a table angle`).toBe(false);
    return;
  }
  const product = /^(2?)\\(sin|cos) (\d*)x \\(sin|cos) (\d*)x$/.exec(p.prompt);
  const sum = /^\\(sin|cos) (\d*)x ([+-]) \\(sin|cos) (\d*)x$/.exec(p.prompt);
  expect(!!product !== !!sum, p.prompt).toBe(true);
  if (product) {
    expect(arg(product[3]), p.prompt).not.toBe(arg(product[5]));
    const m = /^(\\frac\{1\}\{2\}\\left\()?(-?)\\(sin|cos) (\d*)x ([+-]) \\(sin|cos) (\d*)x(\\right\))?$/.exec(p.answer);
    expect(m, `${p.prompt}: ${p.answer} is not the canonical sum`).not.toBeNull();
    const [, half, firstSign, f1, a1, op, f2, a2, close] = m!;
    expect(!!half, `${p.prompt}: the ½ (only without a printed 2)`).toBe(product[1] === "");
    expect(!!close).toBe(!!half);
    expect(f1, p.answer).toBe(f2);
    expect(arg(a1), p.answer).not.toBe(arg(a2));
    expect(firstSign === "-" && op === "+", `${p.answer}: the positive term goes first`).toBe(false);
    if ((firstSign === "") === (op === "+")) expect(arg(a1) > arg(a2), `${p.answer}: larger argument first`).toBe(true);
    return;
  }
  expect(arg(sum![2]) > arg(sum![5]), p.prompt).toBe(true);
  const m = /^(-?)2\\(sin|cos) (\d*)x \\(sin|cos) (\d*)x$/.exec(p.answer);
  expect(m, `${p.prompt}: ${p.answer} is not the canonical product`).not.toBeNull();
  const [, , , pk, , qk] = m!;
  // half-sum first, then half-difference
  expect(2 * arg(pk)).toBe(arg(sum![2]) + arg(sum![5]));
  expect(2 * arg(qk)).toBe(arg(sum![2]) - arg(sum![5]));
}
