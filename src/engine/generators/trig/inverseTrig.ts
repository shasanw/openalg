// "Evaluating inverse trig functions": exact principal values
// (\arcsin\left(-\frac{1}{2}\right) = -\frac{\pi}{6}, \arctan \sqrt{3}, and
// optionally arcsec, arccsc and arccot), a function of an inverse read off a
// right triangle (\sin\left(\arccos\left(\frac{3}{5}\right)\right) = \frac{4}{5}),
// and compositions that undo or seem to undo (\arcsin\left(\sin \frac{5\pi}{6}\right)
// = \frac{\pi}{6}; \cos\left(\arccos\left(-\frac{2}{5}\right)\right) = -\frac{2}{5};
// \sin\left(\arcsin 2\right) is undefined).
//
// Built ANSWER-FIRST:
// - values: an angle in the inverse's principal range is chosen; the
//   printed value is the table value exactValue(fn, angle);
// - triangles: a Pythagorean triple and the quadrant the principal range
//   puts the angle in are chosen; the input and the Answer are ratios of the
//   signed sides;
// - undoing: an angle outside the principal range is chosen and the Answer
//   is the principal angle with the same value; or a number in (or out of)
//   the inverse's domain, which comes straight back (or is undefined).
// Nothing is ever solved.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints, neg, numLatex, rat, ratValue, type Rat } from "../shared/equationKit";
import { unitField } from "./trigEquationKit";
import {
  angleLatex,
  cofunction,
  coterminal,
  exactValue,
  fnLatex,
  inverseLatex,
  inverseOf,
  inverseValue,
  principalAngles,
  principalRange,
  PRIMARY_FNS,
  PYTHAGOREAN_TRIPLES,
  reciprocalFn,
  STANDARD_ANGLES,
  surdLatex,
  surdNeg,
  swappedSpecialAngle,
  TRIG_FNS,
  trigOf,
  UNDEFINED_LATEX,
  type Angle,
  type AngleUnit,
  type Surd,
  type TrigFn,
} from "./trigKit";

export const INVERSE_TRIG_ID = "inverse-trig";

export type Kind = "values" | "triangles" | "undo";

export const schema = [
  {
    type: "enum",
    key: "problems",
    label: "Problems",
    default: "mixed",
    options: [
      { value: "mixed", label: "All kinds" },
      { value: "values", label: "Exact values, like arcsin(−1/2)" },
      { value: "triangles", label: "A function of an inverse, like sin(arccos 3/5)" },
      { value: "undo", label: "Inverses that undo (or don't), like arcsin(sin 5π/6)" },
    ],
  },
  {
    type: "enum",
    key: "functions",
    label: "Functions",
    default: "primary",
    options: [
      { value: "primary", label: "sin, cos and tan" },
      { value: "all", label: "All six, with sec, csc and cot" },
    ],
  },
  {
    type: "enum",
    key: "notation",
    label: "Notation",
    default: "arc",
    options: [
      { value: "arc", label: "arcsin x" },
      { value: "power", label: "sin⁻¹ x" },
      { value: "mixed", label: "Both" },
    ],
  },
  unitField,
] as const satisfies ParamSchema;

export interface InverseTrigConstruction {
  kind: Kind;
  prompt: string;
  answer: string;
  hints: (string | null)[];
}

type Notation = "arc" | "power";

const inRange = (fn: TrigFn, a: Angle) => {
  const { lo, hi } = principalRange(fn);
  return ratValue(a) >= ratValue(lo) && ratValue(a) <= ratValue(hi);
};

/** A same-value angle written in the principal range's half (fn's range or it less 2π). */
const signed = (fn: TrigFn, a: Angle): Angle => (inRange(fn, a) ? a : rat(a.n - 2 * a.d, a.d));

const inverseHint = (fn: TrigFn, v: Surd, unit: AngleUnit): string => {
  const a = inverseValue(fn, v);
  return a ? angleLatex(a, unit) : UNDEFINED_LATEX;
};

/** "f(inner)" with the inner expression bracketed. */
const apply = (fn: TrigFn, inner: string) => `${fnLatex(fn)}\\left(${inner}\\right)`;

