// Test-only: reading a right-triangle diagram back from its printed labels and
// its drawn corners, independently of how a Topic built it. The right-triangle
// Topics' property tests recompute every Answer from what is read here.

import { expect } from "vitest";
import type { GraphSpec, TriangleCorner, TriangleLabel, TriangleSpec } from "../../plot";

/** A side label's length: "12", "8.4", "√13", "2√5"; null for anything else ("x", "a", "?"). */
export function labelLength(text: string): number | null {
  const m = text.match(/^(\d+(?:\.\d+)?)?(?:√(\d+))?$/);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  return (m[1] === undefined ? 1 : Number(m[1])) * (m[2] === undefined ? 1 : Math.sqrt(Number(m[2])));
}

/** An angle label's degrees: "35°", "36.9°"; null for anything else ("θ", "?"). */
export function labelDegrees(text: string): number | null {
  const m = text.match(/^(\d+(?:\.\d+)?)°$/);
  return m ? Number(m[1]) : null;
}

/** The angle at corner i, in degrees, from the drawn corners. */
export function drawnAngle(cs: readonly TriangleCorner[], i: number): number {
  const p = cs[i];
  const q = cs[(i + 1) % 3];
  const r = cs[(i + 2) % 3];
  const u = [q.x - p.x, q.y - p.y];
  const v = [r.x - p.x, r.y - p.y];
  const c = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]));
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

/** The drawn length of the side opposite corner i. */
export function drawnSide(cs: readonly TriangleCorner[], i: number): number {
  const q = cs[(i + 1) % 3];
  const r = cs[(i + 2) % 3];
  return Math.hypot(q.x - r.x, q.y - r.y);
}

export interface RightTriangleRead {
  corners: readonly TriangleCorner[];
  /** Index of the right-angle corner. */
  right: number;
  /** Drawn units per printed unit, from the exact (given) side labels. */
  scale: number;
}

/**
 * Checks a right-triangle diagram is consistent: one right-angle mark, on a
 * corner that is drawn at 90°; every given side label in proportion to its
 * drawn side; every given angle label equal to its drawn angle. Returns what
 * the property tests need to recompute the Answer.
 */
export function readRightTriangle(spec: GraphSpec | undefined): RightTriangleRead {
  expect(spec?.kind).toBe("triangle");
  const cs = (spec as TriangleSpec).corners;
  const rights = cs.flatMap((c, i) => (c.rightAngle ? [i] : []));
  expect(rights.length).toBe(1);
  const right = rights[0];
  expect(Math.abs(drawnAngle(cs, right) - 90)).toBeLessThan(1e-9);
  const ratios = cs.flatMap((c, i) => {
    const l = c.opposite && !c.opposite.answer ? labelLength(c.opposite.text) : null;
    return l === null ? [] : [drawnSide(cs, i) / l];
  });
  expect(ratios.length).toBeGreaterThan(0);
  for (const r of ratios) expect(Math.abs(r / ratios[0] - 1)).toBeLessThan(1e-9);
  cs.forEach((c, i) => {
    const d = c.angle && !c.angle.answer ? labelDegrees(c.angle.text) : null;
    if (d !== null) expect(Math.abs(drawnAngle(cs, i) - d)).toBeLessThan(1e-9);
  });
  // a right triangle diagram's acute angles stay wide enough to label
  cs.forEach((_, i) => expect(drawnAngle(cs, i)).toBeGreaterThan(14));
  return { corners: cs, right, scale: ratios[0] };
}

/** A side's true length from the drawing (exact: the drawing is built from the givens). */
export const trueSide = (t: RightTriangleRead, i: number): number => drawnSide(t.corners, i) / t.scale;

/**
 * The answer graph is the student's graph with only the marked unknowns'
 * labels replaced, each by `{ text, answer: true }`; returns the replaced
 * labels as [the student's mark, the key's text, the corner, which label].
 */
export function replacedLabels(
  graph: GraphSpec | undefined,
  answerGraph: GraphSpec | undefined,
  marks: readonly string[],
): { mark: string; text: string; corner: number; field: "angle" | "opposite" }[] {
  expect(answerGraph?.kind).toBe("triangle");
  const g = (graph as TriangleSpec).corners;
  const a = (answerGraph as TriangleSpec).corners;
  const out: { mark: string; text: string; corner: number; field: "angle" | "opposite" }[] = [];
  g.forEach((c, i) => {
    const k = a[i];
    expect({ x: k.x, y: k.y, name: k.name, rightAngle: k.rightAngle }).toEqual({
      x: c.x,
      y: c.y,
      name: c.name,
      rightAngle: c.rightAngle,
    });
    for (const field of ["angle", "opposite"] as const) {
      const s: TriangleLabel | undefined = c[field];
      const t: TriangleLabel | undefined = k[field];
      if (s && marks.includes(s.text)) {
        expect(t?.answer).toBe(true);
        out.push({ mark: s.text, text: t!.text, corner: i, field });
      } else {
        expect(t).toEqual(s);
      }
    }
  });
  return out;
}
