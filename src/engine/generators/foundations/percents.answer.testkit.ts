import type { Problem } from "../../types";
import { expect } from "vitest";
import { close } from "../shared/latexEval.testkit";

/** "12.5\%" -> 12.5, "48" -> 48 */
export const num = (s: string) => Number(s.replace("\\%", ""));

/** The numbers printed in a prompt, in order: [value, isPercent]. */
export function printed(prompt: string): { value: number; percent: boolean }[] {
  return [...prompt.matchAll(/(\d+(?:\.\d+)?)(\\%)?/g)].map((m) => ({ value: Number(m[1]), percent: !!m[2] }));
}

/** Answer the printed question from its wording and numbers alone. */
function answerPercentQuestion(prompt: string): number {
  const nums = printed(prompt);
  if (/what percent/i.test(prompt)) {
    // "P is what percent of W" / "What percent of W is P"
    const [a, b] = nums.map((n) => n.value);
    const [part, whole] = prompt.startsWith("\\text{What percent") ? [b, a] : [a, b];
    return (part / whole) * 100;
  }
  const pc = nums.find((n) => n.percent)!.value;
  const other = nums.find((n) => !n.percent)!.value;
  if (prompt.includes("of what number")) return other / (pc / 100);
  return (pc / 100) * other;
}

export function percents(p: Problem): void {
  expect(p.answer.endsWith("\\%")).toBe(/what percent/i.test(p.prompt));
  expect(close(num(p.answer), answerPercentQuestion(p.prompt)), `${p.prompt} => ${p.answer}`).toBe(true);
}