function valuesProblem(rng: Rng, fns: readonly TrigFn[], notation: Notation, unit: AngleUnit): InverseTrigConstruction {
  const fn = rng.pick(fns);
  // 0 is left out: arcsin 0 = 0 and arctan 0 = 0 are too plain
  const a = rng.pick(principalAngles(fn).filter((t) => t.n !== 0));
  const v = exactValue(fn, a) as Surd;
  const A = (x: Angle | null) => (x ? angleLatex(x, unit) : null);
  const others = STANDARD_ANGLES.filter((t) => exactValue(fn, t) !== "undefined" && surdLatex(exactValue(fn, t) as Surd) === surdLatex(v));
  const swapped = swappedSpecialAngle(a);
  const hints: (string | null)[] = [
    // the right reference angle in the wrong range (11π/6 or 7π/6 for -π/6)
    ...others.map((t) => A(t)),
    // the degree measure given without its unit, as if it were radians
    unit === "radians" ? numLatex(rat(180 * a.n, a.d)) : null,
    A(coterminal(a)),
    // sin and cos (or their relatives) mixed up
    inverseHint(cofunction(fn), v, unit),
    // π/6 and π/3 mixed up
    swapped ? A(signed(fn, inverseValue(fn, exactValue(fn, swapped) as Surd) ?? swapped)) : null,
    // the minus sign dropped, or carried outside (arccos(-x) read as -arccos x)
    v.n < 0 ? inverseHint(fn, surdNeg(v), unit) : null,
    v.n < 0 && a.n > 0 ? A(neg(inverseValue(fn, surdNeg(v))!)) : null,
    a.n !== 0 ? A(neg(a)) : null,
    // the reciprocal's inverse (arcsec 2 read as arccos 2: "undefined")
    inverseHint(reciprocalFn(fn), v, unit),
    // the reference angle placed in the wrong quadrant (π - θ, π + θ)
    A(signed(fn, coterminal(rat(a.d - a.n, a.d)))),
    A(coterminal(rat(a.d + a.n, a.d))),
  ];
  const where = unit === "degrees" ? ",\\quad \\text{in degrees}" : "";
  return { kind: "values", prompt: inverseOf(fn, surdLatex(v), notation) + where, answer: angleLatex(a, unit), hints };
}

/** A ratio's LaTeX: "\frac{4}{5}", "-\frac{12}{5}", "3". */
const R = (r: Rat) => numLatex(r);

function trianglesProblem(rng: Rng, fns: readonly TrigFn[], notation: Notation): InverseTrigConstruction {
  const [p, q, h] = rng.pick(PYTHAGOREAN_TRIPLES);
  const [legO, legA] = rng.bool() ? [p, q] : [q, p];
  const inner = rng.pick(fns);
  const outer = rng.pick(fns.filter((f) => f !== inner));
  const negative = rng.bool(0.5);
  // the principal range puts a negative input in Quadrant IV (arcsin, arctan,
  // arccsc) or Quadrant II (arccos, arcsec, arccot)
  const q4 = inner === "sin" || inner === "tan" || inner === "csc";
  const opp = negative && q4 ? -legO : legO;
  const adj = negative && !q4 ? -legA : legA;
  const ratioOf = (fn: TrigFn, o: number, a: number): Rat => {
    switch (fn) {
      case "sin":
        return rat(o, h);
      case "cos":
        return rat(a, h);
      case "tan":
        return rat(o, a);
      case "csc":
        return rat(h, o);
      case "sec":
        return rat(h, a);
      case "cot":
        return rat(a, o);
    }
  };
  const x = ratioOf(inner, opp, adj);
  const ans = ratioOf(outer, opp, adj);
  const flip = (r: Rat) => rat(r.d, r.n);
  const legsSwapped = ratioOf(outer, adj, opp);
  const hints = [
    R(neg(ans)), // the quadrant's sign forgotten
    R(flip(ans)), // the reciprocal ratio
    R(legsSwapped), // opposite and adjacent swapped
    R(neg(legsSwapped)),
    R(neg(flip(ans))),
    R(x), // the inverse "cancelled" with the outer function
    R(ratioOf(outer, legO, legA)), // the triangle drawn in Quadrant I regardless
  ];
  const prompt = apply(outer, inverseOf(inner, R(x), notation));
  return { kind: "triangles", prompt, answer: R(ans), hints };
}

/** Numbers to put through f(f^{-1}(x)): in fn's domain, and (for sin, cos, sec, csc) out of it. */
const IN_DOMAIN: Record<"unit" | "outside" | "any", Rat[]> = {
  unit: [rat(1, 3), rat(2, 5), rat(3, 4), rat(2, 7), rat(5, 6), rat(1, 4), rat(3, 5)],
  outside: [rat(3, 2), rat(2), rat(5, 3), rat(4), rat(7, 2), rat(5, 4)],
  any: [rat(5), rat(7, 3), rat(1, 6), rat(9, 4), rat(3)],
};

