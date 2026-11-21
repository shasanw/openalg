// Exponentials and logarithms.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as exponentialCommonBase } from "./exponentialCommonBase";
import { generator as logExponentialForm } from "./logExponentialForm";
import { generator as evaluatingLogarithms } from "./evaluatingLogarithms";
import { generator as logProperties } from "./logProperties";
import { generator as exponentialEquationsLogs } from "./exponentialEquationsLogs";
import { generator as logarithmicEquations } from "./logarithmicEquations";

export const generators: readonly Generator[] = [
  exponentialCommonBase,
  logExponentialForm,
  evaluatingLogarithms,
  logProperties,
  exponentialEquationsLogs,
  logarithmicEquations,
];
