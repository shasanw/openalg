// "Area of triangles": the area from two sides and the angle between them
// (½ab sin C), from three sides (Heron's formula), or from two angles and a
// side (find a second side by the Law of Sines first), from a diagram or in a
// word problem. Lengths may carry a unit, and the area is then in that unit
// squared.
//
// Choose a complete triangle, round the measurements that will be printed,
// then recompute the requested parts from those givens at full precision.


import { createRng, type Rng } from "../../rng";
import { prose } from "../../format";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints } from "../shared/equationKit";
import { roundTo } from "./trigKit";
import {
  VERTICES,
  areaTex,
  isClean,
  minAngle,
  others,
  placeWord,
  placesOf,
  plausible,
  pickTriangle,
  sideSpread,
  sinD,
  cosD,
  third,
  triDiagram,
  triFromAngles,
  triFromSAS,
  triFromSides,
  type Mark,
  type Marks,
  type Places,
  type Tri,
  type Vertex,
} from "./obliqueKit";

export const TRIANGLE_AREA_ID = "triangle-area";

export type AreaGiven = "sas" | "sss" | "asa";

export const schema = [
  {
    type: "enum",
    key: "given",
    label: "Given",
    default: "mixed",
    options: [
      { value: "mixed", label: "Any of these" },
      { value: "sas", label: "Two sides and the angle between (SAS)" },
      { value: "sss", label: "Three sides (Heron's formula)" },
      { value: "asa", label: "Two angles and a side (ASA, AAS)" },
    ],
  },
  { type: "boolean", key: "units", label: "Lengths in units (cm, in, ft)", default: false },
  {
    type: "enum",
    key: "context",
    label: "Problems are",
    default: "diagrams",
    options: [
      { value: "diagrams", label: "Triangle diagrams" },
      { value: "mixed", label: "Diagrams and word problems" },
      { value: "word", label: "Word problems only" },
    ],
  },
  {
    type: "enum",
    key: "rounding",
    label: "Round to",
    default: "tenth",
    options: [
      { value: "tenth", label: "The nearest tenth" },
      { value: "hundredth", label: "The nearest hundredth" },
    ],
  },
] as const satisfies ParamSchema;

const MIN_DRAWN = 15;
const MIN_UNDRAWN = 10;
const MAX_SPREAD = 4;
const DIAGRAM_UNITS = ["cm", "in", "ft"] as const;

export interface TriangleAreaConstruction {
  given: AreaGiven;
  t: Tri;
  /** sas: the vertex of the given angle. asa: the given side. sss: unused (0). */
  v: Vertex;
  /** asa: the vertices whose angles are given. */
  angles: Vertex[];
  area: number;
  unit: string;
  places: Places;
  /** A word problem's template, or -1 for a diagram. */
  story: number;
}

const r2 = (x: number) => roundTo(x, 2);

/** Heron's formula. */
export const heron = (a: number, b: number, c: number): number => {
  const s = (a + b + c) / 2;
  return Math.sqrt(s * (s - a) * (s - b) * (s - c));
};

/** ½·(side x)·(side y)·sin(the angle between them). */
const halfAbSin = (t: Tri, x: Vertex, y: Vertex) => 0.5 * t.sides[x] * t.sides[y] * sinD(t.angles[third(x, y)]);

/** Word problems by kind of givens: their unit and how much the chosen whole numbers are scaled. */
const STORIES: Record<AreaGiven, readonly { unit: string; scale: number }[]> = {
  sas: [
    { unit: "ft", scale: 1 },
    { unit: "m", scale: 10 },
  ],
  sss: [
    { unit: "ft", scale: 1 },
    { unit: "yd", scale: 1 },
  ],
  asa: [{ unit: "m", scale: 10 }],
};

