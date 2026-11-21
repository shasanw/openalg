import type { Problem } from "../../types";
import { expect } from "vitest";
import { close, evalLatex } from "../shared/latexEval.testkit";
import { parseList, splitAsk } from "./sequences.testkit";

/** The printed ends, the number of blanks and the label. */
function readPrompt(prompt: string) {
  const [run, label] = splitAsk(prompt);
  const parts = run.split(", ");
  const blanks = parts.slice(1, -1);
  for (const b of blanks) expect(b).toBe("\\underline{\\qquad}");
  return { first: evalLatex(parts[0]), last: evalLatex(parts[parts.length - 1]), m: blanks.length, label };
}

/** Whether the full run has a common difference (or ratio). */
function isArithmetic(xs: number[]): boolean {
  return xs.every((x, i) => i < 2 || close(x - xs[i - 1], xs[1] - xs[0]));
}

function isGeometric(xs: number[]): boolean {
  return xs[0] !== 0 && xs.every((x, i) => i < 2 || close(x / xs[i - 1], xs[1] / xs[0]));
}

export function sequenceMeans(p: Problem): void {
  const { first, last, m, label } = readPrompt(p.prompt);
  const means = parseList(p.answer);
  expect(means).toHaveLength(m);
  const full = [first, ...means, last];
  if (label === "\\text{arithmetic}") expect(isArithmetic(full)).toBe(true);
  else {
    expect(isGeometric(full)).toBe(true);
    // an even gap fits r and -r: the prompt pins r > 0
    if ((m + 1) % 2 === 0) {
      expect(label).toBe("\\text{geometric}, r > 0");
      expect(full[1] / full[0]).toBeGreaterThan(0);
    } else expect(label).toBe("\\text{geometric}");
  }
}
