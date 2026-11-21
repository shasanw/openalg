// "Multiple-angle identities": double-angle values from one value and the
// quadrant (\sin\theta = \frac{3}{5} in Quadrant II gives \sin 2\theta =
// -\frac{24}{25}, \cos 2\theta = \frac{7}{25}, \tan 2\theta =
// -\frac{24}{7}), half-angle values (\sin 22.5^{\circ} =
// \frac{\sqrt{2 - \sqrt{2}}}{2}, \tan \frac{\pi}{12} = 2 - \sqrt{3}, and
// \sin\frac{\theta}{2} from \cos\theta), and rewriting one side of an
// identity as a single function (1 - 2\sin^{2} 3x is \cos 6x;
// 2\sin 15^{\circ} \cos 15^{\circ} is \frac{1}{2}).
//
// Built ANSWER-FIRST. Double and half from a value: the point (from a
// Pythagorean triple) and quadrant are chosen first; every value is a ratio of
// its coordinates put through the formula exactly. Half-angle exact values:
// the angle h (2h standard, h not) is chosen first; trigKit's halfAngleValue
// gives the value in the form the formula produces (a nested radical for sin
// and cos, a sum of surds for tan). Sine and cosine use only odd multiples of
// 22.5°: at odd multiples of 15° the formula's √(2 ± √3)/2 denests to
// (√6 ± √2)/4, so it would not be in simplest form (those angles belong to the
// sum and difference identities); tangent uses both. Rewriting: the single function f(2u) (or
// tan u) is chosen first and one side of its identity is printed.

import { createRng, type Rng } from "../../rng";
import { ANSWER_PART_SEPARATOR } from "../../format";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { add, distinctHints, div, mul, neg, numLatex, rat, sub, type Rat } from "../shared/equationKit";
import {
  angleLatex,
  exactValue,
  halfAngleValue,
  halfValueLatex,
  halfValueNumber,
  locationLatex,
  nestedNeg,
  PYTHAGOREAN_TRIPLES,
  sumLatex,
  sumAdd,
  sumDiv,
  sumNeg,
  sumScale,
  sumSub,
  surd,
  surdLatex,
  surdSum,
  surdToSum,
  trigOf,
  trigValueLatex,
  valueMistakes,
  type Angle,
  type AngleUnit,
  type HalfValue,
  type Quadrant,
  type Surd,
} from "./trigKit";

export const MULTIPLE_ANGLE_ID = "multiple-angle-identities";

export type ProblemType = "double" | "half" | "rewrite" | "mixed";
export type Units = AngleUnit | "mixed";
type Fn3 = "sin" | "cos" | "tan";

export const schema = [
  {
    type: "enum",
    key: "problemType",
    label: "Problems",
    default: "mixed",
    options: [
      { value: "double", label: "Double-angle values from one value" },
      { value: "half", label: "Half-angle values" },
      { value: "rewrite", label: "Rewrite as one function, like 2 sin x cos x = sin 2x" },
      { value: "mixed", label: "Mixed" },
    ],
  },
  {
    type: "enum",
    key: "units",
    label: "Angles",
    default: "degrees",
    options: [
      { value: "degrees", label: "Degrees" },
      { value: "radians", label: "Radians" },
      { value: "mixed", label: "Both" },
    ],
  },
  { type: "boolean", key: "tangent", label: "Include tangent", default: true },
] as const satisfies ParamSchema;

// ------------------------------------------------------------------ constructions

/** sin and cos of θ (exact), its quadrant, and which value the prompt states. */
export interface Given {
  sin: Rat;
  cos: Rat;
  quadrant: Quadrant;
  stated: Fn3;
}

export interface DoubleConstruction {
  type: "double";
  given: Given;
  fns: Fn3[];
}

export interface HalfExactConstruction {
  type: "halfExact";
  fn: Fn3;
  /** the half angle: 2h standard, h not */
  h: Angle;
  unit: AngleUnit;
}

export interface HalfGivenConstruction {
  type: "halfGiven";
  given: Given;
  fns: Fn3[];
  unit: AngleUnit;
}

/** The identities a rewrite Problem prints one side of. */
export type Form = "sin2" | "cos2diff" | "cos2cos" | "cos2sin" | "tan2" | "tanHalfCos" | "tanHalfSin";

