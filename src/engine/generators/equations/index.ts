// Linear equations.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as oneStepEquations } from "./oneStepEquations";
import { generator as twoStepEquations } from "./twoStepEquations";
import { generator as multiStepEquations } from "./multiStepEquations";
import { generator as absoluteValueEquations } from "./absoluteValueEquations";
import { generator as literalEquations } from "./literalEquations";

export const generators: readonly Generator[] = [
  oneStepEquations,
  twoStepEquations,
  multiStepEquations,
  absoluteValueEquations,
  literalEquations,
];
