// Every registered Topic must work in multiple-choice mode: for any seed and
// any requested count, the assembler yields exactly that many distinct choices,
// with the Answer at the recorded position.

import { describe, expect, it } from "vitest";
import { assemble } from "./mc";
import { GENERATORS } from "./registry";
import { resolveParams } from "./types";

describe("multiple choice across every Topic", () => {
  for (const g of GENERATORS) {
    it(`${g.id} yields distinct choices for 2 to 5`, () => {
      const params = resolveParams(g.schema, {});
      for (let seed = 1; seed <= 200; seed++) {
        const problem = g.generate(params, seed);
        for (let n = 2; n <= 5; n++) {
          const { choices, correctIndex } = assemble(problem, { choices: n, seed });
          expect(choices).toHaveLength(n);
          expect(new Set(choices).size).toBe(n);
          expect(choices[correctIndex]).toBe(problem.answer);
        }
      }
    });
  }
});
