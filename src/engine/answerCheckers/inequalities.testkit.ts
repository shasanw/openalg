import type { NumberLineSpec } from "../plot";
import type { Problem } from "../types";
import { answerHolds, inequalityHolds, printedNumbers } from "../generators/inequalities/inequalityEval.testkit";
import { close, evalLatex } from "../generators/shared/latexEval.testkit";
import { check, equal, realRoots } from "./math.testkit";

function shaded(g: NumberLineSpec, x: number) {
  const dot = g.points?.find((pt) => close(pt.x, x));
  return dot ? dot.closed : (g.shaded ?? []).some((s) => x > (s.from ?? -Infinity) && x < (s.to ?? Infinity));
}
function description(s: string, x: number) {
  const dots = [...s.matchAll(/\\text\{(open|closed) circle at \} x = (.+?);/g)].map((m) => ({
    x: evalLatex(m[2]),
    closed: m[1] === "closed",
  }));
  const direction = s.match(/\\text\{shade (left|right|outside|between)\}$/)![1];
  equal(dots.length, ["left", "right"].includes(direction) ? 1 : 2);
  const dot = dots.find((pt) => close(pt.x, x));
  if (dot) return dot.closed;
  if (direction === "left") return x < dots[0].x;
  if (direction === "right") return x > dots[0].x;
  return (x > dots[0].x && x < dots[1].x) === (direction === "between");
}

export function inequality(p: Problem) {
  const readGraph = p.prompt.startsWith("\\text{Write");
  const g = readGraph ? p.graph : p.answerGraph;
  check(g?.kind === "numberLine", "missing number line");
  const boundaries = [...printedNumbers(p.answer), ...printedNumbers(p.prompt)];
  for (const pt of g.points ?? []) {
    boundaries.push(pt.x);
    if (pt.label) {
      const [top, bottom] = pt.label
        .replace(/−/g, "-")
        .replace(/√(\d+)/g, "\\sqrt{$1}")
        .split("/");
      equal(evalLatex(top) / Number(bottom ?? 1), pt.x);
    }
  }
  for (const s of g.shaded ?? []) {
    if (s.from !== null) boundaries.push(s.from);
    if (s.to !== null) boundaries.push(s.to);
  }
  if (!readGraph) {
    const plain = p.prompt.replace(/\\mathord\{-\}/g, "-");
    for (const clause of plain.split(/\\text\{ (?:or|and) \}/)) {
      const sides = clause.split(/\\le|\\ge|[<>]/);
      for (let i = 1; i < sides.length; i++)
        for (const sign of [-1, 1]) {
          const difference = `(${sides[i - 1]}) - (${sides[i]})`.replace(/\\lvert(.+?)\\rvert/g, `(${sign})($1)`);
          boundaries.push(...realRoots((x) => evalLatex(difference, { x })));
        }
    }
  }
  // The set is constant between consecutive critical points. Check both tails,
  // each endpoint, and one interior point of every interval.
  boundaries.sort((a, b) => a - b);
  const probes = [(boundaries[0] ?? 0) - 100, (boundaries[boundaries.length - 1] ?? 0) + 100, ...boundaries];
  for (let i = 1; i < boundaries.length; i++) probes.push((boundaries[i - 1] + boundaries[i]) / 2);
  for (const x of probes) {
    const graph = shaded(g, x);
    const expected = readGraph ? graph : inequalityHolds(p.prompt, x);
    check(graph === expected, `incorrect shading at ${x}`);
    const answer = p.answer.includes("circle at") ? description(p.answer, x) : answerHolds(p.answer, x);
    check(answer === expected, `incorrect solution set at ${x}`);
  }
}
