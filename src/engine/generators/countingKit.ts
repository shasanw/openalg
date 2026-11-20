// Shared pieces of the Counting and the Binomial Theorem Topics: factorials,
// permutations and combinations as exact whole numbers, their notation, large
// whole numbers with thin-space thousands separators, and the word-problem
// scenarios the permutation and combination Topics draw from.
//
// Every count is evaluated FORWARDS from the numbers a scenario is built
// with (n things, r chosen, order matters or not); nothing is solved.

import { prose } from "../format";
import type { Rng } from "../rng";

// ------------------------------------------------------------------ counting

export function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** nPr = n! / (n - r)!, the ordered arrangements of r of n things. */
export function perm(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  let p = 1;
  for (let i = n - r + 1; i <= n; i++) p *= i;
  return p;
}

/** nCr = n! / (r! (n - r)!), the unordered selections of r of n things. */
export const comb = (n: number, r: number): number => (r < 0 || r > n ? 0 : perm(n, r) / factorial(r));

// ------------------------------------------------------------------ printing

/**
 * A whole number, with comma thousands separators from 10,000 up ("5040",
 * "30\mathord{,}240"). The comma is an ordinary symbol, so neither KaTeX nor
 * Typst spaces it like a list's comma.
 */
export function countLatex(n: number): string {
  if (!Number.isSafeInteger(n)) throw new Error(`countLatex: ${n}`);
  const s = String(Math.abs(n));
  const body = Math.abs(n) < 10000 ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, "\\mathord{,}");
  return (n < 0 ? "-" : "") + body;
}

/** "{}_{8}P_{3}" */
export const permLatex = (n: number, r: number): string => `{}_{${n}}P_{${r}}`;
/** "{}_{8}C_{3}" */
export const combLatex = (n: number, r: number): string => `{}_{${n}}C_{${r}}`;

/** Ordinal words for places and positions: "first", "second", ... */
export const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"] as const;

/** "a, b and c" */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ------------------------------------------------------------------ scenarios

/** Whether a scenario's order matters (a permutation) or not (a combination). */
export type CountKind = "permutation" | "combination";

/**
 * A counting word problem: n things, r of them chosen, and the count it asks
 * for. `count` is the Answer. A two-group combination ("2 of 6 teachers and 3
 * of 10 students") counts both groups; its `groups` hold each one.
 */
export interface Scenario {
  kind: CountKind;
  /** the prompt, as prose */
  text: string;
  n: number;
  r: number;
  count: number;
  /** a two-group selection: the count is the product of the groups' counts */
  groups?: readonly { n: number; r: number }[];
}

type Make = (rng: Rng, maxN: number) => Scenario | null;

const OFFICES = ["a president", "a vice president", "a secretary", "a treasurer"] as const;

const permOf = (text: string, n: number, r: number): Scenario => ({ kind: "permutation", text, n, r, count: perm(n, r) });
const combOf = (text: string, n: number, r: number): Scenario => ({ kind: "combination", text, n, r, count: comb(n, r) });

/** n in [lo, maxN], or null when maxN is below lo. */
const upTo = (rng: Rng, lo: number, maxN: number): number | null => (maxN < lo ? null : rng.int(lo, maxN));

/** Word problems where order matters. */
export const PERMUTATION_SCENARIOS: readonly Make[] = [
  (rng, maxN) => {
    const r = rng.int(2, 3);
    const n = upTo(rng, r + 3, maxN);
    if (n === null) return null;
    const offices = r === 2 ? [OFFICES[0], OFFICES[1]] : [OFFICES[0], OFFICES[1], OFFICES[3]];
    return permOf(
      `A club with ${n} members elects ${listWords(offices)}. In how many ways can the offices be filled?`,
      n,
      r,
    );
  },
  (rng, maxN) => {
    const r = rng.int(2, 3);
    const n = upTo(rng, r + 3, maxN);
    if (n === null) return null;
    return permOf(
      `${n} runners are in a race. In how many ways can ${listWords(ORDINALS.slice(0, r))} place be awarded?`,
      n,
      r,
    );
  },
  (rng, maxN) => {
    const r = rng.int(2, 5);
    const n = upTo(rng, r + 2, maxN);
    if (n === null) return null;
    return permOf(`In how many ways can ${r} of ${n} different books be arranged in a row on a shelf?`, n, r);
  },
  (rng, maxN) => {
    const n = upTo(rng, 4, Math.min(maxN, 8));
    if (n === null) return null;
    return permOf(`In how many different orders can ${n} students stand in a line?`, n, n);
  },
  (rng) => {
    const r = rng.int(3, 5);
    return permOf(
      `A ${r}-digit code uses the digits 0 to 9, with no digit repeated. How many codes are possible?`,
      10,
      r,
    );
  },
  (rng, maxN) => {
    const r = rng.int(3, 5);
    const n = upTo(rng, r + 2, maxN);
    if (n === null) return null;
    return permOf(`A playlist plays ${r} of ${n} different songs, one after another. How many orders are possible?`, n, r);
  },
  (rng, maxN) => {
    const r = rng.int(2, 4);
    const n = upTo(rng, r + 3, maxN);
    if (n === null) return null;
    return permOf(
      `A teacher gives ${r} different prizes to ${r} of ${n} students, one prize each. In how many ways can the prizes be given?`,
      n,
      r,
    );
  },
];

