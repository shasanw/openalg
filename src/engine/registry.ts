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
import { generator as oneStepEquations } from "./generators/oneStepEquations";
import { generator as twoStepEquations } from "./generators/twoStepEquations";
import { generator as multiStepEquations } from "./generators/multiStepEquations";
import { generator as absoluteValueEquations } from "./generators/absoluteValueEquations";
import { generator as literalEquations } from "./generators/literalEquations";
import { generator as slope } from "./generators/slope";
import { generator as parallelPerpendicular } from "./generators/parallelPerpendicular";
import { generator as graphingLinear } from "./generators/graphingLinear";
import { generator as writingLinear } from "./generators/writingLinear";
import { generator as systemsGraphing } from "./generators/systemsGraphing";
import { generator as systemsElimination } from "./generators/systemsElimination";
import { generator as systemsSubstitution } from "./generators/systemsSubstitution";
import { generator as graphingInequalities } from "./generators/graphingInequalities";
import { generator as oneStepInequalities } from "./generators/oneStepInequalities";
import { generator as twoStepInequalities } from "./generators/twoStepInequalities";
import { generator as multiStepInequalities } from "./generators/multiStepInequalities";
import { generator as compoundInequalities } from "./generators/compoundInequalities";
import { generator as absoluteValueInequalities } from "./generators/absoluteValueInequalities";
import { generator as generalSequences } from "./generators/generalSequences";
import { generator as arithmeticSequences } from "./generators/arithmeticSequences";
import { generator as geometricSequences } from "./generators/geometricSequences";
import { generator as sequenceMeans } from "./generators/sequenceMeans";
import { generator as arithmeticSeries } from "./generators/arithmeticSeries";
import { generator as geometricSeries } from "./generators/geometricSeries";

export const GENERATORS: readonly Generator[] = [
  quadraticFactoring,
  quadraticFormula,
  completingTheSquare,
  parabolaProperties,
  graphingQuadratics,
  quadraticInequalities,
  oneStepEquations,
  twoStepEquations,
  multiStepEquations,
  absoluteValueEquations,
  literalEquations,
  slope,
  parallelPerpendicular,
  graphingLinear,
  writingLinear,
  systemsGraphing,
  systemsElimination,
  systemsSubstitution,
  graphingInequalities,
  oneStepInequalities,
  twoStepInequalities,
  multiStepInequalities,
  compoundInequalities,
  absoluteValueInequalities,
  generalSequences,
  arithmeticSequences,
  geometricSequences,
  sequenceMeans,
  arithmeticSeries,
  geometricSeries,
];

const byId: Record<string, Generator> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g]),
);

export function getGenerator(id: string): Generator | undefined {
  return byId[id];
}
