// The printed-Answer checker for triangle-area: reads the givens back from
// the printed diagram or word problem, rebuilds the triangle from scratch with
// the test-only math in oblique.testkit, and compares its shoelace area with
// the printed Answer within the stated rounding, in square units when the
// lengths have units. Shared by triangleArea.test.ts and the every-Topic
// Answer suite.

import { expect } from "vitest";
import type { Problem } from "../../types";
import { checkArea, promptPlaces } from "./oblique.testkit";

export function triangleArea(p: Problem): void {
  // the area is not a label, so the student's diagram is the whole Answer Key diagram
  expect(p.answerGraph).toBeUndefined();
  checkArea(p, promptPlaces(p.prompt));
}
