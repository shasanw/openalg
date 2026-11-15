// "Solve quadratics by the quadratic formula", with the cross-cutting
// rational / irrational / imaginary root-type toggle.
//
// Built ANSWER-FROM-CONSTRUCTION, but for this topic the construction works in
// the OTHER direction from factoring: instead of picking roots and expanding, we
// pick integer coefficients a, b, c whose discriminant D = b^2 - 4ac is forced
// into the requested class (a perfect square => rational, a positive non-square
// => irrational, a negative => imaginary). The answer is then the EXACT quadratic
// -formula output (-b ± √D) / 2a, simplified by exact integer/radical arithmetic
// — never solved by a CAS. Because D is computed from the very a, b, c we print,
// those roots satisfy the equation by the quadratic-formula identity; the tests
// confirm the simplifier preserves that value across all three modes.
//
// Integer coefficients are guaranteed by a modular trick: c = (b^2 - D) / 4a is
// an integer exactly when D ≡ b^2 (mod 4a), so every D we choose is drawn from
// that residue class.

import { createRng, type Rng } from "../rng";
import {
  resolveParams,
  type Generator,
  type ParamSchema,
  type ParamValues,
  type Problem,
} from "../types";
import { quadraticToLatex } from "../format";
import {
  answerToLatex,
  discriminants,
  makeRoot,
  rootTypeField,
  type ExactRoot,
  type RootType,
} from "../quadratics";

export { answerToLatex, type ExactRoot, type RootType };

export const QUADRATIC_FORMULA_ID = "quadratic-formula";

export const schema = [
  rootTypeField,
  {
    type: "boolean",
    key: "allowLeadingCoefficient",
    label: "Allow a leading coefficient (a > 1)",
    default: true,
  },
  {
    type: "int",
    key: "maxCoefficient",
    label: "Largest coefficient magnitude",
    min: 2,
    max: 20,
    default: 9,
  },
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface FormulaConstruction {
  a: number;
  b: number;
  c: number;
  /** discriminant, computed from a, b, c we actually print */
  D: number;
  rootType: RootType;
  root: ExactRoot;
}

/** Pick the leading coefficient a within the params. */
function pickA(rng: Rng, allowLeading: boolean, maxCoef: number): number {
  if (!allowLeading) return 1;
  // Keep a small so radicands and the constant term stay pedagogically clean.
  return rng.int(2, Math.min(4, Math.max(2, maxCoef)));
}

/** Pure construction from params + an RNG: choose a, b, then a discriminant of
 * the requested class, and recover the integer c plus the exact roots. */
export function construct(params: ParamValues, rng: Rng): FormulaConstruction {
  const p = resolveParams(schema, params);
  const rootType = p.rootType as RootType;
  const allowLeading = p.allowLeadingCoefficient as boolean;
  const maxCoef = p.maxCoefficient as number;

  const a = pickA(rng, allowLeading, maxCoef);
  const b = rng.int(-maxCoef, maxCoef);

  const candidates = discriminants(a, b, rootType);
  const D = rng.pick(candidates);
  // c is an integer because every candidate D ≡ b^2 (mod 4a).
  const c = (b * b - D) / (4 * a);

  const root = makeRoot(-b, D, 2 * a);
  return { a, b, c, D, rootType, root };
}

/** Mistake-based distractors for the MC assembler: each models a classic
 * quadratic-formula error. Distinct, and never equal to the correct answer. */
export function distractors(k: FormulaConstruction): string[] {
  const { a, b, c, D } = k;
  const correct = answerToLatex(k.root);
  const candidates: ExactRoot[] = [
    makeRoot(b, D, 2 * a), // forgot to negate b
    makeRoot(-b, D, 2), // divided by 2 instead of 2a
    makeRoot(-b, b * b + 4 * a * c, 2 * a), // sign error in the discriminant
    makeRoot(-b, D, a), // divided by a instead of 2a
  ];
  const seen = new Set<string>([correct]);
  const out: string[] = [];
  for (const root of candidates) {
    const tex = answerToLatex(root);
    if (seen.has(tex)) continue;
    seen.add(tex);
    out.push(tex);
  }
  return out;
}

export const generator: Generator = {
  id: QUADRATIC_FORMULA_ID,
  chapter: "Quadratics",
  title: "Solving quadratics by the quadratic formula",
  defaultDirections: "Solve each equation using the quadratic formula.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const k = construct(params, createRng(seed));
    return {
      kind: "generated",
      generatorId: QUADRATIC_FORMULA_ID,
      params: resolveParams(schema, params),
      seed,
      prompt: `${quadraticToLatex(k.a, k.b, k.c)} = 0`,
      answer: answerToLatex(k.root),
      distractorHints: distractors(k),
    };
  },
};
