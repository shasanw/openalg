import type { Problem } from "../../types";
import { expect } from "vitest";
import { evalLatex } from "../shared/latexEval.testkit";
import { parseSeries, parseSigma, splitAsk } from "./sequences.testkit";

type Read = { kind: "firstN" | "lastTerm" | "sigma"; terms: number[] };

/** Every term of the printed series, read from the prompt alone. */
export function readSeries(prompt: string): Read {
  const sigma = parseSigma(prompt);
  if (sigma) {
    expect(Number.isFinite(sigma.to)).toBe(true);
    const terms: number[] = [];
    for (let k = sigma.from; k <= sigma.to; k++) terms.push(evalLatex(sigma.body, { k }));
    return { kind: "sigma", terms };
  }
  const asksN = prompt.includes(";\\quad ");
  const [series, ask] = asksN ? splitAsk(prompt) : [prompt, ""];
  const { opening, last } = parseSeries(series);
  const d = opening[1] - opening[0];
  expect(opening[2] - opening[1]).toBe(d);
  let n: number;
  if (asksN) {
    expect(last).toBeNull();
    n = Number(ask.match(/^\\text\{find \} S_\{(\d+)\}$/)![1]);
  } else {
    n = (last! - opening[0]) / d + 1;
    expect(Number.isInteger(n)).toBe(true);
  }
  return { kind: asksN ? "firstN" : "lastTerm", terms: Array.from({ length: n }, (_, i) => opening[0] + i * d) };
}

const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function arithmeticSeries(p: Problem): void {
  expect(evalLatex(p.answer)).toBe(total(readSeries(p.prompt).terms));
}
