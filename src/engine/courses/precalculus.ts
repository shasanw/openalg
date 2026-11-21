// Precalculus. Units follow the usual teaching order; empty Units are planned
// (see its tracking issue) and stay hidden until a Topic is listed, and the
// Course itself stays hidden until its first Topic is.

import type { CourseOutline } from "./types";

export const precalculus: CourseOutline = {
  course: "Precalculus",
  units: [
    { name: "Functions", topics: [] },
    { name: "Polynomial and Rational Functions", topics: [] },
    {
      name: "Exponential and Logarithmic Functions",
      topics: [
        { topic: "exponential-common-base" },
        { topic: "log-exponential-form" },
        { topic: "evaluating-logarithms" },
        { topic: "log-properties" },
        { topic: "exponential-equations-logs" },
        { topic: "logarithmic-equations" },
      ],
    },
    {
      name: "Trigonometry",
      topics: [
        { topic: "angle-measure" },
        { topic: "radians-degrees" },
        { topic: "right-triangle-ratios" },
        { topic: "right-triangle-solving" },
        { topic: "trig-any-angle" },
        { topic: "graphing-trig" },
      ],
    },
    { name: "Parametric Equations", topics: [] },
    { name: "Polar Coordinates", topics: [] },
    { name: "Vectors", topics: [] },
    { name: "Vectors in Three Dimensions", topics: [] },
    {
      name: "Matrices and Systems",
      topics: [
        { topic: "matrix-operations" },
        { topic: "determinants" },
        { topic: "matrix-inverses" },
        { topic: "cramers-rule" },
      ],
    },
    { name: "Conic Sections", topics: [] },
    {
      name: "Counting and the Binomial Theorem",
      topics: [
        { topic: "counting-principle" },
        { topic: "permutations" },
        { topic: "combinations" },
        { topic: "permutations-vs-combinations" },
        { topic: "binomial-theorem" },
      ],
    },
    { name: "Probability", topics: [] },
    {
      name: "Sequences and Series",
      topics: [
        { topic: "general-sequences" },
        { topic: "arithmetic-sequences" },
        { topic: "geometric-sequences" },
        { topic: "arithmetic-geometric-means" },
        { topic: "arithmetic-series" },
        { topic: "geometric-series" },
      ],
    },
    { name: "Introduction to Calculus", topics: [] },
  ],
};
