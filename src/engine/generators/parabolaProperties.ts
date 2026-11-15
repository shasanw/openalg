// "Properties of parabolas": given y = f(x), find the vertex, the axis of
// symmetry, and the x- and y-intercepts.
//
// Built ANSWER-FROM-CONSTRUCTION. Every quadratic printed has integer
// coefficients a, b, c, and every property is read off exact integer
// arithmetic on the very a, b, c (or a, h, k) we chose, never solved by a CAS:
//   vertex       (h, k) = (-b / 2a, -D / 4a), with D = b^2 - 4ac
//   axis         x = h
//   x-intercepts (-b ± √D) / 2a, or none when D < 0
//   y-intercept  (0, c)
// How a, b, c are chosen depends on the form shown:
// - vertex form a(x - h)^2 + k: pick integers a, h first, then k from the class
//   the x-intercepts must fall in (D = -4ak decides it), and expand to b, c.
// - standard form, rational intercepts: pick distinct integer roots and expand
//   a(x - r1)(x - r2), so the intercepts are literally the chosen numbers.
// - standard form, irrational / no intercepts: pick a, b, then a discriminant of
//   the requested class from the residue class D ≡ b^2 (mod 4|a|), which is what
//   keeps c = (b^2 - D) / 4a an integer (the quadratic-formula generator's trick).
//   This is also what gives standard-form problems fractional vertices.
//
// Graphs (#9): this Topic stays text-only. Graphing a parabola is its own Topic
// (./graphingQuadratics), which reuses this file's facts, Answer and
// Distractors and adds the coordinate grid and answer graph.

import { createRng, type Rng } from "../rng";
import {
  resolveParams,
  type Generator,
  type ParamSchema,
  type ParamValues,
  type Problem,
} from "../types";
import {
  ANSWER_PART_SEPARATOR,
  fractionToLatex,
  gcd,
  quadraticToLatex,
  simplifyRadical,
} from "../format";

export const PARABOLA_PROPERTIES_ID = "parabola-properties";

export type Form = "standard" | "vertex" | "mixed";
export type Ask = "all" | "vertexAxis" | "intercepts";
export type InterceptType = "rational" | "irrational" | "none";

export const schema = [
  {
    type: "enum",
    key: "ask",
    label: "Properties to find",
    default: "all",
    options: [
      { value: "all", label: "Vertex, axis and intercepts" },
      { value: "vertexAxis", label: "Vertex and axis of symmetry" },
      { value: "intercepts", label: "Intercepts only" },
    ],
  },
  {
    type: "enum",
    key: "form",
    label: "Equation given in",
    default: "standard",
    options: [
      { value: "standard", label: "Standard form" },
      { value: "vertex", label: "Vertex form" },
      { value: "mixed", label: "A mix of both" },
    ],
  },
  {
    type: "enum",
    key: "interceptType",
    label: "x-intercepts",
    default: "rational",
    options: [
      { value: "rational", label: "Rational" },
      { value: "irrational", label: "Irrational (radicals)" },
      { value: "none", label: "None (misses the x-axis)" },
    ],
  },
  {
    type: "boolean",
    key: "allowLeadingCoefficient",
    label: "Allow a leading coefficient (|a| > 1)",
    default: true,
  },
  {
    type: "boolean",
    key: "allowOpensDown",
    label: "Allow parabolas that open downward (a < 0)",
    default: true,
  },
  {
    type: "int",
    key: "maxValue",
    label: "Largest vertex / root magnitude",
    min: 2,
    max: 12,
    default: 6,
  },
] as const satisfies ParamSchema;

/** An exact rational n/d with d > 0 (not necessarily reduced). */
export interface Rational {
  n: number;
  d: number;
}

/**
 * The exact x-intercepts (p ± q√s) / r, as in the quadratic-formula generator:
 * s === 1 is rational, s > 1 irrational, s === 0 a single touching root, and
 * s < 0 means there are no real intercepts.
 */
export interface ExactRoots {
  p: number;
  q: number;
  s: number;
  r: number;
}

/** Everything the answer states, as exact values. */
export interface Facts {
  vertex: [Rational, Rational];
  axis: Rational;
  /** Rendered as "y = …" instead of "x = …": only used by a distractor. */
  axisAsY?: boolean;
  xIntercepts: ExactRoots;
  /** The y-intercept point, as [x, y]; the answer always has x = 0. */
  yIntercept: [number, number];
}

/** The structured construction. Exposed for property tests. */
export interface ParabolaConstruction {
  form: "standard" | "vertex";
  a: number;
  b: number;
  c: number;
  /** b^2 - 4ac, computed from the a, b, c we print */
  D: number;
  /** integer vertex for vertex form (the h, k actually printed) */
  h?: number;
  k?: number;
  facts: Facts;
}

// `+ 0` normalizes -0, so equal values always compare (and render) equal
const q = (n: number, d = 1): Rational =>
  d < 0 ? { n: -n + 0, d: -d } : { n: n + 0, d };

