// "Solving multi-step equations": the distributive property, combining like
// terms and variables on both sides, alone or together, with optional
// no-solution and all-real-numbers equations.
//
// Built ANSWER-FROM-CONSTRUCTION: a template fixes the shape (which terms and
// groups sit on which side), its coefficients are drawn, then the solution x
// is chosen and ONE constant (the "free" constant) is computed so that both
// sides agree at x. For a fraction solution, x = n/K where K is the net
// coefficient of x, so the free constant still comes out a whole number. The
// special cases give both sides the same coefficient of x and then make the
// constants agree (all real numbers) or differ (no solution). Nothing is ever
// solved.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import {
  add,
  ALL_REALS,
  distinctHints,
  div,
  linearLatex,
  neg,
  NO_SOLUTION,
  nonzeroInt,
  pickVariable,
  rat,
  solutionHint,
  solutionLatex,
  sub,
  varyVariableField,
  type Rat,
} from "./equationKit";

export const MULTI_STEP_EQUATIONS_ID = "multi-step-equations";

export type Solutions = "integer" | "fraction";
export type Feature = "distribute" | "combine" | "bothSides";

export const schema = [
  {
    type: "boolean",
    key: "distribute",
    label: "Distributive property",
    default: true,
  },
  {
    type: "boolean",
    key: "combineLikeTerms",
    label: "Combining like terms",
    default: true,
  },
  {
    type: "boolean",
    key: "bothSides",
    label: "Variables on both sides",
    default: true,
  },
  {
    type: "boolean",
    key: "specialCases",
    label: "Include no-solution and all-real-numbers equations",
    default: false,
  },
  {
    type: "enum",
    key: "solutions",
    label: "Solutions",
    default: "integer",
    options: [
      { value: "integer", label: "Integers" },
      { value: "fraction", label: "Fractions" },
    ],
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative numbers",
    default: true,
  },
  {
    type: "int",
    key: "maxSolution",
    label: "Largest solution",
    min: 2,
    max: 50,
    default: 10,
  },
  {
    type: "int",
    key: "maxCoefficient",
    label: "Largest coefficient or constant",
    min: 2,
    max: 12,
    default: 6,
  },
  varyVariableField,
] as const satisfies ParamSchema;

// ------------------------------------------------------------------ pieces

/** A term coef·x (x: true) or a constant, or a group mult(p·x + q). */
export type Piece =
  | { kind: "term"; coef: number; x: boolean }
  | { kind: "group"; mult: number; p: number; q: number };

export interface Equation {
  left: Piece[];
  right: Piece[];
}

/** Where the free constant sits: the last constant on the right side. */
const FREE = Symbol("free");

/** x-coefficient and constant of a side (exact, integers). */
export function sideParts(side: Piece[]): { xc: number; k: number } {
  let xc = 0;
  let k = 0;
  for (const p of side) {
    if (p.kind === "term") {
      if (p.x) xc += p.coef;
      else k += p.coef;
    } else {
      xc += p.mult * p.p;
      k += p.mult * p.q;
    }
  }
  return { xc, k };
}

// ------------------------------------------------------------------ templates

interface Draw {
  /** x coefficient, possibly 1 ("x") */
  xc(): number;
  /** a group multiplier, |m| >= 2 */
  mult(): number;
  /** a constant, either sign (a negative one prints as subtraction) */
  k(): number;
  /** the x-coefficient inside a group, >= 2 */
  inner(): number;
}

type Slot = Piece | typeof FREE;
interface Template {
  name: string;
  features: Feature[];
  build(d: Draw): { left: Slot[]; right: Slot[] };
}

const T = (coef: number, x = true): Piece => ({ kind: "term", coef, x });
const G = (mult: number, q: number, p = 1): Piece => ({ kind: "group", mult, p, q });

