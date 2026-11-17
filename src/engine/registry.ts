// The generator registry: every Topic, by id. Where a Topic shows up (which
// Courses and Units) is decided by the Course Outlines in ./courses, so adding
// a Topic = registering its generator here and listing it there.

import type { Generator } from "./types";
import { generator as quadraticFactoring } from "./generators/quadraticFactoring";
import { generator as quadraticFormula } from "./generators/quadraticFormula";
import { generator as completingTheSquare } from "./generators/completingTheSquare";
import { generator as parabolaProperties } from "./generators/parabolaProperties";
import { generator as quadraticInequalities } from "./generators/quadraticInequalities";
import { generator as graphingQuadratics } from "./generators/graphingQuadratics";
import { generator as slope } from "./generators/slope";

export const GENERATORS: readonly Generator[] = [
  quadraticFactoring,
  quadraticFormula,
  completingTheSquare,
  parabolaProperties,
  graphingQuadratics,
  quadraticInequalities,
  slope,
];

const byId: Record<string, Generator> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g]),
);

export function getGenerator(id: string): Generator | undefined {
  return byId[id];
}
