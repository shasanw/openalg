// Linear and absolute value inequalities.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as graphingInequalities } from "./graphingInequalities";
import { generator as oneStepInequalities } from "./oneStepInequalities";
import { generator as twoStepInequalities } from "./twoStepInequalities";
import { generator as multiStepInequalities } from "./multiStepInequalities";
import { generator as compoundInequalities } from "./compoundInequalities";
import { generator as absoluteValueInequalities } from "./absoluteValueInequalities";

export const generators: readonly Generator[] = [
  graphingInequalities,
  oneStepInequalities,
  twoStepInequalities,
  multiStepInequalities,
  compoundInequalities,
  absoluteValueInequalities,
];
