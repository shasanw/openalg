// Test-only: the properties every Inequalities solving Topic shares, checked on
// the BAKED Problem: the Answer is exactly the prompt's solution set, every
// Distractor is a different set, the notation and number-line options are
// honoured, and nothing degenerate prints.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Generator, ParamValues } from "../../types";
import { blankGraph, graphSpecProblem } from "../../plot";
import { answerHolds, inequalityHolds, isInterval, probePoints } from "./inequalityEval.testkit";

export const anySeed = fc.integer({ min: 0, max: 0xffffffff });

/** Printed forms no Problem may contain: 1x, -1x, + 0, double signs, -0, a minus after words. */
export function expectTidy(tex: string): void {
  expect(tex).not.toMatch(/(^|[^0-9.])1[a-z]/);
  expect(tex).not.toMatch(/[+-] 0(?![.\d])/);
  expect(tex).not.toMatch(/[+-] [+-]|--|\+-|-\+/);
  expect(tex).not.toMatch(/(^|[^0-9])-0(?![.\d])/);
  // a minus right after words prints as subtraction ("and − 9x")
  expect(tex).not.toMatch(/\\text\{[^}]*\}\s*-/);
}

export function solvedTopicSuite(
  generator: Generator,
  anyParams: fc.Arbitrary<ParamValues>,
  numRuns = 100,
): void {
  describe(`${generator.id}: shared inequality properties`, () => {
    it("the Answer is exactly the solution set of the printed inequality", () => {
      fc.assert(
        fc.property(anySeed, anyParams, (seed, params) => {
          const p = generator.generate(params, seed);
          for (const x of probePoints(p.prompt, p.answer)) {
            expect(answerHolds(p.answer, x), `${p.prompt} => ${p.answer} at ${x}`).toBe(inequalityHolds(p.prompt, x));
          }
        }),
        { numRuns },
      );
    });

    it("Distractors are at least four different sets, never the Answer", () => {
      fc.assert(
        fc.property(anySeed, anyParams, (seed, params) => {
          const p = generator.generate(params, seed);
          expect(p.distractorHints.length).toBeGreaterThanOrEqual(4);
          expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
          for (const d of p.distractorHints) {
            const pts = probePoints(p.answer, d);
            expect(
              pts.some((x) => answerHolds(d, x) !== answerHolds(p.answer, x)),
              `${d} vs ${p.answer}`,
            ).toBe(true);
          }
        }),
        { numRuns },
      );
    });

    it("honours the Answer notation and prints nothing degenerate", () => {
      fc.assert(
        fc.property(anySeed, anyParams, (seed, params) => {
          const p = generator.generate(params, seed);
          const interval = p.params.notation === "interval";
          expect(isInterval(p.answer)).toBe(interval);
          for (const d of p.distractorHints) expect(isInterval(d)).toBe(interval);
          for (const t of [p.prompt, p.answer, ...p.distractorHints]) expectTidy(t);
        }),
        { numRuns },
      );
    });

    it("draws the Answer on a number line, and a blank one only when asked", () => {
      fc.assert(
        fc.property(anySeed, anyParams, (seed, params) => {
          const p = generator.generate(params, seed);
          expect(p.answerGraph?.kind).toBe("numberLine");
          expect(graphSpecProblem(p.answerGraph)).toBeNull();
          if (p.params.showNumberLine) expect(p.graph).toEqual(blankGraph(p.answerGraph!));
          else expect(p.graph).toBeUndefined();
        }),
        { numRuns },
      );
    });

    it("is deterministic for the same (params, seed)", () => {
      fc.assert(
        fc.property(anySeed, anyParams, (seed, params) => {
          expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
        }),
        { numRuns: 30 },
      );
    });

    it("has enough variety for a 20-Problem Section", () => {
      const prompts = new Set(Array.from({ length: 100 }, (_, s) => generator.generate({}, s).prompt));
      expect(prompts.size).toBeGreaterThan(70);
    });
  });
}