/** Equations with one solution. */
export const TEMPLATES: readonly Template[] = [
  { name: "D1", features: ["distribute"], build: (d) => ({ left: [G(d.mult(), d.k())], right: [FREE] }) },
  {
    name: "D2",
    features: ["distribute"],
    build: (d) => ({ left: [G(d.mult(), d.k(), d.inner())], right: [FREE] }),
  },
  { name: "D3", features: ["distribute"], build: (d) => ({ left: [G(d.mult(), d.k()), T(d.k(), false)], right: [FREE] }) },
  { name: "C1", features: ["combine"], build: (d) => ({ left: [T(d.xc()), T(d.k(), false), T(d.xc())], right: [FREE] }) },
  {
    name: "C2",
    features: ["combine"],
    build: (d) => ({ left: [T(d.xc()), T(d.k(), false), T(d.xc()), T(d.k(), false)], right: [FREE] }),
  },
  { name: "DC1", features: ["distribute", "combine"], build: (d) => ({ left: [G(d.mult(), d.k()), T(d.xc())], right: [FREE] }) },
  { name: "DC2", features: ["distribute", "combine"], build: (d) => ({ left: [T(d.xc()), G(d.mult(), d.k())], right: [FREE] }) },
  { name: "B1", features: ["bothSides"], build: (d) => ({ left: [T(d.xc()), T(d.k(), false)], right: [T(d.xc()), FREE] }) },
  { name: "B2", features: ["bothSides"], build: (d) => ({ left: [T(d.xc()), T(d.k(), false)], right: [FREE, T(d.xc())] }) },
  { name: "DB1", features: ["distribute", "bothSides"], build: (d) => ({ left: [G(d.mult(), d.k())], right: [T(d.xc()), FREE] }) },
  {
    name: "DB2",
    features: ["distribute", "bothSides"],
    build: (d) => ({ left: [G(d.mult(), d.k())], right: [G(d.mult(), d.k()), FREE] }),
  },
  {
    name: "CB1",
    features: ["combine", "bothSides"],
    build: (d) => ({ left: [T(d.xc()), T(d.k(), false), T(d.xc())], right: [T(d.xc()), FREE] }),
  },
  {
    name: "DCB1",
    features: ["distribute", "combine", "bothSides"],
    build: (d) => ({ left: [G(d.mult(), d.k()), T(d.xc())], right: [T(d.xc()), FREE] }),
  },
];

/**
 * No-solution and all-real-numbers equations: the right side gets the same
 * coefficient of x as the left (built here from the left side), so x cancels.
 * Each needs only the features listed (and is a both-sides equation by nature).
 */
const SPECIAL_TEMPLATES: readonly Template[] = [
  {
    // constant first on the right, so the all-real-numbers case reads
    // "3x + 4 = 4 + 3x" rather than two identical sides
    name: "S1",
    features: [],
    build: (d) => {
      const left = [T(d.xc()), T(d.k(), false)];
      return { left, right: [FREE, T(sideParts(left).xc)] };
    },
  },
  { name: "S2", features: ["distribute"], build: (d) => withMatchingRight([G(d.mult(), d.k())]) },
  { name: "S3", features: ["combine"], build: (d) => withMatchingRight([T(d.xc()), T(d.k(), false), T(d.xc())]) },
  { name: "S4", features: ["distribute", "combine"], build: (d) => withMatchingRight([G(d.mult(), d.k()), T(d.xc())]) },
  {
    name: "S5",
    features: ["distribute"],
    build: (d) => {
      const left = [G(d.mult(), d.k())];
      const g = left[0] as Extract<Piece, { kind: "group" }>;
      return { left, right: [G(g.mult, d.k()), FREE] };
    },
  },
];

function withMatchingRight(left: Piece[]): { left: Slot[]; right: Slot[] } {
  return { left, right: [T(sideParts(left).xc), FREE] };
}

// ------------------------------------------------------------------ construction

export type Outcome = "one" | "none" | "all";

