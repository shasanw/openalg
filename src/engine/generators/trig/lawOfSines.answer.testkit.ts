// The printed-Answer checker for law-of-sines: reads the givens back from the
// printed diagram (or, for the ambiguous case, the prompt), solves the
// triangle from scratch with the test-only math in oblique.testkit, counts the
// ambiguous case's triangles independently, and compares with the printed
// Answer within the stated rounding. Shared by lawOfSines.test.ts and the
// every-Topic Answer suite.

import { expect } from "vitest";
import type { Problem } from "../../types";
import { expectAmbiguousRight, expectDiagramProblemRight, promptPlaces } from "./oblique.testkit";

export function lawOfSines(p: Problem): void {
  const places = promptPlaces(p.prompt);
  if (p.graph) {
    expectDiagramProblemRight(p, places, p.prompt.includes("Solve the triangle"));
    return;
  }
  // the ambiguous case: no diagram, which would show (or fake) one of the answers
  expect(p.answerGraph).toBeUndefined();
  expect(p.prompt).toContain("How many triangles are possible?");
  expectAmbiguousRight(p.prompt, p.answer, places, p.prompt.includes("Solve each"));
}
