import type { Problem } from "../../types";
import { expect } from "vitest";

/**
 * Classify a printed number from its LaTeX alone, independently of the
 * generator: \pi, a never-repeating pattern (\ldots) or the root of a
 * non-square is irrational; otherwise the exact value decides.
 */
function classify(latex: string): { irrational: true } | { irrational: false; value: number } {
  if (latex.includes("\\pi") || latex.includes("\\ldots")) return { irrational: true };
  const root = latex.match(/\\sqrt\{(\d+)\}/);
  if (root && !Number.isInteger(Math.sqrt(Number(root[1])))) return { irrational: true };
  const sign = latex.startsWith("-") ? -1 : 1;
  const body = latex.replace(/^-/, "");
  let value: number;
  let m: RegExpMatchArray | null;
  if ((m = body.match(/^\\sqrt\{\\frac\{(\d+)\}\{(\d+)\}\}$/)))
    value = Math.sqrt(Number(m[1])) / Math.sqrt(Number(m[2]));
  else if ((m = body.match(/^\\sqrt\{(\d+)\}$/))) value = Math.sqrt(Number(m[1]));
  else if ((m = body.match(/^(\d+)\.\\overline\{(\d+)\}$/)))
    value = Number(m[1]) + Number(m[2]) / (10 ** m[2].length - 1);
  else if ((m = body.match(/^(\d+)\\frac\{(\d+)\}\{(\d+)\}$/))) value = Number(m[1]) + Number(m[2]) / Number(m[3]);
  else if ((m = body.match(/^\\frac\{(\d+)\}\{(\d+)\}$/))) value = Number(m[1]) / Number(m[2]);
  else if (/^\d+(\.\d+)?$/.test(body)) value = Number(body);
  else throw new Error(`cannot read ${latex}`);
  return { irrational: false, value: sign * value };
}

function expectedSets(latex: string, includeNatural: boolean): string[] {
  const c = classify(latex);
  let sets: string[];
  if (c.irrational) sets = ["irrational"];
  else {
    const isInt = Math.abs(c.value - Math.round(c.value)) < 1e-9;
    const v = Math.round(c.value);
    if (!isInt) sets = ["rational"];
    else if (v > 0) sets = ["natural", "whole", "integer", "rational"];
    else if (v === 0) sets = ["whole", "integer", "rational"];
    else sets = ["integer", "rational"];
  }
  return includeNatural ? sets : sets.filter((s) => s !== "natural");
}

const setsOf = (answer: string) => answer.replace(/^\\text\{|\}$/g, "").split(", ");

export function classifyingNumbers(p: Problem): void {
  expect(setsOf(p.answer).sort(), p.prompt).toEqual(expectedSets(p.prompt, p.params.includeNatural === true).sort());
}
