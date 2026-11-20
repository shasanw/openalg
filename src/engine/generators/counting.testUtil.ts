// Test-only: independent counting arithmetic and readers for the counting
// Topics' notation prompts.

export const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
export const nPr = (n: number, r: number): number => fact(n) / fact(n - r);
export const nCr = (n: number, r: number): number => fact(n) / (fact(r) * fact(n - r));

/** "{}_{8}P_{3}" -> { n: 8, r: 3, letter: "P" }, or null for a word problem. */
export function readNotation(prompt: string): { n: number; r: number; letter: "P" | "C" } | null {
  const m = prompt.match(/^\{\}_\{(\d+)\}([PC])_\{(\d+)\}$/);
  return m ? { n: Number(m[1]), r: Number(m[3]), letter: m[2] as "P" | "C" } : null;
}
