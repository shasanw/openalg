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
  if (r1 === 0 && r2 === 0) {
    // x^2 = 0 is not a factoring problem and admits no mistake-based
    // Distractors, so a double root at 0 becomes the roots 0 and 1.
    r2 = 1;
  }

  const b = -(r1 + r2);
  const c = r1 * r2;
  return { b, c, roots: [r1, r2] };
}

/**
 * Other ways to split c into a factor pair (p, q) with p * q = c whose sum is
 * NOT -b: the "picked the wrong factor pair" mistake. Ordered by how close the
 * pair is to the right one, so the most tempting wrong pair comes first.
 */
function wrongFactorPairs(k: FactoringConstruction): [number, number][] {
  const [r1, r2] = k.roots;
  const c = k.c;
  if (c === 0) return [];
  const pairs: [number, number][] = [];
  const m = Math.abs(c);
  for (let d = 1; d * d <= m; d++) {
    if (m % d !== 0) continue;
    const e = m / d;
    // Roots with the right product; try both sign patterns that give c.
    const options: [number, number][] =
      c > 0
        ? [
            [d, e],
            [-d, -e],
          ]
        : [
            [d, -e],
            [-d, e],
          ];
    for (const [x, y] of options) {
      // Skip the right pair, and its negation (that is the sign error,
      // offered separately).
      if (Math.abs(x + y) === Math.abs(r1 + r2)) continue;
      pairs.push([x, y]);
    }
  }
  const target = r1 + r2;
  return pairs.sort(
    (a, b) =>
      Math.abs(a[0] + a[1] - target) - Math.abs(b[0] + b[1] - target) ||
      a[0] - b[0],
  );
}

/**
 * Mistake-based Distractors for the MC assembler, most diagnostic first:
 * - read the roots straight off the factors without flipping the signs:
 *   (x - 3)(x + 2) = 0 answered as x = -3, 2 instead of x = -2, 3
 * - flipped only one of the two signs
 * - picked a factor pair of c with the wrong sum
 * - kept only one solution (dropped the other, like dropping a ±)
 * - wrote the coefficients b and c as the answer
 * The generator is monic (a = 1), so "forgot to divide by the leading
 * coefficient" cannot happen here; the quadratic-formula Topic covers it.
 * Distinct, and never equal to the correct answer.
 */
export function distractors(k: FactoringConstruction): string[] {
  const [r1, r2] = k.roots;
  const correct = rootsToLatex([r1, r2]);
  const [pair1, pair2] = wrongFactorPairs(k);
  // Interleaved by mistake type, so a sheet with few choices still mixes
  // different mistakes instead of offering only sign variants.
  const candidates: number[][] = [
    [-r1, -r2], // forgot to flip signs when reading the factors
    ...(pair1 ? [pair1] : []), // wrong factor pair of c
    [-r1, r2], // flipped one sign
    [Math.max(r1, r2)], // kept only one solution
    [r1, -r2], // flipped the other sign
    ...(pair2 ? [pair2] : []), // another wrong factor pair
    [Math.min(r1, r2)], // kept only the other solution
    [k.b, k.c], // read the coefficients as the answer
  ];
  const seen = new Set<string>([correct]);
  const out: string[] = [];
  for (const roots of candidates) {
    const tex = rootsToLatex(roots);
    if (seen.has(tex)) continue;
    seen.add(tex);
    out.push(tex);
  }
  return out;
}

export const generator: Generator = {
  id: QUADRATIC_FACTORING_ID,
  chapter: "Quadratics",
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
