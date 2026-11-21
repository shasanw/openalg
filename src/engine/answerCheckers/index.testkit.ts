import { trigAnyAngle } from "../generators/trig/trigAnyAngle.answer.testkit";
import { radiansDegrees } from "../generators/trig/radiansDegrees.answer.testkit";
import { angleMeasure } from "../generators/trig/angleMeasure.answer.testkit";
import { evalLatex } from "../generators/shared/latexEval.testkit";
import { equal } from "./math.testkit";
import { counting } from "./counting.testkit";
import { inequality } from "./inequalities.testkit";
import { parabola, linear, system } from "./geometry.testkit";
import { quadratic, equation, literal, radicalEquation, exponential, logForm, logEquation } from "./equations.testkit";
import { arithmetic, namePolynomial, expression } from "./expressions.testkit";
import { arithmeticSequences } from "../generators/sequences/arithmeticSequences.answer.testkit";
import { arithmeticSeries } from "../generators/sequences/arithmeticSeries.answer.testkit";
import { generalSequences } from "../generators/sequences/generalSequences.answer.testkit";
import { geometricSequences } from "../generators/sequences/geometricSequences.answer.testkit";
import { geometricSeries } from "../generators/sequences/geometricSeries.answer.testkit";
import { sequenceMeans } from "../generators/sequences/sequenceMeans.answer.testkit";
import { cramersRule } from "../generators/matrices/cramersRule.answer.testkit";
import { determinants } from "../generators/matrices/determinants.answer.testkit";
import { matrixInverses } from "../generators/matrices/matrixInverses.answer.testkit";
import { matrixOperations } from "../generators/matrices/matrixOperations.answer.testkit";
import { classifyingNumbers } from "../generators/foundations/classifyingNumbers.answer.testkit";
import { percents } from "../generators/foundations/percents.answer.testkit";
import { percentOfChange } from "../generators/foundations/percentOfChange.answer.testkit";
import { distanceFormula } from "../generators/radicals/distanceFormula.answer.testkit";
import { midpointFormula } from "../generators/radicals/midpointFormula.answer.testkit";
import { binomialTheorem } from "../generators/counting/binomialTheorem.answer.testkit";
import { graphingTrig } from "../generators/trig/graphingTrig.answer.testkit";
import { rightTriangleRatios } from "../generators/trig/rightTriangleRatios.answer.testkit";
import { rightTriangleSolving } from "../generators/trig/rightTriangleSolving.answer.testkit";
import { fundamentalIdentities } from "../generators/trig/fundamentalIdentities.answer.testkit";
import { sumDifferenceIdentities } from "../generators/trig/sumDifferenceIdentities.answer.testkit";
import { multipleAngleIdentities } from "../generators/trig/multipleAngleIdentities.answer.testkit";
import { productToSum } from "../generators/trig/productToSum.answer.testkit";
import { lawOfSines } from "../generators/trig/lawOfSines.answer.testkit";
import { lawOfCosines } from "../generators/trig/lawOfCosines.answer.testkit";
import { triangleArea } from "../generators/trig/triangleArea.answer.testkit";
import type { Problem } from "../types";

export const checkers: Record<string, (p: Problem) => void> = {
  "angle-measure": angleMeasure,
  "radians-degrees": radiansDegrees,
  "trig-any-angle": trigAnyAngle,
  "right-triangle-ratios": rightTriangleRatios,
  "right-triangle-solving": rightTriangleSolving,
  "graphing-trig": graphingTrig,
  "fundamental-identities": fundamentalIdentities,
  "sum-difference-identities": sumDifferenceIdentities,
  "multiple-angle-identities": multipleAngleIdentities,
  "product-to-sum": productToSum,
  "law-of-sines": lawOfSines,
  "law-of-cosines": lawOfCosines,
  "triangle-area": triangleArea,
  "arithmetic-sequences": arithmeticSequences,
  "arithmetic-series": arithmeticSeries,
  "general-sequences": generalSequences,
  "geometric-sequences": geometricSequences,
  "geometric-series": geometricSeries,
  "arithmetic-geometric-means": sequenceMeans,
  "cramers-rule": cramersRule,
  determinants: determinants,
  "matrix-inverses": matrixInverses,
  "matrix-operations": matrixOperations,
  "classifying-numbers": classifyingNumbers,
  percents: percents,
  "percent-of-change": percentOfChange,
  "distance-formula": distanceFormula,
  "midpoint-formula": midpointFormula,
  "binomial-theorem": binomialTheorem,
  "order-of-operations": arithmetic,
  "adding-subtracting-rationals": arithmetic,
  "multiplying-rationals": arithmetic,
  "dividing-rationals": arithmetic,
  "naming-polynomials": namePolynomial,
  "adding-subtracting-polynomials": expression,
  "multiplying-polynomials": expression,
  "special-products": expression,
  "dividing-polynomials": expression,
  "factoring-gcf": expression,
  "factoring-quadratics": expression,
  "factoring-special-cases": expression,
  "factoring-by-grouping": expression,
  "simplifying-radicals": expression,
  "adding-radicals": expression,
  "multiplying-radicals": expression,
  "dividing-radicals": expression,
  "log-properties": expression,
  "distributive-property": expression,
  "quadratic-factoring": quadratic,
  "quadratic-formula": quadratic,
  "completing-the-square": quadratic,
  "one-step-equations": equation,
  "two-step-equations": equation,
  "multi-step-equations": equation,
  "absolute-value-equations": equation,
  "solving-proportions": equation,
  "literal-equations": literal,
  "radical-equations": radicalEquation,
  "exponential-common-base": exponential,
  "exponential-equations-logs": exponential,
  "log-exponential-form": logForm,
  "logarithmic-equations": logEquation,
  "parabola-properties": parabola,
  "graphing-quadratics": parabola,
  slope: linear,
  "graphing-linear-equations": linear,
  "writing-linear-equations": linear,
  "parallel-perpendicular-slopes": linear,
  "systems-graphing": system,
  "systems-substitution": system,
  "systems-elimination": system,
  "one-step-inequalities": inequality,
  "two-step-inequalities": inequality,
  "multi-step-inequalities": inequality,
  "absolute-value-inequalities": inequality,
  "compound-inequalities": inequality,
  "quadratic-inequalities": inequality,
  "graphing-inequalities": inequality,
  "counting-principle": counting,
  permutations: counting,
  "permutations-vs-combinations": counting,
  combinations: counting,
  "evaluating-logarithms": (p) => equal(evalLatex(p.prompt, { e: Math.E }), evalLatex(p.answer, { e: Math.E })),
};
