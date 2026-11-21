// Sequences and series.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as generalSequences } from "./generalSequences";
import { generator as arithmeticSequences } from "./arithmeticSequences";
import { generator as geometricSequences } from "./geometricSequences";
import { generator as sequenceMeans } from "./sequenceMeans";
import { generator as arithmeticSeries } from "./arithmeticSeries";
import { generator as geometricSeries } from "./geometricSeries";

export const generators: readonly Generator[] = [
  generalSequences,
  arithmeticSequences,
  geometricSequences,
  sequenceMeans,
  arithmeticSeries,
  geometricSeries,
];
