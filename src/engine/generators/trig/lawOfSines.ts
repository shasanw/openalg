// "The Law of Sines": find a side from two angles and a side (AAS, ASA), find
// an angle from two sides and the angle opposite one of them (SSA, where only
// one triangle fits), or say how many triangles fit an SSA triple (the
// ambiguous case: none, one or two) and solve each. Any of them can ask for
// the whole triangle.
//
// Choose a complete triangle, round the measurements that will be printed,
// then recompute the requested parts from those givens at full precision.


import { createRng, type Rng } from "../../rng";
import { prose } from "../../format";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints } from "../shared/equationKit";
import { roundTo } from "./trigKit";
import {
  ANGLE_NAMES,
  SIDE_NAMES,
  VERTICES,
  acosD,
  asinD,
  cosD,
  degLabel,
  degTex,
  isClean,
  lenLabel,
  lenTex,
  others,
  parts,
  pickTriangle,
  placeWord,
  placesOf,
  plausible,
  rounded,
  sinD,
  third,
  triDiagram,
  triFromAngles,
  type Mark,
  type Marks,
  type Places,
  type Tri,
  type Vertex,
} from "./obliqueKit";
import type { TriangleSpec } from "../../plot";

export const LAW_OF_SINES_ID = "law-of-sines";

export type LawOfSinesProblems = "mixed" | "side" | "angle" | "ambiguous" | "all";

