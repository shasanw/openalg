// Opt-in soak scan: `pnpm test:soak`. NOT part of the normal run (the file is
// not *.test.ts). For every registered Topic it draws N random (seed, option
// combination) pairs and reports every Problem with fewer than four distinct
// mistake-based Distractors, apart from the named natural limits (see
// distractorLimits.testkit.ts), which need three.
//
//   SOAK_N     pairs per Topic (default 100000)
//   SOAK_IDS   comma-separated Topic ids to scan (default: all)
//   SOAK_SEED  seed of the pair generator (default 1; the scan is reproducible)

import { expect, it } from "vitest";
import { NATURAL_LIMITS } from "./distractorLimits.testkit";
import { choiceKey } from "./mc";
import { GENERATORS } from "./registry";
import { createRng, type Rng } from "./rng";
import type { ParamSchema, ParamValues } from "./types";

const N = Number(process.env.SOAK_N ?? 100_000);
const IDS = (process.env.SOAK_IDS ?? "").split(",").filter(Boolean);
const START = Number(process.env.SOAK_SEED ?? 1);
/** Yield to the event loop this often, so vitest's worker RPC does not time out. */
const YIELD_EVERY = 2000;

/** A uniformly random value for every option of the schema. */
function randomOptions(schema: ParamSchema, rng: Rng): ParamValues {
  const options: ParamValues = {};
  for (const f of schema) {
    if (f.type === "enum") options[f.key] = f.options[rng.int(0, f.options.length - 1)].value;
    else if (f.type === "boolean") options[f.key] = rng.bool();
    else if (f.type === "int") options[f.key] = rng.int(f.min, f.max);
  }
  return options;
}

it("every Topic keeps four distinct mistake-based Distractors", async () => {
  const shortfalls: string[] = [];
  for (const g of GENERATORS) {
    if (IDS.length && !IDS.includes(g.id)) continue;
    const rng = createRng(START * 7919 + g.id.length * 104729 + g.id.charCodeAt(0));
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (i % YIELD_EVERY === 0) await new Promise((r) => setImmediate(r));
      const options = randomOptions(g.schema, rng);
      const seed = Math.floor(rng.next() * 2 ** 32);
      const p = g.generate(options, seed);
      const keys = new Set(p.distractorHints.map(choiceKey));
      const context = `${g.id} options=${JSON.stringify(options)} seed=${seed}`;
      if (keys.has(choiceKey(p.answer)) || keys.size !== p.distractorHints.length) {
        shortfalls.push(`${context}: a Distractor repeats or equals the Answer`);
        count++;
        continue;
      }
      const limit = NATURAL_LIMITS[g.id]?.is(p);
      if (keys.size < (limit ? 3 : 4)) {
        shortfalls.push(`${context}: only ${keys.size} Distractors | ${p.prompt} | ${p.answer} | ${JSON.stringify(p.distractorHints)}`);
        count++;
      }
    }
    console.log(`${g.id}: ${count} shortfalls in ${N} Problems`);
  }
  for (const line of shortfalls) console.log(`SHORT ${line}`);
  expect(shortfalls).toEqual([]);
}, 24 * 60 * 60 * 1000);