function undoProblem(rng: Rng, fns: readonly TrigFn[], notation: Notation, unit: AngleUnit): InverseTrigConstruction {
  const fn = rng.pick(fns);
  if (rng.bool(0.5)) {
    // arcf(f(θ)) for θ outside the principal range
    const pool: Angle[] = [];
    for (let k = -12; k < 24; k++) {
      for (const d of [6, 4]) {
        const t = rat(k, d);
        if (ratValue(t) <= -1 || ratValue(t) >= 2 || pool.some((u) => u.n === t.n && u.d === t.d)) continue;
        if (!inRange(fn, t) && exactValue(fn, t) !== "undefined" && coterminal(t).n !== 0) pool.push(t);
      }
    }
    const theta = rng.pick(pool);
    const v = exactValue(fn, theta) as Surd;
    const a = inverseValue(fn, v)!;
    const A = (x: Angle) => angleLatex(x, unit);
    const ref = coterminal(theta);
    const hints = [
      A(theta), // "they cancel"
      a.n !== 0 ? A(neg(a)) : null,
      A(coterminal(a)),
      ref.n !== theta.n || ref.d !== theta.d ? A(ref) : null,
      A(signed(fn, coterminal(rat(theta.d - theta.n, theta.d)))),
      inverseHint(cofunction(fn), v, unit),
      // the Answer's reference angle in another quadrant, and the angle's negative
      A(rat(a.d + a.n, a.d)),
      A(rat(a.d - a.n, a.d)),
      A(neg(theta)),
      A(rat(2 * a.d + a.n, a.d)),
    ];
    const prompt = `${inverseLatex(fn, notation)}\\left(${trigOf(fn, angleLatex(theta, unit))}\\right)`;
    return { kind: "undo", prompt, answer: A(a), hints };
  }
  // f(f^{-1}(x)): x comes back, or is outside the domain
  const bounded = fn === "sin" || fn === "cos";
  const atLeastOne = fn === "sec" || fn === "csc";
  const outside = (bounded || atLeastOne) && rng.bool(0.4);
  // sin and cos take |x| <= 1, sec and csc |x| >= 1, tan and cot anything
  const smallX = bounded ? !outside : outside;
  const pool = fn === "tan" || fn === "cot" ? [...IN_DOMAIN.any, ...IN_DOMAIN.unit] : smallX ? IN_DOMAIN.unit : IN_DOMAIN.outside;
  const x = rng.bool() ? neg(rng.pick(pool)) : rng.pick(pool);
  const flip = rat(x.d, x.n);
  const answer = outside ? UNDEFINED_LATEX : R(x);
  const hints = outside ? [R(x), R(flip), R(neg(x)), R(neg(flip))] : [UNDEFINED_LATEX, R(neg(x)), R(flip), R(neg(flip))];
  return { kind: "undo", prompt: apply(fn, inverseOf(fn, R(x), notation)), answer, hints };
}

export function construct(params: ParamValues, rng: Rng): InverseTrigConstruction {
  const p = resolveParams(schema, params);
  const fns = p.functions === "all" ? TRIG_FNS : PRIMARY_FNS;
  const notation: Notation = p.notation === "mixed" ? rng.pick(["arc", "power"] as const) : (p.notation as Notation);
  const unit = p.unit as AngleUnit;
  const kind: Kind =
    p.problems === "mixed" ? (rng.bool(0.5) ? "values" : rng.bool(0.5) ? "triangles" : "undo") : (p.problems as Kind);
  if (kind === "values") return valuesProblem(rng, fns, notation, unit);
  if (kind === "triangles") return trianglesProblem(rng, fns, notation);
  return undoProblem(rng, fns, notation, unit);
}

/**
 * Mistake-based Distractors, most common first:
 * - values: the right reference angle outside the principal range (7π/6 or
 *   11π/6 for -π/6), sin and cos mixed up, π/6 and π/3 mixed up, the minus
 *   sign dropped or carried outside (arccos(-x) as -arccos x), the angle's
 *   negative, and the reciprocal's inverse ("undefined" for arcsec 2 read as
 *   arccos 2);
 * - triangles: the quadrant's sign forgotten, the reciprocal ratio, opposite
 *   and adjacent swapped, the input itself (as if the functions cancelled),
 *   and the Quadrant I triangle whatever the sign;
 * - undoing: the angle itself ("they cancel"), its negative and coterminal
 *   forms, the supplement; for f(f^{-1}(x)) "undefined", -x and 1/x, and x
 *   itself when x is outside the domain.
 */
export const distractors = (k: InverseTrigConstruction): string[] => distinctHints(k.answer, k.hints);

export const generator: Generator = {
  id: INVERSE_TRIG_ID,
  title: "Evaluating inverse trig functions",
  defaultDirections: "Find the exact value of each expression.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: INVERSE_TRIG_ID,
      params: resolved,
      seed,
      prompt: k.prompt,
      answer: k.answer,
      distractorHints: distractors(k),
    };
  },
};
