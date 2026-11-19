// Test-only helpers for the Sequences and Series Topics: read the BAKED prompt
// and Answer strings back into numbers, so property tests check what prints.

import katex from "katex";
import { expect } from "vitest";
import { evalLatex } from "./latexEval.testkit";

/** "5, 8, -\frac{1}{2}" -> [5, 8, -0.5] (top-level commas only). */
export function parseList(latex: string): number[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < latex.length; i++) {
    if (latex[i] === "{") depth++;
    else if (latex[i] === "}") depth--;
    else if (latex[i] === "," && depth === 0) {
      parts.push(latex.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(latex.slice(start));
  return parts.map((p) => evalLatex(p.trim()));
}

/** The prompt's math part and its request, split at ";\quad ". */
export function splitAsk(prompt: string): [string, string] {
  const at = prompt.lastIndexOf(";\\quad ");
  if (at < 0) throw new Error(`no request in ${prompt}`);
  return [prompt.slice(0, at), prompt.slice(at + ";\\quad ".length)];
}

/** "\text{find } a_{12}" -> 12 */
export function askedIndex(ask: string): number | null {
  const m = ask.match(/^\\text\{find \} a_\{(\d+)\}$/);
  return m ? Number(m[1]) : null;
}

/** Every number printed in a LaTeX string, ignoring subscripts and exponents. */
export function printedNumbers(latex: string): number[] {
  const stripped = latex.replace(/[_^]\{[^}]*\}/g, "").replace(/[_^]\d/g, "");
  return [...stripped.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

/** Degenerate spellings no printed expression may contain. */
export function expectTidy(latex: string): void {
  expect(latex, latex).not.toMatch(/(^|[^0-9.])1(n|k|a_|\\cdot|\()/);
  expect(latex, latex).not.toMatch(/[+-] 0(?![.\d])/);
  expect(latex, latex).not.toMatch(/[+-] -/);
  expect(latex, latex).not.toMatch(/\^\{?1\}?(?![0-9])/);
  expect(latex, latex).not.toMatch(/(^|[^0-9])0 ?\\cdot/);
}

/** It renders in KaTeX without errors. */
export function expectKatex(latex: string): void {
  expect(() => katex.renderToString(latex, { throwOnError: true }), latex).not.toThrow();
}
