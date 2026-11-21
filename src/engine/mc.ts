// Multiple-choice assembler (issue #5). Turns any Problem into a set of
// lettered choices: the Answer plus Distractors drawn from the Problem's
// mistake-based `distractorHints`, topped up with deterministic fallback
// Distractors when the hints run short. A Problem without enough hints (a
// Custom Problem a teacher wrote has none) is topped up with plausible
// mistakes of its Answer first (the sign flipped, a fraction's reciprocal, a
// number doubled or halved, a leading coefficient's sign), then with numbers
// nudged by one, and never with a well-formed equivalent of the Answer (no
// \frac{2}{4} for \frac{1}{2}).
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

/** Preserve the variable in a printed answer such as "x = -3". */
function answerParts(answer: Latex) {
  const prefix = answer.match(/^\s*(?:[a-zA-Z]|\\theta)\s*=\s*/)?.[0] ?? "";
  return { prefix, value: answer.slice(prefix.length).trim() };
}

/** Read a scalar exactly, including unreduced fractions and finite decimals. */
function scalar(value: string): [bigint, bigint] | undefined {
  const compact = value.replace(/\s+/g, "");
  const frac = compact.match(/^([+-]?)\\frac\{([+-]?\d+)\}\{([+-]?\d+)\}$/);
  if (frac && BigInt(frac[3]) !== 0n)
    return [(frac[1] === "-" ? -1n : 1n) * BigInt(frac[2]), BigInt(frac[3])];
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(compact)) return;
  const places = compact.split(".")[1]?.length ?? 0;
  return [BigInt(compact.replace(".", "")), 10n ** BigInt(places)];
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function reduced(n: bigint, d: bigint): Latex {
  let a = n < 0n ? -n : n;
  let b = d < 0n ? -d : d;
  const sign = n !== 0n && (n < 0n) !== (d < 0n) ? "-" : "";
  const numerator = a;
  const denominator = b;
  while (b !== 0n) [a, b] = [b, a % b];
  return denominator === a ? sign + String(numerator / a) : `${sign}\\frac{${numerator / a}}{${denominator / a}}`;
}

/** An exact value key lets fallback choices respect a differently spelled hint. */
function fallbackKey(answer: Latex): string {
  const { prefix, value } = answerParts(answer);
  const pair = scalar(value);
  return choiceKey(pair ? prefix + reduced(...pair) : answer);
}

function* mistakeFallbacks(answer: Latex): Generator<Latex> {
  const { prefix, value } = answerParts(answer);
  const pair = scalar(value);
  if (pair) {
    const [n, d] = pair;
    if (n === 0n) return;
    yield prefix + reduced(-n, d);
    if (value.includes("\\frac")) yield prefix + reduced(d, n);
    yield prefix + reduced(2n * n, d);
    yield prefix + reduced(n, 2n * d);
  } else if (/^-?(?:[1-9]\d*)?[a-z](?:\^(?:\d+|\{\d+\}))?(?:\s*[+-]|$)/.test(value)) {
    // Flip only a nonzero leading monomial (e.g. -3x² + 1 becomes 3x² + 1).
    yield prefix + (value.startsWith("-") ? value.slice(1) : "-" + value);
  }
}

/** Last-resort numerical offsets, after the mistake-based choices. */
export function* fallbackDistractors(answer: Latex): Generator<Latex> {
  const { prefix, value } = answerParts(answer);
  const pair = scalar(value);
  if (pair && (/^-?\d+$/.test(value) || /^-?\\frac\{\d+\}\{\d+\}$/.test(value))) {
    const numbers = [...value.matchAll(/\d+/g)];
    for (let step = 1n; ; step++) {
      for (const delta of [step, -step]) {
        for (const [i, m] of numbers.entries()) {
          // A zero fraction remains zero when only its denominator changes.
          if (i === 1 && pair[0] === 0n) continue;
          const changed = BigInt(m[0]) + delta;
          if (changed < 1n) continue;
          yield prefix + value.slice(0, m.index) + changed + value.slice(m.index! + m[0].length);
        }
      }
    }
  }
  if (pair) {
    for (let step = 1n; ; step++) {
      for (const delta of [step, -step]) yield prefix + reduced(pair[0] + delta * pair[1], pair[1]);
    }
  }
  // Any other Answer (several parts, text, expressions): nudge one whole number
  // at a time, keeping it positive so no "\frac{1}{0}" or "-0" appears. Skip a
  // digit whose change cannot change the value (the exponent of 0 or 1, the
  // denominator of a zero fraction), since that would print the Answer again.
  const numbers = [...answer.matchAll(/\d+/g)].filter(
    (m) => !/(?:^|[^\d.])[01]\^\{?$|\\frac\{0\}\{$/.test(answer.slice(0, m.index)),
  );
  if (numbers.length === 0) {
    // Nothing to nudge: "x = 1", "x = 2", ... on the Answer's own left-hand side.
    const eq = answer.indexOf("=");
    const lhs = eq >= 0 ? answer.slice(0, eq + 1).trimEnd() + " " : "";
    for (let n = 1n; ; n++) yield `${lhs}${n}`;
  }
  for (let step = 1n; ; step++) {
    for (const delta of [step, -step]) {
      for (const m of numbers) {
        // BigInt so a long digit run still changes by exactly `delta`.
        const changed = BigInt(m[0]) + delta;
        if (changed < 1n) continue;
        const before = answer.slice(0, m.index);
        const after = answer.slice(m.index! + m[0].length);
        // Never print an unreduced fraction such as \frac{10}{2}: a tell, and
        // not how a student would write an Answer.
        const num = after.match(/^\}\{(\d+)\}/);
        const den = before.match(/\\frac\{(\d+)\}\{$/);
        if (before.endsWith("\\frac{") && num && gcd(changed, BigInt(num[1])) > 1n) continue;
        if (den && gcd(BigInt(den[1]), changed) > 1n) continue;
        yield before + changed + after;
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
    const values = new Set(picked.map(fallbackKey));
    for (const source of [mistakeFallbacks, fallbackDistractors]) {
      for (const candidate of source(problem.answer)) {
        const key = fallbackKey(candidate);
        if (values.has(key)) continue;
        values.add(key);
        full = take(candidate);
        if (full) break;
      }
      if (full) break;
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
