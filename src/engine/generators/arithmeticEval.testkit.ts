// Test-only: evaluate the BAKED arithmetic the Foundations and Percents Topics
// print, independently of the generators' own exact arithmetic. The LaTeX is
// rewritten to a JavaScript expression (so JavaScript's own precedence rules
// check the order of operations) and evaluated in floating point.
//
// Supported: integers and decimals, \frac{..}{..} (numbers inside), mixed
// numbers 2\frac{1}{3}, \left( \right) and plain parentheses, \cdot,
// \times, \div, ^{n}, unary minus, + and -.

import { expect } from "vitest";
import { close } from "./latexEval.testkit";

export function toJs(latex: string): string {
  let s = latex
    .replace(/\\left\(/g, "(")
    .replace(/\\right\)/g, ")")
    // a mixed number is a sum: 2\frac{1}{3} = (2 + 1/3), and -2\frac{1}{3} = -(2 + 1/3)
    .replace(/(\d+)\\frac\{(\d+)\}\{(\d+)\}/g, "($1 + $2/$3)")
    .replace(/\\frac\{(-?[\d.]+)\}\{(-?[\d.]+)\}/g, "($1/$2)")
    .replace(/\\(cdot|times)/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\^\{(\d+)\}/g, "**$1");
  // a power of a lone number: 3**2 binds as written; JavaScript refuses -3**2, which the generators never print
  s = s.replace(/\s+/g, " ");
  if (/[^\d+\-*/(). ]/.test(s)) throw new Error(`unsupported LaTeX: ${latex} -> ${s}`);
  return s;
}

export function evalArithmetic(latex: string): number {
  return Function(`"use strict"; return (${toJs(latex)});`)() as number;
}

/** The printed Answer, as a number (integers, fractions, mixed numbers, decimals). */
export function answerNumber(latex: string): number {
  return evalArithmetic(latex);
}

export function expectClose(actual: number, expected: number, message?: string): void {
  expect(close(actual, expected), message ?? `${actual} vs ${expected}`).toBe(true);
}
