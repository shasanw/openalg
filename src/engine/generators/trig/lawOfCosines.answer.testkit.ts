// The printed-Answer checker for law-of-cosines: reads the givens back from
// the printed diagram or word problem, solves the triangle from scratch with
// the test-only math in oblique.testkit, and compares with the printed Answer
// within the stated rounding. Shared by lawOfCosines.test.ts and the
// every-Topic Answer suite.

import { expect } from "vitest";
import type { Problem } from "../../types";
import { expectDiagramProblemRight, expectWordProblemRight, promptPlaces } from "./oblique.testkit";

export function lawOfCosines(p: Problem): void {
  const places = promptPlaces(p.prompt);
  if (p.graph) {
    const r = expectDiagramProblemRight(p, places, p.prompt.includes("Solve the triangle"));
    // SAS or SSS: never two angles (that would be the Law of Sines)
    expect(r.givens.angles.filter((x) => x !== null).length).toBeLessThanOrEqual(1);
    return;
  }
  expect(p.answerGraph).toBeUndefined();
  expectWordProblemRight(p, places);
}