/** The structured construction. Exposed for property tests. */
export interface MultiStepConstruction {
  template: string;
  outcome: Outcome;
  v: string;
  eq: Equation;
  /** the Answer when outcome is "one" */
  x: Rat | null;
}

function enabledFeatures(p: ParamValues): Feature[] {
  const f: Feature[] = [];
  if (p.distribute) f.push("distribute");
  if (p.combineLikeTerms) f.push("combine");
  if (p.bothSides) f.push("bothSides");
  // nothing ticked means "anything goes" rather than an empty Section
  return f.length > 0 ? f : ["distribute", "combine", "bothSides"];
}

const leadsNegative = (side: Piece[]) => {
  const first = side[0];
  return first.kind === "term" ? first.coef < 0 : first.mult < 0;
};

/** Checks every printed equation must pass, beyond the Answer itself. */
function wellFormed(eq: Equation, negOk: boolean): boolean {
  for (const side of [eq.left, eq.right]) {
    if (side.length === 0) return false;
    for (const p of side) {
      if (p.kind === "term" && p.coef === 0) return false;
      if (p.kind === "group" && (p.q === 0 || p.mult === 0)) return false;
    }
    // like terms that cancel on one side (3x + 4 - 3x) are not "combining"
    const xs = side.filter((p) => p.kind === "group" || p.x);
    if (xs.length >= 2 && sideParts(xs).xc === 0) return false;
    if (!negOk) {
      if (leadsNegative(side)) return false;
      for (const p of side) {
        if (p.kind === "term" && p.x && p.coef < 0) return false;
        if (p.kind === "group" && p.mult < 0) return false;
      }
    }
  }
  return true;
}

/** Fill the free constant so that both sides agree at x (or, for the special
 * cases, so the constants agree or differ by `shift`). */
