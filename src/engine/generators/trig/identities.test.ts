// The four identity Topics against their printed-Answer checkers, over
// random seeds and EVERY combination of Topic Options, plus the multiple
// choice rules: at least three Distractors, and no two choices equal in value
// (two differently printed but equal expressions never both appear).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Generator, ParamValues, Problem } from "../../types";
import { close } from "../shared/latexEval.testkit";
import { generator as fundamental } from "./fundamentalIdentities";
import { generator as sumDifference } from "./sumDifferenceIdentities";
import { generator as multipleAngle } from "./multipleAngleIdentities";
import { generator as productSum } from "./productToSum";
import { fundamentalIdentities } from "./fundamentalIdentities.answer.testkit";
import { sumDifferenceIdentities } from "./sumDifferenceIdentities.answer.testkit";
import { multipleAngleIdentities } from "./multipleAngleIdentities.answer.testkit";
import { productToSum } from "./productToSum.answer.testkit";
import { anySeed, expectLowestTerms } from "./trig.testkit";
import { choiceValues, expectSimplestExact } from "./identities.testkit";

const TOPICS: [Generator, (p: Problem) => void][] = [
  [fundamental, fundamentalIdentities],
  [sumDifference, sumDifferenceIdentities],
  [multipleAngle, multipleAngleIdentities],
  [productSum, productToSum],
];

function everyCombination(g: Generator): ParamValues[] {
  let options: ParamValues[] = [{}];
  for (const field of g.schema) {
    const values = field.type === "enum" ? field.options.map((o) => o.value) : [false, true];
    options = options.flatMap((params) => values.map((v) => ({ ...params, [field.key]: v })));
  }
  return options;
}

describe("trig identities: the printed Answer is right, and the choices differ in value", () => {
  for (const [g, check] of TOPICS) {
    it(`${g.id}, every option combination`, () => {
      for (const params of everyCombination(g))
        fc.assert(
          fc.property(anySeed, (seed) => {
            const p = g.generate(params, seed);
            check(p);
            expectLowestTerms(p.prompt);
            expect(p.distractorHints.length, p.prompt).toBeGreaterThanOrEqual(3);
            const seen: number[][] = [];
            for (const tex of [p.answer, ...p.distractorHints]) {
              const v = choiceValues(tex, seed);
              const same = (u: number[]) => v.length === u.length && v.every((n, i) => close(n, u[i], 1e-8));
              expect(seen.some(same), `${p.prompt}: ${tex} equals an earlier choice`).toBe(false);
              seen.push(v);
            }
          }),
          { numRuns: 40 },
        );
    }, 60_000);
  }
});

describe("trig identities: the checkers reject wrong or unsimplified Answers", () => {
  const base = (prompt: string, answer: string): Problem => ({
    kind: "generated",
    generatorId: "x",
    params: {},
    seed: 1,
    prompt,
    answer,
    distractorHints: [],
  });

  it("simplest exact form", () => {
    for (const ok of ["\\frac{\\sqrt{6} + \\sqrt{2}}{4}", "-2 - \\sqrt{3}", "\\frac{\\sqrt{2 - \\sqrt{2}}}{2}", "-\\frac{3}{5}", "\\sqrt{3} - 2"])
      expectSimplestExact(ok);
    for (const bad of [
      "\\frac{\\sqrt{2 - \\sqrt{3}}}{2}", // denests to (√6 - √2)/4
      "\\frac{2\\sqrt{6} + 2\\sqrt{2}}{8}",
      "\\frac{\\sqrt{8}}{2}",
      "\\frac{1}{\\sqrt{2}}",
      "\\frac{6}{4}",
      "0.5",
      "\\sin 30^{\\circ}",
    ])
      expect(() => expectSimplestExact(bad), bad).toThrow();
  });

  it("wrong values and unsimplified rewrites", () => {
    expect(() => sumDifferenceIdentities(base("\\sin 75^{\\circ}", "\\frac{\\sqrt{6} - \\sqrt{2}}{4}"))).toThrow();
    expect(() => sumDifferenceIdentities(base("\\sin 60^{\\circ}", "\\frac{\\sqrt{3}}{2}"))).toThrow();
    sumDifferenceIdentities(base("\\sin 75^{\\circ}", "\\frac{\\sqrt{6} + \\sqrt{2}}{4}"));
    expect(() => fundamentalIdentities(base("\\sin x \\cot x", "\\sin x"))).toThrow();
    expect(() => fundamentalIdentities(base("\\sin x \\cot x", "\\frac{\\cos x}{1}"))).toThrow();
    fundamentalIdentities(base("\\sin x \\cot x", "\\cos x"));
    expect(() => multipleAngleIdentities(base("1 - 2\\sin^{2} 3x", "\\cos 3x"))).toThrow();
    multipleAngleIdentities(base("1 - 2\\sin^{2} 3x", "\\cos 6x"));
    expect(() => productToSum(base("\\sin 3x \\cos x", "\\frac{1}{2}\\left(\\sin 2x + \\sin 4x\\right)"))).toThrow();
    productToSum(base("\\sin 3x \\cos x", "\\frac{1}{2}\\left(\\sin 4x + \\sin 2x\\right)"));
    expect(() => productToSum(base("\\cos 7x - \\cos 3x", "2\\sin 5x \\sin 2x"))).toThrow();
    productToSum(base("\\cos 7x - \\cos 3x", "-2\\sin 5x \\sin 2x"));
    expect(() =>
      fundamentalIdentities(
        base("\\cos \\theta = -\\frac{5}{13}, \\ \\theta \\text{ in } \\text{Quadrant II};\\quad \\text{find } \\sin \\theta", "\\sin \\theta = -\\frac{12}{13}"),
      ),
    ).toThrow();
  });
});
