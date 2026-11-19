// Algebra 1. Units follow the usual teaching order; empty Units are planned
// (see the tracking issue #35) and stay hidden until a Topic is listed.

import type { CourseOutline } from "./types";

export const algebra1: CourseOutline = {
  course: "Algebra 1",
  units: [
    { name: "Foundations", topics: [] },
    {
      name: "Equations",
      topics: [
        { topic: "one-step-equations" },
        { topic: "two-step-equations" },
        { topic: "multi-step-equations" },
        { topic: "absolute-value-equations" },
        { topic: "literal-equations" },
      ],
    },
    {
      name: "Inequalities",
      topics: [
        { topic: "one-step-inequalities" },
        { topic: "two-step-inequalities" },
        { topic: "multi-step-inequalities" },
      ],
    },
    { name: "Proportions and Percents", topics: [] },
    { name: "Relations and Functions", topics: [] },
    {
      name: "Linear Equations and Inequalities",
      topics: [
        { topic: "slope" },
        { topic: "parallel-perpendicular-slopes" },
        { topic: "graphing-linear-equations" },
        { topic: "writing-linear-equations" },
      ],
    },
    { name: "Systems of Equations and Inequalities", topics: [] },
    { name: "Exponents", topics: [] },
    { name: "Polynomials", topics: [] },
    { name: "Factoring", topics: [] },
    {
      name: "Quadratic Functions",
      topics: [
        { topic: "graphing-quadratics" },
        { topic: "parabola-properties" },
        { topic: "quadratic-inequalities" },
        { topic: "quadratic-factoring" },
        { topic: "quadratic-formula" },
        { topic: "completing-the-square" },
      ],
    },
    { name: "Radicals", topics: [] },
    { name: "Rational Expressions", topics: [] },
    { name: "Right-Triangle Trigonometry", topics: [] },
    { name: "Statistics", topics: [] },
  ],
};
