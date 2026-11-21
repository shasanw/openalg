// Matrices.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as matrixOperations } from "./matrixOperations";
import { generator as determinants } from "./determinants";
import { generator as matrixInverses } from "./matrixInverses";
import { generator as cramersRule } from "./cramersRule";

export const generators: readonly Generator[] = [
  matrixOperations,
  determinants,
  matrixInverses,
  cramersRule,
];
