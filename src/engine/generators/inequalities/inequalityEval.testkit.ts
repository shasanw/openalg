// Test-only: read the BAKED strings of the Inequalities Topics back, so
// property tests check what actually prints. A printed inequality (a prompt,
// or an Answer in inequality notation) and an Answer in interval notation both
// become a predicate on x; tests compare the two at many points, including
// every printed endpoint and points just either side of it.

import { evalLatex } from "../shared/latexEval.testkit";

const TOL = 1e-9;

function compare(l: number, op: string, r: number): boolean {
  const eq = Math.abs(l - r) <= TOL * Math.max(1, Math.abs(l), Math.abs(r));
  switch (op) {
    case "<":
      return l < r && !eq;
    case ">":
      return l > r && !eq;
    case "\\le":
      return l < r || eq;
    case "\\ge":
      return l > r || eq;
    case "=":
      return eq;
    case "\\ne":
      return !eq;
  }
  throw new Error(`unknown op ${op}`);
}

const OP_RE = /(\\le(?![a-z])|\\ge(?![a-z])|\\ne(?![a-z])|<|>|=)/;

/** "a < 2x + 1 \le b" and friends: every comparison in the chain holds. */
function chain(tex: string, v: string, x: number): boolean {
  const parts = tex.split(OP_RE).map((t) => t.trim());
  if (parts.length < 3 || parts.length % 2 === 0) throw new Error(`not a chain: ${tex}`);
  const values: number[] = [];
  for (let i = 0; i < parts.length; i += 2) values.push(evalLatex(parts[i], { [v]: x }));
  for (let i = 1; i < parts.length; i += 2) {
    if (!compare(values[(i - 1) / 2], parts[i], values[(i + 1) / 2])) return false;
  }
  return true;
}

/** A printed inequality (with "\text{ and }", "\text{ or }") as a predicate. */
export function inequalityHolds(tex: string, x: number, v = "x"): boolean {
  tex = tex.replace(/\\mathord\{-\}/g, "-");
  if (tex === "\\text{all real numbers}") return true;
  if (tex === "\\text{no solution}") return false;
  return tex.split("\\text{ or }").some((part) => part.split("\\text{ and }").every((c) => chain(c.trim(), v, x)));
}

/** Whether a string is interval notation (as setLatex prints it). */
export function isInterval(tex: string): boolean {
  return /^[[(]|^\\varnothing$|^\\\{/.test(tex);
}

function intervalHolds(tex: string, x: number): boolean {
  if (tex === "\\varnothing") return false;
  const point = tex.match(/^\\\{(.+)\\\}$/);
  if (point) return compare(x, "=", evalLatex(point[1]));
  return tex.split(" \\cup ").some((part) => {
    const m = part.match(/^([[(])(.+), (.+)([\])])$/);
    if (!m) throw new Error(`unparsed interval: ${part}`);
    const okLo = m[2] === "-\\infty" || compare(evalLatex(m[2]), m[1] === "[" ? "\\le" : "<", x);
    const okHi = m[3] === "\\infty" || compare(x, m[4] === "]" ? "\\le" : "<", evalLatex(m[3]));
    return okLo && okHi;
  });
}

/** An Answer in either notation as a predicate. */
export function answerHolds(tex: string, x: number, v = "x"): boolean {
  return isInterval(tex) ? intervalHolds(tex, x) : inequalityHolds(tex, x, v);
}

/** Every number printed in a string (integers and \frac{a}{b}, with signs). */
export function printedNumbers(tex: string): number[] {
  const out: number[] = [];
  for (const m of tex.matchAll(/(-?)\\frac\{(\d+)\}\{(\d+)\}|(-?\d+(?:\.\d+)?)/g)) {
    out.push(m[4] !== undefined ? Number(m[4]) : (m[1] ? -1 : 1) * (Number(m[2]) / Number(m[3])));
  }
  return out;
}

/** Points to compare two sets at: every printed endpoint, just either side, and far out. */
export function probePoints(...texs: string[]): number[] {
  const pts = new Set<number>([0, -1000, 1000, 0.5, -0.5]);
  for (const t of texs)
    for (const e of printedNumbers(t)) for (const d of [0, 1e-4, -1e-4, 0.5, -0.5]) pts.add(e + d);
  return [...pts];
}
