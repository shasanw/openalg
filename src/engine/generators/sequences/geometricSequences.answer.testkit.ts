import type { Problem } from "../../types";
import { expect } from "vitest";
import { close, evalLatex } from "../shared/latexEval.testkit";
import { askedIndex, parseList, splitAsk } from "./sequences.testkit";

/** a_1 and r, read back from the printed givens alone. */
export function readGiven(given: string): { a1: number; r: number; twoTerms: boolean } {
  const two = given.match(/^a_\{(\d+)\} = (.+),\\ a_\{(\d+)\} = (.+)$/);
  if (two) {
    const [p, x, q, y] = [Number(two[1]), evalLatex(two[2]), Number(two[3]), evalLatex(two[4])];
    // an odd gap, so the ratio is the unique real root
    expect((q - p) % 2).toBe(1);
    expect(q - p).toBeGreaterThan(1);
    const r = Math.sign(y / x) * Math.abs(y / x) ** (1 / (q - p));
    return { a1: x / r ** (p - 1), r, twoTerms: true };
  }
  const terms = parseList(given.replace(/, \\ldots$/, ""));
  expect(terms).toHaveLength(4);
  const r = terms[1] / terms[0];
  for (let i = 2; i < 4; i++) expect(close(terms[i] / terms[i - 1], r)).toBe(true);
  return { a1: terms[0], r, twoTerms: false };
}

export const ruleValue = (answer: string, n: number) => evalLatex(answer.replace(/^a_n = /, ""), { n });

export function geometricSequences(p: Problem): void {
  const [given, ask] = splitAsk(p.prompt);
  const { a1, r } = readGiven(given);
  const k = askedIndex(ask);
  if (k !== null) expect(close(evalLatex(p.answer), a1 * r ** (k - 1), 1e-6)).toBe(true);
  else {
    expect(ask).toBe("\\text{find a rule for } a_n");
    expect(p.answer).toMatch(/^a_n = /);
    for (const n of [1, 2, 5]) expect(close(ruleValue(p.answer, n), a1 * r ** (n - 1), 1e-6)).toBe(true);
  }
}
