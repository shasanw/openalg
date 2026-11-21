// The printed-Answer checker for right-triangle-solving: reads the PRINTED
// prompt, the triangle's labels and the PRINTED Answer, and recomputes every
// side and angle from the given labels alone with Math.sin / cos / asin /
// acos / atan / hypot (a word problem from its prose), never from the
// generator's construction. The printed value must be the true value rounded
// to the tenth. Shared by rightTriangleSolving.test.ts and the every-Topic
// Answer suite.

import { expect } from "vitest";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { proseOf } from "../shared/matrices.testkit";
import {
  drawnAngle,
  labelDegrees,
  labelLength,
  readRightTriangle,
  replacedLabels,
  trueSide,
  type RightTriangleRead,
} from "./rightTriangle.testkit";
import type { Problem } from "../../types";

const RAD = Math.PI / 180;
const sinD = (d: number) => Math.sin(d * RAD);
const cosD = (d: number) => Math.cos(d * RAD);
const tanD = (d: number) => Math.tan(d * RAD);
const DEG = 180 / Math.PI;

/**
 * The printed value v is the true value rounded to the nearest tenth, and the
 * true value is clear of a rounding boundary (a calculator cannot disagree).
 */
export function expectRoundedTenth(printed: string, truth: number): void {
  expect(printed).toMatch(/^\d+(\.\d)?$/);
  const v = Number(printed);
  expect(Math.abs(v - truth), `${printed} vs ${truth}`).toBeLessThanOrEqual(0.045 + 1e-9);
}

export type Kind = "side" | "angle" | "solve" | "word";
export function kindOf(p: Problem): Kind {
  if (p.prompt === "\\textnormal{Find} x") return "side";
  if (p.prompt === "\\textnormal{Find} \\theta") return "angle";
  if (p.prompt === "\\textnormal{Solve the triangle.}") return "solve";
  expect(p.graph).toBeUndefined();
  return "word";
}

/** θ's opposite, adjacent and hypotenuse corners (the side opposite each), from the given or marked angle k. */
function rolesFrom(t: RightTriangleRead, k: number) {
  const other = [0, 1, 2].find((i) => i !== k && i !== t.right)!;
  return { opp: k, adj: other, hyp: t.right } as const;
}

/** The one acute corner whose angle is given (degrees) or marked (θ, ?). */
function angleCorner(t: RightTriangleRead, test: (text: string) => boolean): number {
  const ks = t.corners.flatMap((c, i) => (c.angle && test(c.angle.text) ? [i] : []));
  expect(ks.length).toBe(1);
  expect(ks[0]).not.toBe(t.right);
  return ks[0];
}

export type Role = "opp" | "adj" | "hyp";
export const isDividing = (given: Role, unknown: Role) => unknown === "hyp" || (given === "opp" && unknown === "adj");

/** A side problem worked from its labels: [x, given role, x's role]. */
export function workSide(p: Problem): { x: number; given: Role; unknown: Role; theta: number; t: RightTriangleRead } {
  const t = readRightTriangle(p.graph);
  const k = angleCorner(t, (s) => labelDegrees(s) !== null);
  const theta = labelDegrees(t.corners[k].angle!.text)!;
  expect(Number.isInteger(theta)).toBe(true);
  const roles = rolesFrom(t, k);
  const roleOf = (text: (s: string) => boolean) =>
    (Object.keys(roles) as Role[]).filter((r) => text(t.corners[roles[r]].opposite?.text ?? ""));
  const [unknown] = roleOf((s) => s === "x");
  const givens = roleOf((s) => labelLength(s) !== null);
  expect(unknown).toBeDefined();
  expect(givens.length).toBe(1);
  const given = givens[0];
  const g = labelLength(t.corners[roles[given]].opposite!.text)!;
  expect(Number.isInteger(g)).toBe(true);
  const hyp = given === "hyp" ? g : given === "opp" ? g / sinD(theta) : g / cosD(theta);
  const x = unknown === "hyp" ? hyp : unknown === "opp" ? hyp * sinD(theta) : hyp * cosD(theta);
  // the drawing (built from the givens) agrees
  expect(Math.abs(trueSide(t, roles[unknown]) - x)).toBeLessThan(1e-9 * Math.max(1, x));
  return { x, given, unknown, theta, t };
}

/** θ from two labelled sides by inverse trig: the student's way. */
function inverseFrom(opp: number | null, adj: number | null, hyp: number | null): number {
  if (hyp === null) return Math.atan(opp! / adj!) * DEG;
  if (adj === null) return Math.asin(opp! / hyp) * DEG;
  return Math.acos(adj / hyp) * DEG;
}

export function workAngle(p: Problem, mark: string) {
  const t = readRightTriangle(p.graph);
  const k = angleCorner(t, (s) => s === mark);
  const roles = rolesFrom(t, k);
  const len = (r: Role) => labelLength(t.corners[roles[r]].opposite?.text ?? "");
  const known = (["opp", "adj", "hyp"] as Role[]).filter((r) => len(r) !== null);
  expect(known.length).toBe(2);
  for (const r of known) expect(Number.isInteger(len(r))).toBe(true);
  const theta = inverseFrom(len("opp"), len("adj"), len("hyp"));
  expect(Math.abs(drawnAngle(t.corners, k) - theta)).toBeLessThan(1e-9);
  return { theta, t, k };
}

