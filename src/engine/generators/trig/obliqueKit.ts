// Shared pieces of the oblique-triangle Topics (the Law of Sines, the Law of
// Cosines, area of triangles):
//
// - A `Tri` is a whole triangle: its three angles in degrees and the sides
//   opposite them, indexed by vertex (0 = A, 1 = B, 2 = C; side 0 is a = BC).
//   A Topic chooses a triangle, rounds its givens to whole numbers,
//   and lays the printed triangle out from them with `triFromSides`, `triFromSAS`,
//   `triFromAngles`; every Answer is a part of that triangle, computed from
//   the givens by the formula a student uses, and so matches their
//   calculator.
// - Rounding: `places` 1 (tenth) or 2 (hundredth); `isClean` rejects a value
//   too near a rounding boundary for a student's calculator and the key to
//   agree, and `lenTex`/`degTex` print a rounded length or angle.
// - Drawing: `triDiagram` lays the triangle out to scale, with its longest
//   side (usually) as the base, and gives the student's graph (givens and
//   unknowns marked) and the answer graph (each unknown's label replaced by
//   its Answer).

import { ANSWER_PART_SEPARATOR } from "../../format";
import { triangleFromSides, type TriangleCorner, type TriangleLabel, type TriangleSpec } from "../../plot";
import type { Rng } from "../../rng";
import { decimalLatex, roundsCleanly, roundTo } from "./trigKit";

export type Vertex = 0 | 1 | 2;
export const VERTICES: readonly Vertex[] = [0, 1, 2];
export const ANGLE_NAMES = ["A", "B", "C"] as const;
export const SIDE_NAMES = ["a", "b", "c"] as const;

/** The two vertices other than v, in order. */
export const others = (v: Vertex): [Vertex, Vertex] => VERTICES.filter((u) => u !== v) as [Vertex, Vertex];
/** The vertex that is neither u nor v. */
export const third = (u: Vertex, v: Vertex): Vertex => (3 - u - v) as Vertex;

// ------------------------------------------------------------------ degrees

const RAD = Math.PI / 180;
export const sinD = (deg: number): number => Math.sin(deg * RAD);
export const cosD = (deg: number): number => Math.cos(deg * RAD);
/** sin⁻¹ in degrees (NaN outside [-1, 1]). */
export const asinD = (v: number): number => Math.asin(v) / RAD;
/** cos⁻¹ in degrees (NaN outside [-1, 1]). */
export const acosD = (v: number): number => Math.acos(v) / RAD;

// ------------------------------------------------------------------ triangles

/** A triangle: angles in degrees and the sides opposite them, by vertex. */
export interface Tri {
  angles: [number, number, number];
  sides: [number, number, number];
}

/** The triangle with these sides (Law of Cosines for each angle), or null if none. */
export function triFromSides(sides: readonly [number, number, number]): Tri | null {
  const [a, b, c] = sides;
  if (!(a > 0 && b > 0 && c > 0 && a < b + c && b < a + c && c < a + b)) return null;
  const angle = (x: number, y: number, z: number) => acosD((y * y + z * z - x * x) / (2 * y * z));
  return { angles: [angle(a, b, c), angle(b, c, a), angle(c, a, b)], sides: [a, b, c] };
}

/**
 * The triangle with angle `deg` at vertex g between the sides p and q, where
 * p is the side opposite the vertex after g (others(g)[0]) and q the side
 * opposite the other one.
 */
export function triFromSAS(g: Vertex, deg: number, p: number, q: number): Tri {
  const [u, v] = others(g);
  const s: [number, number, number] = [0, 0, 0];
  s[u] = p;
  s[v] = q;
  s[g] = Math.sqrt(p * p + q * q - 2 * p * q * cosD(deg));
  const t = triFromSides(s);
  if (!t) throw new Error("triFromSAS: no triangle");
  t.angles[g] = deg; // exactly the given, not recomputed
  return t;
}

/** The triangle with these angles (summing to 180) and side `len` opposite vertex k (Law of Sines). */
export function triFromAngles(angles: readonly [number, number, number], k: Vertex, len: number): Tri {
  const sides = angles.map((x) => (len * sinD(x)) / sinD(angles[k])) as [number, number, number];
  sides[k] = len;
  return { angles: [...angles] as [number, number, number], sides };
}

/** Choose a complete triangle before deciding which measurements to print. */
export function pickTriangle(rng: Rng): Tri {
  const A = rng.int(25, 115);
  const B = rng.int(25, 155 - A);
  return triFromAngles([A, B, 180 - A - B], 0, rng.int(7, 24));
}

