// The printed-Answer checker for right-triangle-ratios: reads the PRINTED
// prompt, the triangle's labels and the PRINTED Answer, and recomputes every
// ratio from the labelled sides alone (Math.hypot / sqrt for a side marked x),
// never from the generator's construction. Shared by
// rightTriangleRatios.test.ts and the every-Topic Answer suite.

import { expect } from "vitest";
import { ANSWER_PART_SEPARATOR, gcd, simplifyRadical } from "../../format";
import { evalLatex } from "../shared/latexEval.testkit";
import { expectRationalized } from "./trig.testkit";
import { labelLength, readRightTriangle, replacedLabels, trueSide } from "./rightTriangle.testkit";
import type { Problem } from "../../types";

/** "\sin \theta = \frac{3}{5}" -> ["sin", "\frac{3}{5}"]. */
export function parts(answer: string): [string, string][] {
  return answer.split(ANSWER_PART_SEPARATOR).map((p) => {
    const m = p.match(/^\\(sin|cos|tan|csc|sec|cot) \\theta = (.+)$/);
    expect(m, p).not.toBeNull();
    return [m![1], m![2]];
  });
}

/** Every number in a value is in lowest terms with a square-free radicand. */
export function expectSimplest(v: string): void {
  const m = v.match(/^(?:\\frac\{(\d*)(?:\\sqrt\{(\d+)\})?\}\{(\d+)\}|(\d*)(?:\\sqrt\{(\d+)\})?)$/);
  expect(m, v).not.toBeNull();
  const [, fn, fr, fd, n, r] = m!;
  const radicand = fr ?? r;
  if (radicand) expect(simplifyRadical(Number(radicand)).outside, v).toBe(1);
  if (radicand) expect(Number(radicand)).toBeGreaterThan(1);
  if (fd) {
    expect(gcd(fn === "" ? 1 : Number(fn), Number(fd)), v).toBe(1);
    expect(Number(fd)).toBeGreaterThan(1);
  }
  if (n !== undefined && !radicand) expect(n).not.toBe("");
  expect(v).not.toMatch(/(^|\{)1\\sqrt/);
  expectRationalized(v);
}

/** What the student reads off the diagram: θ's opposite, adjacent and hypotenuse, from the labels. */
export function sidesOf(p: Problem) {
  const t = readRightTriangle(p.graph);
  const cs = t.corners;
  const thetas = cs.flatMap((c, i) => (c.angle?.text === "θ" ? [i] : []));
  expect(thetas.length).toBe(1);
  const th = thetas[0];
  expect(th).not.toBe(t.right);
  const other = [0, 1, 2].find((i) => i !== th && i !== t.right)!;
  const label = (i: number) => cs[i].opposite?.text ?? "";
  const lens = [0, 1, 2].map((i) => labelLength(label(i)));
  const missing = [0, 1, 2].filter((i) => lens[i] === null);
  expect(missing.length).toBeLessThanOrEqual(1);
  // the missing side, if any, by the Pythagorean theorem from the labels
  if (missing.length === 1) {
    const m = missing[0];
    expect(label(m)).toBe("x");
    const [u, v] = [0, 1, 2].filter((i) => i !== m).map((i) => lens[i]!);
    lens[m] = m === t.right ? Math.hypot(u, v) : Math.sqrt(Math.abs(u * u - v * v));
  }
  // the labels agree with the drawing (missing side included)
  for (const i of [0, 1, 2]) expect(Math.abs(trueSide(t, i) / lens[i]! - 1)).toBeLessThan(1e-9);
  const missingRole = missing[0] === th ? "opp" : missing[0] === other ? "adj" : missing[0] === t.right ? "hyp" : null;
  return { missingRole, opp: lens[th]!, adj: lens[other]!, hyp: lens[t.right]!, missing: missing[0] ?? null, labels: [0, 1, 2].map(label) };
}

const RATIO = {
  sin: (s: { opp: number; adj: number; hyp: number }) => s.opp / s.hyp,
  cos: (s: { opp: number; adj: number; hyp: number }) => s.adj / s.hyp,
  tan: (s: { opp: number; adj: number; hyp: number }) => s.opp / s.adj,
  csc: (s: { opp: number; adj: number; hyp: number }) => s.hyp / s.opp,
  sec: (s: { opp: number; adj: number; hyp: number }) => s.hyp / s.adj,
  cot: (s: { opp: number; adj: number; hyp: number }) => s.adj / s.opp,
} as const;


/** The every-Topic Answer suite's checker: the printed ratios, and the answer graph. */
export function rightTriangleRatios(p: Problem): void {
  const s = sidesOf(p);
  const asked = p.prompt.split(/, |;\\quad /).map((f) => f.match(/^\\(\w+) \\theta$/)?.[1]);
  const ps = parts(p.answer);
  expect(ps.map(([fn]) => fn)).toEqual(asked);
  for (const [fn, v] of ps) {
    expectSimplest(v);
    const want = RATIO[fn as keyof typeof RATIO](s);
    expect(Math.abs(evalLatex(v) - want), `${fn}: ${v} vs ${want}`).toBeLessThan(1e-12 * Math.max(1, want));
  }
  // The answer graph: absent when nothing is unknown, otherwise only x replaced, by the side's length.
  if (s.missing === null) {
    expect(p.answerGraph).toBeUndefined();
    return;
  }
  const replaced = replacedLabels(p.graph, p.answerGraph, ["x"]);
  expect(replaced.length).toBe(1);
  const want = { opp: s.opp, adj: s.adj, hyp: s.hyp }[s.missingRole!]!;
  const got = labelLength(replaced[0].text);
  expect(got, replaced[0].text).not.toBeNull();
  expect(Math.abs(want - got!), `x is ${want}, key says ${replaced[0].text}`).toBeLessThan(1e-9);
  const t = readRightTriangle(p.graph);
  expect(Math.abs(trueSide(t, replaced[0].corner) - got!)).toBeLessThan(1e-9);
}