export function construct(params: ParamValues, rng: Rng): TriangleAreaConstruction {
  const r = resolveParams(schema, params);
  const places = placesOf(r.rounding);
  const given: AreaGiven = r.given === "mixed" ? rng.pick(["sas", "sss", "asa"] as const) : (r.given as AreaGiven);
  const word = r.context === "word" || (r.context === "mixed" && rng.bool(0.4));
  const story = word ? rng.int(0, STORIES[given].length - 1) : -1;
  const scale = word ? STORIES[given][story].scale : 1;
  const unit = word ? STORIES[given][story].unit : r.units ? rng.pick(DIAGRAM_UNITS) : "";
  const min = word ? MIN_UNDRAWN : MIN_DRAWN;
  for (;;) {
    const original = pickTriangle(rng);
    let t: Tri | null;
    let v: Vertex = 0;
    let angles: Vertex[] = [];
    let area: number;
    if (given === "sas") {
      v = rng.pick(VERTICES);
      // not nearly right: sin C would round to 1 and ½ab would be the Answer
      if (Math.abs(original.angles[v] - 90) < 5) continue;
      const [x, y] = others(v);
      t = triFromSAS(v, original.angles[v], Math.round(original.sides[x] * scale), Math.round(original.sides[y] * scale));
      area = halfAbSin(t, x, y);
    } else if (given === "sss") {
      t = triFromSides(original.sides.map(Math.round) as Tri["sides"]);
      if (!t) continue;
      area = heron(...t.sides);
    } else {
      v = rng.pick(VERTICES);
      // a word problem's baseline lies between its two given angles (ASA)
      angles = word || rng.bool() ? others(v) : [v, rng.pick(others(v))];
      t = triFromAngles(original.angles, v, Math.round(original.sides[v] * scale));
      const [p] = others(v);
      area = halfAbSin(t, v, p);
    }
    if (minAngle(t) < min || (!word && sideSpread(t) > MAX_SPREAD)) continue;
    if (!isClean(area, places)) continue;
    return { given, t, v, angles, area, unit, places, story };
  }
}

// ------------------------------------------------------------------ printing

export const answerLatex = (k: TriangleAreaConstruction): string => areaTex(k.area, k.places, k.unit);

const UNIT_WORDS: Record<string, string> = { ft: "feet", m: "meters", yd: "yards" };
const SQUARE_WORDS: Record<string, string> = { ft: "square foot", m: "square meter", yd: "square yard" };

function storyLatex(k: TriangleAreaConstruction): string {
  const w = UNIT_WORDS[k.unit];
  const round = `Round to the nearest ${placeWord(k.places)} of a ${SQUARE_WORDS[k.unit]}.`;
  const deg = (x: number) => `${x}^{\\circ}`;
  const S = k.t.sides;
  if (k.given === "sas") {
    const [x, y] = others(k.v);
    const A = k.t.angles[k.v];
    if (k.story === 0) {
      return `${prose(`Two edges of a triangular sail are ${S[x]} ${w} and ${S[y]} ${w} long and meet at an angle of `)}${deg(A)}${prose(
        `. Find the area of the sail. ${round}`,
      )}`;
    }
    return `${prose(`A triangular plot of land has two sides of ${S[x]} ${w} and ${S[y]} ${w}, with an angle of `)}${deg(A)}${prose(
      ` between them. Find the area of the plot. ${round}`,
    )}`;
  }
  if (k.given === "sss") {
    const [a, b, c] = S;
    if (k.story === 0) return prose(`A triangular garden has sides of ${a} ${w}, ${b} ${w} and ${c} ${w}. Find the area of the garden. ${round}`);
    return prose(`A triangular patch of lawn has sides of ${a} ${w}, ${b} ${w} and ${c} ${w}. Find its area. ${round}`);
  }
  const [x, y] = others(k.v);
  return `${prose(`Two corners of a triangular field are ${S[k.v]} ${w} apart. The angles at those two corners, between the side joining them and the other two sides, are `)}${deg(
    k.t.angles[x],
  )}${prose(" and ")}${deg(k.t.angles[y])}${prose(`. Find the area of the field. ${round}`)}`;
}

