import { expect } from "vitest";
import { coordinates, expandSigns } from "../../answerCheckers/math.testkit";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { choiceKey } from "../../mc";
import type { Problem } from "../../types";
import { evalLatex } from "./latexEval.testkit";

export function expectDistinctChoices(p: Problem, valueKey: (tex: string) => unknown) {
  const choices = [p.answer, ...p.distractorHints];
  expect(choices.length).toBeGreaterThanOrEqual(5);
  expect(new Set(choices.map(choiceKey)).size).toBe(choices.length);
  expect(new Set(choices.map(tex => JSON.stringify(valueKey(tex)))).size, choices.join("\n")).toBe(choices.length);
}

export function slopeValue(tex: string) {
  return tex.startsWith("\\text") || tex === "\\infty" ? tex : evalLatex(tex);
}

export function solutionValues(tex: string) {
  if (tex.startsWith("\\text")) return tex;
  return tex.split(" = ")[1].split(", ").flatMap(expandSigns).map(root => {
    // Each printed root is linear in i. Separate its real and imaginary parts.
    const re = evalLatex(root, { i: 0 });
    const im = evalLatex(root, { i: 1 }) - re;
    return [re.toFixed(9), im.toFixed(9)];
  }).sort();
}

export function graphFactValues(tex: string) {
  return tex.split(ANSWER_PART_SEPARATOR).map(part => {
    const pts = coordinates(part);
    if (pts.length) {
      const label = part.slice(0, part.indexOf("}") + 1);
      return [label, pts.map(({x, y}) => [x.toFixed(9), y.toFixed(9)]).sort()];
    }
    if (part.includes(" = ")) {
      const [label, value] = part.split(" = ");
      return [label, slopeValue(value)];
    }
    return part;
  });
}
