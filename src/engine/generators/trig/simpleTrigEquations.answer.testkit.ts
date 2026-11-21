// The printed-Answer checker for "Solving simple trig equations": reads only the BAKED prompt and
// Answer (see trigEquation.testkit.ts). Every printed solution must satisfy
// the printed equation with every term defined, and a scan of the interval
// (or of the whole period, for all solutions) must find no other solution.
// Shared by the Topic's tests and the every-Topic Answer suite.

import type { Problem } from "../../types";
import { expectExactSolutions } from "./trigEquation.testkit";

export const simpleTrigEquations = (p: Problem): void => expectExactSolutions(p.prompt, p.answer);