function fill(built: { left: Slot[]; right: Slot[] }, freeValue: (rest: Equation) => number): Equation {
  const strip = (s: Slot[]) => s.filter((p): p is Piece => p !== FREE);
  const rest: Equation = { left: strip(built.left), right: strip(built.right) };
  const value = freeValue(rest);
  const place = (s: Slot[]) => s.map((p) => (p === FREE ? T(value, false) : p));
  return { left: place(built.left), right: place(built.right) };
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): MultiStepConstruction {
  const p = resolveParams(schema, params);
  const S = p.maxSolution as number;
  const C = p.maxCoefficient as number;
  const negOk = p.allowNegatives as boolean;
  const fractions = p.solutions === "fraction";
  const features = enabledFeatures(p);
  const v = pickVariable(rng, p.varyVariable as boolean);
  const allowed = (t: Template) => t.features.every((f) => features.includes(f));

  // Fraction solutions need a net x-coefficient of at least 2, which small
  // positive coefficients on both sides cannot always give; if many draws
  // fail, the x-coefficients may go up to 4.
  let xcMax = C;
  const draw: Draw = {
    xc: () => nonzeroInt(rng, 1, xcMax, negOk),
    mult: () => nonzeroInt(rng, 2, C, negOk),
    k: () => nonzeroInt(rng, 1, C, true),
    inner: () => rng.int(2, Math.max(2, Math.min(C, 5))),
  };

  const outcome: Outcome = p.specialCases && rng.bool(0.3) ? rng.pick(["none", "all"] as const) : "one";

  if (outcome !== "one") {
    const options = SPECIAL_TEMPLATES.filter(allowed);
    for (let tries = 0; tries < 200; tries++) {
      const t = rng.pick(options);
      const built = t.build(draw);
      const shift = outcome === "none" ? nonzeroInt(rng, 1, C, true) : 0;
      const eq = fill(built, (rest) => sideParts(rest.left).k - sideParts(rest.right).k + shift);
      const free = eq.right.find((_, i) => built.right[i] === FREE) as Extract<Piece, { kind: "term" }>;
      if (free.coef === 0) continue; // would print "2x + 6 = 2x"
      // "3x + 4 = 3x + 4" is no exercise: the sides must look different
      if (sideLatex(eq.left, v) === sideLatex(eq.right, v)) continue;
      if (wellFormed(eq, negOk)) return { template: t.name, outcome, v, eq, x: null };
    }
    // fall through to a one-solution equation (practically unreachable)
  }

  const options = TEMPLATES.filter(allowed);
  for (let tries = 0; tries < 500; tries++) {
    if (tries === 250) xcMax = Math.max(C, 4);
    const t = rng.pick(options);
    const built = t.build(draw);
    const strip = (s: Slot[]) => s.filter((q): q is Piece => q !== FREE);
    const K = sideParts(strip(built.left)).xc - sideParts(strip(built.right)).xc;
    if (K === 0 || (fractions && Math.abs(K) < 2)) continue;
    let x: Rat;
    if (fractions) {
      const A = Math.abs(K);
      let n = nonzeroInt(rng, 1, S * A, negOk);
      if (n % A === 0) n -= n > 0 ? 1 : -1; // toward zero keeps |x| <= S
      x = rat(n, A);
    } else x = rat(nonzeroInt(rng, 1, S, negOk));
    // free = (left at x) - (rest of right at x); an integer since K·x is
    const eq = fill(built, (rest) => {
      const l = sideParts(rest.left);
      const r = sideParts(rest.right);
      const value = add(rat((l.xc - r.xc) * x.n, x.d), rat(l.k - r.k));
      if (value.d !== 1) throw new Error("multi-step: free constant is not an integer");
      return value.n;
    });
    const free = eq.right.find((_, i) => built.right[i] === FREE) as Extract<Piece, { kind: "term" }>;
    // keep the computed constant about as readable as the drawn ones
    if (free.coef === 0 || Math.abs(free.coef) > 10 * C) continue;
    if (wellFormed(eq, negOk)) return { template: t.name, outcome: "one", v, eq, x };
  }
  // Unreachable in practice (the tests check); a safe, always-valid fallback.
  const x = fractions ? rat(1, 2) : rat(Math.min(S, 3));
  return {
    template: "fallback",
    outcome: "one",
    v,
    eq: { left: [G(2, 1)], right: [T((2 * x.n) / x.d + 2, false)] },
    x,
  };
}

// ------------------------------------------------------------------ rendering

function pieceBody(p: Piece, v: string): { negative: boolean; body: string } {
  if (p.kind === "term") {
    const mag = Math.abs(p.coef);
    const body = p.x ? (mag === 1 ? v : `${mag}${v}`) : String(mag);
    return { negative: p.coef < 0, body };
  }
  const inner = linearLatex([{ coef: rat(p.p), v }, { coef: rat(p.q), v: "" }]);
  return { negative: p.mult < 0, body: `${Math.abs(p.mult)}(${inner})` };
}

export function sideLatex(side: Piece[], v: string): string {
  return side
    .map((p, i) => {
      const { negative, body } = pieceBody(p, v);
      if (i === 0) return (negative ? "-" : "") + body;
      return ` ${negative ? "-" : "+"} ${body}`;
    })
    .join("");
}

export function promptLatex(k: MultiStepConstruction): string {
  return `${sideLatex(k.eq.left, k.v)} = ${sideLatex(k.eq.right, k.v)}`;
}

export function answerLatex(k: MultiStepConstruction): string {
  if (k.outcome === "none") return NO_SOLUTION;
  if (k.outcome === "all") return ALL_REALS;
  return solutionLatex(k.v, k.x!);
}

// ------------------------------------------------------------------ distractors

type Mistake = "none" | "partial" | "negSign" | "absCombine";

