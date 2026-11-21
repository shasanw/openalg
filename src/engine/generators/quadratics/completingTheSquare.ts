// "Solve quadratics by completing the square", with the cross-cutting
// rational / irrational / imaginary root-type toggle.
//
// Built ANSWER-FROM-CONSTRUCTION. The completed square of a x^2 + b x + c = 0 is
//   (x + b/2a)^2 = D / 4a^2,   D = b^2 - 4ac,
// so the answer is x = -b/2a ± √D / 2a. We pick a, then the half-coefficient
// h = b/2a (a whole number unless fractions are allowed), then a discriminant D
// of the requested class from the residue class that keeps c an integer (the
// same modular trick as the quadratic-formula topic, shared via ../quadratics).
// The exact roots follow by integer/radical arithmetic, never by a CAS.

import { createRng, type Rng } from "../../rng";
import {
  resolveParams,
  type Generator,
  type ParamSchema,
  type ParamValues,
  type Problem,
} from "../../types";
import { quadraticToLatex, renderPolynomial } from "../../format";
import {
  answerToLatex,
  discriminants,
  makeRoot,
  rootTypeField,
  singleRootToLatex,
  type ExactRoot,
  type RootType,
} from "../../quadratics";

export const COMPLETING_THE_SQUARE_ID = "completing-the-square";

export const schema = [
  rootTypeField,
  {
    type: "boolean",
    key: "allowLeadingCoefficient",
    label: "Allow a leading coefficient (a > 1)",
    default: false,
  },
  {
    type: "boolean",
    key: "allowFractions",
    label: "Allow fractions in the square (odd b/a)",
    default: false,
  },
  {
    type: "boolean",
    key: "constantOnRight",
    label: "Constant on the right (x^2 + bx = k)",
    default: true,
  },
  {
    type: "int",
    key: "maxCoefficient",
    label: "Largest x-coefficient magnitude",
    min: 4,
    max: 20,
    default: 10,
  },
] as const satisfies ParamSchema;

/** The structured construction. Exposed for property tests. */
export interface SquareConstruction {
  a: number;
  b: number;
  c: number;
  /** discriminant b^2 - 4ac, computed from the a, b, c we actually print */
  D: number;
  rootType: RootType;
  root: ExactRoot;
  constantOnRight: boolean;
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): SquareConstruction {
  const p = resolveParams(schema, params);
  const rootType = p.rootType as RootType;
  const allowLeading = p.allowLeadingCoefficient as boolean;
  const allowFractions = p.allowFractions as boolean;
  const constantOnRight = p.constantOnRight as boolean;
  const maxCoef = p.maxCoefficient as number;

  // b = a·n. Without fractions n is even (so h = n/2 is whole), which needs
  // |b| >= 2a; maxCoefficient >= 4 keeps a = 2 always reachable.
  const aMax = Math.min(3, allowFractions ? maxCoef : Math.floor(maxCoef / 2));
  const a = allowLeading ? rng.int(2, aMax) : 1;

  const nMax = Math.floor(maxCoef / a);
  const magnitude = allowFractions
    ? rng.int(1, nMax)
    : 2 * rng.int(1, Math.floor(nMax / 2));
  const n = rng.bool() ? magnitude : -magnitude;
  const b = a * n;

  // Skip D = b^2 (c = 0): x(ax + b) = 0 is a factoring exercise, not a
  // completing-the-square one. At most one candidate is dropped.
  const D = rng.pick(discriminants(a, b, rootType).filter((d) => d !== b * b));
  // c is an integer because every candidate D ≡ b^2 (mod 4a).
  const c = (b * b - D) / (4 * a);

  const root = makeRoot(-b, D, 2 * a);
  return { a, b, c, D, rootType, root, constantOnRight };
}

/** The printed equation: "a x^2 + b x = k" or "a x^2 + b x + c = 0". */
export function promptToLatex(k: SquareConstruction): string {
  if (!k.constantOnRight) return `${quadraticToLatex(k.a, k.b, k.c)} = 0`;
  const left = renderPolynomial([
    { coef: k.a, variable: "x^2" },
    { coef: k.b, variable: "x" },
  ]);
  return `${left} = ${-k.c}`;
}

/** Render a mistake's roots; a zero discriminant (q === 0) is a repeated real
 * root, so render it as rational rather than "± 0√0". */
function mistakeToLatex(root: ExactRoot): string {
  return answerToLatex(root.q === 0 ? { ...root, s: 1 } : root);
}

/** Mistake-based distractors for the MC assembler, each a classic
 * completing-the-square error. Distinct, and never equal to the answer. */
export function distractors(k: SquareConstruction): string[] {
  const { a, b, c, D } = k;
  const correct = answerToLatex(k.root);
  const candidates = [
    // forgot to add (b/2a)^2 to both sides: (x + b/2a)^2 = -c/a
    mistakeToLatex(makeRoot(-b, -4 * a * c, 2 * a)),
    // sign error in the square: x = +b/2a ± √D/2a
    mistakeToLatex(makeRoot(b, D, 2 * a)),
    // dropped the ± when taking the square root
    singleRootToLatex(k.root),
    // forgot to divide through by a before completing the square
    mistakeToLatex(makeRoot(-b, b * b - 4 * c, 2)),
    // added b/2a instead of its square: (x + b/2a)^2 = -c/a + b/2a
    mistakeToLatex(makeRoot(-b, 2 * a * b - 4 * a * c, 2 * a)),
  ];
  const seen = new Set<string>([correct]);
  const out: string[] = [];
  for (const tex of candidates) {
    if (seen.has(tex)) continue;
    seen.add(tex);
    out.push(tex);
  }
  return out;
}

export const generator: Generator = {
  id: COMPLETING_THE_SQUARE_ID,
  title: "Solving quadratics by completing the square",
  defaultDirections: "Solve each equation by completing the square.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const k = construct(params, createRng(seed));
    return {
      kind: "generated",
      generatorId: COMPLETING_THE_SQUARE_ID,
      params: resolveParams(schema, params),
      seed,
      prompt: promptToLatex(k),
      answer: answerToLatex(k.root),
      distractorHints: distractors(k),
    };
  },
};
