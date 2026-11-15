// Exact-root machinery shared by the quadratic generators (quadratic formula,
// completing the square). Every root here is the exact conjugate pair
// (p ± q√s) / r recovered from integer coefficients by integer/radical
// arithmetic, never by a CAS, and rendered as LaTeX that both KaTeX and
// Typst+mitex accept.

import { fractionToLatex, gcd, simplifyRadical } from "./format";
import type { ParamField } from "./types";

export type RootType = "rational" | "irrational" | "imaginary";

/** The cross-cutting root-type Topic Option, shared so every quadratic topic
 * offers the same toggle with the same labels. */
export const rootTypeField: Extract<ParamField, { type: "enum" }> = {
  type: "enum",
  key: "rootType",
  label: "Root type",
  default: "rational",
  options: [
    { value: "rational", label: "Rational" },
    { value: "irrational", label: "Irrational (radicals)" },
    { value: "imaginary", label: "Imaginary (complex)" },
  ],
};

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

/** Build the normalized exact root form from a numerator offset `p0` (the −b of
 * the formula), a discriminant `D`, and a denominator `r0` (the 2a). Negative D
 * is rendered as an imaginary radical by carrying a negative `s`. */
export function makeRoot(p0: number, D: number, r0: number): ExactRoot {
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

export function isPerfectSquare(n: number): boolean {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

/** Candidate discriminants ≡ b^2 (mod 4a) of the requested class, in increasing
 * |D| (so we prefer small, clean radicands). Always non-empty. Any D drawn from
 * here makes c = (b^2 − D) / 4a an integer. */
export function discriminants(a: number, b: number, type: RootType): number[] {
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
  // A zero discriminant (q === 0) is one repeated real root, not "± 0√0".
  if (root.q === 0) return rationalAnswer({ ...root, s: 1 });
  return root.s === 1 ? rationalAnswer(root) : surdAnswer(root);
}

/** Render only the "+" root (p + q√s) / r as "x = …": the shape of the classic
 * dropped-the-± mistake. */
export function singleRootToLatex(root: ExactRoot): string {
  const { p, q, s, r } = root;
  if (s === 1) return `x = ${fractionToLatex(p + q, r)}`;
  if (q === 0) return `x = ${fractionToLatex(p, r)}`;
  const rad = radicalTerm(Math.abs(q), s);
  const sign = q < 0 ? "-" : "+";
  const numer = p === 0 ? (q < 0 ? `-${rad}` : rad) : `${p} ${sign} ${rad}`;
  const body = r === 1 ? numer : `\\frac{${numer}}{${r}}`;
  return `x = ${body}`;
}
