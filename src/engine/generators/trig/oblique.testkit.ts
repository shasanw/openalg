// Test-only: an INDEPENDENT checker for the oblique-triangle Topics. It reads
// the givens back out of what is printed (the diagram's labels, or the
// numbers in a prompt), solves the triangle from scratch with its own code
// (coordinates, the quadratic form of the Law of Cosines for SSA, the
// shoelace formula for area; nothing from obliqueKit or the generators), and
// compares with the printed Answer within the stated rounding. The Topics'
// printed-Answer checkers (lawOfSines, lawOfCosines and triangleArea
// .answer.testkit.ts) are built from these pieces.

import { expect } from "vitest";
import type { TriangleCorner, TriangleLabel, TriangleSpec } from "../../plot";
import { ANSWER_PART_SEPARATOR } from "../../format";
import type { Problem } from "../../types";

const D = Math.PI / 180;

/** A solved triangle: angles (degrees) and the sides opposite them, by vertex A, B, C. */
export interface Solved {
  angles: number[];
  sides: number[];
}

/** What is known of a triangle: a number, or null when not given. */
export interface Givens {
  angles: (number | null)[];
  sides: (number | null)[];
}

/** The triangle with these corners, measured: side i opposite corner i, angle at i. */
export function measure(pts: readonly { x: number; y: number }[]): Solved {
  const sides = [0, 1, 2].map((i) => {
    const p = pts[(i + 1) % 3];
    const q = pts[(i + 2) % 3];
    return Math.hypot(p.x - q.x, p.y - q.y);
  });
  const angles = [0, 1, 2].map((i) => {
    const o = pts[i];
    const p = pts[(i + 1) % 3];
    const q = pts[(i + 2) % 3];
    const a1 = Math.atan2(p.y - o.y, p.x - o.x);
    const a2 = Math.atan2(q.y - o.y, q.x - o.x);
    let d = Math.abs(a1 - a2);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d / D;
  });
  return { angles, sides };
}

/** Corners of the triangle with angle `deg` at the origin between rays of lengths p and q. */
const sasCorners = (deg: number, p: number, q: number) => [
  { x: 0, y: 0 },
  { x: p, y: 0 },
  { x: q * Math.cos(deg * D), y: q * Math.sin(deg * D) },
];

/**
 * Every triangle with these givens (several only for SSA). Throws for
 * givens that do not fix a triangle up to the ambiguous case.
 */