export interface RewriteConstruction {
  type: "rewrite";
  form: Form;
  /** u = k·x, or a numeric angle when `angle` is set */
  k: number;
  angle: Angle | null;
  unit: AngleUnit;
  /** for "sin2": the printed coefficient c in c\sin u\cos u */
  c: number;
}

export type Construction = DoubleConstruction | HalfExactConstruction | HalfGivenConstruction | RewriteConstruction;

const TRIPLES = PYTHAGOREAN_TRIPLES.slice(0, 4);
const QUADRANT_SIGNS: Record<Quadrant, [number, number]> = { 1: [1, 1], 2: [-1, 1], 3: [-1, -1], 4: [1, -1] };

function pickGiven(rng: Rng, stated: readonly Fn3[]): Given {
  const [a, b, c] = rng.pick(TRIPLES);
  const [u, v] = rng.bool() ? [a, b] : [b, a];
  const quadrant = rng.int(1, 4) as Quadrant;
  const [sx, sy] = QUADRANT_SIGNS[quadrant];
  return { cos: rat(sx * u, c), sin: rat(sy * v, c), quadrant, stated: rng.pick(stated) };
}

/** Odd multiples of π/8 in (0, 2π): halves of standard angles whose sin and cos stay nested radicals. */
const EIGHTHS: readonly Angle[] = [1, 3, 5, 7, 9, 11, 13, 15].map((k) => rat(k, 8));
/** Odd multiples of π/12 and of π/8 in (0, 2π): halves of standard angles that are not standard. */
const HALF_ANGLES: readonly Angle[] = [...[1, 5, 7, 11, 13, 17, 19, 23].map((k) => rat(k, 12)), ...EIGHTHS];

const FORMS_SIN_COS: readonly Form[] = ["sin2", "cos2diff", "cos2cos", "cos2sin"];
const FORMS_TAN: readonly Form[] = ["tan2", "tanHalfCos", "tanHalfSin"];

function constructRewrite(rng: Rng, tangent: boolean, unit: AngleUnit): RewriteConstruction {
  const form = rng.pick(tangent && rng.bool(0.3) ? FORMS_TAN : FORMS_SIN_COS);
  const numeric = rng.bool(0.3);
  const c = form === "sin2" ? rng.pick([2, 2, 2, 4, 6, 1]) : 2;
  if (!numeric) return { type: "rewrite", form, k: rng.pick([1, 1, 2, 3, 4]), angle: null, unit, c };
  // a numeric angle u whose double is standard (and, for tan 2u, defined)
  for (;;) {
    const angle = rng.pick(HALF_ANGLES.filter((a) => a.n / a.d < 1));
    const full = mul(angle, rat(2));
    if (form === "tan2" && exactValue("tan", full) === "undefined") continue;
    if (form === "tanHalfSin" || form === "tanHalfCos") {
      // the printed angle is 2u: avoid sin 2u = 0 and 1 + cos 2u = 0
      if ((exactValue("sin", full) as Surd).n === 0) continue;
    }
    return { type: "rewrite", form, k: 1, angle, unit, c };
  }
}

export function construct(params: ParamValues, rng: Rng): Construction {
  const p = resolveParams(schema, params);
  const tangent = p.tangent as boolean;
  const fns: Fn3[] = tangent ? ["sin", "cos", "tan"] : ["sin", "cos"];
  const units = p.units as Units;
  const unit: AngleUnit = units === "mixed" ? rng.pick(["degrees", "radians"] as const) : units;
  const type =
    p.problemType === "mixed" ? rng.pick(["double", "half", "half", "rewrite", "rewrite"] as const) : (p.problemType as Exclude<ProblemType, "mixed">);
  if (type === "double") return { type: "double", given: pickGiven(rng, fns), fns };
  if (type === "half") {
    if (rng.bool(0.6)) {
      const fn = rng.pick(fns);
      return { type: "halfExact", fn, h: rng.pick(fn === "tan" ? HALF_ANGLES : EIGHTHS), unit };
    }
    return { type: "halfGiven", given: pickGiven(rng, ["sin", "cos"]), fns, unit };
  }
  return constructRewrite(rng, tangent, unit);
}

// ------------------------------------------------------------------ values

const tanOf = (g: { sin: Rat; cos: Rat }) => div(g.sin, g.cos)!;

