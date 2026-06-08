// First generator: "Solve quadratics by factoring" (rational/integer roots).
//
// Built ANSWER-FROM-CONSTRUCTION: we pick the integer roots first, then expand
// to the standard form. The answer is therefore known by construction — we never
// solve anything. This is the pattern every later generator follows.

import { createRng, type Rng } from "../rng";
import {
  resolveParams,
  type Generator,
  type ParamSchema,
  type ParamValues,
  type Problem,
} from "../types";
import { quadraticToLatex, rootsToLatex } from "../format";

export const QUADRATIC_FACTORING_ID = "quadratic-factoring";

export const schema = [
  {
    type: "int",
    key: "maxRoot",
    label: "Largest root magnitude",
    min: 1,
    max: 20,
    default: 9,
  },
  {
    type: "boolean",
    key: "allowEqualRoots",
    label: "Allow repeated roots (perfect-square trinomials)",
    default: false,
  },
] as const satisfies ParamSchema;

/** The structured construction (monic: a = 1). Exposed for property tests. */
export interface FactoringConstruction {
  /** coefficient of x */
  b: number;
  /** constant term */
  c: number;
  roots: [number, number];
}

/** Pure construction from params + an RNG. The roots are chosen, so the answer
 * (the roots) is known with certainty; b and c follow by Vieta's formulas. */
export function construct(params: ParamValues, rng: Rng): FactoringConstruction {
  const p = resolveParams(schema, params);
  const maxRoot = p.maxRoot as number;
  const allowEqual = p.allowEqualRoots as boolean;

  const r1 = rng.int(-maxRoot, maxRoot);
  let r2 = rng.int(-maxRoot, maxRoot);
  if (!allowEqual && r2 === r1) {
    // nudge to a guaranteed-distinct value that stays within [-maxRoot, maxRoot]
    r2 = r1 === maxRoot ? r1 - 1 : r1 + 1;
  }

  const b = -(r1 + r2);
  const c = r1 * r2;
  return { b, c, roots: [r1, r2] };
}

/** Mistake-based distractors for the MC assembler (slice #4). Distinct, and
 * never equal to the correct answer. */
export function distractors(k: FactoringConstruction): string[] {
  const [r1, r2] = k.roots;
  const correct = rootsToLatex([r1, r2]);
  const candidates = [
    [-r1, -r2], // forgot to flip signs when reading the factors
    [-r1, r2], // flipped one sign
    [r1, -r2], // flipped the other sign
    [k.b, k.c], // read the coefficients as the answer
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const roots of candidates) {
    const tex = rootsToLatex(roots);
    if (tex === correct || seen.has(tex)) continue;
    seen.add(tex);
    out.push(tex);
  }
  return out;
}

export const generator: Generator = {
  id: QUADRATIC_FACTORING_ID,
  title: "Solving quadratics by factoring",
  defaultDirections: "Solve each equation by factoring.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const k = construct(params, createRng(seed));
    return {
      kind: "generated",
      generatorId: QUADRATIC_FACTORING_ID,
      params: resolveParams(schema, params),
      seed,
      prompt: `${quadraticToLatex(1, k.b, k.c)} = 0`,
      answer: rootsToLatex(k.roots),
      distractorHints: distractors(k),
    };
  },
};
