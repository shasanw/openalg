// "Determinants": evaluate the determinant of a 2 by 2 or 3 by 3 matrix,
// printed between vertical bars.
//
// Built ANSWER-FROM-CONSTRUCTION: the entries are chosen and the determinant
// is evaluated forwards from them (ad - bc, or cofactor expansion along the
// first row). Nothing is solved.

import { createRng, type Rng } from "../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../types";
import { distinctHints, numLatex, rat } from "./equationKit";
import { det, matrixLatex, minors, randomMatrix, type Matrix } from "./matrixKit";

export const DETERMINANTS_ID = "determinants";

export const schema = [
  {
    type: "enum",
    key: "size",
    label: "Matrix size",
    default: "mixed",
    options: [
      { value: "2", label: "2 by 2" },
      { value: "3", label: "3 by 3" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "int",
    key: "maxEntry",
    label: "Largest entry",
    min: 3,
    max: 12,
    default: 6,
  },
  {
    type: "boolean",
    key: "allowNegatives",
    label: "Allow negative entries",
    default: true,
  },
] as const satisfies ParamSchema;

export interface DeterminantConstruction {
  m: Matrix;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): DeterminantConstruction {
  const p = resolveParams(schema, params);
  const size = p.size === "mixed" ? rng.pick([2, 3]) : Number(p.size);
  const max = p.maxEntry as number;
  for (let tries = 0; ; tries++) {
    const m = randomMatrix(rng, size, size, max, p.allowNegatives as boolean);
    // at most one zero entry, and a zero determinant only now and then
    const zeros = m.flat().filter((x) => x.n === 0).length;
    if (zeros > 1 && tries < 50) continue;
    if (det(m).n === 0 && rng.bool(0.85) && tries < 50) continue;
    return { m };
  }
}

export const promptLatex = (k: DeterminantConstruction): string => matrixLatex(k.m, { bars: true });
export const answerLatex = (k: DeterminantConstruction): string => numLatex(det(k.m));

/**
 * Mistake-based Distractors, most common first.
 * - 2 by 2 [a b; c d]: ad + bc (adding the diagonals), bc - ad (subtracting
 *   the wrong way round), ab - cd (rows, not diagonals), ac - bd (columns).
 * - 3 by 3: the cofactor expansion without its alternating signs, only the
 *   three forward diagonals (half of the rule of Sarrus), every product
 *   added, the sign of the result flipped, and each 2 by 2 minor taken as
 *   ad + bc.
 */
export function distractors(k: DeterminantConstruction): string[] {
  const v = k.m.map((r) => r.map((x) => x.n));
  const values: number[] = [];
  if (v.length === 2) {
    const [[a, b], [c, d]] = v;
    values.push(a * d + b * c, b * c - a * d, a * b - c * d, a * c - b * d);
  } else {
    const [[a, b, c], [d, e, f], [g, h, i]] = v;
    const mins = minors(k.m)[0].map((x) => x.n);
    const forward = a * e * i + b * f * g + c * d * h;
    const backward = c * e * g + a * f * h + b * d * i;
    values.push(
      a * mins[0] + b * mins[1] + c * mins[2],
      forward,
      forward + backward,
      -(forward - backward),
      a * (e * i + f * h) - b * (d * i + f * g) + c * (d * h + e * g),
    );
  }
  return distinctHints(
    answerLatex(k),
    values.map((x) => numLatex(rat(x))),
  );
}

export const generator: Generator = {
  id: DETERMINANTS_ID,
  title: "Determinants",
  defaultDirections: "Evaluate each determinant.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: DETERMINANTS_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
