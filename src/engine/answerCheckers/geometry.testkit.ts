import { ANSWER_PART_SEPARATOR } from "../format";
import type { GraphSpec, LineCurve } from "../plot";
import type { Problem } from "../types";
import {
  answerMatchesPrompt,
  equations,
  coefficients as lineCoefficients,
} from "../generators/systems/systems.testUtil";
import { close, evalLatex, splitEquation } from "../generators/shared/latexEval.testkit";
import { check, coefficients, coordinates, equal, gap, realRoots, sameNumbers } from "./math.testkit";

const slopeNumber = (s: string) => (s.includes("undefined") ? Infinity : evalLatex(s));
const perpendicular = (m: number) => (m === 0 ? Infinity : -1 / m);
const sameSlope = (a: number, b: number) => a === b || (Number.isFinite(a) && Number.isFinite(b) && close(a, b));

function slopeOf(eq: string) {
  if (eq.includes("undefined") || /(?:^| )m(?:_\d)? = /.test(eq)) return slopeNumber(eq.split(" = ").pop()!);
  const [a, b] = lineCoefficients(eq);
  check(a !== 0 || b !== 0, "degenerate line");
  return close(b, 0) ? Infinity : -a / b;
}

function curves(graph?: GraphSpec) {
  check(graph?.kind === "plane", "missing plane");
  if (graph.axisLabels) check(graph.axisLabels.x === "x" && graph.axisLabels.y === "y", "incorrect coordinate axes");
  for (const pt of graph.points ?? []) {
    if (pt.label === undefined) continue;
    const label = pt.label.replace(/−/g, "-").match(/^\((-?[\d.]+),\s*(-?[\d.]+)\)$/);
    check(label, `unrecognized coordinate label ${pt.label}`);
    equal(Number(label[1]), pt.x);
    equal(Number(label[2]), pt.y);
  }
  return graph.curves ?? [];
}
function onCurve(eq: string, c: LineCurve) {
  return [0, 1].every((t) => close(gap(eq, c.form === "vertical" ? { x: c.x, y: t } : { x: t, y: c.m * t + c.b }), 0));
}

export function linear(p: Problem) {
  if (p.generatorId === "parallel-perpendicular-slopes") {
    const parts = p.prompt.split(" \\text{ and } ");
    if (parts.length === 2) {
      const [a, b] = parts.map(slopeOf);
      const relation = sameSlope(a, b) ? "Parallel" : sameSlope(perpendicular(a), b) ? "Perpendicular" : "Neither";
      check(p.answer === `\\text{${relation}}`, "wrong relation");
    } else {
      const m = slopeOf(p.prompt.replace(/^\\text\{(?:Parallel|Perpendicular) to \} /, ""));
      check(sameSlope(slopeNumber(p.answer), p.prompt.includes("Perpendicular") ? perpendicular(m) : m), "wrong slope");
    }
    return;
  }
  if (p.generatorId === "graphing-linear-equations") {
    const m = slopeOf(p.prompt);
    const [slope, intercept] = p.answer.split(ANSWER_PART_SEPARATOR);
    check(slope.startsWith("m = ") && sameSlope(slopeOf(slope), m), "wrong slope");
    const axis = m === Infinity ? "x" : "y";
    check(intercept.startsWith(`\\text{$${axis}$-intercept: } `), "wrong intercept");
    const [pt] = coordinates(intercept);
    equal(axis === "x" ? pt.y : pt.x, 0);
    equal(gap(p.prompt, pt), 0);
    const cs = curves(p.answerGraph);
    check(cs.length === 1 && cs[0].kind === "line" && onCurve(p.prompt, cs[0]), "wrong drawn line");
    if (p.answerGraph?.kind === "plane")
      for (const pt of p.answerGraph.points ?? []) equal(gap(p.prompt, { x: pt.x, y: pt.y }), 0);
    return;
  }
  const pts = p.graph?.kind === "plane" ? p.graph.points! : coordinates(p.prompt);
  let m: number;
  if (pts.length === 2) {
    const [a, b] = pts;
    m = a.x === b.x ? Infinity : (b.y - a.y) / (b.x - a.x);
  } else m = slopeNumber(p.prompt.split(" = ").pop()!);
  if (p.graph) {
    const cs = curves(p.graph);
    check(cs.length === 1 && cs[0].kind === "line", "missing given line");
    const c = cs[0];
    for (const pt of pts) equal(c.form === "vertical" ? pt.x : pt.y, c.form === "vertical" ? c.x : c.m * pt.x + c.b);
  }
  if (p.generatorId === "slope") check(sameSlope(slopeNumber(p.answer), m), "wrong rise/run");
  else {
    check(sameSlope(slopeOf(p.answer), m), "wrong slope");
    for (const pt of pts) equal(gap(p.answer, { x: pt.x, y: pt.y }), 0);
  }
}