/** Word problems, read from their prose: what is given, and the student's computation. */
export const WORDS: { re: RegExp; unit: "ft" | "m" | null; divide: boolean; work: (n: number[], a: number) => number }[] = [
  { re: /^A (\d+)-foot ladder leans against a wall, making an angle of with the ground\. How high up the wall does the ladder reach\?$/, unit: "ft", divide: false, work: ([l], a) => l * sinD(a) },
  { re: /^A (\d+)-foot ladder leans against a wall, making an angle of with the ground\. How far is the foot of the ladder from the wall\?$/, unit: "ft", divide: false, work: ([l], a) => l * cosD(a) },
  { re: /^A kite flies on a straight string (\d+) meters long that makes an angle of with the ground\. How high is the kite\?$/, unit: "m", divide: false, work: ([l], a) => l * sinD(a) },
  { re: /^A tree casts a shadow (\d+) meters long when the angle of elevation of the sun is \. How tall is the tree\?$/, unit: "m", divide: false, work: ([s], a) => s * tanD(a) },
  { re: /^From the top of a lighthouse (\d+) meters tall, the angle of depression to a boat is \. How far is the boat from the base of the lighthouse\?$/, unit: "m", divide: true, work: ([h], a) => h / tanD(a) },
  { re: /^A ramp rises (\d+) feet and makes an angle of with the ground\. How long is the ramp\?$/, unit: "ft", divide: true, work: ([h], a) => h / sinD(a) },
  { re: /^A wire runs from the top of a pole (\d+) feet tall to the ground, making an angle of with the ground\. How long is the wire\?$/, unit: "ft", divide: true, work: ([h], a) => h / sinD(a) },
  { re: /^A (\d+)-foot ladder leans against a wall and reaches (\d+) feet up the wall\. What angle does the ladder make with the ground\?$/, unit: null, divide: false, work: ([l, h]) => Math.asin(h / l) * DEG },
  { re: /^A flagpole (\d+) meters tall casts a shadow (\d+) meters long\. What is the angle of elevation of the sun\?$/, unit: null, divide: false, work: ([h, s]) => Math.atan(h / s) * DEG },
  { re: /^From the top of a cliff (\d+) meters high, a boat is seen (\d+) meters from the base of the cliff\. What is the angle of depression to the boat\?$/, unit: null, divide: false, work: ([h, d]) => Math.atan(h / d) * DEG },
  { re: /^A ramp (\d+) feet long rises (\d+) feet\. What angle does the ramp make with the ground\?$/, unit: null, divide: false, work: ([l, h]) => Math.asin(h / l) * DEG },
];

export function workWord(p: Problem) {
  const text = proseOf(p.prompt);
  const hits = WORDS.flatMap((w) => {
    const m = text.match(w.re);
    return m ? [{ w, nums: m.slice(1).map(Number) }] : [];
  });
  expect(hits.length, text).toBe(1);
  const { w, nums } = hits[0];
  const angles = [...p.prompt.matchAll(/(\d+)\^\{\\circ\}/g)].map((m) => Number(m[1]));
  expect(angles.length).toBe(w.unit ? 1 : 0);
  return { w, nums, value: w.work(nums, angles[0]) };
}

