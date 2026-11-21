// Test helper for the linear Topics: checks a printed equation independently
// of how lines.ts writes it, by evaluating the LaTeX itself.

/**
 * Whether (x, y) satisfies the equation printed as `tex`, in slope-intercept,
 * point-slope or standard form (or x = c / y = c).
 */
export function satisfies(tex: string, x: number, y: number): boolean {
  // LaTeX to a JS expression: \frac{a}{b} -> (a/b), implicit products -> *
  const js = tex
    .replace(/\\frac\{(\d+)\}\{(\d+)\}/g, "($1/$2)")
    .replace(/(\d|\))\s*(x|y|\()/g, "$1*$2")
    .replace(/-\s*\(/g, "-1*(")
    .replace(/\bx\b/g, `(${x})`)
    .replace(/\by\b/g, `(${y})`);
  const sides = js.split("=");
  if (sides.length !== 2) throw new Error(`not an equation: ${tex}`);
  const diff = Function(`return (${sides[0]}) - (${sides[1]})`)() as number;
  return Math.abs(diff) < 1e-9;
}
