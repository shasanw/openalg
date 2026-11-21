import type { Problem } from "../../types";
import { expect } from "vitest";
import { evalLatex } from "../shared/latexEval.testkit";
import { leibnizDet, readMatrices } from "../shared/matrices.testkit";

export function determinants(p: Problem): void {
  expect(p.prompt).toMatch(/^\\begin\{vmatrix\}.*\\end\{vmatrix\}$/);
  const [m] = readMatrices(p.prompt);
  expect(evalLatex(p.answer)).toBe(leibnizDet(m));
}
