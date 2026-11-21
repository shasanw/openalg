// Radicals (with the distance and midpoint formulas).
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as simplifyingRadicals } from "./simplifyingRadicals";
import { generator as distanceFormula } from "./distanceFormula";
import { generator as midpointFormula } from "./midpointFormula";
import { generator as addingRadicals } from "./addingRadicals";
import { generator as multiplyingRadicals } from "./multiplyingRadicals";
import { generator as dividingRadicals } from "./dividingRadicals";
import { generator as radicalEquations } from "./radicalEquations";

export const generators: readonly Generator[] = [
  simplifyingRadicals,
  distanceFormula,
  midpointFormula,
  addingRadicals,
  multiplyingRadicals,
  dividingRadicals,
  radicalEquations,
];
