// Test-only, sharded across distractorsN.allGenerators.test.ts so the Topics
// run on several workers at once.
//
// Every registered Topic must offer at least four distinct mistake-based
// Distractors (`distractorHints`) for every Problem, so a multiple-choice sheet
// of five never has to pad with numbers nudged by one (see mc.ts), which are not
// real mistakes. Checked over a fixed set of seeds for the defaults, every
// single-option variant (as topicSmoke.testkit.ts builds them), and a fixed set
// of random COMBINATIONS of options, since an option interaction can starve the
// hint list even when each option alone is fine.

import { describe, expect, it } from "vitest";
import { NATURAL_LIMITS } from "./distractorLimits.testkit";
import { choiceKey } from "./mc";
import { GENERATORS } from "./registry";
import { createRng } from "./rng";
import { topicVariants } from "./topicVariants.testkit";
import type { Generator, ParamSchema, ParamValues } from "./types";

const SEEDS = 80;

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

/** How many distractorsN.allGenerators.test.ts files share the Topics. */
export const DISTRACTOR_SHARDS = 4;

/** Shard `shard` (0-based) of DISTRACTOR_SHARDS: every DISTRACTOR_SHARDS-th Topic. */
export const distractorTopicsOfShard = (shard: number): Generator[] =>
  GENERATORS.filter((_, i) => i % DISTRACTOR_SHARDS === shard);

export function everyTopicHasDistractors(shard: number): void {
describe(`mistake-based Distractors across every Topic (shard ${shard + 1} of ${DISTRACTOR_SHARDS})`, () => {
  for (const g of distractorTopicsOfShard(shard)) {
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
}
