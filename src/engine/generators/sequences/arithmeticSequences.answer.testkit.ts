import type { Problem } from "../../types";
import { expect } from "vitest";
import { close, evalLatex } from "../shared/latexEval.testkit";
import { askedIndex, parseList, splitAsk } from "./sequences.testkit";

/** a_1 and d, read back from the printed givens alone. */
export function readGiven(given: string): { a1: number; d: number; twoTerms: boolean } {
  const two = given.match(/^a_\{(\d+)\} = (.+),\\ a_\{(\d+)\} = (.+)$/);
  if (two) {
    const [p, x, q, y] = [Number(two[1]), evalLatex(two[2]), Number(two[3]), evalLatex(two[4])];
    expect(q - p).toBeGreaterThanOrEqual(2); // not consecutive
    const d = (y - x) / (q - p);
    return { a1: x - (p - 1) * d, d, twoTerms: true };
  }
  const terms = parseList(given.replace(/, \\ldots$/, ""));
  expect(terms).toHaveLength(4);
  const d = terms[1] - terms[0];
  for (let i = 2; i < 4; i++) expect(close(terms[i] - terms[i - 1], d)).toBe(true);
  return { a1: terms[0], d, twoTerms: false };
}

export const ruleValue = (answer: string, n: number) => evalLatex(answer.replace(/^a_n = /, ""), { n });

export function arithmeticSequences(p: Problem): void {
  const [given, ask] = splitAsk(p.prompt);
  const { a1, d } = readGiven(given);
  const k = askedIndex(ask);
  if (k !== null) expect(close(evalLatex(p.answer), a1 + (k - 1) * d)).toBe(true);
  else {
    expect(ask).toBe("\\text{find a rule for } a_n");
    expect(p.answer).toMatch(/^a_n = /);
    for (const n of [1, 2, 7]) expect(close(ruleValue(p.answer, n), a1 + (n - 1) * d)).toBe(true);
  }
}