/** sin 2θ, cos 2θ, tan 2θ from sin θ and cos θ. */
export function doubleValues(s: Rat, c: Rat): Record<Fn3, Rat> {
  const sin = mul(rat(2), mul(s, c));
  const cos = sub(mul(c, c), mul(s, s));
  return { sin, cos, tan: div(sin, cos)! };
}

/** √r for a rational r ≥ 0, as a surd: √(9/10) = 3√10/10. */
const sqrtRat = (r: Rat): Surd => surd(1, r.n * r.d, r.d);

/** The quadrant of θ/2 for θ in (0, 2π) in quadrant q. */
const halfQuadrant = (q: Quadrant): Quadrant => (q <= 2 ? 1 : 2);

/** sin(θ/2), cos(θ/2), tan(θ/2) with the signs of quadrant `q` for θ/2. */
export function halfValues(c: Rat, s: Rat, q: Quadrant): Record<Fn3, Surd> {
  const [sx, sy] = QUADRANT_SIGNS[q];
  const sin = sqrtRat(div(sub(rat(1), c), rat(2))!);
  const cos = sqrtRat(div(add(rat(1), c), rat(2))!);
  // tan(θ/2) = (1 - cos θ)/sin θ, sign included
  const t = div(sub(rat(1), c), s)!;
  return {
    sin: sy < 0 ? surd(-sin.n, sin.r, sin.d) : sin,
    cos: sx < 0 ? surd(-cos.n, cos.r, cos.d) : cos,
    tan: surd(t.n, 1, t.d),
  };
}

// ------------------------------------------------------------------ printing

const uLatex = (k: number) => (k === 1 ? "x" : `${k}x`);

/** The printed u of a rewrite Problem, and its double. */
function rewriteArgs(k: RewriteConstruction): { u: string; u2: string } {
  if (k.angle) return { u: angleLatex(k.angle, k.unit), u2: angleLatex(mul(k.angle, rat(2)), k.unit) };
  return { u: uLatex(k.k), u2: uLatex(2 * k.k) };
}

function rewritePrompt(k: RewriteConstruction): string {
  const { u, u2 } = rewriteArgs(k);
  switch (k.form) {
    case "sin2":
      return `${k.c === 1 ? "" : k.c}${trigOf("sin", u)} ${trigOf("cos", u)}`;
    case "cos2diff":
      return `${trigOf("cos", u, 2)} - ${trigOf("sin", u, 2)}`;
    case "cos2cos":
      return `2${trigOf("cos", u, 2)} - 1`;
    case "cos2sin":
      return `1 - 2${trigOf("sin", u, 2)}`;
    case "tan2":
      return `\\frac{2${trigOf("tan", u)}}{1 - ${trigOf("tan", u, 2)}}`;
    case "tanHalfCos":
      return `\\frac{1 - ${trigOf("cos", u2)}}{${trigOf("sin", u2)}}`;
    case "tanHalfSin":
      return `\\frac{${trigOf("sin", u2)}}{1 + ${trigOf("cos", u2)}}`;
  }
}

/** The single function a rewrite Problem's expression is: coef·fn(arg). */
export function rewriteTarget(k: RewriteConstruction): { coef: Rat; fn: Fn3; double: boolean } {
  if (k.form === "sin2") return { coef: rat(k.c, 2), fn: "sin", double: true };
  if (k.form === "tan2") return { coef: rat(1), fn: "tan", double: true };
  if (k.form === "tanHalfCos" || k.form === "tanHalfSin") return { coef: rat(1), fn: "tan", double: false };
  return { coef: rat(1), fn: "cos", double: true };
}

const coefLatex = (c: Rat) => (c.n === 1 && c.d === 1 ? "" : c.n === -1 && c.d === 1 ? "-" : numLatex(c));

/** coef·fn(arg) for a symbolic u, or the exact value for a numeric one. */
function rewriteValue(k: RewriteConstruction, coef: Rat, fn: Fn3, double: boolean): string | null {
  if (!k.angle) return `${coefLatex(coef)}${trigOf(fn, double ? uLatex(2 * k.k) : uLatex(k.k))}`;
  if (double) {
    const v = exactValue(fn, mul(k.angle, rat(2)));
    if (v === "undefined") return null;
    return surdLatex(surd(v.n * coef.n, v.r, v.d * coef.d));
  }
  if (fn !== "tan") throw new Error("rewriteValue: only tan is undoubled");
  const h = halfAngleValue("tan", k.angle);
  return h.kind === "surd" ? sumLatex(sumScale(h.v, coef)) : null;
}

