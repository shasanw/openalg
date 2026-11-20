// "Multiplying polynomials": a monomial times a polynomial, two binomials, or
// a binomial times a trinomial: (2x - 3)(x^{2} + 4x - 1).
//
// Built ANSWER-FROM-CONSTRUCTION: the factors are chosen and the Answer is
// their product, formed term by term from the partial products (integer
// arithmetic, the very construction a student does), so it is known exactly.
// Every Distractor replays that construction with one real mistake in it.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import {
  groupLatex,
  mono,
  mulMono,
  nonzero,
  norm,
  pickVars,
  polyHints,
  standardLatex,
  varyPolyVariableField,
  type Mono,
  type Poly,
} from "./polyKit";

export const MULTIPLYING_POLYNOMIALS_ID = "multiplying-polynomials";

export type Factors = "mixed" | "monomial" | "binomials" | "binomialTrinomial";

export const schema = [
  {
    type: "enum",
    key: "factors",
    label: "Factors",
    default: "mixed",
    options: [
      { value: "mixed", label: "Mixed" },
      { value: "monomial", label: "Monomial times a polynomial" },
      { value: "binomials", label: "Two binomials" },
      { value: "binomialTrinomial", label: "Binomial times a trinomial" },
    ],
  },
  {
    type: "int",
    key: "maxCoefficient",
    label: "Largest number in a factor",
    min: 2,
    max: 12,
    default: 6,
  },
  {
    type: "boolean",
    key: "leadingCoefficients",
    label: "Leading coefficients other than 1",
    default: true,
  },
  {
    type: "boolean",
    key: "twoVariables",
    label: "Terms in two variables",
    default: false,
  },
  varyPolyVariableField,
] as const satisfies ParamSchema;

export interface MultiplyingConstruction {
  kind: Exclude<Factors, "mixed">;
  vars: [string, string];
  left: Mono[];
  right: Mono[];
  answer: Mono[];
}

/** The partial products, one per pair of terms, in distributing order. */
export const partials = (a: Poly, b: Poly): Mono[][] => a.map((s) => b.map((t) => mulMono(s, t)));

/** The i-th term's exponents in a polynomial of degree d: descending powers
 * of v (one variable), or every term of full degree d with descending powers
 * of v and ascending powers of w (two variables: x^{2} - xy + y^{2}). */
function shape(d: number, two: boolean, i: number): [number, number] {
  return two ? [d - i, i] : [d - i, 0];
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): MultiplyingConstruction {
  const p = resolveParams(schema, params);
  const choice = p.factors as Factors;
  const C = p.maxCoefficient as number;
  const leadOk = p.leadingCoefficients as boolean;
  const two = p.twoVariables as boolean;
  const vars = pickVars(rng, p.varyVariable as boolean, two);
  const kind = choice === "mixed" ? rng.pick(["monomial", "binomials", "binomials", "binomialTrinomial"] as const) : choice;
  const leading = () => (leadOk ? rng.int(1, Math.min(C, 5)) : 1);

  /** A polynomial of degree d with n terms: a leading term, then lower ones. */
  const poly = (d: number, n: number): Mono[] => {
    const out: Mono[] = [];
    for (let i = 0; i < n; i++) {
      const [a, b] = shape(d, two, i);
      out.push(mono(i === 0 ? leading() : nonzero(rng, C), a, b));
    }
    return out;
  };

  for (let tries = 0; tries < 200; tries++) {
    let left: Mono[];
    let right: Mono[];
    if (kind === "monomial") {
      const k = rng.int(1, 2);
      const [mx, my] = two ? [k - 1, 1] : [k, 0];
      left = [mono(nonzero(rng, C), mx, my)];
      const d = rng.int(1, 3);
      right = poly(d, rng.int(2, Math.min(3, d + 1)));
    } else if (kind === "binomials") {
      left = poly(1, 2);
      right = poly(1, 2);
    } else {
      left = poly(1, 2);
      right = poly(2, 3);
    }
    const answer = norm(partials(left, right).flat());
    // Like terms that cancel (sum times difference) belong to Special Products.
    if (kind === "binomials" && answer.length !== 3) continue;
    if (kind === "binomialTrinomial" && answer.length < 3) continue;
    // never the same binomial twice: that is a square, a Special Product
    if (kind === "binomials" && left.every((t, i) => t.c === right[i].c && t.e[0] === right[i].e[0])) continue;
    return { kind, vars, left, right, answer };
  }
  const left = [mono(1, 1), mono(2)];
  const right = [mono(1, 1), mono(3)];
  return { kind: "binomials", vars, left, right, answer: norm(partials(left, right).flat()) };
}

export function promptLatex(k: MultiplyingConstruction): string {
  return `${groupLatex(k.left, k.vars)}${groupLatex(k.right, k.vars)}`;
}

/**
 * Mistake-based Distractors, most diagnostic first:
 * - binomials: multiplied only the first terms and the last terms (no middle term)
 * - a monomial or binomial distributed to the first term only, or only its
 *   first term distributed
 * - multiplied exponents instead of adding them (x^{2} \cdot x = x^{2})
 * - a sign slip on the last partial product (negative times negative)
 * - added the leading coefficients instead of multiplying them
 * - left out the last partial product
 */
export function distractors(k: MultiplyingConstruction): string[] {
  const { left, right, answer, vars } = k;
  const parts = partials(left, right);
  const c: (Poly | null)[] = [];
  if (k.kind === "binomials") c.push(norm([parts[0][0], parts[1][1]]));
  // a monomial distributed to the first term only; or only the binomial's
  // first term distributed, the rest just written down
  if (k.kind === "monomial") c.push(norm([parts[0][0], ...right.slice(1)]));
  else c.push(norm([...parts[0], ...left.slice(1)]));
  // exponents multiplied, where both factors carry the variable
  c.push(
    norm(
      left.flatMap((s) =>
        right.map((t) => {
          const m = mulMono(s, t);
          const e0 = s.e[0] > 0 && t.e[0] > 0 ? s.e[0] * t.e[0] : m.e[0];
          const e1 = s.e[1] > 0 && t.e[1] > 0 ? s.e[1] * t.e[1] : m.e[1];
          return mono(m.c, e0, e1);
        }),
      ),
    ),
  );
  const flat = parts.flat();
  c.push(norm(flat.map((t, i) => (i === flat.length - 1 ? mono(-t.c, ...t.e) : t))));
  const s = left[0];
  const t = right[0];
  if (Math.abs(s.c) > 1 || Math.abs(t.c) > 1) {
    c.push(norm(flat.map((m, i) => (i === 0 ? mono(s.c + t.c, ...m.e) : m))));
  }
  c.push(norm(flat.slice(0, -1)));
  // signs of the whole middle flipped (inner and outer products)
  c.push(norm(flat.map((m, i) => (i === 0 || i === flat.length - 1 ? m : mono(-m.c, ...m.e)))));
  return polyHints(answer, c, vars);
}

export const generator: Generator = {
  id: MULTIPLYING_POLYNOMIALS_ID,
  title: "Multiplying polynomials",
  defaultDirections: "Find each product.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const k = construct(params, createRng(seed));
    return {
      kind: "generated",
      generatorId: MULTIPLYING_POLYNOMIALS_ID,
      params: resolveParams(schema, params),
      seed,
      prompt: promptLatex(k),
      answer: standardLatex(k.answer, k.vars),
      distractorHints: distractors(k),
    };
  },
};
