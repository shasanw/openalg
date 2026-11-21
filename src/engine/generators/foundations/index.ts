// Foundations: arithmetic, rational numbers, proportions and percents.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as orderOfOperations } from "./orderOfOperations";
import { generator as classifyingNumbers } from "./classifyingNumbers";
import { generator as addingSubtractingRationals } from "./addingSubtractingRationals";
import { generator as multiplyingRationals } from "./multiplyingRationals";
import { generator as dividingRationals } from "./dividingRationals";
import { generator as distributiveProperty } from "./distributiveProperty";
import { generator as solvingProportions } from "./solvingProportions";
import { generator as percents } from "./percents";
import { generator as percentOfChange } from "./percentOfChange";

export const generators: readonly Generator[] = [
  orderOfOperations,
  classifyingNumbers,
  addingSubtractingRationals,
  multiplyingRationals,
  dividingRationals,
  distributiveProperty,
  solvingProportions,
  percents,
  percentOfChange,
];