/** A whole triangle: every missing part, worked from the givens, matches its Answer part. */
export function workSolve(p: Problem): void {
  const t = readRightTriangle(p.graph);
  const cs = t.corners;
  expect(cs.map((c) => c.name).sort()).toEqual(["A", "B", "C"]);
  expect(cs[t.right].name).toBe("C");
  const given = cs.flatMap((c, i) => (c.angle && labelDegrees(c.angle.text) !== null ? [i] : []));
  const sideLen = (i: number) => labelLength(cs[i].opposite?.text ?? "");
  const knownSides = [0, 1, 2].filter((i) => sideLen(i) !== null);
  // the true parts, from the givens only
  const angle: Record<string, number> = {};
  const side: Record<string, number> = {};
  if (given.length === 1) {
    const k = given[0];
    const roles = rolesFrom(t, k);
    const th = labelDegrees(cs[k].angle!.text)!;
    expect(Number.isInteger(th)).toBe(true);
    expect(knownSides.length).toBe(1);
    const gRole = (Object.keys(roles) as Role[]).find((r) => roles[r] === knownSides[0])!;
    const gl = sideLen(knownSides[0])!;
    const hyp = gRole === "hyp" ? gl : gRole === "opp" ? gl / sinD(th) : gl / cosD(th);
    side[cs[roles.opp].name!.toLowerCase()] = hyp * sinD(th);
    side[cs[roles.adj].name!.toLowerCase()] = hyp * cosD(th);
    side.c = hyp;
    angle[cs[roles.adj].name!] = 90 - th;
    if (!p.params.divide) expect(gRole).toBe("hyp");
  } else {
    expect(given.length).toBe(0);
    expect(knownSides.length).toBe(2);
    const a = cs.findIndex((c) => c.name === "A");
    const roles = rolesFrom(t, a);
    const len = (r: Role) => sideLen(roles[r]);
    const A = inverseFrom(len("opp"), len("adj"), len("hyp"));
    angle.A = A;
    angle.B = 90 - A;
    const [u, v] = knownSides.map((i) => sideLen(i)!);
    const missing = [0, 1, 2].find((i) => sideLen(i) === null)!;
    side[cs[missing].name!.toLowerCase()] = missing === t.right ? Math.hypot(u, v) : Math.sqrt(Math.abs(u * u - v * v));
  }
  // every true part agrees with the drawing
  for (const [n, d] of Object.entries(angle)) expect(Math.abs(drawnAngle(cs, cs.findIndex((c) => c.name === n)) - d)).toBeLessThan(1e-9);
  for (const [n, l] of Object.entries(side)) {
    const i = cs.findIndex((c) => c.name === n.toUpperCase());
    expect(Math.abs(trueSide(t, i) - l)).toBeLessThan(1e-9 * Math.max(1, l));
  }
  const unknownSides = Object.keys(side).filter((n) => sideLen(cs.findIndex((c) => c.name === n.toUpperCase())) === null);
  const parts = p.answer.split(ANSWER_PART_SEPARATOR);
  const names = parts.map((part) => part.split(" ")[0]);
  expect(names).toEqual([...Object.keys(angle), ...unknownSides].sort());
  for (const part of parts) {
    const m = part.match(/^([ABabc]) (=|\\approx) (\S+?)(\^\{\\circ\})?$/);
    expect(m, part).not.toBeNull();
    const [, n, rel, v, degSign] = m!;
    const truth = n === n.toUpperCase() ? angle[n] : side[n];
    expect(!!degSign).toBe(n === n.toUpperCase());
    if (rel === "=") expect(Math.abs(Number(v) - truth)).toBeLessThan(1e-9);
    else expectRoundedTenth(v, truth);
  }
  // another sound route to the last side (the Pythagorean theorem from a rounded side) rounds the same
  if (given.length === 1) {
    const legs = Object.keys(side).filter((n) => n !== "c");
    const known = (n: string) => (parts.find((q) => q.startsWith(n + " ")) ? Number(parts.find((q) => q.startsWith(n + " "))!.split(" ").pop()) : side[n]);
    for (const n of unknownSides) {
      const alt =
        n === "c" ? Math.hypot(known(legs[0]), known(legs[1])) : Math.sqrt(known("c") ** 2 - known(legs.find((l) => l !== n)!) ** 2);
      expect(Math.round(alt * 10) / 10, `${n} by the Pythagorean theorem`).toBe(Number(known(n)));
    }
  }
}


/** The every-Topic Answer suite's checker: the printed Answer, then the answer graph. */
export function rightTriangleSolving(p: Problem): void {
  const kind = kindOf(p);
  if (kind === "side") {
    const { x } = workSide(p);
    const m = p.answer.match(/^x \\approx (\S+)$/);
    expect(m, p.answer).not.toBeNull();
    expectRoundedTenth(m![1], x);
  } else if (kind === "angle") {
    const { theta } = workAngle(p, "θ");
    const m = p.answer.match(/^\\theta \\approx (\S+)\^\{\\circ\}$/);
    expect(m, p.answer).not.toBeNull();
    expectRoundedTenth(m![1], theta);
  } else if (kind === "word") {
    const { w, value } = workWord(p);
    const m = w.unit
      ? p.answer.match(new RegExp(`^(\\S+) \\\\text\\{ ${w.unit}\\}$`))
      : p.answer.match(/^(\S+)\^\{\\circ\}$/);
    expect(m, p.answer).not.toBeNull();
    expectRoundedTenth(m![1], value);
  } else {
    workSolve(p);
  }

  // The answer graph replaces only the marked unknowns, with the Answer's values.
  if (kind === "word") {
    expect(p.answerGraph).toBeUndefined();
    return;
  }
  const marks = kind === "side" ? ["x"] : kind === "angle" ? ["θ"] : ["?", "a", "b", "c"];
  const replaced = replacedLabels(p.graph, p.answerGraph, marks);
  const ans = p.answer.split(ANSWER_PART_SEPARATOR).map((part) => part.match(/^(\S+) (?:=|\\approx) (\S+?)(\^\{\\circ\})?$/)!);
  if (kind !== "solve") {
    expect(replaced.length).toBe(1);
    expect(replaced[0].text).toBe(ans[0][2] + (ans[0][3] ? "°" : ""));
    return;
  }
  const names = readRightTriangle(p.graph).corners.map((c) => c.name);
  expect(replaced.length).toBe(ans.length);
  for (const r of replaced) {
    const name = r.field === "angle" ? names[r.corner]! : names[r.corner]!.toLowerCase();
    if (r.field === "opposite") expect(r.mark).toBe(name);
    const part = ans.find((a) => a[1] === name);
    expect(part, `${name} in ${p.answer}`).toBeDefined();
    expect(r.text).toBe(part![2] + (part![3] ? "°" : ""));
  }
}