export const minAngle = (t: Tri): number => Math.min(...t.angles);
/** Longest side over shortest. */
export const sideSpread = (t: Tri): number => Math.max(...t.sides) / Math.min(...t.sides);

// ------------------------------------------------------------------ rounding

export type Places = 1 | 2;

export const placesOf = (rounding: unknown): Places => (rounding === "hundredth" ? 2 : 1);
export const placeWord = (p: Places): string => (p === 2 ? "hundredth" : "tenth");

/**
 * Far enough (a tenth of the last place) from a rounding boundary that a
 * student's calculator and the key cannot disagree.
 */
export const isClean = (x: number, p: Places): boolean => Number.isFinite(x) && roundsCleanly(x, p, 0.1);

export const rounded = (x: number, p: Places): number => roundTo(x, p);

/** A rounded length: "12.4", or "12.4\,\text{cm}" (a thin space, which every renderer keeps). */
export function lenTex(x: number, p: Places, unit = ""): string {
  return decimalLatex(x, p) + (unit ? `\\,\\text{${unit}}` : "");
}

/** A rounded area: "24.5", or "24.5\,\text{cm}^{2}". */
export function areaTex(x: number, p: Places, unit = ""): string {
  return decimalLatex(x, p) + (unit ? `\\,\\text{${unit}}^{2}` : "");
}

/** A rounded angle: "38.2^{\circ}". */
export const degTex = (x: number, p: Places): string => `${decimalLatex(x, p)}^{\\circ}`;

/** A diagram's label for a length ("12.4", "8 cm") or an angle ("38.2°"). */
export const lenLabel = (x: number, p: Places, unit = ""): string => decimalLatex(x, p) + (unit ? ` ${unit}` : "");
export const degLabel = (x: number, p: Places): string => `${decimalLatex(x, p)}°`;

/** Answer parts joined for the Answer Key. */
export const parts = (ps: readonly string[]): string => ps.join(ANSWER_PART_SEPARATOR);

/** A value fit to offer as a wrong answer: a positive, finite, printable number. */
export const plausible = (x: number): boolean => Number.isFinite(x) && x > 0 && x < 1e6;

// ------------------------------------------------------------------ drawing

/** What a diagram prints at an angle or side: a given, or an unknown and its Answer. */
export type Mark = { text: string } | { text: string; answer: string } | null;

export interface Marks {
  angles: [Mark, Mark, Mark];
  sides: [Mark, Mark, Mark];
}

/**
 * The triangle drawn to scale with corner names A, B, C, the givens printed
 * and each unknown marked, and (when anything is unknown) the answer graph:
 * the same corners with each unknown's mark replaced by its Answer. The base
 * is the longest side, or now and then the second longest, so the triangle
 * reads the usual way up.
 */
export function triDiagram(rng: Rng, t: Tri, marks: Marks): { graph: TriangleSpec; answerGraph?: TriangleSpec } {
  const bySize = [...VERTICES].sort((u, v) => t.sides[v] - t.sides[u]);
  const apex = bySize[rng.bool(0.75) ? 0 : 1];
  const [p, q] = rng.bool() ? others(apex) : (others(apex).reverse() as [Vertex, Vertex]);
  const [P, Q, R] = triangleFromSides(t.sides[p], t.sides[q], t.sides[apex]);
  const at: Record<Vertex, { x: number; y: number }> = { [p]: P, [q]: Q, [apex]: R } as Record<
    Vertex,
    { x: number; y: number }
  >;
  const label = (m: Mark, answer: boolean): TriangleLabel | undefined => {
    if (m === null) return undefined;
    if (answer && "answer" in m) return { text: m.answer, answer: true };
    return { text: m.text };
  };
  const corners = (answer: boolean) =>
    VERTICES.map((v): TriangleCorner => {
      const c: TriangleCorner = { x: round6(at[v].x), y: round6(at[v].y), name: ANGLE_NAMES[v] };
      const angle = label(marks.angles[v], answer);
      const opposite = label(marks.sides[v], answer);
      if (angle) c.angle = angle;
      if (opposite) c.opposite = opposite;
      return c;
    }) as TriangleSpec["corners"];
  const graph: TriangleSpec = { kind: "triangle", corners: corners(false) };
  const anyUnknown = [...marks.angles, ...marks.sides].some((m) => m !== null && "answer" in m);
  return anyUnknown ? { graph, answerGraph: { kind: "triangle", corners: corners(true) } } : { graph };
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6 + 0;