const stateLatex = (g: Given, v: string) => {
  const value = g.stated === "sin" ? g.sin : g.stated === "cos" ? g.cos : tanOf(g);
  return `${trigOf(g.stated, v)} = ${numLatex(value)}`;
};

const QUADRANT_BOUNDS: Record<Quadrant, [Angle, Angle]> = {
  1: [rat(0), rat(1, 2)],
  2: [rat(1, 2), rat(1)],
  3: [rat(1), rat(3, 2)],
  4: [rat(3, 2), rat(2)],
};

const DOUBLE_ARG = "2\\theta";
const HALF_ARG = "\\frac{\\theta}{2}";

const partsLatex = (fns: readonly Fn3[], arg: string, values: Record<Fn3, string>) =>
  fns.map((f) => `${trigOf(f, arg)} = ${values[f]}`).join(ANSWER_PART_SEPARATOR);

export function promptLatex(k: Construction): string {
  switch (k.type) {
    case "double": {
      const given = `${stateLatex(k.given, "\\theta")}, \\ \\theta \\text{ in } ${locationLatex(k.given.quadrant)}`;
      return `${given}${ANSWER_PART_SEPARATOR}\\text{find } ${k.fns.map((f) => trigOf(f, DOUBLE_ARG)).join(", ")}`;
    }
    case "halfExact":
      return trigOf(k.fn, angleLatex(k.h, k.unit));
    case "halfGiven": {
      // the half-angle's quadrant depends on θ's range, so the range is stated exactly
      const [lo, hi] = QUADRANT_BOUNDS[k.given.quadrant];
      const range = `${angleLatex(lo, k.unit)} < \\theta < ${angleLatex(hi, k.unit)}`;
      const given = `${stateLatex(k.given, "\\theta")}, \\ ${range}`;
      return `${given}${ANSWER_PART_SEPARATOR}\\text{find } ${k.fns.map((f) => trigOf(f, HALF_ARG)).join(", ")}`;
    }
    case "rewrite":
      return rewritePrompt(k);
  }
}

const ratTex = (r: Record<Fn3, Rat>): Record<Fn3, string> => ({ sin: numLatex(r.sin), cos: numLatex(r.cos), tan: numLatex(r.tan) });
const surdTex = (r: Record<Fn3, Surd>): Record<Fn3, string> => ({
  sin: surdLatex(r.sin),
  cos: surdLatex(r.cos),
  tan: surdLatex(r.tan),
});

export function answerLatex(k: Construction): string {
  switch (k.type) {
    case "double":
      return partsLatex(k.fns, DOUBLE_ARG, ratTex(doubleValues(k.given.sin, k.given.cos)));
    case "halfExact":
      return halfValueLatex(halfAngleValue(k.fn, k.h));
    case "halfGiven":
      return partsLatex(k.fns, HALF_ARG, surdTex(halfValues(k.given.cos, k.given.sin, halfQuadrant(k.given.quadrant))));
    case "rewrite": {
      const t = rewriteTarget(k);
      return rewriteValue(k, t.coef, t.fn, t.double)!;
    }
  }
}

// ------------------------------------------------------------------ distractors

const absR = (r: Rat) => rat(Math.abs(r.n), r.d);

/** The given point with the value found from the Pythagorean theorem (not the stated one) signed wrong. */
function wrongComputedSign(g: Given): { sin: Rat; cos: Rat } {
  if (g.stated === "sin") return { sin: g.sin, cos: neg(g.cos) };
  if (g.stated === "cos") return { sin: neg(g.sin), cos: g.cos };
  // tan stated: both found; the quadrant with the same tangent
  return { sin: neg(g.sin), cos: neg(g.cos) };
}

