// Counting, permutations, combinations and the Binomial Theorem.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as countingPrinciple } from "./countingPrinciple";
import { generator as permutations } from "./permutations";
import { generator as combinations } from "./combinations";
import { generator as permutationsVsCombinations } from "./permutationsVsCombinations";
import { generator as binomialTheorem } from "./binomialTheorem";

export const generators: readonly Generator[] = [
  countingPrinciple,
  permutations,
  combinations,
  permutationsVsCombinations,
  binomialTheorem,
];
