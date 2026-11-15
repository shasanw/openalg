// Multiple-choice assembler (issue #5). Turns any Problem into a set of
// lettered choices: the Answer plus Distractors drawn from the Problem's
// mistake-based `distractorHints`, topped up with deterministic fallback
// Distractors when the hints run short.
//
// The assembler is pure and its seed is an explicit input. The SET of choices
// depends only on (problem, choice count); the seed only decides their ORDER
// (and so where the correct choice lands). That split is what lets Versions
// scramble choices (#11) by re-running the assembler with a different seed while
// every Version still offers the same choices.
//
// Choices are not stored on the Problem: they are derived at render time from
// the baked Answer and distractorHints, so a saved Worksheet reopens with the
// same choices in the same order.

import { createRng, deriveSeed } from "./rng";
import type { Latex, Problem } from "./types";

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 5;
export const DEFAULT_CHOICES = 4;

export interface AssembleOptions {
  /** Number of choices to offer, clamped to [MIN_CHOICES, MAX_CHOICES]. */
  choices: number;
  /** Decides the order of the choices, and so the correct choice's position. */
  seed: number;
}

export interface AssembledChoices {
  /** Rendered choices in printed order (A, B, C, ...). */
  choices: Latex[];
  /** Index into `choices` of the Answer. */
  correctIndex: number;
}

/** Clamp a requested choice count into the supported 2 to 5 range. */
export function clampChoices(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CHOICES;
  return Math.min(MAX_CHOICES, Math.max(MIN_CHOICES, Math.round(n)));
}

/** The printed letter for a choice index: 0 -> "A", 1 -> "B", ... */
export function choiceLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * The seed a Worksheet uses to order a Problem's choices. Derived from the
 * Problem's own seed, so a re-rolled Problem gets a fresh order and an
 * untouched one keeps its order. `variant` is reserved for Versions (#11):
 * variant 0 is the Worksheet itself.
 */
export function choiceSeed(problem: Problem, variant = 0): number {
  return deriveSeed(problem.seed, 0x4d43 + variant);
}

/**
 * A comparison key for a choice, so two spellings of the same choice count as
 * duplicates: whitespace is ignored, and a solution set "x = a, b" compares
 * equal regardless of the order its values are listed in.
 */
export function choiceKey(latex: Latex): string {
  const compact = latex.replace(/\s+/g, "");
  const eq = compact.indexOf("=");
  if (eq < 0) return compact;
  const lhs = compact.slice(0, eq);
  const rhs = compact.slice(eq + 1);
  const parts = splitTopLevel(rhs);
  if (parts.length < 2) return compact;
  return `${lhs}=${[...new Set(parts)].sort().join(",")}`;
}

/** Split on commas that are not nested inside braces or parentheses. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

/**
 * Fallback Distractors, in a fixed order, for when a Problem's hints run
 * short: each nudges one whole number in the Answer by a small amount (keeping
 * it a positive whole number, so no "\frac{1}{0}" or "-0"). An Answer with no
 * numbers at all falls back to "x = 1", "x = 2", ... using the Answer's own
 * left-hand side. The sequence never ends, so filling always terminates.
 */
export function* fallbackDistractors(answer: Latex): Generator<Latex> {
  const numbers = [...answer.matchAll(/\d+/g)];
  if (numbers.length === 0) {
    const eq = answer.indexOf("=");
    const lhs = eq >= 0 ? answer.slice(0, eq + 1).trimEnd() + " " : "";
    for (let n = 1; ; n++) yield `${lhs}${n}`;
  }
  for (let step = 1; ; step++) {
    for (const delta of [step, -step]) {
      for (const m of numbers) {
        // BigInt so a long digit run still changes by exactly `delta`.
        const value = BigInt(m[0]) + BigInt(delta);
        if (value < 1n) continue;
        const at = m.index!;
        yield answer.slice(0, at) + String(value) + answer.slice(at + m[0].length);
      }
    }
  }
}

/**
 * Assemble a Problem's multiple-choice set: the Answer plus `choices - 1`
 * Distractors. Distractors come from the Problem's hints first (in the order
 * the generator ranked them), then from fallbackDistractors. No two choices
 * share a choiceKey and no Distractor matches the Answer. The choices are then
 * shuffled by `seed`, and the Answer's position is recorded.
 */
export function assemble(
  problem: Pick<Problem, "answer" | "distractorHints">,
  opts: AssembleOptions,
): AssembledChoices {
  const count = clampChoices(opts.choices);
  const picked: Latex[] = [problem.answer];
  const seen = new Set<string>([choiceKey(problem.answer)]);
  const take = (candidate: Latex): boolean => {
    const key = choiceKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    picked.push(candidate);
    return picked.length >= count;
  };

  let full = picked.length >= count;
  for (const hint of problem.distractorHints) {
    if (full) break;
    full = take(hint);
  }
  if (!full) {
    for (const candidate of fallbackDistractors(problem.answer)) {
      if (take(candidate)) break;
    }
  }

  // Fisher-Yates shuffle of positions, driven only by the seed.
  const rng = createRng(opts.seed);
  const order = picked.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    choices: order.map((i) => picked[i]),
    correctIndex: order.indexOf(0),
  };
}