export function solveIndependently(g: Givens): Solved[] {
  const ka = [0, 1, 2].filter((v) => g.angles[v] !== null);
  const ks = [0, 1, 2].filter((v) => g.sides[v] !== null);
  const A = (v: number) => g.angles[v]!;
  const S = (v: number) => g.sides[v]!;
  if (ks.length === 3) {
    // SSS: corners by circle intersection
    const [a, b, c] = [S(0), S(1), S(2)];
    if (!(a < b + c && b < a + c && c < a + b)) return [];
    const x = (b * b + c * c - a * a) / (2 * c);
    const y = Math.sqrt(b * b - x * x);
    return [measure([{ x: 0, y: 0 }, { x: c, y: 0 }, { x, y }])];
  }
  if (ka.length >= 2) {
    // two angles and a side: rays from the ends of a known side, or the
    // third angle first when the known side is opposite a given angle
    const angles = [0, 1, 2].map((v) => (g.angles[v] !== null ? A(v) : 180 - ka.reduce((s, u) => s + A(u), 0)));
    const k = ks[0];
    const [u, w] = [0, 1, 2].filter((v) => v !== k);
    // side k joins corners u and w; the rays at u and w meet at k
    const len = S(k);
    const tu = Math.tan(angles[u] * D);
    const tw = Math.tan(angles[w] * D);
    // corner u at (0,0), corner w at (len, 0), apex at x with y = x tan(U) = (len - x) tan(W)
    const x = angles[u] === 90 ? 0 : angles[w] === 90 ? len : (len * tw) / (tu + tw);
    const y = angles[u] === 90 ? len * tw : x * tu;
    const pts: { x: number; y: number }[] = [];
    pts[u] = { x: 0, y: 0 };
    pts[w] = { x: len, y: 0 };
    pts[k] = { x, y };
    return [measure(pts)];
  }
  if (ka.length === 1 && ks.length === 2) {
    const G = ka[0];
    if (!ks.includes(G)) {
      // SAS: the angle between the two known sides
      const [u, w] = ks;
      // corner G at the origin; side u runs from G to corner w, side w from G to corner u
      const pts: { x: number; y: number }[] = [];
      const c = sasCorners(A(G), S(u), S(w));
      pts[G] = c[0];
      pts[w] = c[1];
      pts[u] = c[2];
      return [measure(pts)];
    }
    // SSA: angle G, side g opposite it, side h. With corner G at the origin
    // and side h along a ray at angle G, the third corner lies on the x-axis
    // at distance w from G where g² = h² + w² − 2hw cos G.
    const h = ks.find((v) => v !== G)!;
    const [g0, h0] = [S(G), S(h)];
    const cos = Math.cos(A(G) * D);
    const disc = (h0 * cos) ** 2 - (h0 * h0 - g0 * g0);
    if (disc < 0) return [];
    const ws = [h0 * cos - Math.sqrt(disc), h0 * cos + Math.sqrt(disc)].filter((w) => w > 1e-9);
    const unique = ws.filter((w, i) => ws.findIndex((x) => Math.abs(x - w) < 1e-9) === i);
    const W = 3 - G - h;
    return unique.map((w) => {
      const pts: { x: number; y: number }[] = [];
      // corner G at the origin; side h joins G and corner W (along the ray); side W joins G and corner h (on the x-axis)
      pts[G] = { x: 0, y: 0 };
      pts[h] = { x: w, y: 0 };
      pts[W] = { x: h0 * Math.cos(A(G) * D), y: h0 * Math.sin(A(G) * D) };
      return measure(pts);
    });
  }
  throw new Error(`cannot solve from ${JSON.stringify(g)}`);
}

/** Area by the shoelace formula from a triangle's corners, rebuilt from its three sides. */
export function shoelaceArea(t: Solved): number {
  const [a, b, c] = t.sides;
  const x = (b * b + c * c - a * a) / (2 * c);
  const y = Math.sqrt(Math.max(0, b * b - x * x));
  const P = [
    [0, 0],
    [c, 0],
    [x, y],
  ];
  let s = 0;
  for (let i = 0; i < 3; i++) s += P[i][0] * P[(i + 1) % 3][1] - P[(i + 1) % 3][0] * P[i][1];
  return Math.abs(s) / 2;
}

// ------------------------------------------------------------------ reading what is printed

/** "38.2°" -> 38.2; "12.4" or "12 cm" -> 12.4 / 12; anything else (x, θ, ?, a) -> null. */
export function labelNumber(text: string): number | null {
  const m = text.match(/^(\d+(?:\.\d+)?)(°| [a-z]+)?$/);
  return m ? Number(m[1]) : null;
}

/** The number of decimals a printed number has. */
export const decimals = (s: string): number => (s.includes(".") ? s.split(".")[1].length : 0);

/** A printed value: "12.4", "38.2^{\circ}", "24.5\,\text{cm}^{2}" -> its number and its decimal places. */
export function printedValue(latex: string): { value: number; places: number; unit: string | null; degrees: boolean } {
  const m = latex.trim().match(/^(\d+(?:\.\d+)?)(\^\{\\circ\})?(?:\\,\\text\{([a-z]+)\}(\^\{2\})?)?$/);
  if (!m) throw new Error(`not a printed value: ${latex}`);
  return { value: Number(m[1]), places: decimals(m[1]), unit: m[3] ?? null, degrees: !!m[2] };
}

/** Within the stated rounding of the true value, with no more places than asked. */
export function expectRoundedTo(printed: string, truth: number, places: number, what = ""): void {
  const v = printedValue(printed);
  expect(v.places, `${what}: ${printed} has too many places`).toBeLessThanOrEqual(places);
  expect(Math.abs(v.value - truth), `${what}: ${printed} vs true ${truth}`).toBeLessThanOrEqual(0.5 * 10 ** -places + 1e-9);
  // and not on a rounding boundary, where a calculator could print either
  const frac = Math.abs(truth * 10 ** places) % 1;
  expect(Math.abs(frac - 0.5), `${what}: ${truth} is on a rounding boundary`).toBeGreaterThan(0.05);
}