/** A side's x-coefficient and constant as a student making `mistake` would get them. */
function mistakenParts(side: Piece[], mistake: Mistake): { xc: number; k: number } {
  let xc = 0;
  let k = 0;
  const hasNegativeX = side.some((p) => (p.kind === "term" ? p.x && p.coef < 0 : p.mult * p.p < 0));
  const xCount = side.filter((p) => p.kind === "group" || p.x).length;
  for (const p of side) {
    if (p.kind === "term") {
      if (!p.x) k += p.coef;
      else xc += mistake === "absCombine" && hasNegativeX && xCount >= 2 ? Math.abs(p.coef) : p.coef;
    } else {
      const px = p.mult * p.p;
      xc += mistake === "absCombine" && hasNegativeX && xCount >= 2 ? Math.abs(px) : px;
      if (mistake === "partial") k += p.q; // multiplied only the first term
      else if (mistake === "negSign" && p.mult < 0) k -= p.mult * p.q; // -2(x - 4) -> -2x - 8
      else k += p.mult * p.q;
    }
  }
  return { xc, k };
}

/** x = (kR - kL) / (xL - xR), or null when that divides by zero. */
function solveParts(l: { xc: number; k: number }, r: { xc: number; k: number }): Rat | null {
  return div(rat(r.k - l.k), rat(l.xc - r.xc));
}

/**
 * Mistake-based Distractors, each the answer to a mis-solved equation:
 * - distributed to the first term only: 3(x + 4) -> 3x + 4;
 * - dropped the sign when distributing a negative: -2(x - 4) -> -2x - 8;
 * - combined like terms ignoring a minus sign: 5x - 2x -> 7x;
 * - moved the x-term across without changing its sign;
 * - moved a constant across without changing its sign;
 * - a sign slip at the end (-x), or dividing the wrong way round.
 * For no solution: "all real numbers", x = 0, and "x = d" where d is the
 * nonzero constant left over (0 = d read as x = d). For all real numbers:
 * "no solution", x = 0, and "x = c" from reading c = c as x = c.
 * Distinct, and never equal to the Answer.
 */
export function distractors(k: MultiStepConstruction): string[] {
  const { left, right } = k.eq;
  const l = sideParts(left);
  const r = sideParts(right);
  const answer = answerLatex(k);
  const v = k.v;
  if (k.outcome === "none") {
    const d = r.k - l.k;
    return distinctHints(answer, [ALL_REALS, `${v} = 0`, `${v} = ${d}`, `${v} = ${-d}`, `${v} = 1`]);
  }
  if (k.outcome === "all") {
    const c = r.k;
    return distinctHints(answer, [NO_SOLUTION, `${v} = 0`, `${v} = ${c}`, `${v} = 1`, `${v} = -1`]);
  }
  const x = k.x!;
  const values: (Rat | null)[] = [];
  const hasGroup = [...left, ...right].some((p) => p.kind === "group");
  const hasNegGroup = [...left, ...right].some((p) => p.kind === "group" && p.mult < 0);
  if (hasNegGroup) values.push(solveParts(mistakenParts(left, "negSign"), mistakenParts(right, "negSign")));
  if (hasGroup) values.push(solveParts(mistakenParts(left, "partial"), mistakenParts(right, "partial")));
  values.push(solveParts(mistakenParts(left, "absCombine"), mistakenParts(right, "absCombine")));
  if (r.xc !== 0) values.push(div(rat(r.k - l.k), rat(l.xc + r.xc))); // x-term moved without sign change
  if (l.k !== 0 && r.k !== 0) values.push(div(rat(r.k + l.k), rat(l.xc - r.xc))); // constant moved without sign change
  values.push(neg(x));
  values.push(div(rat(l.xc - r.xc), rat(r.k - l.k))); // divided the wrong way round
  values.push(add(x, rat(1)), sub(x, rat(1)));
  return distinctHints(
    answer,
    values.map((val) => solutionHint(v, val)),
  ).slice(0, 6);
}

export const generator: Generator = {
  id: MULTI_STEP_EQUATIONS_ID,
  title: "Solving multi-step equations",
  defaultDirections: "Solve each equation.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: MULTI_STEP_EQUATIONS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