export const schema = [
  {
    type: "enum",
    key: "problems",
    label: "Problems",
    default: "mixed",
    options: [
      { value: "mixed", label: "Find a side or an angle" },
      { value: "side", label: "Find a side (AAS and ASA)" },
      { value: "angle", label: "Find an angle (SSA, one triangle)" },
      { value: "ambiguous", label: "How many triangles? (the ambiguous case)" },
      { value: "all", label: "All of these" },
    ],
  },
  { type: "boolean", key: "solveTriangle", label: "Solve the whole triangle", default: false },
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

/** Smallest angle in a drawn triangle, and in an ambiguous-case triangle (not drawn). */
const MIN_DRAWN = 15;
const MIN_UNDRAWN = 10;

/** Two angles and a side: find another side (or solve). */
export interface SideConstruction {
  kind: "side";
  t: Tri;
  /** The given side. */
  known: Vertex;
  /** The vertices whose angles are given. */
  given: [Vertex, Vertex];
  /** The side asked for (when not solving the whole triangle). */
  unknown: Vertex;
}

/** SSA with one triangle: angle g, the side opposite it and side h; find angle h. */
export interface AngleConstruction {
  kind: "angle";
  t: Tri;
  g: Vertex;
  h: Vertex;
}

/** One solved triangle of the ambiguous case: the angle at h, the angle at w and side w. */
export interface SsaSolution {
  H: number;
  W: number;
  sw: number;
}

/** SSA: angle g, side g and side h given; 0, 1 or 2 triangles. */
export interface AmbiguousConstruction {
  kind: "ambiguous";
  g: Vertex;
  h: Vertex;
  Ag: number;
  sg: number;
  sh: number;
  solutions: SsaSolution[];
  /** Zero triangles because angle g is obtuse and side g is not the longest (sin h < 1 all the same). */
  obtuseNone: boolean;
}

export type LawOfSinesConstruction = (SideConstruction | AngleConstruction | AmbiguousConstruction) & {
  places: Places;
  whole: boolean;
};

const r2 = (x: number) => roundTo(x, 2);

function constructSide(rng: Rng, p: Places, whole: boolean): SideConstruction {
  for (;;) {
    const original = pickTriangle(rng);
    const angles = original.angles;
    if (Math.max(...angles) > 140) continue;
    // no two equal angles: an isosceles triangle hands over the side asked for
    if (angles.some((x, i) => angles.some((y, j) => i < j && Math.abs(x - y) < 3))) continue;
    const known = rng.pick(VERTICES);
    const asa = rng.bool();
    const given: [Vertex, Vertex] = asa ? others(known) : [known, rng.pick(others(known))];
    const t = triFromAngles(angles, known, Math.round(original.sides[known]));
    const unknown = rng.pick(others(known));
    const asked = whole ? others(known) : [unknown];
    if (!asked.every((v) => isClean(t.sides[v], p) && t.sides[v] < 100)) continue;
    return { kind: "side", t, known, given, unknown };
  }
}

function constructAngle(rng: Rng, p: Places, whole: boolean): AngleConstruction {
  for (;;) {
    const g = rng.pick(VERTICES);
    const h = rng.pick(others(g));
    const w = third(g, h);
    const original = pickTriangle(rng);
    const Ag = original.angles[g];
    const sh = Math.round(original.sides[h]);
    const sg = Math.round(original.sides[g]);
    if (sg <= sh) continue;
    const H = asinD((sh * sinD(Ag)) / sg);
    const W = 180 - Ag - H;
    if (!(H >= MIN_DRAWN && W >= MIN_DRAWN)) continue;
    const angles: [number, number, number] = [0, 0, 0];
    angles[g] = Ag;
    angles[h] = H;
    angles[w] = W;
    const t = triFromAngles(angles, g, sg);
    t.sides[h] = sh; // exactly the given, not sg·sin H / sin G recomputed
    if (!isClean(H, p)) continue;
    if (whole) {
      if (!isClean(t.sides[w], p)) continue;
      // a student who rounds the angle at h before going on gets the same Answers
      const W2 = 180 - Ag - rounded(H, p);
      if (rounded(W2, p) !== rounded(W, p)) continue;
      if (rounded((sg * sinD(W2)) / sinD(Ag), p) !== rounded(t.sides[w], p)) continue;
    }
    return { kind: "angle", t, g, h };
  }
}

/** The triangles fitting angle Ag opposite side sg, with side sh: 0, 1 or 2 of them. */
export function ssaSolutions(Ag: number, sg: number, sh: number): SsaSolution[] {
  const sinH = (sh * sinD(Ag)) / sg;
  if (sinH > 1) return [];
  const H1 = asinD(sinH);
  const out: SsaSolution[] = [];
  for (const H of [H1, 180 - H1]) {
    const W = 180 - Ag - H;
    if (W > 0 && !out.some((s) => Math.abs(s.H - H) < 1e-9)) out.push({ H, W, sw: (sg * sinD(W)) / sinD(Ag) });
  }
  return out;
}

function constructAmbiguous(rng: Rng, p: Places, whole: boolean): AmbiguousConstruction {
  const count = rng.pick([0, 1, 2]);
  for (;;) {
    const g = rng.pick(VERTICES);
    const h = rng.pick(others(g));
    let Ag: number, sg: number, sh: number;
    let obtuseNone = false;
    if (count > 0) {
      const original = pickTriangle(rng);
      Ag = original.angles[g];
      sg = Math.round(original.sides[g]);
      sh = Math.round(original.sides[h]);
      if (count === 1 && sg <= sh) continue;
    } else if (rng.bool(0.7)) {
      Ag = rng.int(25, 75);
      sh = rng.int(8, 25);
      const hi = Math.floor(0.92 * sh * sinD(Ag));
      if (hi < 3) continue;
      sg = rng.int(3, hi);
    } else {
      // sin of the asked angle stays under 1, so only the angles' sizes rule the triangle out
      obtuseNone = true;
      Ag = rng.int(95, 140);
      sh = rng.int(6, 25);
      const lo = Math.ceil((sh * sinD(Ag)) / 0.97);
      if (lo > sh - 1) continue;
      sg = rng.int(lo, sh - 1);
    }
    const solutions = ssaSolutions(Ag, sg, sh);
    if (solutions.length !== count) continue;
    if (solutions.some((s) => Math.min(s.H, s.W) < MIN_UNDRAWN)) continue;
    if (count === 2 && solutions[0].H > 78) continue;
    // one triangle: the obtuse candidate 180° − H misses by a clear margin (H well under the given angle)
    if (count === 1 && Ag - solutions[0].H < 3) continue;
    const printed = solutions.flatMap((s) => (whole ? [s.H, s.W, s.sw] : [s.H]));
    if (!printed.every((x) => isClean(x, p))) continue;
    if (whole && !solutions.every((s) => studentAgrees(Ag, sg, s, p))) continue;
    return { kind: "ambiguous", g, h, Ag, sg, sh, solutions, obtuseNone };
  }
}

/** A student who rounds the angle at h before finding the rest gets the same Answers. */
function studentAgrees(Ag: number, sg: number, s: SsaSolution, p: Places): boolean {
  const W = 180 - Ag - rounded(s.H, p);
  return rounded(W, p) === rounded(s.W, p) && rounded((sg * sinD(W)) / sinD(Ag), p) === rounded(s.sw, p);
}

export function construct(params: ParamValues, rng: Rng): LawOfSinesConstruction {
  const r = resolveParams(schema, params);
  const places = placesOf(r.rounding);
  const whole = r.solveTriangle === true;
  const mode = r.problems as LawOfSinesProblems;
  const kind =
    mode === "mixed"
      ? rng.pick(["side", "angle"] as const)
      : mode === "all"
        ? rng.pick(["side", "angle", "ambiguous"] as const)
        : mode;
  const c =
    kind === "side"
      ? constructSide(rng, places, whole)
      : kind === "angle"
        ? constructAngle(rng, places, whole)
        : constructAmbiguous(rng, places, whole);
  return { ...c, places, whole };
}

// ------------------------------------------------------------------ printing

/** The unknown parts of a triangle, by vertex. */
interface Unknowns {
  angles: Vertex[];
  sides: Vertex[];
}

function unknownsOf(k: LawOfSinesConstruction & (SideConstruction | AngleConstruction)): Unknowns {
  if (k.kind === "side") {
    if (!k.whole) return { angles: [], sides: [k.unknown] };
    return { angles: [third(k.given[0], k.given[1])], sides: others(k.known) };
  }
  const w = third(k.g, k.h);
  return k.whole ? { angles: [k.h, w].sort() as Vertex[], sides: [w] } : { angles: [k.h], sides: [] };
}

/** "C = 75^{\circ};\quad a = 12.4;\quad b = 9.8", or just "12.4" for one unknown; null if a value is not printable. */
function solvedLatex(u: Unknowns, angles: readonly number[], sides: readonly number[], p: Places, whole: boolean): string | null {
  const vals = [...u.angles.map((v) => angles[v]), ...u.sides.map((v) => sides[v])];
  if (!vals.every(plausible) || u.angles.some((v) => angles[v] >= 180)) return null;
  if (!whole) return u.angles.length ? degTex(angles[u.angles[0]], p) : lenTex(sides[u.sides[0]], p);
  return parts([
    ...u.angles.map((v) => `${ANGLE_NAMES[v]} = ${degTex(angles[v], p)}`),
    ...u.sides.map((v) => `${SIDE_NAMES[v]} = ${lenTex(sides[v], p)}`),
  ]);
}

/** The ambiguous case's Answer: "\text{no triangle}", or the count and each triangle's parts. */
export function ambiguousLatex(k: Pick<AmbiguousConstruction, "g" | "h">, sols: readonly SsaSolution[], p: Places, whole: boolean): string | null {
  if (sols.length === 0) return "\\text{no triangle}";
  const w = third(k.g, k.h);
  const sub = (i: number) => (sols.length === 2 ? `_{${i + 1}}` : "");
  const out = [`\\text{${sols.length} triangle${sols.length === 2 ? "s" : ""}}`];
  for (const [i, s] of sols.entries()) {
    if (!(whole ? [s.H, s.W, s.sw] : [s.H]).every(plausible) || s.H >= 180) return null;
    out.push(`${ANGLE_NAMES[k.h]}${sub(i)} = ${degTex(s.H, p)}`);
    if (whole) {
      out.push(`${ANGLE_NAMES[w]}${sub(i)} = ${degTex(s.W, p)}`);
      out.push(`${SIDE_NAMES[w]}${sub(i)} = ${lenTex(s.sw, p)}`);
    }
  }
  return parts(out);
}

const roundText = (p: Places) => `to the nearest ${placeWord(p)}`;

export function promptLatex(k: LawOfSinesConstruction): string {
  if (k.kind === "ambiguous") {
    const [G, g, h] = [ANGLE_NAMES[k.g], SIDE_NAMES[k.g], SIDE_NAMES[k.h]];
    const ask = k.whole
      ? prose(`. How many triangles are possible? Solve each one, ${roundText(k.places)}.`)
      : `${prose(". How many triangles are possible? Find ")}${ANGLE_NAMES[k.h]}${prose(` in each, ${roundText(k.places)}.`)}`;
    return `${prose("In triangle ABC, ")}${G} = ${k.Ag}^{\\circ}, ${g} = ${k.sg}, ${prose("and ")}${h} = ${k.sh}${ask}`;
  }
  if (k.whole) return prose(`Solve the triangle. Round ${roundText(k.places)}.`);
  if (k.kind === "angle") return `${prose("Find ")}\\theta${prose(` ${roundText(k.places)} of a degree.`)}`;
  return `${prose("Find ")}x${prose(` ${roundText(k.places)}.`)}`;
}

export function answerLatex(k: LawOfSinesConstruction): string {
  if (k.kind === "ambiguous") return ambiguousLatex(k, k.solutions, k.places, k.whole)!;
  return solvedLatex(unknownsOf(k), k.t.angles, k.t.sides, k.places, k.whole)!;
}

/** The givens and unknowns as the diagram marks them. */
function marksOf(k: LawOfSinesConstruction & (SideConstruction | AngleConstruction)): Marks {
  const u = unknownsOf(k);
  const p = k.places;
  const angles: [Mark, Mark, Mark] = [null, null, null];
  const sides: [Mark, Mark, Mark] = [null, null, null];
  const givenAngles = k.kind === "side" ? k.given : [k.g];
  const givenSides = k.kind === "side" ? [k.known] : [k.g, k.h];
  for (const v of givenAngles) angles[v] = { text: `${k.t.angles[v]}°` };
  for (const v of givenSides) sides[v] = { text: String(k.t.sides[v]) };
  for (const v of u.angles) angles[v] = { text: k.whole ? "?" : "θ", answer: degLabel(k.t.angles[v], p) };
  for (const v of u.sides) sides[v] = { text: k.whole ? "?" : "x", answer: lenLabel(k.t.sides[v], p) };
  return { angles, sides };
}

/**
 * Mistake-based Distractors, printed like the Answer:
 * - the ratio upside down (sin of the known side's angle over sin of the
 *   unknown's), the two unknown sides swapped, or the known side over the
 *   sine of an angle not opposite it (in ASA, a given angle used in place of
 *   the third angle, never found); cosines in place of sines;
 * - SSA: the obtuse angle 180° − θ when only the acute one fits, the other
 *   angle found instead, the ratio of sides flipped, sin of the given angle
 *   left out, and sin θ rounded before sin⁻¹;
 * - the ambiguous case: the second (obtuse) triangle missed, an extra one
 *   claimed, or "no triangle" when there are some;
 * - the calculator in radians mode;
 * - a value rounded too early (sines to two places, or a found angle to the
 *   nearest degree before going on).
 */
export function distractors(k: LawOfSinesConstruction): string[] {
  const p = k.places;
  if (k.kind === "ambiguous") return ambiguousDistractors(k);
  const u = unknownsOf(k);
  const answer = answerLatex(k);
  const show = (angles: readonly number[], sides: readonly number[]) => solvedLatex(u, angles, sides, p, k.whole);
  const A = k.t.angles;
  const S = k.t.sides;
  const cands: (string | null)[] = [];
  /** later mistakes, after the ones above so their order is kept */
  const later: (string | null)[] = [];
  if (k.kind === "side") {
    const K = A[k.known];
    const len = S[k.known];
    const withSides = (f: (v: Vertex) => number) => {
      const s = [...S];
      for (const v of others(k.known)) s[v] = f(v);
      return show(A, s);
    };
    const swap = () => {
      const [x, y] = others(k.known);
      const s = [...S];
      [s[x], s[y]] = [S[y], S[x]];
      return show(A, s);
    };
    cands.push(withSides((v) => (len * sinD(K)) / sinD(A[v])));
    cands.push(swap());
    // a wrong opposite pair: the known side over the sine of an angle not opposite it
    // (in ASA, a given angle used in place of the third angle, never found)
    cands.push(withSides((v) => (len * sinD(A[v])) / sinD(A[third(k.known, v)])));
    cands.push(withSides((v) => (len * Math.sin(A[v])) / Math.sin(K)));
    cands.push(withSides((v) => (len * r2(sinD(A[v]))) / r2(sinD(K))));
    // cosines in place of sines
    cands.push(withSides((v) => (len * cosD(A[v])) / cosD(K)));
    later.push(
      // the angles used as the ratio in place of their sines: x = len · B / A
      withSides((v) => (len * A[v]) / K),
      // forgot to divide by sin of the known angle: x = len · sin B
      withSides((v) => len * sinD(A[v])),
      // tangents in place of sines
      withSides((v) => (len * Math.tan((A[v] * Math.PI) / 180)) / Math.tan((K * Math.PI) / 180)),
      // divided by the angle itself, not its sine: x = len · sin B / A
      withSides((v) => (len * sinD(A[v])) / K),
    );
  } else {
    const { g, h } = k;
    const w = third(g, h);
    const Ag = A[g];
    const sg = S[g];
    const sh = S[h];
    const path = (H: number, sideOf = (W: number) => (sg * sinD(W)) / sinD(Ag)) => {
      const a = [...A];
      const s = [...S];
      a[h] = H;
      a[w] = 180 - Ag - H;
      s[w] = sideOf(a[w]);
      if (k.whole && !(a[w] > 0)) return null;
      return show(a, s);
    };
    const H = A[h];
    cands.push(path(180 - H));
    const flipped = (sg * sinD(Ag)) / sh;
    if (flipped <= 1) cands.push(path(asinD(flipped)));
    // the other angle found in its place (sides paired with the wrong angles)
    cands.push(path(A[w]));
    const rad = (sh * Math.sin(Ag)) / sg;
    if (Math.abs(rad) <= 1) cands.push(path(Math.asin(rad)));
    // sin of the given angle left out: sin θ = (side h) / (side g)
    cands.push(path(asinD(sh / sg)));
    if (k.whole) {
      cands.push(path(Math.round(H)));
      cands.push(path(asinD(r2((sh * sinD(Ag)) / sg))));
      cands.push(path(H, (W) => (sg * sinD(Ag)) / sinD(W)));
      cands.push(path(H, (W) => (sg * r2(sinD(W))) / r2(sinD(Ag))));
    } else {
      cands.push(path(asinD(r2((sh * sinD(Ag)) / sg))));
    }
    const sinH = (sh * sinD(Ag)) / sg;
    later.push(
      // cos⁻¹ in place of sin⁻¹
      Math.abs(sinH) <= 1 ? path(acosD(sinH)) : null,
      // tan⁻¹ in place of sin⁻¹
      path((Math.atan(sinH) * 180) / Math.PI),
      // the angles used as the ratio in place of their sines: θ = A · h / g
      path((Ag * sh) / sg),
      // cos of the given angle in place of its sine
      Math.abs((sh * cosD(Ag)) / sg) <= 1 ? path(asinD((sh * cosD(Ag)) / sg)) : null,
    );
  }
  return distinctHints(answer, [...distinctHints(answer, cands).slice(0, 6), ...later]);
}

function ambiguousDistractors(k: LawOfSinesConstruction & AmbiguousConstruction): string[] {
  const { Ag, sg, sh, places: p, whole } = k;
  const answer = answerLatex(k);
  const sol = (H: number, third = 180 - Ag - H, sideOf = (W: number) => (sg * sinD(W)) / sinD(Ag)): SsaSolution => ({
    H,
    W: third,
    sw: sideOf(third),
  });
  const ok = (s: SsaSolution) => !whole || s.W > 0;
  const show = (Hs: number[], third?: (H: number) => number, sideOf?: (W: number) => number) => {
    const sols = Hs.map((H) => sol(H, third?.(H), sideOf));
    return sols.every(ok) ? ambiguousLatex(k, sols, p, whole) : null;
  };
  const sinH = (sh * sinD(Ag)) / sg;
  const H1 = sinH <= 1 ? asinD(sinH) : NaN;
  const flipped = (sg * sinD(Ag)) / sh;
  const F = flipped <= 1 ? asinD(flipped) : NaN;
  const rad = (sh * Math.sin(Ag)) / sg;
  const R = Math.abs(rad) <= 1 ? Math.asin(rad) : NaN;
  const cands: (string | null)[] = [];
  const n = k.solutions.length;
  if (n === 2) {
    cands.push(show([H1]), show([180 - H1]), "\\text{no triangle}", show([Math.round(H1), 180 - Math.round(H1)]));
  } else if (n === 1) {
    cands.push(show([H1, 180 - H1]), "\\text{no triangle}", show([180 - H1]));
    if (!Number.isNaN(R)) cands.push(show([R]));
    if (!Number.isNaN(F)) cands.push(show([F]));
    if (whole) cands.push(show([Math.round(H1)]));
  } else if (k.obtuseNone) {
    if (!Number.isNaN(H1)) cands.push(show([H1]), show([H1, 180 - H1]), show([180 - H1]));
    if (!Number.isNaN(F)) cands.push(show([F]), show([Math.round(F)]));
    if (!Number.isNaN(R)) cands.push(show([R]));
    cands.push(show([90]));
  } else {
    if (!Number.isNaN(F)) cands.push(show([F]), show([F, 180 - F]), show([180 - F]));
    if (!Number.isNaN(R)) cands.push(show([R]));
    cands.push(show([90]));
  }
  // Treating the two given sides as legs ignores the given angle.
  const legAngle = Math.atan2(sh, sg) * 180 / Math.PI;
  cands.push(show([legAngle]), show([90 - legAngle]));
  if (n === 0) {
    // Bisecting the remaining angle assumes that the two unknown angles are equal.
    cands.push(show([(180 - Ag) / 2]));
  }
  // Later mistakes, after the ones above so their order is kept.
  const later: (string | null)[] = [
    // cos⁻¹ in place of sin⁻¹
    Math.abs(sinH) <= 1 ? show([acosD(sinH)]) : null,
    // tan⁻¹ in place of sin⁻¹
    show([(Math.atan(sinH) * 180) / Math.PI]),
    // the angles used as the ratio in place of their sines: θ = A · h / g
    show([(Ag * sh) / sg]),
    // cos of the given angle in place of its sine
    Math.abs((sh * cosD(Ag)) / sg) <= 1 ? show([asinD((sh * cosD(Ag)) / sg)]) : null,
  ];
  // Still later: sin of the given angle left out (sin H = side h / side g), and, once H is found,
  // the third angle taken as 180 degrees minus H (the given angle forgotten), or the third side
  // found from the inverted ratio.
  if (sh / sg <= 1) later.push(show([asinD(sh / sg)]));
  if (whole && !Number.isNaN(H1)) {
    later.push(
      show([H1], (H) => 180 - H),
      show([H1], undefined, (W) => (sg * sinD(Ag)) / sinD(W)),
    );
  }
  return distinctHints(answer, [...distinctHints(answer, cands).slice(0, 6), ...later]);
}

export const generator: Generator = {
  id: LAW_OF_SINES_ID,
  title: "The Law of Sines",
  defaultDirections: "Use the Law of Sines to solve each problem.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const rng = createRng(seed);
    const k = construct(resolved, rng);
    const problem: Problem = {
      kind: "generated",
      generatorId: LAW_OF_SINES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
    if (k.kind !== "ambiguous") {
      const { graph, answerGraph } = triDiagram(rng, k.t, marksOf(k));
      problem.graph = graph;
      problem.answerGraph = answerGraph as TriangleSpec;
    }
    return problem;
  },
};