/** Build the normalized exact root form for (p0 ± √D) / r0. */
export function makeRoots(p0: number, D: number, r0: number): ExactRoots {
  const { outside, inside } = simplifyRadical(Math.abs(D));
  let p = p0;
  let qq = outside;
  let r = r0;
  if (r < 0) {
    p = -p;
    r = -r;
  }
  const g = gcd(gcd(Math.abs(p), qq), r) || 1;
  return { p: p / g, q: qq / g, s: D < 0 ? -inside : inside, r: r / g };
}

/** Read every property off integer a, b, c exactly. */
export function factsFrom(a: number, b: number, c: number): Facts {
  const D = b * b - 4 * a * c;
  const h = q(-b, 2 * a);
  return {
    vertex: [h, q(-D, 4 * a)],
    axis: h,
    xIntercepts: makeRoots(-b, D, 2 * a),
    yIntercept: [0, c],
  };
}

function isPerfectSquare(n: number): boolean {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

/** |a| <= min(3, maxValue): keeps numbers small, and lets vertex form with
 * rational intercepts (|k| = |a| m^2) stay within maxValue. */
function pickA(
  rng: Rng,
  allowLeading: boolean,
  allowDown: boolean,
  M: number,
): number {
  const mag = allowLeading ? rng.int(1, Math.min(3, M)) : 1;
  return allowDown && rng.bool() ? -mag : mag;
}

/** Vertex form: integer h, k with the intercept class decided by D = -4ak. */
function constructVertex(
  rng: Rng,
  a: number,
  type: InterceptType,
  M: number,
): { h: number; k: number } {
  // h !== 0, so the vertex form is genuinely shifted (not just a x^2 + k)
  const h = rng.pick([...range(-M, -1), ...range(1, M)]);
  const sign = Math.sign(a);
  const A = Math.abs(a);
  let k: number;
  if (type === "rational") {
    // k = -a m^2 makes -k/a = m^2, so the roots are h ± m.
    const m = rng.int(1, Math.max(1, Math.floor(Math.sqrt(M / A))));
    k = -a * m * m;
  } else if (type === "irrational") {
    // |a||k| not a perfect square, k opposite in sign to a.
    const mags: number[] = [];
    for (let t = 1; t <= M; t++) if (!isPerfectSquare(A * t)) mags.push(t);
    k = -sign * rng.pick(mags);
  } else {
    // same sign as a: the parabola never reaches the x-axis
    k = sign * rng.int(1, M);
  }
  return { h, k };
}

/** Standard form, irrational / none: discriminants of the requested class in
 * the residue class D ≡ b^2 (mod 4|a|), smallest |D| first. Never empty. */
function discriminants(a: number, b: number, type: InterceptType): number[] {
  const m = 4 * Math.abs(a);
  const rho = ((b * b) % m + m) % m;
  const out: number[] = [];
  if (type === "irrational") {
    for (let t = 0; t < 12 && out.length < 4; t++) {
      const D = (rho === 0 ? m : rho) + m * t;
      if (!isPerfectSquare(D)) out.push(D);
    }
  } else {
    for (let t = 1; t <= 3; t++) out.push(rho - m * t);
  }
  return out;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): ParabolaConstruction {
  const p = resolveParams(schema, params);
  const type = p.interceptType as InterceptType;
  const M = p.maxValue as number;
  const formParam = p.form as Form;
  const form: "standard" | "vertex" =
    formParam === "mixed" ? (rng.bool() ? "vertex" : "standard") : formParam;
  const a = pickA(
    rng,
    p.allowLeadingCoefficient as boolean,
    p.allowOpensDown as boolean,
    M,
  );

  let b: number;
  let c: number;
  let h: number | undefined;
  let k: number | undefined;
  if (form === "vertex") {
    ({ h, k } = constructVertex(rng, a, type, M));
    b = -2 * a * h;
    c = a * h * h + k;
  } else if (type === "rational") {
    const r1 = rng.int(-M, M);
    let r2 = rng.int(-M, M);
    if (r2 === r1) r2 = r1 === M ? r1 - 1 : r1 + 1;
    b = -a * (r1 + r2);
    c = a * r1 * r2;
  } else {
    b = rng.int(-M, M);
    const D = rng.pick(discriminants(a, b, type));
    c = (b * b - D) / (4 * a);
  }

  const D = b * b - 4 * a * c;
  return { form, a, b, c, D, h, k, facts: factsFrom(a, b, c) };
}

// ---------------------------------------------------------------- rendering
//
// Kept to constructs known to survive both KaTeX and mitex (checked against
// mitex 0.2.7): \text{}, \frac, \sqrt, \pm, \left( \right), \quad.

function ratLatex(r: Rational): string {
  return fractionToLatex(r.n, r.d);
}

function point(x: string, y: string): string {
  return x.includes("\\frac") || y.includes("\\frac")
    ? `\\left(${x}, ${y}\\right)`
    : `(${x}, ${y})`;
}

function radicalTerm(qq: number, s: number): string {
  return `${qq === 1 ? "" : qq}\\sqrt{${s}}`;
}

/** The x-intercepts as points, "(x1, 0), (x2, 0)" or "(p ± q√s / r, 0)". */
export function xInterceptsLatex(x: ExactRoots): string {
  if (x.s < 0) return "\\text{none}";
  if (x.q === 0 || x.s === 0) return point(fractionToLatex(x.p, x.r), "0");
  if (x.s === 1) {
    const vals = [
      { n: x.p - x.q, d: x.r },
      { n: x.p + x.q, d: x.r },
    ].sort((u, v) => u.n / u.d - v.n / v.d);
    return vals.map((v) => point(fractionToLatex(v.n, v.d), "0")).join(", ");
  }
  const rad = radicalTerm(x.q, x.s);
  if (x.p === 0) {
    return point(x.r === 1 ? `\\pm ${rad}` : `\\pm \\frac{${rad}}{${x.r}}`, "0");
  }
  const numer = `${x.p} \\pm ${rad}`;
  return point(x.r === 1 ? numer : `\\frac{${numer}}{${x.r}}`, "0");
}

/** The multi-part Answer as one LaTeX string, e.g.
 * "\text{Vertex: } (2, -1);\quad \text{Axis: } x = 2;\quad ..." */
export function answerToLatex(f: Facts, ask: Ask): string {
  const parts: string[] = [];
  if (ask !== "intercepts") {
    parts.push(
      `\\text{Vertex: } ${point(ratLatex(f.vertex[0]), ratLatex(f.vertex[1]))}`,
      f.axisAsY
        ? `\\text{Axis: } y = ${ratLatex(f.vertex[1])}`
        : `\\text{Axis: } x = ${ratLatex(f.axis)}`,
    );
  }
  if (ask !== "vertexAxis") {
    parts.push(
      `x\\text{-intercepts: } ${xInterceptsLatex(f.xIntercepts)}`,
      `y\\text{-intercept: } ${point(String(f.yIntercept[0]), String(f.yIntercept[1]))}`,
    );
  }
  return parts.join(ANSWER_PART_SEPARATOR);
}

/** y = a(x - h)^2 + k, hiding a unit a, a zero h and a zero k. */
export function vertexFormToLatex(a: number, h: number, k: number): string {
  const lead = a === 1 ? "" : a === -1 ? "-" : String(a);
  const square =
    h === 0 ? "x^2" : `(x ${h > 0 ? "-" : "+"} ${Math.abs(h)})^2`;
  const body = lead + square;
  const tail = k === 0 ? "" : ` ${k > 0 ? "+" : "-"} ${Math.abs(k)}`;
  return `y = ${body}${tail}`;
}

export function promptToLatex(k: ParabolaConstruction): string {
  return k.form === "vertex"
    ? vertexFormToLatex(k.a, k.h as number, k.k as number)
    : `y = ${quadraticToLatex(k.a, k.b, k.c)}`;
}

// ---------------------------------------------------------------- distractors

/** Mistake-based distractors: each is the full answer with ONE classic error.
 * Errors in properties the Topic Options do not ask for render identically to
 * the answer and are dropped, so the set adapts to `ask`. */
export function distractors(k: ParabolaConstruction, ask: Ask): string[] {
  const { a, b, c, D, facts } = k;
  const [hv, kv] = facts.vertex;
  const negH = q(-hv.n, hv.d);
  const variants: Facts[] = [
    // sign of h flipped: x = b/2a instead of -b/2a (standard form, then
    // substituted back), or (x - h) misread as h -> -h (vertex form)
    {
      ...facts,
      vertex: [negH, k.form === "vertex" ? kv : q(3 * b * b + 4 * a * c, 4 * a)],
      axis: negH,
    },
    // axis of symmetry written through the vertex's y-coordinate
    { ...facts, axisAsY: true },
    // vertex coordinates swapped
    { ...facts, vertex: [kv, hv], axis: kv },
    // sign error in the discriminant (b^2 + 4ac): flips "none" vs real roots
    { ...facts, xIntercepts: makeRoots(-b, b * b + 4 * a * c, 2 * a) },
    // forgot to negate b in -b ± √D
    { ...facts, xIntercepts: makeRoots(b, D, 2 * a) },
    // divided by a instead of 2a
    { ...facts, xIntercepts: makeRoots(-b, D, a) },
    // y-intercept: vertex form's k (forgot a h^2), standard form's coordinates swapped
    {
      ...facts,
      yIntercept: k.form === "vertex" ? [0, k.k as number] : [c, 0],
    },
  ];
  const correct = answerToLatex(facts, ask);
  const seen = new Set<string>([correct]);
  const out: string[] = [];
  for (const v of variants) {
    const tex = answerToLatex(v, ask);
    if (seen.has(tex)) continue;
    seen.add(tex);
    out.push(tex);
  }
  return out;
}

export const generator: Generator = {
  id: PARABOLA_PROPERTIES_ID,
  course: "Algebra 2",
  unit: "Quadratics",
  title: "Properties of parabolas (vertex, axis, intercepts)",
  defaultDirections:
    "Find the vertex, axis of symmetry, and intercepts of each parabola.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const ask = resolved.ask as Ask;
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: PARABOLA_PROPERTIES_ID,
      params: resolved,
      seed,
      prompt: promptToLatex(k),
      answer: answerToLatex(k.facts, ask),
      distractorHints: distractors(k, ask),
    };
  },
};
