// Test-only helpers for the Sequences and Series Topics: read the BAKED prompt
// and Answer strings back into numbers, so property tests check what prints.

import katex from "katex";
import { expect } from "vitest";
import { evalLatex } from "../shared/latexEval.testkit";

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

/**
 * A written-out series: "3 + 7 + 11 + \cdots + 79" -> opening [3, 7, 11] and
 * last 79; "12 - 6 + 3 + \cdots" -> opening [12, -6, 3] and no last term.
 */
export function parseSeries(latex: string): { opening: number[]; last: number | null } {
  const tokens = latex.split(/ (?=[+-] )/);
  const at = tokens.findIndex((t) => t.endsWith("\\cdots"));
  if (at < 0) throw new Error(`no ellipsis in ${latex}`);
  const opening = tokens.slice(0, at).map((t) => evalLatex(t));
  const rest = tokens.slice(at + 1);
  if (rest.length > 1) throw new Error(`more than one last term in ${latex}`);
  return { opening, last: rest.length ? evalLatex(rest[0]) : null };
}

/** "\sum_{k=1}^{20} (3k - 1)" -> from 1, to 20 (or Infinity), body "(3k - 1)". */
export function parseSigma(latex: string): { from: number; to: number; body: string } | null {
  const m = latex.match(/^\\sum_\{k=(\d+)\}\^\{(\d+|\\infty)\} (.+)$/);
  if (!m) return null;
  return { from: Number(m[1]), to: m[2] === "\\infty" ? Infinity : Number(m[2]), body: m[3] };
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
