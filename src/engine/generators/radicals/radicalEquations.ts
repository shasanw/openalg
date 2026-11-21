// "Radical equations": a radical equal to a number (\sqrt{2x + 3} = 5, or
// 3\sqrt{x - 1} + 4 = 10 with the radical to isolate first), a radical on
// each side (\sqrt{3x - 2} = \sqrt{x + 6}), and a radical equal to a linear
// expression (\sqrt{x + 7} = x + 1), which squares to a quadratic. Opt-in cube
// roots (\sqrt[3]{x - 4} = -2) for the first two kinds.
//
// Extraneous solutions are built deliberately, not found by checking:
// - a square root isolated against a negative number (\sqrt{x + 2} + 5 = 1)
//   squares to a root that fails, so the Answer is "no solution";
// - two square roots that agree only where both radicands are negative
//   (the common value v < 0) give "no solution" the same way;
// - \sqrt{ax + b} = x + c is built from both roots r1, r2 of
//   (x + c)^2 = ax + b (a = 2c + r1 + r2, b = c^2 - r1 r2); a root with
//   r + c < 0 makes the right side negative and is extraneous.
// Cube roots have no extraneous solutions. Nothing is ever solved: every root
// is chosen first and the equation built around it.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import {
  distinctHints,
  div,
  linearLatex,
  NO_SOLUTION,
  rat,
  solutionHint,
  solutionLatex,
  solutionsLatex,
  sub,
  type Rat,
} from "../shared/equationKit";
import { cubeRootsField, rootLatex, type RootIndex } from "./radicalKit";

export const RADICAL_EQUATIONS_ID = "radical-equations";

export type FormMode = "mixed" | "number" | "bothSides" | "linear";
export type Form = Exclude<FormMode, "mixed">;

export const schema = [
  {
    type: "enum",
    key: "form",
    label: "Equations",
    default: "mixed",
    options: [
      { value: "mixed", label: "Mixed" },
      { value: "number", label: "A radical equal to a number, like √(2x + 3) = 5" },
      { value: "bothSides", label: "A radical on each side, like √(3x − 2) = √(x + 6)" },
      { value: "linear", label: "A radical equal to x + c, like √(x + 7) = x + 1" },
    ],
  },
  {
    type: "boolean",
    key: "isolate",
    label: "Include equations where the radical must be isolated first",
    default: true,
  },
  {
    type: "boolean",
    key: "extraneous",
    label: "Include extraneous solutions",
    default: true,
  },
  { ...cubeRootsField, label: "Include cube roots (no extraneous solutions)" },
] as const satisfies ParamSchema;

export interface RadicalEquationConstruction {
  form: Form;
  index: RootIndex;
  left: string;
  right: string;
  /** the valid solutions, ascending ([] for no solution) */
  solutions: number[];
  /** roots of the squared equation that fail the original */
  extraneous: number[];
  /** the Distractors, most common mistake first */
  hints: (string | null)[];
  /** used only when fewer than three distinct hints remain */
  spare?: (string | null)[];
}

// ------------------------------------------------------------------ printing

const lin = (a: number, b: number) => linearLatex([{ coef: rat(a), v: "x" }, { coef: rat(b), v: "" }]);
/** d * root(ax + b) + e, e.g. "3\sqrt{x - 1} + 4" */
function radSide(index: RootIndex, a: number, b: number, d = 1, e = 0): string {
  const core = (d === 1 ? "" : d === -1 ? "-" : String(d)) + rootLatex(index, lin(a, b));
  return e === 0 ? core : `${core} ${e > 0 ? "+" : "-"} ${Math.abs(e)}`;
}

/** A one-value Distractor, unless it is so unwieldy (x = \frac{6751}{81}) that it gives itself away. */
const hint = (r: Rat | null) => (r && (r.d > 12 || Math.abs(r.n) > 150) ? null : solutionHint("x", r));
const hints = (xs: number[]) => (xs.length === 0 ? NO_SOLUTION : solutionsLatex("x", xs.map((x) => rat(x))));

// ------------------------------------------------------------------ forms

interface Opts {
  isolate: boolean;
  extraneous: boolean;
}

