// Worksheet model: a generator + params + a base seed, expanded into N problems.
// Each problem gets a derived seed so the whole sheet is reproducible from
// (generatorId, params, baseSeed, count) — the "recipe" — while also storing the
// baked problems for byte-identical reopen.

import { deriveSeed } from "./rng";
import { getGenerator } from "./registry";
import type { ParamValues, Problem } from "./types";

export interface Worksheet {
  version: 1;
  title: string;
  generatorId: string;
  params: ParamValues;
  directions: string;
  baseSeed: number;
  count: number;
  problems: Problem[];
}

export interface BuildOptions {
  generatorId: string;
  params?: ParamValues;
  baseSeed: number;
  count: number;
  title?: string;
  directions?: string;
}

export function buildWorksheet(opts: BuildOptions): Worksheet {
  const generator = getGenerator(opts.generatorId);
  if (!generator) {
    throw new Error(`Unknown generator: ${opts.generatorId}`);
  }
  const params = opts.params ?? {};
  const problems: Problem[] = [];
  for (let i = 0; i < opts.count; i++) {
    problems.push(generator.generate(params, deriveSeed(opts.baseSeed, i)));
  }
  return {
    version: 1,
    title: opts.title ?? generator.title,
    generatorId: generator.id,
    params,
    directions: opts.directions ?? generator.defaultDirections,
    baseSeed: opts.baseSeed,
    count: opts.count,
    problems,
  };
}

/** "Regenerate all": same recipe, a new base seed -> a fresh set of problems. */
export function regenerateAll(ws: Worksheet, newBaseSeed: number): Worksheet {
  return buildWorksheet({
    generatorId: ws.generatorId,
    params: ws.params,
    baseSeed: newBaseSeed,
    count: ws.count,
    title: ws.title,
    directions: ws.directions,
  });
}
