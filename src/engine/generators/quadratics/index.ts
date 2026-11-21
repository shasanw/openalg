// Quadratics.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as quadraticFactoring } from "./quadraticFactoring";
import { generator as quadraticFormula } from "./quadraticFormula";
import { generator as completingTheSquare } from "./completingTheSquare";
import { generator as parabolaProperties } from "./parabolaProperties";
import { generator as graphingQuadratics } from "./graphingQuadratics";
import { generator as quadraticInequalities } from "./quadraticInequalities";

export const generators: readonly Generator[] = [
  quadraticFactoring,
  quadraticFormula,
  completingTheSquare,
  parabolaProperties,
  graphingQuadratics,
  quadraticInequalities,
];
