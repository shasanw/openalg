import { close, evalLatex, splitEquation, type Env } from "../generators/shared/latexEval.testkit";

export function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function equal(a: number, b: number) {
  check(Number.isFinite(a) && Number.isFinite(b) && close(a, b), `expected ${b}, got ${a}`);
}
export function gap(eq: string, env: Env) {
  const [lhs, rhs] = splitEquation(eq);
  return evalLatex(lhs, env) - evalLatex(rhs, env);
}
export function coefficients(f: (x: number) => number) {
  const c = f(0),
    b = (f(1) - f(-1)) / 2;
  return { a: f(1) - b - c, b, c };
}
export function realRoots(f: (x: number) => number) {
  const { a, b, c } = coefficients(f);
  if (close(a, 0)) return close(b, 0) ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  if (close(d, 0)) return [-b / (2 * a)];
  return d < 0 ? [] : [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)];
}
export function sameNumbers(actual: number[], expected: number[]) {
  check(actual.length === expected.length, `expected [${expected}], got [${actual}]`);
  actual.sort((a, b) => a - b);
  expected.sort((a, b) => a - b).forEach((n, i) => equal(actual[i], n));
}
export function expandSigns(s: string) {
  return s.includes("\\pm") ? ["-", "+"].map((sign) => s.replace("\\pm", sign)) : [s];
}
export function coordinates(s: string) {
  return [...s.replace(/\\left|\\right/g, "").matchAll(/\(([^(),]+), ([^(),]+)\)/g)].flatMap((m) =>
    expandSigns(m[1]).map((x) => ({ x: evalLatex(x), y: evalLatex(m[2]) })),
  );
}
export function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a);
}
