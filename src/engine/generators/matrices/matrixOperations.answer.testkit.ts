import type { Problem } from "../../types";
import { expect } from "vitest";
import { expectClose, matMul, readMatrices, readMatrix } from "../shared/matrices.testkit";

/** Read "s A op t B" (or "s A", or "A B") from the prompt and evaluate it independently; null when undefined. */
function evaluatePrompt(prompt: string): number[][] | null {
  const [A, B] = readMatrices(prompt);
  const parts = prompt.split(/\\begin\{bmatrix\}.*?\\end\{bmatrix\}/);
  // parts: [s, " op t", ""] or [s, ""]
  const scalar = (s: string) => (s === "" ? 1 : s === "-" ? -1 : Number(s));
  const s1 = scalar(parts[0]);
  if (!B) return A.map((r) => r.map((x) => s1 * x));
  if (parts[1] === "") {
    if (A[0].length !== B.length) return null;
    return matMul(A, B);
  }
  const m = parts[1].match(/^ ([+-]) (-?\d*)$/)!;
  const s2 = (m[1] === "-" ? -1 : 1) * scalar(m[2]);
  if (A.length !== B.length || A[0].length !== B[0].length) return null;
  return A.map((r, i) => r.map((x, j) => s1 * x + s2 * B[i][j]));
}

export function matrixOperations(p: Problem): void {
  const want = evaluatePrompt(p.prompt);
  if (want === null) expect(p.answer).toBe("\\text{undefined}");
  else expectClose(readMatrix(p.answer), want, p.prompt);
}
