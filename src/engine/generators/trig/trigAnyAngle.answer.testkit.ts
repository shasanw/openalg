import { expect } from "vitest";
import type { Problem } from "../../types";
import { close } from "../shared/latexEval.testkit";
import type { TrigFn } from "./trigKit";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { evalTrig, expectLowestTerms, expectRationalized } from "./trig.testkit";

const TAU = 2 * Math.PI;
const FN = "(sin|cos|tan|csc|sec|cot)";

/** fn at the angle through (x, y), from x, y and r directly. */
function fromPoint(fn: TrigFn, x: number, y: number): number {
  const r = Math.hypot(x, y);
  return { sin: y / r, cos: x / r, tan: y / x, csc: r / y, sec: r / x, cot: x / y }[fn];
}

/** A printed value (NaN for undefined) is fn's value, or fn is undefined (huge) there. */
function expectValue(printed: string, actual: number): void {
  if (Math.abs(actual) > 1e12) {
    expect(printed).toBe("\\text{undefined}");
    return;
  }
  const v = evalTrig(printed);
  expect(Number.isFinite(v) && close(v, actual, 1e-9), `${printed} vs ${actual}`).toBe(true);
}

/** The angle in [0, 2π) in quadrant q where fn takes the value v. */
function angleWith(fn: TrigFn, v: number, q: number): number {
  const base = { sin: Math.asin(v), csc: Math.asin(1 / v), cos: Math.acos(v), sec: Math.acos(1 / v), tan: Math.atan(v), cot: Math.atan(1 / v) }[fn];
  const candidates = [base, Math.PI - base, -base, Math.PI + base].map((t) => ((t % TAU) + TAU) % TAU);
  const inQ = candidates.filter((t) => Math.floor(t / (Math.PI / 2)) + 1 === q && close(fromPoint(fn, Math.cos(t), Math.sin(t)), v, 1e-9));
  expect(inQ.length, `${fn} = ${v} in quadrant ${q}`).toBeGreaterThan(0);
  return inQ[0];
}

const ROMAN = ["I", "II", "III", "IV"];

export function trigAnyAngle(p: Problem): void {
  expectRationalized(p.answer);
  expectLowestTerms(p.answer);
  if (!p.prompt.includes("textnormal")) {
    // the prompt evaluates (in radians, degrees read as radians) to the Answer
    expectValue(p.answer, evalTrig(p.prompt));
    return;
  }
  if (p.prompt.includes("The point")) {
    const m = p.prompt.match(/\\left\((-?\d+), (-?\d+)\\right\)/)!;
    const [x, y] = [Number(m[1]), Number(m[2])];
    expect(x * y).not.toBe(0);
    expect(Number.isInteger(Math.sqrt(x * x + y * y))).toBe(true);
    const parts = p.answer.split(ANSWER_PART_SEPARATOR);
    if (parts.length === 1) {
      const fn = p.prompt.match(new RegExp(`\\\\${FN} \\\\theta$`))![1] as TrigFn;
      expectValue(p.answer, fromPoint(fn, x, y));
    } else {
      expect(parts.length).toBe(p.prompt.includes("all six") ? 6 : 3);
      const asked = p.prompt.includes("all six") ? ["sin", "cos", "tan", "csc", "sec", "cot"]
        : [...p.prompt.matchAll(new RegExp(`\\\\${FN} \\\\theta`, "g"))].map(m => m[1]);
      expect(parts.map(part => part.match(new RegExp(FN))![1]).sort()).toEqual(asked.sort());
      for (const part of parts) {
        const [, fn, v] = part.match(new RegExp(`^\\\\${FN} \\\\theta = (.+)$`))!;
        expectValue(v, fromPoint(fn as TrigFn, x, y));
      }
    }
    return;
  }
  // fromValue: find θ from the given value and quadrant, then evaluate the asked function
  const [, given, value] = p.prompt.match(new RegExp(`^\\\\textnormal\\{Given\\} \\\\${FN} \\\\theta = (.+?) \\\\textnormal`))!;
  const asked = p.prompt.match(new RegExp(`\\\\${FN} \\\\theta$`))![1] as TrigFn;
  const words = p.prompt.match(/Quadrant ([IV]+)/);
  let q: number;
  if (words) q = ROMAN.indexOf(words[1]) + 1;
  else {
    const [, lower, upper] = p.prompt.match(/\\textnormal\{and\} (.+?) < \\theta < (.+?)\\textnormal\{, find\}/)!;
    q = Math.round(evalTrig(lower) / (Math.PI / 2)) + 1;
    expect(close(evalTrig(lower), (q - 1) * Math.PI / 2)).toBe(true);
    expect(close(evalTrig(upper), q * Math.PI / 2)).toBe(true);
  }
  const t = angleWith(given as TrigFn, evalTrig(value), q);
  expectValue(p.answer, fromPoint(asked, Math.cos(t), Math.sin(t)));
  expect(asked).not.toBe(given);
}