/** Word problems where order does not matter. */
export const COMBINATION_SCENARIOS: readonly Make[] = [
  (rng, maxN) => {
    const r = rng.int(2, 5);
    const n = upTo(rng, r + 3, maxN);
    if (n === null) return null;
    return combOf(`In how many ways can a committee of ${r} be chosen from ${n} people?`, n, r);
  },
  (rng, maxN) => {
    const r = rng.int(2, 4);
    const n = upTo(rng, r + 4, maxN);
    if (n === null) return null;
    return combOf(`A pizza shop offers ${n} toppings. How many different pizzas with ${r} different toppings are possible?`, n, r);
  },
  (rng, maxN) => {
    const r = rng.int(2, 5);
    const n = upTo(rng, r + 2, maxN);
    if (n === null) return null;
    return combOf(`In how many ways can you choose ${r} of ${n} books to take on a trip?`, n, r);
  },
  (rng, maxN) => {
    const r = rng.int(3, 6);
    const n = upTo(rng, r + 2, maxN);
    if (n === null) return null;
    return combOf(`A test has ${n} questions, and you may answer any ${r} of them. In how many ways can you choose the questions?`, n, r);
  },
  (rng, maxN) => {
    const n = upTo(rng, 5, maxN);
    if (n === null) return null;
    return combOf(`${n} people each shake hands once with every other person. How many handshakes are there?`, n, 2);
  },
  (rng, maxN) => {
    const r = rng.int(3, 5);
    const n = upTo(rng, r + 3, maxN);
    if (n === null) return null;
    return combOf(`A coach chooses ${r} of ${n} players for a practice group. How many different groups are possible?`, n, r);
  },
];

/** A two-group committee: r1 of n1 teachers and r2 of n2 students. */
export function twoGroupScenario(rng: Rng, maxN: number): Scenario | null {
  const r1 = rng.int(1, 2);
  const r2 = rng.int(2, 3);
  const n1 = upTo(rng, r1 + 2, Math.min(maxN, 8));
  const n2 = upTo(rng, r2 + 3, maxN);
  if (n1 === null || n2 === null) return null;
  const teachers = r1 === 1 ? "1 teacher" : `${r1} teachers`;
  return {
    kind: "combination",
    text: `A committee of ${teachers} and ${r2} students is chosen from ${n1} teachers and ${n2} students. How many committees are possible?`,
    n: n1 + n2,
    r: r1 + r2,
    count: comb(n1, r1) * comb(n2, r2),
    groups: [
      { n: n1, r: r1 },
      { n: n2, r: r2 },
    ],
  };
}

/** A scenario drawn from `pool`, retrying until one fits within maxN. */
export function pickScenario(rng: Rng, pool: readonly Make[], maxN: number): Scenario {
  for (;;) {
    const s = rng.pick(pool)(rng, maxN);
    if (s) return s;
  }
}

/** The scenario's text as a prompt. */
export const scenarioPrompt = (s: Scenario): string => prose(s.text);

/**
 * The counts a student gets with a common slip, most common first: the other
 * kind of count (dividing by r! or not), n^r (repetition allowed), n!, r!,
 * and n·r. For a two-group selection, adding the groups instead of
 * multiplying, and pooling the groups into one selection.
 */
export function scenarioSlips(s: Scenario): number[] {
  const { n, r } = s;
  if (s.groups) {
    const [a, b] = s.groups;
    return [
      comb(a.n, a.r) + comb(b.n, b.r),
      comb(n, r),
      perm(a.n, a.r) * perm(b.n, b.r),
      comb(a.n, a.r) * comb(b.n, b.r - 1),
    ];
  }
  const other = s.kind === "permutation" ? comb(n, r) : perm(n, r);
  const out = [other];
  if (r < n) out.push(n ** r);
  out.push(s.kind === "permutation" ? perm(n, r - 1) : comb(n, r - 1));
  out.push(s.kind === "permutation" ? perm(n, r + 1) : comb(n, r + 1));
  out.push(factorial(n) / factorial(r), n * r, factorial(r));
  return out.filter((v) => v > 0 && Number.isSafeInteger(v) && v <= 1e9);
}