export function system(p: Problem) {
  check(answerMatchesPrompt(p.prompt, p.answer), "wrong system solution");
  if (p.generatorId !== "systems-graphing") return;
  const eqs = equations(p.prompt);
  const cs = curves(p.answerGraph);
  equal(cs.length, p.answer.includes("infinitely") ? 1 : 2);
  for (const eq of eqs)
    check(
      cs.some((c) => c.kind === "line" && onCurve(eq, c)),
      "missing system line",
    );
  if (p.answerGraph?.kind === "plane") {
    const pts = p.answerGraph.points ?? [];
    equal(pts.length, coordinates(p.answer).length);
    for (const pt of pts) for (const eq of eqs) equal(gap(eq, { x: pt.x, y: pt.y }), 0);
  }
}

export function parabola(p: Problem) {
  const [y, rhs] = splitEquation(p.prompt);
  check(y === "y", "expected parabola");
  const f = (x: number) => evalLatex(rhs, { x });
  const { a, b, c } = coefficients(f),
    h = -b / (2 * a);
  const parts = p.answer.split(ANSWER_PART_SEPARATOR);
  if (p.params.ask !== "intercepts") {
    const vertex = parts.shift()!,
      axis = parts.shift()!;
    check(
      vertex.startsWith("\\text{Vertex: }") && axis.startsWith("\\text{Axis: } x = "),
      "wrong vertex or axis label",
    );
    const [pt] = coordinates(vertex);
    equal(pt.x, h);
    equal(pt.y, f(h));
    equal(evalLatex(axis.split(" = ")[1]), h);
  }
  if (p.params.ask !== "vertexAxis") {
    const xs = parts.shift()!,
      ys = parts.shift()!;
    check(
      xs.startsWith("\\text{$x$-intercepts: }") && ys.startsWith("\\text{$y$-intercept: }"),
      "incorrect intercept labels",
    );
    const pts = coordinates(xs),
      expected = realRoots(f);
    if (!expected.length) check(xs.endsWith("\\text{none}"), "expected no intercepts");
    sameNumbers(
      pts.map((pt) => pt.x),
      expected,
    );
    for (const pt of pts) equal(pt.y, 0);
    const [pt] = coordinates(ys);
    equal(pt.x, 0);
    equal(pt.y, c);
  }
  equal(parts.length, 0);
  if (p.generatorId === "graphing-quadratics") {
    const cs = curves(p.answerGraph);
    check(cs.length === 1 && cs[0].kind === "parabola", "missing parabola");
    const curve = cs[0];
    for (const x of [-1, 0, 1])
      equal(
        curve.form === "vertex" ? curve.a * (x - curve.h) ** 2 + curve.k : curve.a * x * x + curve.b * x + curve.c,
        f(x),
      );
    if (p.answerGraph?.kind === "plane") {
      const lines = p.answerGraph.lines ?? [];
      check(lines.length === 1 && lines[0].dashed, "missing axis");
      equal(lines[0].x, h);
      const pts = p.answerGraph.points ?? [];
      for (const pt of pts) equal(pt.y, f(pt.x));
      for (const pt of [{ x: h, y: f(h) }, { x: 0, y: c }, ...realRoots(f).map((x) => ({ x, y: 0 }))])
        check(
          pts.some((q) => close(q.x, pt.x) && close(q.y, pt.y)),
          "missing feature point",
        );
    }
  }
}
