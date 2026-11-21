import type { Problem } from "../../types";
import { expect } from "vitest";
import { expectClose, leibnizDet, matMul, readMatrix } from "../shared/matrices.testkit";

export const identity = (n: number) =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

export function matrixInverses(p: Problem): void {
  const a = readMatrix(p.prompt);
  if (p.answer === "\\text{no inverse}") {
    expect(leibnizDet(a)).toBe(0);
    return;
  }
  const inv = readMatrix(p.answer);
  expectClose(matMul(a, inv), identity(a.length), p.prompt);
  expectClose(matMul(inv, a), identity(a.length), p.prompt);
}
