import type { Problem } from "../../types";
import { expect } from "vitest";
import { proseSegments } from "../../format";
import { evalLatex } from "../shared/latexEval.testkit";
import { proseOf, readCount } from "../shared/matrices.testkit";
import { nCr } from "./counting.testUtil";

/** The prompt's math runs, in order. */
const mathOf = (prompt: string): string[] =>
  proseSegments(prompt)
    .filter((s) => s.kind === "math")
    .map((s) => (s as { latex: string }).latex.trim())
    .filter(Boolean);

/** "(2x - 3y)^{5}" -> a, b, n, two variables */
function readBinomial(latex: string): { a: number; b: number; n: number; y: boolean } {
  const m = latex.match(/^\((\d*)x ([+-]) (\d*)(y?)\)\^\{(\d+)\}$/);
  if (!m) throw new Error(`not a binomial power: ${latex}`);
  const a = m[1] === "" ? 1 : Number(m[1]);
  const mag = m[3] === "" ? 1 : Number(m[3]);
  return { a, b: m[2] === "-" ? -mag : mag, n: Number(m[5]), y: m[4] === "y" };
}

/** "-1080x^{2}y^{3}" -> coefficient and powers */
export function readMonomial(latex: string): { c: number; px: number; py: number } {
  const m = latex.match(/^(-?)(\d*)(x(?:\^\{(\d+)\})?)?(y(?:\^\{(\d+)\})?)?$/);
  if (!m) throw new Error(`not a monomial: ${latex}`);
  const mag = m[2] === "" ? 1 : Number(m[2]);
  return {
    c: (m[1] ? -1 : 1) * mag,
    px: m[3] ? Number(m[4] ?? 1) : 0,
    py: m[5] ? Number(m[6] ?? 1) : 0,
  };
}

const ORDINAL = /the (\d+)(st|nd|rd|th) term/;

export function binomialTheorem(p: Problem): void {
  const [lead] = proseOf(p.prompt).split(" ");
  const math = mathOf(p.prompt);
  const power = math[math.length - 1];
  const { a, b, n, y } = readBinomial(power);

  expect(y).toBe(p.params.twoVariables);
  if (lead === "Expand") {
    expect(p.answer).not.toMatch(/[()]/);
    for (const [x, yv] of [
      [2, 3],
      [-1, 0.5],
      [0.3, -1.7],
    ]) {
      const want = evalLatex(power, { x, y: yv });
      expect(Math.abs(evalLatex(p.answer, { x, y: yv }) - want)).toBeLessThan(1e-6 * Math.max(1, Math.abs(want)));
    }
    return;
  }
  let k: number;
  if (lead === "Find" && ORDINAL.test(proseOf(p.prompt))) {
    k = Number(proseOf(p.prompt).match(ORDINAL)![1]) - 1;
    const t = readMonomial(p.answer);
    expect(t.px).toBe(n - k);
    expect(t.py).toBe(y ? k : 0);
    expect(t.c).toBe(nCr(n, k) * a ** (n - k) * b ** k);
  } else {
    const target = readMonomial(math[0]);
    expect(target.c).toBe(1);
    k = n - target.px;
    if (y) expect(target.py).toBe(k);
    expect(readCount(p.answer)).toBe(nCr(n, k) * a ** (n - k) * b ** k);
  }
}
