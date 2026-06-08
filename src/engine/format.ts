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
