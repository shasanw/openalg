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
import {
  fractionToLatex,
  gcd,
  quadraticToLatex,
  simplifyRadical,
} from "../format";

export const QUADRATIC_FORMULA_ID = "quadratic-formula";

export type RootType = "rational" | "irrational" | "imaginary";

export const schema = [
  {
    type: "enum",
    key: "rootType",
    label: "Root type",
    default: "rational",
    options: [
      { value: "rational", label: "Rational" },
      { value: "irrational", label: "Irrational (radicals)" },
      { value: "imaginary", label: "Imaginary (complex)" },
    ],
  },
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

/**
 * The exact conjugate-root pair (p ± q√s) / r in lowest joint terms:
 * - s === 1  → rational (a perfect-square discriminant)
 * - s  >  1  → irrational (q√s is a real surd)
 * - s  <  0  → imaginary (√s is i√|s|)
 * The two roots use +q and −q; the sign convention lets one value describe both.
 */
export interface ExactRoot {
  p: number;
  q: number;
  s: number;
  r: number;
}

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

/** Build the normalized exact root form from a numerator offset `p0` (the −b of
 * the formula), a discriminant `D`, and a denominator `r0` (the 2a). Negative D
 * is rendered as an imaginary radical by carrying a negative `s`. */
function makeRoot(p0: number, D: number, r0: number): ExactRoot {
  let outside: number;
  let inside: number;
  if (D >= 0) {
    ({ outside, inside } = simplifyRadical(D));
  } else {
    ({ outside, inside } = simplifyRadical(-D));
    inside = -inside; // negative radicand marks the imaginary case
  }
  let p = p0;
  let q = outside;
  let r = r0;
  // Reduce the rational scaffolding (p, q, r) by their common factor; s is the
  // square-free radicand and never shares this division.
  const g = gcd(gcd(Math.abs(p), Math.abs(q)), Math.abs(r)) || 1;
  if (r < 0) {
    p = -p;
    q = -q;
    r = -r;
  }
  return { p: p / g, q: q / g, s: inside, r: r / g };
}

/** Pick the leading coefficient a within the params. */
function pickA(rng: Rng, allowLeading: boolean, maxCoef: number): number {
  if (!allowLeading) return 1;
  // Keep a small so radicands and the constant term stay pedagogically clean.
  return rng.int(2, Math.min(4, Math.max(2, maxCoef)));
}

/** Candidate discriminants ≡ b^2 (mod 4a) of the requested class, in increasing
 * |D| (so we prefer small, clean radicands). Always non-empty. */
function discriminants(a: number, b: number, type: RootType): number[] {
  const m = 4 * a;
  const rho = ((b * b) % m + m) % m; // b^2 mod 4a — the residue c-integrality needs
  const out: number[] = [];

  if (type === "rational") {
    // D = g^2 with g = |b + 2a·k|, k ≠ 0 → D ≡ b^2 (mod 4a) and a perfect square,
    // giving distinct rational roots (g ≠ 0).
    for (const k of [1, -1, 2, -2, 3, -3]) {
      const g = Math.abs(b + 2 * a * k);
      if (g > 0) out.push(g * g);
    }
    return out;
  }

  if (type === "irrational") {
    // Positive, non-perfect-square members of the residue class.
    for (let t = 0; t < 8 && out.length < 6; t++) {
      const D = (rho === 0 ? m : rho) + m * t;
      if (D > 0 && !isPerfectSquare(D)) out.push(D);
    }
    return out;
  }

  // imaginary: negative members of the residue class (smallest magnitude first).
  for (let t = 1; t <= 6; t++) {
    out.push(rho - m * t);
  }
  return out;
}

function isPerfectSquare(n: number): boolean {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
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

/** Render a rational conjugate pair (s === 1) as "x = f1, f2" — two reduced
 * fractions, sorted by value and de-duplicated (repeated root collapses to one). */
function rationalAnswer(root: ExactRoot): string {
  const pairs: [number, number][] = [
    [root.p + root.q, root.r],
    [root.p - root.q, root.r],
  ];
  const seen = new Set<string>();
  const parts = pairs
    .map(([n, d]) => ({ tex: fractionToLatex(n, d), val: n / d }))
    .sort((x, y) => x.val - y.val)
    .filter((x) => (seen.has(x.tex) ? false : (seen.add(x.tex), true)))
    .map((x) => x.tex);
  return "x = " + parts.join(", ");
}

/** Render the radical term q√s (irrational) or q·i√|s| (imaginary), hiding a
 * unit coefficient and a unit radicand. */
function radicalTerm(q: number, s: number): string {
  const coef = q === 1 ? "" : String(q);
  if (s < 0) {
    const m = -s;
    return m === 1 ? `${coef}i` : `${coef}i\\sqrt{${m}}`;
  }
  return `${coef}\\sqrt{${s}}`;
}

/** Render an irrational/imaginary conjugate pair as "x = (p ± q√s) / r". */
function surdAnswer(root: ExactRoot): string {
  const { p, q, s, r } = root;
  const rad = radicalTerm(q, s);
  const numer = p === 0 ? `\\pm ${rad}` : `${p} \\pm ${rad}`;
  const body = r === 1 ? numer : `\\frac{${numer}}{${r}}`;
  return `x = ${body}`;
}

/** Render any exact root form, dispatching on the radicand (used for both the
 * answer and the mistake-based distractors, whose class may differ). */
export function answerToLatex(root: ExactRoot): string {
  return root.s === 1 ? rationalAnswer(root) : surdAnswer(root);
}

/** Mistake-based distractors for the MC assembler: each models a classic
 * quadratic-formula error (sign of b, dropped the ±, dividing by 2 or a instead
 * of 2a, i.e. forgetting the leading coefficient, and a sign error in the
 * discriminant). Distinct, and never equal to the correct answer. */
export function distractors(k: FormulaConstruction): string[] {
  const { a, b, c, D } = k;
  const correct = answerToLatex(k.root);
  const candidates: ExactRoot[] = [
    makeRoot(b, D, 2 * a), // forgot to negate b
    makeRoot(-b, D, 2), // divided by 2 instead of 2a
    makeRoot(-b, b * b + 4 * a * c, 2 * a), // sign error in the discriminant
    makeRoot(-b, D, a), // divided by a instead of 2a
  ];
  const texts = candidates.map(answerToLatex);
  texts.splice(1, 0, plusOnlyAnswer(k.root)); // dropped the ±
  const seen = new Set<string>([correct]);
  const out: string[] = [];
  for (const tex of texts) {
    if (seen.has(tex)) continue;
    seen.add(tex);
    out.push(tex);
  }
  return out;
}

/** The "dropped the ±" mistake: only the + branch of the formula. */
function plusOnlyAnswer(root: ExactRoot): string {
  const { p, q, s, r } = root;
  if (s === 1) return `x = ${fractionToLatex(p + q, r)}`;
  const rad = radicalTerm(q, s);
  const numer = p === 0 ? rad : `${p} + ${rad}`;
  return `x = ${r === 1 ? numer : `\\frac{${numer}}{${r}}`}`;
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
