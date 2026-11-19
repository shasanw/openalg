// LaTeX formatting helpers shared by generators. Kept separate so the math
// rendering is unit-testable and reused across topics.

interface Term {
  coef: number;
  /** variable part in LaTeX, e.g. "x^2", "x", or "" for a constant */
  variable: string;
}

/** Render a sum of integer-coefficient terms as LaTeX, omitting zeros and unit
 * coefficients and using proper +/- joining. */
export function renderPolynomial(terms: Term[]): string {
  const nonzero = terms.filter((t) => t.coef !== 0);
  if (nonzero.length === 0) return "0";

  return nonzero
    .map((t, i) => {
      const mag = Math.abs(t.coef);
      // constants always show their digits; variable terms hide a leading 1
      const coefStr = t.variable === "" ? String(mag) : mag === 1 ? "" : String(mag);
      const body = coefStr + t.variable;
      if (i === 0) return (t.coef < 0 ? "-" : "") + body;
      return ` ${t.coef < 0 ? "-" : "+"} ${body}`;
    })
    .join("");
}

/** Render a x^2 + b x + c (integer coefficients) as LaTeX. */
export function quadraticToLatex(a: number, b: number, c: number): string {
  return renderPolynomial([
    { coef: a, variable: "x^2" },
    { coef: b, variable: "x" },
    { coef: c, variable: "" },
  ]);
}

/** Render a solution set "x = r1, r2" (sorted, de-duplicated). */
export function rootsToLatex(roots: number[]): string {
  const uniq = [...new Set(roots)].sort((a, b) => a - b);
  return "x = " + uniq.join(", ");
}

/** Greatest common divisor (non-negative). gcd(0, 0) === 0. */
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * Factor a non-negative integer n into outside·sqrt(inside) with `inside`
 * square-free, so that outside * sqrt(inside) === sqrt(n). A perfect square
 * yields inside === 1; n === 0 yields {outside: 0, inside: 0}.
 */
export function simplifyRadical(n: number): { outside: number; inside: number } {
  if (n === 0) return { outside: 0, inside: 0 };
  let outside = 1;
  let inside = n;
  for (let f = 2; f * f <= inside; f++) {
    while (inside % (f * f) === 0) {
      inside /= f * f;
      outside *= f;
    }
  }
  return { outside, inside };
}

/** Render a fraction n/d (integers) as reduced LaTeX: an integer when it
 * divides, a `\frac` otherwise, with the sign pulled out front. */
export function fractionToLatex(n: number, d: number): string {
  if (d === 0) throw new Error("fractionToLatex: zero denominator");
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  n /= g;
  d /= g;
  if (d === 1) return String(n);
  return n < 0 ? `-\\frac{${-n}}{${d}}` : `\\frac{${n}}{${d}}`;
}

/**
 * Separates the parts of a multi-part Answer (e.g. vertex; axis; intercepts),
 * or of a prompt (a given, then what to find: "5, 8, 11, \ldots;\quad
 * \text{find } a_{20}"). Printed layouts split on it so a long one can wrap between its parts
 * instead of overflowing as one unbreakable equation; on screen it renders as
 * "; " plus a quad.
 */
export const ANSWER_PART_SEPARATOR = ";\\quad ";
