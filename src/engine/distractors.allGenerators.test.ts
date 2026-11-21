// Every registered Topic must offer at least four distinct mistake-based
// Distractors (`distractorHints`) for every Problem, so a multiple-choice sheet
// of five never has to pad with numbers nudged by one (see mc.ts), which are not
// real mistakes. Checked over a fixed set of seeds for the defaults, every
// single-option variant (as topicSmoke.testkit.ts builds them), and a fixed set
// of random COMBINATIONS of options, since an option interaction can starve the
// hint list even when each option alone is fine.

import { describe, expect, it } from "vitest";
import { choiceKey } from "./mc";
import { GENERATORS } from "./registry";
import { createRng } from "./rng";
import { topicVariants } from "./topicVariants.testkit";
import type { ParamSchema, ParamValues, Problem } from "./types";

const SEEDS = 80;

/**
 * Problems where every real mistake lands on the same few values, so only
 * three distinct ones exist. Each is named exactly, needs three, and says
 * why; anything else still needs four.
 */
const NATURAL_LIMITS: Record<string, { is: (p: Problem) => boolean; why: string }> = {
  "order-of-operations": {
    // (2^2)^2, 2 - 2 \div 2: every slip gives 0, 2, 3, 4, 6 or 8
    is: (p) => /\d/.test(p.prompt) && !/[013-9]/.test(p.prompt),
    why: "an expression made only of 2s",
  },
  "percent-of-change": {
    // the base is 100, so "decreased by p%" is p either way, and the decimal
    // slips that would remain are excluded from a whole-number sheet
    is: (p) => /^100 \\text\{ decreased by \}/.test(p.prompt),
    why: "100 decreased by a whole percent",
  },
  "adding-subtracting-rationals": {
    // 1 + 1 + 1 or 2 + 2 + 2 with no negatives: the slips coincide
    is: (p) => !/\\frac|\.|-/.test(p.prompt) && new Set(p.prompt.match(/\d+/g) ?? []).size === 1,
    why: "the same whole number repeated, with no negatives",
  },
};

const COMBINATIONS = 25;

/** A fixed set of random option combinations (deterministic: seeded generator). */
function combinations(schema: ParamSchema): ParamValues[] {
  const rng = createRng(2024);
  const out: ParamValues[] = [];
  for (let i = 0; i < COMBINATIONS; i++) {
    const options: ParamValues = {};
    for (const f of schema) {
      if (f.type === "enum") options[f.key] = f.options[rng.int(0, f.options.length - 1)].value;
      else if (f.type === "boolean") options[f.key] = rng.bool();
      else if (f.type === "int") options[f.key] = rng.int(f.min, f.max);
    }
    out.push(options);
  }
  return out;
}

describe("mistake-based Distractors across every Topic", () => {
  for (const g of GENERATORS) {
    it(`${g.id} offers at least 4 distinct mistake-based Distractors`, () => {
      for (const options of [...topicVariants(g.schema), ...combinations(g.schema)]) {
        for (let seed = 0; seed < SEEDS; seed++) {
          const p = g.generate(options, seed);
          const keys = p.distractorHints.map(choiceKey);
          const context = `${g.id} options=${JSON.stringify(options)} seed=${seed}`;
          expect(keys, context).not.toContain(choiceKey(p.answer));
          expect(new Set(keys).size, `${context}: duplicate Distractors`).toBe(keys.length);
          const limit = NATURAL_LIMITS[g.id]?.is(p) ? NATURAL_LIMITS[g.id] : null;
          const need = limit ? 3 : 4;
          expect(keys.length, `${context}: only ${keys.length} Distractors${limit ? ` (natural limit: ${limit.why})` : ""}`).toBeGreaterThanOrEqual(need);
        }
      }
    });
  }
});
