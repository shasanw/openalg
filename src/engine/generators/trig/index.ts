// Trigonometry.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as angleMeasure } from "./angleMeasure";
import { generator as radiansDegrees } from "./radiansDegrees";
import { generator as rightTriangleRatios } from "./rightTriangleRatios";
import { generator as rightTriangleSolving } from "./rightTriangleSolving";
import { generator as trigAnyAngle } from "./trigAnyAngle";
import { generator as graphingTrig } from "./graphingTrig";
import { generator as simpleTrigEquations } from "./simpleTrigEquations";
import { generator as inverseTrig } from "./inverseTrig";
import { generator as fundamentalIdentities } from "./fundamentalIdentities";
import { generator as trigEquationsFactoring } from "./trigEquationsFactoring";
import { generator as sumDifferenceIdentities } from "./sumDifferenceIdentities";
import { generator as multipleAngleIdentities } from "./multipleAngleIdentities";
import { generator as productToSum } from "./productToSum";
import { generator as trigEquationsMultipleAngle } from "./trigEquationsMultipleAngle";
import { generator as lawOfSines } from "./lawOfSines";
import { generator as lawOfCosines } from "./lawOfCosines";
import { generator as triangleArea } from "./triangleArea";

export const generators: readonly Generator[] = [
  angleMeasure,
  radiansDegrees,
  rightTriangleRatios,
  rightTriangleSolving,
  trigAnyAngle,
  graphingTrig,
  simpleTrigEquations,
  inverseTrig,
  fundamentalIdentities,
  trigEquationsFactoring,
  sumDifferenceIdentities,
  multipleAngleIdentities,
  productToSum,
  trigEquationsMultipleAngle,
  lawOfSines,
  lawOfCosines,
  triangleArea,
];