/** "A = 38.2^{\circ};\quad b = 12.4" -> { A: "38.2^{\circ}", b: "12.4" }. */
export function answerParts(answer: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of answer.split(ANSWER_PART_SEPARATOR)) {
    const m = part.match(/^([A-Ca-c](?:_\{\d\})?) = (.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export interface DiagramReading {
  givens: Givens;
  /** The unknowns' places and their marks. */
  unknownAngles: { v: number; mark: string }[];
  unknownSides: { v: number; mark: string }[];
}

const NAMES = ["A", "B", "C"];

/** The givens and unknowns as printed on a triangle diagram (corners in any order, by name). */
export function readDiagram(spec: TriangleSpec): DiagramReading {
  const givens: Givens = { angles: [null, null, null], sides: [null, null, null] };
  const unknownAngles: { v: number; mark: string }[] = [];
  const unknownSides: { v: number; mark: string }[] = [];
  for (const c of spec.corners) {
    const v = NAMES.indexOf(c.name ?? "");
    expect(v, `corner name ${c.name}`).toBeGreaterThanOrEqual(0);
    for (const [label, known, unknown] of [
      [c.angle, givens.angles, unknownAngles],
      [c.opposite, givens.sides, unknownSides],
    ] as const) {
      if (!label) continue;
      const n = labelNumber(label.text);
      if (n === null) unknown.push({ v, mark: label.text });
      else known[v] = n;
    }
  }
  return { givens, unknownAngles, unknownSides };
}

/** The diagram's corners by vertex A, B, C. */
export function cornersByName(spec: TriangleSpec): TriangleCorner[] {
  return NAMES.map((n) => spec.corners.find((c) => c.name === n)!);
}

/**
 * The drawn triangle matches every number printed on it: angles to within
 * their rounding, and lengths in proportion (one scale for every side).
 */
export function expectDrawnToLabels(spec: TriangleSpec, places: number): void {
  const cs = cornersByName(spec);
  const m = measure(cs);
  // the scale from a given (whole-number) side, so a rounded Answer's error does not leak into it
  const given = cs.findIndex((c) => c.opposite && !c.opposite.answer && labelNumber(c.opposite.text) !== null);
  let scale: number | null = given >= 0 ? m.sides[given] / labelNumber(cs[given].opposite!.text)! : null;
  const tol = 0.5 * 10 ** -places + 1e-6;
  cs.forEach((c, v) => {
    const a = c.angle ? labelNumber(c.angle.text) : null;
    if (a !== null) expect(Math.abs(m.angles[v] - a), `angle ${NAMES[v]}: drawn ${m.angles[v]}, labelled ${a}`).toBeLessThanOrEqual(tol);
    const s = c.opposite ? labelNumber(c.opposite.text) : null;
    if (s !== null) {
      scale ??= m.sides[v] / s;
      expect(Math.abs(m.sides[v] / scale - s), `side ${NAMES[v]}: drawn ${m.sides[v] / scale}, labelled ${s}`).toBeLessThanOrEqual(
        tol * 1.5 + 1e-6 * s,
      );
    }
  });
}

/**
 * The answer graph is the student's graph with only the unknowns' labels
 * replaced, each by the printed value (in the key colour); returns the
 * replaced labels by place.
 */
export function expectOnlyUnknownsReplaced(graph: TriangleSpec, answer: TriangleSpec): Map<string, TriangleLabel> {
  const replaced = new Map<string, TriangleLabel>();
  expect(answer.corners.length).toBe(3);
  graph.corners.forEach((c, i) => {
    const a = answer.corners[i];
    expect({ x: a.x, y: a.y, name: a.name, rightAngle: a.rightAngle }).toEqual({ x: c.x, y: c.y, name: c.name, rightAngle: c.rightAngle });
    for (const key of ["angle", "opposite"] as const) {
      const s = c[key];
      const t = a[key];
      if (s && labelNumber(s.text) === null) {
        expect(t?.answer, `${c.name} ${key}: the unknown is answered`).toBe(true);
        expect(labelNumber(t!.text), `${c.name} ${key}: answered with a number`).not.toBeNull();
        replaced.set(`${key}:${c.name}`, t!);
      } else {
        expect(t, `${c.name} ${key}: a given is unchanged`).toEqual(s);
      }
    }
  });
  return replaced;
}

/** The numbers in a prompt's prose and math: lengths, and angles (followed by ^{\circ}). */
export function promptNumbers(prompt: string): { lengths: number[]; angles: number[] } {
  const lengths: number[] = [];
  const angles: number[] = [];
  for (const m of prompt.matchAll(/(\d+(?:\.\d+)?)(\^\{\\circ\})?/g)) (m[2] ? angles : lengths).push(Number(m[1]));
  return { lengths, angles };
}

/** Distractors distinct, never the Answer, and printed like it. */
export function expectGoodDistractors(p: Problem, choiceKey: (s: string) => string): void {
  const values = [p.answer, ...p.distractorHints].map(choice =>
    choiceKey(choice.replace(/\d+(?:\.\d+)?/g, n => String(Number(n)))),
  );
  expect(new Set(values).size).toBe(values.length);
  const keys = p.distractorHints.map(choiceKey);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).not.toContain(choiceKey(p.answer));
  for (const d of p.distractorHints) {
    expect(d).not.toMatch(/NaN|Infinity|-/);
  }
}

/** "38.2^{\circ}" -> "38.2°", "12.4" -> "12.4": how a printed value is labelled on a diagram. */
export const asLabel = (latex: string): string => latex.replace("^{\\circ}", "°");

/** Smallest angle of a drawn triangle. */
export const drawnMinAngle = (spec: TriangleSpec): number => Math.min(...measure(cornersByName(spec)).angles);

/**
 * A diagram Problem of the Laws of Sines or Cosines is right: its givens fix
 * exactly one triangle (solved here from scratch), the drawing matches every
 * label, the Answer is that triangle's unknown part(s) to the stated places,
 * and the answer graph replaces only the unknowns' labels, each with the
 * Answer. Returns what was read, for option checks.
 */
export function expectDiagramProblemRight(p: Problem, places: number, whole: boolean): DiagramReading {
  expect(p.graph?.kind).toBe("triangle");
  expect(p.answerGraph?.kind).toBe("triangle");
  const graph = p.graph as TriangleSpec;
  const answerGraph = p.answerGraph as TriangleSpec;
  const r = readDiagram(graph);
  const sols = solveIndependently(r.givens);
  expect(sols.length, `${JSON.stringify(r.givens)} fixes exactly one triangle`).toBe(1);
  const t = sols[0];
  expectDrawnToLabels(graph, 4);
  expectDrawnToLabels(answerGraph, places);
  expect(drawnMinAngle(graph)).toBeGreaterThanOrEqual(15 - 1e-4);
  const replaced = expectOnlyUnknownsReplaced(graph, answerGraph);
  const known = (r.givens.angles.filter((x) => x !== null).length + r.givens.sides.filter((x) => x !== null).length);
  expect(known).toBe(3);
  if (whole) {
    // every part not given is asked for, by name, and only those
    const want = [
      ...r.unknownAngles.map((u) => NAMES[u.v]),
      ...r.unknownSides.map((u) => NAMES[u.v].toLowerCase()),
    ].sort();
    expect(r.unknownAngles.length + r.unknownSides.length).toBe(3);
    const got = answerParts(p.answer);
    expect(Object.keys(got).sort()).toEqual(want);
    for (const u of r.unknownAngles) {
      expect(u.mark).toBe("?");
      expectRoundedTo(got[NAMES[u.v]], t.angles[u.v], places, NAMES[u.v]);
      expect(printedValue(got[NAMES[u.v]]).degrees).toBe(true);
      expect(replaced.get(`angle:${NAMES[u.v]}`)?.text).toBe(asLabel(got[NAMES[u.v]]));
    }
    for (const u of r.unknownSides) {
      const n = NAMES[u.v].toLowerCase();
      expect(u.mark).toBe("?");
      expectRoundedTo(got[n], t.sides[u.v], places, n);
      expect(replaced.get(`opposite:${NAMES[u.v]}`)?.text).toBe(asLabel(got[n]));
    }
  } else {
    expect(r.unknownAngles.length + r.unknownSides.length).toBe(1);
    if (r.unknownAngles.length) {
      const u = r.unknownAngles[0];
      expect(u.mark).toBe("θ");
      expect(printedValue(p.answer).degrees).toBe(true);
      expectRoundedTo(p.answer, t.angles[u.v], places, "θ");
      expect(replaced.get(`angle:${NAMES[u.v]}`)?.text).toBe(asLabel(p.answer));
    } else {
      const u = r.unknownSides[0];
      expect(u.mark).toBe("x");
      expect(printedValue(p.answer).degrees).toBe(false);
      expectRoundedTo(p.answer, t.sides[u.v], places, "x");
      expect(replaced.get(`opposite:${NAMES[u.v]}`)?.text).toBe(asLabel(p.answer));
    }
  }
  return r;
}

/** The ambiguous case's givens read back from its prompt: "G = 40^{\circ}, g = 9, and h = 12". */
export function readSsaPrompt(prompt: string) {
  const angle = prompt.match(/([ABC]) = (\d+)\^\{\\circ\}/)!;
  const sides = [...prompt.matchAll(/\b([abc]) = (\d+)/g)];
  expect(sides.length).toBe(2);
  const givens: Givens = { angles: [null, null, null], sides: [null, null, null] };
  givens.angles[NAMES.indexOf(angle[1])] = Number(angle[2]);
  for (const s of sides) givens.sides[NAMES.indexOf(s[1].toUpperCase())] = Number(s[2]);
  const g = NAMES.indexOf(angle[1]);
  const h = NAMES.indexOf(sides.map((s) => s[1].toUpperCase()).find((n) => NAMES.indexOf(n) !== g)!);
  return { givens, g, h, w: 3 - g - h };
}

/** Check an ambiguous-case Problem against an independent count and solve; returns the count. */
export function expectAmbiguousRight(prompt: string, answer: string, places: number, whole: boolean): number {
  const { givens, g, h, w } = readSsaPrompt(prompt);
  const sols = solveIndependently(givens).sort((x, y) => x.angles[h] - y.angles[h]);
  // the count is clear-cut: nudging any given a little does not change it
  for (const [d, key] of [[0.05, "angles"], [-0.05, "angles"], [0.02, "sides"], [-0.02, "sides"]] as const) {
    for (const v of [g, h]) {
      if (givens[key][v] === null) continue;
      const nudged: Givens = { angles: [...givens.angles], sides: [...givens.sides] };
      nudged[key][v] = givens[key][v]! + d;
      expect(solveIndependently(nudged).length, `count near a boundary: ${prompt}`).toBe(sols.length);
    }
  }
  if (sols.length === 0) {
    expect(answer).toBe("\\text{no triangle}");
    return 0;
  }
  const [head] = answer.split(ANSWER_PART_SEPARATOR);
  expect(head).toBe(`\\text{${sols.length} triangle${sols.length === 2 ? "s" : ""}}`);
  const got = answerParts(answer);
  const want: string[] = [];
  sols.forEach((t, i) => {
    const sub = sols.length === 2 ? `_{${i + 1}}` : "";
    const H = NAMES[h] + sub;
    want.push(H);
    expectRoundedTo(got[H], t.angles[h], places, H);
    if (whole) {
      const W = NAMES[w] + sub;
      const wl = NAMES[w].toLowerCase() + sub;
      want.push(W, wl);
      expectRoundedTo(got[W], t.angles[w], places, W);
      expectRoundedTo(got[wl], t.sides[w], places, wl);
    }
    // no sliver triangles even without a diagram
    expect(Math.min(...t.angles)).toBeGreaterThanOrEqual(10 - 1e-9);
  });
  expect(Object.keys(got).sort()).toEqual(want.sort());
  return sols.length;
}

const UNITS: Record<string, string> = { miles: "mi", meters: "m", kilometers: "km", feet: "ft" };

/** A word problem solved from the numbers in its prompt: SAS (two lengths and the angle between) or SSS. */
export function expectWordProblemRight(p: Problem, places: number): "side" | "angle" {
  const { lengths, angles } = promptNumbers(p.prompt);
  if (p.prompt.includes("all missing measurements")) {
    const { givens } = readNamedGivens(p.prompt);
    const [t] = solveIndependently(givens);
    const parts = answerParts(p.answer);
    const unit = UNITS[p.prompt.match(/lengths in (\w+)/)![1]];
    expect(Object.keys(parts)).toHaveLength(3);
    for (const [i, name] of NAMES.entries()) {
      if (givens.angles[i] === null) {
        expect(printedValue(parts[name]).degrees).toBe(true);
        expectRoundedTo(parts[name], t.angles[i], places, name);
      }
      if (givens.sides[i] === null) {
        const side = name.toLowerCase();
        expect(printedValue(parts[side]).unit).toBe(unit);
        expectRoundedTo(parts[side], t.sides[i], places, side);
      }
    }
    return angles.length ? "side" : "angle";
  }
  const unitWord = p.prompt.match(/\d+ (miles|meters|kilometers|feet)/)![1];
  if (angles.length === 1) {
    expect(lengths.length).toBe(2);
    const [t] = solveIndependently({ angles: [angles[0], null, null], sides: [null, lengths[0], lengths[1]] });
    const v = printedValue(p.answer);
    expect(v.unit).toBe(UNITS[unitWord]);
    expectRoundedTo(p.answer, t.sides[0], places, "distance");
    expect(Math.min(...t.angles)).toBeGreaterThanOrEqual(10 - 1e-9);
    return "side";
  }
  expect(angles.length).toBe(0);
  expect(lengths.length).toBe(3);
  expect(new Set(lengths).size).toBe(3);
  const [t] = solveIndependently({ angles: [null, null, null], sides: lengths });
  const want = p.prompt.includes("largest") ? Math.max(...t.angles) : Math.min(...t.angles);
  expect(p.prompt).toMatch(/largest|smallest/);
  expect(printedValue(p.answer).degrees).toBe(true);
  expectRoundedTo(p.answer, want, places, "angle");
  expect(Math.min(...t.angles)).toBeGreaterThanOrEqual(10 - 1e-9);
  return "angle";
}

function readNamedGivens(prompt: string): { givens: Givens } {
  const givens: Givens = { angles: [null, null, null], sides: [null, null, null] };
  for (const [, name, value] of prompt.matchAll(/([ABCabc]) = (\d+)/g)) {
    const isAngle = name === name.toUpperCase();
    (isAngle ? givens.angles : givens.sides)[NAMES.indexOf(name.toUpperCase())] = Number(value);
  }
  return { givens };
}

/** The places the prompt asks for: 2 for "nearest hundredth", 1 for "nearest tenth". */
export function promptPlaces(prompt: string): number {
  const m = prompt.match(/nearest (tenth|hundredth)/);
  expect(m, `no rounding stated: ${prompt}`).not.toBeNull();
  return m![1] === "hundredth" ? 2 : 1;
}

export function checkArea(p: Problem, places: number): string {
  let givens: Givens;
  let unit: string | null;
  if (p.graph?.kind === "triangle") {
    givens = readDiagram(p.graph).givens;
    expectDrawnToLabels(p.graph, 4);
    const labels = p.graph.corners.flatMap(c => c.opposite ? [c.opposite.text] : []);
    unit = labels[0].split(" ")[1] ?? null;
    for (const label of labels) expect(label.split(" ")[1] ?? null).toBe(unit);
  } else {
    const { angles, lengths } = promptNumbers(p.prompt);
    const units: Record<string, string> = { feet: "ft", meters: "m", yards: "yd" };
    unit = units[p.prompt.match(/\d+ (feet|meters|yards)/)![1]];
    givens = angles.length === 2
      ? { angles: [angles[0], angles[1], null], sides: [null, null, lengths[0]] }
      : angles.length === 1
        ? { angles: [angles[0], null, null], sides: [null, ...lengths] }
        : { angles: [null, null, null], sides: lengths };
  }
  const [t] = solveIndependently(givens);
  expect(Math.min(...t.angles)).toBeGreaterThanOrEqual((p.graph ? 15 : 10) - 1e-8);
  expectRoundedTo(p.answer, shoelaceArea(t), places, "area");
  expect(printedValue(p.answer).unit).toBe(unit);
  expect(p.answer.endsWith("^{2}")).toBe(!!unit);
  return ["sss", "sas", "asa"][givens.angles.filter(a => a !== null).length];
}
