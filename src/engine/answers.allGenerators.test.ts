// Check only the baked Problem. A distractor that answers the same question
// correctly would give a multiple-choice Problem two correct choices.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arithmetic, expression, equivalentExpression } from "./answerCheckers/expressions.testkit";
import { evalArithmetic } from "./generators/foundations/arithmeticEval.testkit";
import { close } from "./generators/shared/latexEval.testkit";
import { checkers } from "./answerCheckers/index.testkit";
import { GENERATORS } from "./registry";
import { topicVariants } from "./topicVariants.testkit";

describe("printed Answer Key across every Topic", () => {
  for (const g of GENERATORS) {
    it(
      g.id,
      () => {
        const verify = checkers[g.id];
        expect(
          Object.prototype.hasOwnProperty.call(checkers,g.id) && verify,
          `Add an independent printed Answer checker for ${g.id} in answerCheckers/index.testkit.ts`,
        ).toBeTypeOf("function");
        for (const params of topicVariants(g.schema)) {
          fc.assert(
            fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
              const p = g.generate(params, seed);
              try {
                verify(p);
                for (const hint of p.distractorHints) {
                  if (verify === expression) {
                    expect(equivalentExpression(p, p.answer, hint), `equivalent: ${hint}`).toBe(false);
                    continue;
                  }
                  if (verify === arithmetic) {
                    expect(close(evalArithmetic(p.answer), evalArithmetic(hint)), `equivalent: ${hint}`).toBe(false);
                    continue;
                  }
                  expect(() => verify({ ...p, answer: hint }), `also correct: ${hint}`).toThrow();
                }
              } catch (cause) {
                throw new Error(
                  `${g.id} seed=${seed} options=${JSON.stringify(params)}: ${p.prompt} => ${p.answer}\n${cause}`,
                );
              }
            }),
            { numRuns: 24, endOnFailure: true },
          );
        }
      },
      30000,
    );
  }
});
