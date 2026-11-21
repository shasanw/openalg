// Polynomials and factoring.
// Topics keep this order in GENERATORS (see ../../registry.ts).

import type { Generator } from "../../types";
import { generator as namingPolynomials } from "./namingPolynomials";
import { generator as addingPolynomials } from "./addingPolynomials";
import { generator as multiplyingPolynomials } from "./multiplyingPolynomials";
import { generator as specialProducts } from "./specialProducts";
import { generator as dividingPolynomials } from "./dividingPolynomials";
import { generator as factoringGcf } from "./factoringGcf";
import { generator as factoringQuadratics } from "./factoringQuadratics";
import { generator as factoringSpecialCases } from "./factoringSpecialCases";
import { generator as factoringByGrouping } from "./factoringByGrouping";

export const generators: readonly Generator[] = [
  namingPolynomials,
  addingPolynomials,
  multiplyingPolynomials,
  specialProducts,
  dividingPolynomials,
  factoringGcf,
  factoringQuadratics,
  factoringSpecialCases,
  factoringByGrouping,
];
