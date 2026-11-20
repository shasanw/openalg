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

/**
 * A word problem's sentence(s) inside a prompt. Prose is written as
 * \textnormal{...} (which KaTeX and mitex both read as upright text), and the
 * printed layouts set it as ordinary text that wraps between words, so a
 * sentence never runs past its column as one unbreakable equation. It may not
 * contain braces or backslashes; put any math in the LaTeX around it.
 */
export function prose(text: string): string {
  if (/[{}\\]/.test(text)) throw new Error(`prose: no braces or backslashes: ${text}`);
  return `\\textnormal{${text}}`;
}

/** A run of a prompt: prose (plain text) or math (LaTeX). */
export type ProseSegment = { kind: "prose"; text: string } | { kind: "math"; latex: string };

/**
 * Split LaTeX into its prose runs (see `prose`) and the math between them, in
 * order. Whitespace between a prose run and math is kept on the math run, so
 * a layout can print a space there. LaTeX with no prose is one math run.
 */
export function proseSegments(latex: string): ProseSegment[] {
  const out: ProseSegment[] = [];
  const re = /\\textnormal\{([^{}\\]*)\}/g;
  let at = 0;
  for (const m of latex.matchAll(re)) {
    if (m.index > at) out.push({ kind: "math", latex: latex.slice(at, m.index) });
    out.push({ kind: "prose", text: m[1] });
    at = m.index + m[0].length;
  }
  if (at < latex.length || out.length === 0) out.push({ kind: "math", latex: latex.slice(at) });
  return out;
}

/** True when the LaTeX typesets a matrix or a determinant's bars. */
export const hasMatrix = (latex: string): boolean => /\\begin\{[bBpvV]?matrix\}/.test(latex);
