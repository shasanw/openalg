import type { Problem } from "../../types";
import { num, printed } from "./percents.answer.testkit";
import { expect } from "vitest";
import { close } from "../shared/latexEval.testkit";

export function percentOfChange(p: Problem): void {
  const nums = printed(p.prompt);
  if (p.prompt.includes("\\text{ to }")) {
    const [from, to] = nums.map((n) => n.value);
    const m = p.answer.match(/^([\d.]+)\\% \\text\{ (increase|decrease)\}$/)!;
    expect(m, p.answer).not.toBeNull();
    expect(close(Number(m[1]), (Math.abs(to - from) / from) * 100), `${p.prompt} => ${p.answer}`).toBe(true);
    expect(m[2]).toBe(to > from ? "increase" : "decrease");
  } else {
    const from = nums[0].value;
    const pc = nums[1].value;
    const up = p.prompt.includes("increased");
    expect(close(num(p.answer), from * (1 + ((up ? 1 : -1) * pc) / 100)), `${p.prompt} => ${p.answer}`).toBe(true);
  }
}