function halfExactDistractors(k: HalfExactConstruction): (string | null)[] {
  const right = halfAngleValue(k.fn, k.h);
  const full = mul(k.h, rat(2));
  const c = surdToSum(exactValue("cos", full) as Surd);
  const one = surdSum(surd(1));
  const s = exactValue("sin", full) as Surd;
  const neg1 = (h: HalfValue): string =>
    h.kind === "surd" ? sumLatex(sumNeg(h.v)) : halfValueLatex({ kind: "nested", v: nestedNeg(h.v) });
  // sin(θ/2) as ½ sin θ: the half taken outside
  const halfOutside = (() => {
    const v = exactValue(k.fn, full);
    return v === "undefined" ? null : surdLatex(surd(v.n, v.r, 2 * v.d));
  })();
  if (k.fn === "tan") {
    // (1 + cos)/sin: the formula's sign wrong
    const flipped = sumDiv(sumAdd(one, c), surdToSum(s));
    return [neg1(right), flipped && sumLatex(flipped), halfOutside, flipped && sumLatex(sumNeg(flipped))];
  }
  // the other formula (1 + cos for sin), same sign; the square root forgotten
  const other = halfAngleValue(k.fn === "sin" ? "cos" : "sin", k.h);
  const sign = Math.sign(halfValueNumber(right));
  const otherSigned = Math.sign(halfValueNumber(other)) === sign ? other : negHalf(other);
  const inside = k.fn === "sin" ? sumSub(one, c) : sumAdd(one, c);
  const noRoot = sumScale(inside, rat(sign, 2));
  return [neg1(right), halfValueLatex(otherSigned), sumLatex(noRoot), halfOutside, neg1(otherSigned)];
}

const negHalf = (h: HalfValue): HalfValue =>
  h.kind === "surd" ? { kind: "surd", v: sumNeg(h.v) } : { kind: "nested", v: nestedNeg(h.v) };

function rewriteDistractors(k: RewriteConstruction): (string | null)[] {
  const t = rewriteTarget(k);
  const other: Fn3 = t.fn === "sin" ? "cos" : "sin";
  const out: (string | null)[] = [];
  if (t.double) {
    // the wrong double-angle identity, the sign (2\sin^{2} u - 1 as \cos 2u), the angle not doubled,
    // the 2 kept in front (2\sin u), and for c\sin u\cos u the coefficient not halved
    out.push(rewriteValue(k, t.coef, t.fn === "tan" ? "sin" : other, true));
    out.push(rewriteValue(k, neg(t.coef), t.fn, true));
    if (!k.angle) {
      out.push(rewriteValue(k, t.coef, t.fn, false));
      out.push(rewriteValue(k, mul(t.coef, rat(2)), t.fn, false));
    }
    if (k.form === "sin2") out.push(rewriteValue(k, rat(k.c), "sin", true));
    if (k.angle) {
      const full = mul(k.angle, rat(2));
      out.push(...valueMistakes(t.fn, full).map(trigValueLatex));
      // the half put in the wrong place (\frac{1}{2}\sin 2u), and the angle doubled twice
      out.push(rewriteValue(k, mul(t.coef, rat(1, 2)), t.fn, true));
      out.push(rewriteValue(k, mul(t.coef, rat(2)), t.fn, true));
      const quad = exactValue(t.fn, mul(full, rat(2)));
      if (quad !== "undefined") out.push(surdLatex(surd(quad.n * t.coef.n, quad.r, quad.d * t.coef.d)));
    }
  } else {
    // the half-angle tangent read as tan 2u, as its reciprocal, or with the sign
    if (!k.angle) {
      out.push(`${trigOf("tan", uLatex(2 * k.k))}`);
      out.push(`${trigOf("cot", uLatex(k.k))}`);
      out.push(`-${trigOf("tan", uLatex(k.k))}`);
      out.push(`${trigOf("sin", uLatex(k.k))}`);
    } else {
      const full = mul(k.angle, rat(2));
      out.push(trigValueLatex(exactValue("tan", full)));
      const right = halfAngleValue("tan", k.angle);
      if (right.kind === "surd") {
        out.push(sumLatex(sumNeg(right.v)));
        out.push(halfValueLatex(halfAngleValue("tan", sub(rat(1, 2), k.angle))));
      }
      // tan u as \frac{1}{2}\tan 2u
      const t2 = exactValue("tan", full);
      if (t2 !== "undefined") out.push(surdLatex(surd(t2.n, t2.r, 2 * t2.d)));
    }
  }
  return out;
}

