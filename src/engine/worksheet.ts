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

  // Reject-and-resample so a sheet never shows the same question twice: draw
  // seeds deterministically from the base seed and skip any problem whose prompt
  // duplicates one already placed. The draw budget is bounded, so when the
  // requested count approaches the generator's finite problem space we still
  // terminate instead of spinning forever hunting for a uniqueness that can't
  // exist.
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const maxDraws = opts.count * 64;
  let draw = 0;
  while (problems.length < opts.count && draw < maxDraws) {
    const problem = generator.generate(params, deriveSeed(opts.baseSeed, draw));
    draw++;
    if (seen.has(problem.prompt)) continue;
    seen.add(problem.prompt);
    problems.push(problem);
  }
  // If the option-space was too small to fill uniquely, top up with repeats so
  // the teacher still gets the count they asked for (degrades gracefully).
  while (problems.length < opts.count) {
    problems.push(generator.generate(params, deriveSeed(opts.baseSeed, draw++)));
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

// --- Per-problem curation (issue #4) -----------------------------------------
//
// Curation operates on the `problems[]` array, which is the source of truth once
// a sheet has been hand-edited. Each Problem self-carries its recipe
// (generatorId, params, seed), so a single problem can be re-rolled from its own
// recipe without touching the rest of the sheet — staying answer-from-construction.
// `count` is kept equal to `problems.length` so the worksheet recipe always stays
// consistent with what's displayed.

function withProblems(ws: Worksheet, problems: Problem[]): Worksheet {
  return { ...ws, problems, count: problems.length };
}

/**
 * Re-roll a single problem: regenerate it from its OWN recipe with a new seed,
 * leaving every other problem byte-identical. Out-of-range indices are a no-op.
 */
export function rerollProblem(
  ws: Worksheet,
  index: number,
  newSeed: number,
): Worksheet {
  const target = ws.problems[index];
  if (!target) return ws;
  const generator = getGenerator(target.generatorId);
  if (!generator) {
    throw new Error(`Unknown generator: ${target.generatorId}`);
  }
  const fresh = generator.generate(target.params, newSeed);
  const problems = ws.problems.slice();
  problems[index] = fresh;
  return withProblems(ws, problems);
}

/** Remove a single problem. Out-of-range indices are a no-op. */
export function removeProblem(ws: Worksheet, index: number): Worksheet {
  if (index < 0 || index >= ws.problems.length) return ws;
  const problems = ws.problems.slice();
  problems.splice(index, 1);
  return withProblems(ws, problems);
}

/**
 * Move a problem one slot up (dir = -1) or down (dir = +1). Moves that would
 * fall off either end are a no-op, so callers can wire buttons without bounds
 * checks of their own.
 */
export function moveProblem(
  ws: Worksheet,
  index: number,
  dir: -1 | 1,
): Worksheet {
  const target = index + dir;
  if (
    index < 0 ||
    index >= ws.problems.length ||
    target < 0 ||
    target >= ws.problems.length
  ) {
    return ws;
  }
  const problems = ws.problems.slice();
  [problems[index], problems[target]] = [problems[target], problems[index]];
  return withProblems(ws, problems);
}
