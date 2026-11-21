import { expect } from "vitest";
import { choiceKey } from "../../mc";
import type { Problem } from "../../types";

/** Compare the printed Answer and every pair of hints using the Topic's own value semantics. */
export function expectDistinctDistractors(p: Problem, equivalent: (a: string, b: string) => boolean) {
  const choices = [p.answer, ...p.distractorHints];
  expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
  expect(new Set(choices.map(choiceKey)).size).toBe(choices.length);
  for (const [i, choice] of choices.entries()) {
    for (const earlier of choices.slice(0, i)) {
      expect(equivalent(earlier, choice), `${p.prompt}: ${earlier} and ${choice}`).toBe(false);
    }
  }
}