/** d * root(ax + b) + e = f, with root(ax + b) = c at the chosen x. */
function numberForm(rng: Rng, index: RootIndex, o: Opts): RadicalEquationConstruction | null {
  const x = rng.int(-9, 12);
  const a = rng.int(1, 5) * (rng.bool(0.2) ? -1 : 1);
  // the value of the radical at x; a negative one has no square root
  const bad = index === 2 && o.extraneous && rng.bool(0.3);
  const c = index === 2 ? rng.int(1, 9) : rng.int(1, 4) * (rng.bool(0.4) ? -1 : 1);
  const b = c ** index - a * x;
  if (x === 0 || Math.abs(b) > 60) return null;
  const isolate = o.isolate && rng.bool(0.6);
  const d = isolate ? rng.int(1, 3) : 1;
  const e = isolate ? rng.int(1, 9) * (rng.bool() ? -1 : 1) : 0;
  const value = bad ? -c : c; // what the isolated radical equals
  const f = d * value + e;
  const xOf = (r: Rat) => div(sub(r, rat(b)), rat(a));
  const list: (string | null)[] = [];
  if (bad) list.push(hint(rat(x)));
  // forgot to square (or cube): ax + b = c
  list.push(hint(xOf(rat(value))));
  if (index === 3) {
    list.push(hint(xOf(rat(value * value)))); // squared instead of cubed
    list.push(hint(xOf(rat(-(value ** 3))))); // lost the sign of the cube
    list.push(hint(xOf(rat(3 * value)))); // multiplied by 3
  }
  if (isolate) {
    // squared each term before isolating: d^2 R + e^2 = f^2
    list.push(hint(xOf(rat(f * f - e * e, d * d))));
    // moved e the wrong way: radical = (f + e)/d
    const wrong = rat(f + e, d);
    list.push(hint(xOf(index === 2 ? rat(wrong.n * wrong.n, wrong.d * wrong.d) : rat(wrong.n ** 3, wrong.d ** 3))));
    // forgot to square d: d R = (f - e)^2
    if (d !== 1) list.push(hint(xOf(index === 2 ? rat((f - e) ** 2, d) : rat((f - e) ** 3, d))));
  }
  if (!bad) list.push(index === 2 ? NO_SOLUTION : null, hint(rat(-x)));
  list.push(hint(rat(x + 1)));
  return {
    form: "number",
    index,
    left: radSide(index, a, b, d, e),
    right: String(f),
    solutions: bad ? [] : [x],
    extraneous: bad ? [x] : [],
    hints: list,
    // With the radical equal to -1, forgetting to square can land on x + 1,
    // so the opposite sign, then x - 1, fill the third place.
    spare: bad ? [hint(rat(-x)), hint(rat(x - 1))] : [],
  };
}

/** d * root(a1 x + b1) = root(a2 x + b2); the radicands are v and d^n v at x. */
function bothSidesForm(rng: Rng, index: RootIndex, o: Opts): RadicalEquationConstruction | null {
  const x = rng.int(-8, 10);
  const bad = index === 2 && o.extraneous && rng.bool(0.3);
  const v = index === 2 ? (bad ? -rng.int(1, 15) : rng.int(1, 20)) : rng.int(1, 12) * (rng.bool(0.3) ? -1 : 1);
  const d = o.isolate && rng.bool(0.3) ? 2 : 1;
  const a1 = rng.int(1, 6);
  const a2 = rng.int(1, d === 1 ? 6 : 10);
  const b1 = v - a1 * x;
  const b2 = d ** index * v - a2 * x;
  if (x === 0 || a2 === d ** index * a1 || b1 === 0 || b2 === 0 || Math.abs(b2) > 60) return null;
  const k = d ** index;
  const slope = k * a1 - a2;
  const list: (string | null)[] = [];
  if (bad) list.push(hint(rat(x)));
  else list.push(index === 2 ? NO_SOLUTION : null);
  // constants moved with the wrong signs
  list.push(hint(div(rat(b2 + k * b1), rat(slope))));
  // forgot to square (cube) the d
  if (d !== 1) list.push(hint(div(rat(b2 - d * b1), rat(d * a1 - a2))));
  list.push(hint(rat(-x)));
  // x terms added rather than subtracted
  list.push(hint(div(rat(b2 - k * b1), rat(k * a1 + a2))));
  list.push(hint(rat(x + 1)));
  return {
    form: "bothSides",
    index,
    left: radSide(index, a1, b1, d),
    right: rootLatex(index, lin(a2, b2)),
    solutions: bad ? [] : [x],
    extraneous: bad ? [x] : [],
    hints: list,
    // when the sign slips coincide (and cube roots offer no "no solution"),
    // x off by one the other way, then the radicands equated without d^n
    spare: [hint(rat(x - 1)), a1 === a2 ? null : hint(div(rat(b2 - b1), rat(a1 - a2)))],
  };
}

