import type { Problem } from "../../types";
import { expect } from "vitest";
import { close, evalLatex } from "../shared/latexEval.testkit";
import { askedIndex, parseList, splitAsk } from "./sequences.testkit";

/** The terms a printed rule gives, a_1 to a_last, read from the prompt alone. */
function termsFromRule(rule: string, last: number): number[] {
  if (!rule.includes("a_{n-1}")) {
    const expr = rule.replace(/^a_n = /, "");
    return Array.from({ length: last }, (_, i) => evalLatex(expr, { n: i + 1 }));
  }
  const parts = rule.split(",\\ ");
  const step = parts
    .pop()!
    .replace(/^a_n = /, "")
    .replace(/a_\{n-1\}/g, "P")
    .replace(/a_\{n-2\}/g, "Q");
  const terms = parts.map((p) => evalLatex(p.replace(/^a_\d = /, "")));
  while (terms.length < last) {
    const n = terms.length + 1;
    terms.push(evalLatex(step, { n, P: terms[n - 2], Q: terms[n - 3] ?? NaN }));
  }
  return terms;
}

/** The Answer the printed prompt asks for, worked out from the printed rule. */
function expectedAnswer(prompt: string): number[] {
  const [rule, ask] = splitAsk(prompt);
  const k = askedIndex(ask);
  if (k !== null) return [termsFromRule(rule, k)[k - 1]];
  const m = ask.match(/^\\text\{first (\d) terms\}$/)!;
  return termsFromRule(rule, Number(m[1]));
}

export const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => close(x, b[i]));

export function generalSequences(p: Problem): void {
  expect(sameList(parseList(p.answer), expectedAnswer(p.prompt)), `${p.prompt} => ${p.answer}`).toBe(true);
}
