// Lines: slope, graphing and writing linear equations.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as slope } from "./slope";
import { generator as parallelPerpendicular } from "./parallelPerpendicular";
import { generator as graphingLinear } from "./graphingLinear";
import { generator as writingLinear } from "./writingLinear";

export const generators: readonly Generator[] = [
  slope,
  parallelPerpendicular,
  graphingLinear,
  writingLinear,
];