/**
 * Most common first.
 * Double-angle values: the angle doubled outside (\sin 2\theta as
 * 2\sin\theta), the value found by the Pythagorean theorem signed wrong, the
 * cos 2θ forms mixed up (\sin^{2} - \cos^{2}), every sign positive (the
 * quadrant ignored), and \tan 2\theta with the denominator's sign wrong.
 * Half-angle values: the sign of the wrong quadrant, the other formula
 * (1 + cos for sin), the square root forgotten, the half taken outside
 * (\frac{1}{2}\sin\theta); for tangent (1 + cos)/sin. From a value: the signs
 * of θ's quadrant instead of θ/2's.
 * Rewriting: the wrong double-angle identity (sin for cos), the sign, the
 * angle not doubled, the 2 kept in front, the coefficient not halved; for a
 * numeric angle, wrong values at the doubled angle, the half in the wrong
 * place and the angle doubled twice; for the half-angle tangent, tan 2u, cot u
 * (the cofunction), the sign and \frac{1}{2}\tan 2u.
 */
export function distractors(k: Construction): string[] {
  const answer = answerLatex(k);
  switch (k.type) {
    case "double": {
      const g = k.given;
      const parts = (r: Record<Fn3, Rat>) => partsLatex(k.fns, DOUBLE_ARG, ratTex(r));
      const right = doubleValues(g.sin, g.cos);
      const w = wrongComputedSign(g);
      const mixed = { sin: right.sin, cos: neg(right.cos), tan: neg(right.tan) };
      const t = tanOf(g);
      const wrongTan = div(mul(rat(2), t), add(rat(1), mul(t, t)))!;
      return distinctHints(answer, [
        parts({ sin: mul(rat(2), g.sin), cos: mul(rat(2), g.cos), tan: mul(rat(2), t) }),
        parts(doubleValues(w.sin, w.cos)),
        parts(mixed),
        parts({ sin: g.sin, cos: g.cos, tan: t }), // use θ instead of 2θ
        parts({ sin: neg(right.sin), cos: neg(right.cos), tan: right.tan }),
        parts(doubleValues(absR(g.sin), absR(g.cos))),
        k.fns.includes("tan") ? parts({ ...right, tan: wrongTan }) : null,
      ]);
    }
    case "halfExact":
      return distinctHints(answer, halfExactDistractors(k));
    case "halfGiven": {
      const g = k.given;
      const q = halfQuadrant(g.quadrant);
      const right = halfValues(g.cos, g.sin, q);
      const parts = (r: Record<Fn3, Surd>) => partsLatex(k.fns, HALF_ARG, surdTex(r));
      const thetaSigns = halfValues(g.cos, g.sin, g.quadrant);
      const w = wrongComputedSign(g);
      const swapped = { sin: right.cos, cos: right.sin, tan: surd(right.tan.d, 1, right.tan.n) };
      const noRoot = {
        sin: div(sub(rat(1), g.cos), rat(2))!,
        cos: mul(rat(QUADRANT_SIGNS[q][0]), div(add(rat(1), g.cos), rat(2))!),
        tan: rat(right.tan.n, right.tan.d),
      };
      const halfOutside = { sin: div(g.sin, rat(2))!, cos: div(g.cos, rat(2))!, tan: div(tanOf(g), rat(2))! };
      return distinctHints(answer, [
        parts(thetaSigns),
        parts({ ...right, sin: surd(-right.sin.n, right.sin.r, right.sin.d) }),
        parts({ ...right, cos: surd(-right.cos.n, right.cos.r, right.cos.d) }),
        parts(swapped),
        partsLatex(k.fns, HALF_ARG, ratTex(noRoot)),
        partsLatex(k.fns, HALF_ARG, ratTex(halfOutside)),
        g.stated === "sin" || g.stated === "cos" ? parts(halfValues(w.cos, w.sin, q)) : null,
      ]);
    }
    case "rewrite":
      return distinctHints(answer, rewriteDistractors(k));
  }
}

export const generator: Generator = {
  id: MULTIPLE_ANGLE_ID,
  title: "Multiple-angle identities",
  defaultDirections:
    "Use the double-angle and half-angle identities to find each exact value, or to rewrite each expression using a single trig function.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: MULTIPLE_ANGLE_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
