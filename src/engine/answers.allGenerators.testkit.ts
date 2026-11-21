// Test-only: the every-Topic printed Answer check, sharded across
// answersN.allGenerators.test.ts so the Topics run on several workers at once
// (one file held them all and set the wall time of the whole suite).
//
// Check only the baked Problem. A distractor that answers the same question
// correctly would give a multiple-choice Problem two correct choices.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Generator } from "./types";
import { arithmetic, expression, equivalentExpression } from "./answerCheckers/expressions.testkit";
import { evalArithmetic } from "./generators/foundations/arithmeticEval.testkit";
import { close } from "./generators/shared/latexEval.testkit";
import { checkers } from "./answerCheckers/index.testkit";
import { GENERATORS } from "./registry";
import { anyParams } from "./generators/polynomials/polynomials.testkit";
import { topicVariants } from "./topicVariants.testkit";

/** How many answersN.allGenerators.test.ts files share the Topics. */
export const ANSWER_SHARDS = 4;

/** Shard `shard` (0-based) of ANSWER_SHARDS: every ANSWER_SHARDS-th Topic. */
export const answerTopicsOfShard = (shard: number): Generator[] =>
  GENERATORS.filter((_, i) => i % ANSWER_SHARDS === shard);

export function everyTopicAnswerIsRight(shard: number): void {
describe(`printed Answer Key across every Topic (shard ${shard + 1} of ${ANSWER_SHARDS})`, () => {
  for (const g of answerTopicsOfShard(shard)) {
    it(
      g.id,
      () => {
        const verify = checkers[g.id];
        expect(
          Object.prototype.hasOwnProperty.call(checkers, g.id) && verify,
          `Add an independent printed Answer checker for ${g.id} in answerCheckers/index.testkit.ts`,
        ).toBeTypeOf("function");
        const options = topicVariants(g.schema).map((params) => fc.constant(params));
        options.push(anyParams(g.schema));
        for (const variant of options) {
          fc.assert(
            fc.property(fc.integer({ min: 0, max: 0xffffffff }), variant, (seed, params) => {
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
}
