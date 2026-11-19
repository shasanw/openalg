// Precalculus. Units follow the usual teaching order; empty Units are planned
// (see the tracking issue #41) and stay hidden until a Topic is listed.

import type { CourseOutline } from "./types";

export const precalculus: CourseOutline = {
  course: "Precalculus",
  units: [
    { name: "Functions", topics: [] },
    { name: "Polynomial and Rational Functions", topics: [] },
    {
      name: "Exponential and Logarithmic Functions",
      topics: [{ topic: "exponential-common-base" }],
    },
    { name: "Trigonometry", topics: [] },
    { name: "Parametric Equations", topics: [] },
    { name: "Polar Coordinates", topics: [] },
    { name: "Vectors", topics: [] },
    { name: "Vectors in Three Dimensions", topics: [] },
    { name: "Matrices and Systems", topics: [] },
    { name: "Conic Sections", topics: [] },
    { name: "Counting and the Binomial Theorem", topics: [] },
    { name: "Probability", topics: [] },
    { name: "Sequences and Series", topics: [] },
    { name: "Introduction to Calculus", topics: [] },
  ],
};
