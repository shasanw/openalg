import { expect } from "vitest";
import type { Problem } from "../../types";
import { close } from "../shared/latexEval.testkit";
import { ANSWER_PART_SEPARATOR, proseSegments } from "../../format";
import { evalTrig, expectLowestTerms } from "./trig.testkit";

const TAU = 2 * Math.PI;
const mod = (x: number) => ((x % TAU) + TAU) % TAU;
const isWholeTurns = (x: number) => close(x / TAU, Math.round(x / TAU), 1e-9);

/** The angle a prompt asks about: its last math run. */
export const givenOf = (prompt: string): string =>
  proseSegments(prompt)
    .filter((s) => s.kind === "math")
    .at(-1)!
    .latex.trim();

const LOCATION_TEXT = ["Quadrant I}", "Quadrant II}", "Quadrant III}", "Quadrant IV}"];

/** Where an angle (radians) lies, computed numerically. */
function locationOf(x: number): string {
  const m = mod(x);
  for (const [i, axis] of ["positive } x", "positive } y", "negative } x", "negative } y"].entries())
    if (close(m, (i * Math.PI) / 2, 1e-9) || (i === 0 && close(m, TAU, 1e-9))) return axis;
  return LOCATION_TEXT[Math.floor(m / (Math.PI / 2))];
}

/** "25^{\circ} 30' 18''" in degrees. */
export function readDms(tex: string): number {
  const m = tex.match(/^(\d+)\^\{\\circ\}(?: (\d+)')?(?: (\d+)'')?$/);
  if (!m) throw new Error(`not DMS: ${tex}`);
  return Number(m[1]) + Number(m[2] ?? 0) / 60 + Number(m[3] ?? 0) / 3600;
}
export const readDecimalDegrees = (tex: string): number => Number(tex.match(/^([\d.]+)\^\{\\circ\}$/)![1]);

export function angleMeasure(p: Problem): void {
  const prompt = p.prompt;
  const given = givenOf(p.prompt);
  if (prompt.includes("Write in")) {
    if (prompt.includes("Write in decimal")) expect(close(readDecimalDegrees(p.answer), readDms(given), 1e-9)).toBe(true);
    else expect(close(readDms(p.answer), readDecimalDegrees(given), 1e-9)).toBe(true);
    return;
  }
  const g = evalTrig(given);
  if (prompt.includes("Find the angle between")) {
    const a = evalTrig(p.answer);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(TAU);
    expect(isWholeTurns(g - a)).toBe(true);
    // the given angle is outside the range, so there is something to do
    expect(g < 0 || g >= TAU).toBe(true);
  } else if (prompt.includes("least positive")) {
    const [pos, negative] = p.answer.split(ANSWER_PART_SEPARATOR).map((s) => evalTrig(s));
    expect(pos).toBeGreaterThan(0);
    expect(pos).toBeLessThanOrEqual(TAU + 1e-9);
    expect(close(pos - negative, TAU)).toBe(true);
    expect(isWholeTurns(g - pos)).toBe(true);
  } else if (prompt.includes("terminal side")) {
    expect(p.answer).toContain(locationOf(g));
  } else {
    expect(prompt).toContain("reference angle");
    const m = mod(g);
    const ref = Math.min(m, Math.abs(Math.PI - m), TAU - m);
    expect(close(evalTrig(p.answer), ref, 1e-9)).toBe(true);
    expect(ref).toBeGreaterThan(0);
    expect(ref).toBeLessThan(Math.PI / 2);
    // the reference angle is never just the given angle unchanged
    expect(close(g, ref, 1e-9)).toBe(false);
  }
  expectLowestTerms(p.prompt);
  expectLowestTerms(p.answer);
}
