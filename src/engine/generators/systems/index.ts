// Systems of linear equations.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as systemsGraphing } from "./systemsGraphing";
import { generator as systemsElimination } from "./systemsElimination";
import { generator as systemsSubstitution } from "./systemsSubstitution";

export const generators: readonly Generator[] = [
  systemsGraphing,
  systemsElimination,
  systemsSubstitution,
];
