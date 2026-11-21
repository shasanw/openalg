// Trigonometry.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as angleMeasure } from "./angleMeasure";
import { generator as radiansDegrees } from "./radiansDegrees";
import { generator as rightTriangleRatios } from "./rightTriangleRatios";
import { generator as rightTriangleSolving } from "./rightTriangleSolving";
import { generator as trigAnyAngle } from "./trigAnyAngle";
import { generator as graphingTrig } from "./graphingTrig";

export const generators: readonly Generator[] = [
  angleMeasure,
  radiansDegrees,
  rightTriangleRatios,
  rightTriangleSolving,
  trigAnyAngle,
  graphingTrig,
];