export function promptLatex(k: TriangleAreaConstruction): string {
  if (k.story >= 0) return storyLatex(k);
  return prose(`Find the area, to the nearest ${placeWord(k.places)}.`);
}

function marksOf(k: TriangleAreaConstruction): Marks {
  const angles: [Mark, Mark, Mark] = [null, null, null];
  const sides: [Mark, Mark, Mark] = [null, null, null];
  const len = (x: number) => ({ text: k.unit ? `${x} ${k.unit}` : String(x) });
  if (k.given === "sas") {
    angles[k.v] = { text: `${k.t.angles[k.v]}°` };
    for (const u of others(k.v)) sides[u] = len(k.t.sides[u]);
  } else if (k.given === "sss") {
    for (const u of VERTICES) sides[u] = len(k.t.sides[u]);
  } else {
    sides[k.v] = len(k.t.sides[k.v]);
    for (const u of k.angles) angles[u] = { text: `${k.t.angles[u]}°` };
  }
  return { angles, sides };
}

/**
 * Mistake-based Distractors, printed like the Answer:
 * - the ½ forgotten (ab sin C), sin C left out (½ab, as if right-angled),
 *   or both (ab);
 * - cos C used for sin C;
 * - Heron: the square root forgotten, the perimeter used for the
 *   semiperimeter, ½ put in front of the square root, s rounded to a whole
 *   number too early;
 * - two angles and a side: the second side by the wrong ratio (sin of the
 *   known side's angle over sin of its own), the second side rounded to a
 *   whole number before use, a given angle used in place of the angle between
 *   the two sides;
 * - the calculator in radians mode.
 */
export function distractors(k: TriangleAreaConstruction): string[] {
  const show = (x: number) => (plausible(x) ? areaTex(x, k.places, k.unit) : null);
  const t = k.t;
  const S = t.sides;
  const A = t.angles;
  const cands: (number | null)[] = [];
  if (k.given === "sas") {
    const [x, y] = others(k.v);
    const G = A[k.v];
    const ab = S[x] * S[y];
    cands.push(ab * sinD(G), 0.5 * ab * cosD(G), 0.5 * ab * Math.sin(G), 0.5 * ab, 0.5 * ab * r2(sinD(G)), ab);
  } else if (k.given === "sss") {
    const [a, b, c] = S;
    const s = (a + b + c) / 2;
    const P = a + b + c;
    const prod = s * (s - a) * (s - b) * (s - c);
    const S2 = Math.round(s);
    const sorted = [...S].sort((m, n) => m - n);
    cands.push(prod, Math.sqrt(P * (P - a) * (P - b) * (P - c)), 0.5 * Math.sqrt(prod));
    cands.push(Math.sqrt(S2 * (S2 - a) * (S2 - b) * (S2 - c)), 0.5 * sorted[0] * sorted[1]);
  } else {
    const kv = k.v;
    const j = others(kv)[0];
    const between = A[third(kv, j)];
    const K = A[kv];
    const sk = S[kv];
    const area = (sj: number, ang = between) => 0.5 * sk * sj * sinD(ang);
    cands.push(2 * k.area);
    cands.push(area((sk * sinD(K)) / sinD(A[j])));
    cands.push(area(Math.round(S[j])));
    cands.push(area(S[j], A[j]));
    cands.push(0.5 * sk * ((sk * Math.sin(A[j])) / Math.sin(K)) * Math.sin(between));
  }
  return distinctHints(
    answerLatex(k),
    cands.map((x) => (x === null ? null : show(x))),
  ).slice(0, 6);
}

export const generator: Generator = {
  id: TRIANGLE_AREA_ID,
  title: "Area of triangles",
  defaultDirections: "Find the area of each triangle.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const rng = createRng(seed);
    const k = construct(resolved, rng);
    const problem: Problem = {
      kind: "generated",
      generatorId: TRIANGLE_AREA_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
    if (k.story < 0) problem.graph = triDiagram(rng, k.t, marksOf(k)).graph;
    return problem;
  },
};