/** root(ax + b) = x + c, from the roots r1 < r2 of (x + c)^2 = ax + b. */
function linearForm(rng: Rng, o: Opts): RadicalEquationConstruction | null {
  const c = rng.int(-6, 6);
  const r1 = rng.int(-8, 12);
  const r2 = rng.int(-8, 12);
  if (r1 >= r2) return null;
  const a = 2 * c + r1 + r2;
  const b = c * c - r1 * r2;
  if (a === 0 || Math.abs(a) > 20 || Math.abs(b) > 80) return null;
  const valid = [r1, r2].filter((r) => r + c >= 0);
  const extraneous = [r1, r2].filter((r) => r + c < 0);
  // what this draw should look like
  const want = !o.extraneous ? "both" : rng.pick(["one", "one", "one", "both", "both", "none"] as const);
  const got = valid.length === 2 ? "both" : valid.length === 1 ? "one" : "none";
  if (want !== got) return null;
  // isolate: "x = \sqrt{ax + b} - c" (c != 0) rather than "\sqrt{ax + b} = x + c"
  const isolate = o.isolate && c !== 0 && rng.bool(0.4);
  const left = isolate ? "x" : rootLatex(2, lin(a, b));
  const right = isolate ? `${rootLatex(2, lin(a, b))} ${c > 0 ? "-" : "+"} ${Math.abs(c)}` : lin(1, c);
  const list: (string | null)[] = [];
  if (extraneous.length > 0) {
    list.push(hints([r1, r2]));
    for (const r of extraneous) list.push(hint(rat(r)));
  }
  if (valid.length > 0) list.push(NO_SOLUTION);
  if (valid.length === 2) list.push(hint(rat(r1)), hint(rat(r2)));
  // forgot to square the right side: ax + b = x + c
  list.push(hint(div(rat(c - b), rat(a - 1))));
  list.push(hints([-r1, -r2].filter((r) => r + c >= 0)));
  list.push(hints([-r1, -r2]));
  return { form: "linear", index: 2, left, right, solutions: valid, extraneous, hints: list };
}

export function construct(params: ParamValues, rng: Rng): RadicalEquationConstruction {
  const p = resolveParams(schema, params);
  const mode = p.form as FormMode;
  const o: Opts = { isolate: p.isolate as boolean, extraneous: p.extraneous as boolean };
  const cube = p.cubeRoots as boolean;
  for (;;) {
    const form: Form = mode === "mixed" ? rng.pick(["number", "number", "bothSides", "linear", "linear"] as const) : mode;
    const index: RootIndex = form !== "linear" && cube && rng.bool(0.4) ? 3 : 2;
    const k =
      form === "number" ? numberForm(rng, index, o) : form === "bothSides" ? bothSidesForm(rng, index, o) : linearForm(rng, o);
    if (k) return k;
  }
}

export const promptLatex = (k: RadicalEquationConstruction) => `${k.left} = ${k.right}`;

export function answerLatex(k: RadicalEquationConstruction): string {
  if (k.solutions.length === 0) return NO_SOLUTION;
  return k.solutions.length === 1 ? solutionLatex("x", rat(k.solutions[0])) : hints(k.solutions);
}

/**
 * Mistake-based Distractors, most common first (each form builds its own):
 * - kept an extraneous root (alone, or listed with the valid one), or said
 *   "no solution" for a root that checks;
 * - forgot to square (or cube) the other side;
 * - squared each term before isolating the radical (d^2 R + e^2 = f^2),
 *   moved the constant the wrong way, or forgot to square the coefficient;
 * - for cube roots: squared instead of cubed, lost the sign of the cube, or
 *   multiplied by 3;
 * - radicals on both sides: constants moved with the wrong signs, x terms
 *   added rather than subtracted;
 * - the opposite sign.
 */
export function distractors(k: RadicalEquationConstruction): string[] {
  const out = distinctHints(answerLatex(k), k.hints).slice(0, 6);
  return out.length >= 3 ? out : distinctHints(answerLatex(k), [...k.hints, ...(k.spare ?? [])]).slice(0, 6);
}

export const generator: Generator = {
  id: RADICAL_EQUATIONS_ID,
  title: "Solving radical equations",
  defaultDirections: "Solve each equation. Check for extraneous solutions.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: RADICAL_EQUATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
