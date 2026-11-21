import type { Problem } from "../../types";
import { expect } from "vitest";
import { close, evalLatex } from "../shared/latexEval.testkit";
import { parseSeries, parseSigma } from "./sequences.testkit";

interface Read {
  notation: "terms" | "sigma";
  a1: number;
  r: number;
  /** Infinity for an infinite series */
  n: number;
}

/** The series, read back from the printed prompt alone. */
export function readSeries(prompt: string): Read {
  const sigma = parseSigma(prompt);
  if (sigma) {
    expect(sigma.from).toBe(1);
    const a1 = evalLatex(sigma.body, { k: 1 });
    return { notation: "sigma", a1, r: evalLatex(sigma.body, { k: 2 }) / a1, n: sigma.to };
  }
  const { opening, last } = parseSeries(prompt);
  expect(opening).toHaveLength(3);
  const r = opening[1] / opening[0];
  expect(close(opening[2] / opening[1], r)).toBe(true);
  if (last === null) return { notation: "terms", a1: opening[0], r, n: Infinity };
  let n = 1;
  let t = opening[0];
  while (!close(t, last) && n < 50) {
    t *= r;
    n++;
  }
  expect(close(t, last)).toBe(true);
  expect(n).toBeGreaterThan(4); // the ellipsis hides at least one term
  return { notation: "terms", a1: opening[0], r, n };
}

/** The sum worked out term by term (finite) or by the textbook test (infinite). */
function expected({ a1, r, n }: Read): number | "diverges" {
  if (n === Infinity) return Math.abs(r) < 1 ? a1 / (1 - r) : "diverges";
  let s = 0;
  for (let i = 0; i < n; i++) s += a1 * r ** i;
  return s;
}

export function geometricSeries(p: Problem): void {
  const sigma = parseSigma(p.prompt);
  let want: number | "diverges";
  if (sigma && Number.isFinite(sigma.to)) {
    want = 0;
    for (let k = sigma.from; k <= sigma.to; k++) want += evalLatex(sigma.body, { k });
  } else {
    want = expected(readSeries(p.prompt));
  }
  if (want === "diverges") expect(p.answer).toBe("\\text{diverges}");
  else expect(close(evalLatex(p.answer), want)).toBe(true);
}
