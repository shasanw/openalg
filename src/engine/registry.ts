// The generator registry: every Topic, by id. Where a Topic shows up (which
// Courses and Units) is decided by the Course Outlines in ./courses.
//
// Generators live in one folder per area of math under ./generators, each with
// an index.ts listing its generators. Adding a Topic = adding its generator to
// its area's list (and listing it in a Course Outline); adding an area = one
// import and one spread below. Keep the existing order: the Typst smoke test
// shards by index.

import type { Generator } from "./types";
import { generators as quadratics } from "./generators/quadratics";
import { generators as equations } from "./generators/equations";
import { generators as linear } from "./generators/linear";
import { generators as systems } from "./generators/systems";
import { generators as inequalities } from "./generators/inequalities";
import { generators as sequences } from "./generators/sequences";
import { generators as logarithms } from "./generators/logarithms";
import { generators as counting } from "./generators/counting";
import { generators as matrices } from "./generators/matrices";
import { generators as polynomials } from "./generators/polynomials";
import { generators as radicals } from "./generators/radicals";
import { generators as foundations } from "./generators/foundations";
import { generators as trig } from "./generators/trig";

export const GENERATORS: readonly Generator[] = [
  ...quadratics,
  ...equations,
  ...linear,
  ...systems,
  ...inequalities,
  ...sequences,
  ...logarithms,
  ...counting,
  ...matrices,
  ...polynomials,
  ...radicals,
  ...foundations,
  ...trig,
];

const byId: Record<string, Generator> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g]),
);

export function getGenerator(id: string): Generator | undefined {
  return byId[id];
}
