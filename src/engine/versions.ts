// Versions (issue #11): scrambled variants of one Worksheet, each printed with
// its own matching Answer Key. A Version is never stored: it is derived on
// demand from the Worksheet's own seeds, its Version settings (count and
// Scramble Mode) and the Version's index, so the same Worksheet always prints
// the same Versions. Version A (index 0) is exactly the Worksheet itself.

import { assemble, choiceSeed, type AssembledChoices } from "./mc";
import { createRng, deriveSeed } from "./rng";
import type { Problem } from "./types";
import {
  buildSection,
  clampVersionCount,
  type Section,
  type Worksheet,
} from "./worksheet";

/** One derived Version of a Worksheet. */
export interface WorksheetVersion {
  /** 0 for Version A, 1 for Version B, ... */
  index: number;
  /**
   * "Version A", "Version B", ... printed in the header and on the Answer Key;
   * null when the Worksheet prints a single Version, which goes unlabelled.
   */
  label: string | null;
  /** This Version's Sections and Problems, in printed order. */
  worksheet: Worksheet;
  /**
   * The `variant` this Version passes to choiceSeed when ordering
   * multiple-choice choices: 0 (the Worksheet's own order) unless the Scramble
   * Mode scrambles choices. Both the student pages and the Answer Key read
   * choices through versionChoices, so their letters always agree.
   */
  choiceVariant: number;
}

/** The letter naming a Version: 0 -> "A", 1 -> "B", ... */
export function versionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

// Salts so each Scramble Mode draws from its own seed stream, independent of
// the streams used for Problems (deriveSeed(baseSeed, draw)) and choices.
const ORDER_SALT = 0x4f524452; // "ORDR"
const NEW_QUESTIONS_SALT = 0x4e455751; // "NEWQ"

/** How many Versions the Worksheet prints (its setting, clamped to 1 to 10). */
export function versionCount(ws: Worksheet): number {
  return clampVersionCount(ws.versions.count);
}

/** Every Version of the Worksheet, A first. */
export function deriveVersions(ws: Worksheet): WorksheetVersion[] {
  return Array.from({ length: versionCount(ws) }, (_, i) => deriveVersion(ws, i));
}

/**
 * The Version at `index` (0 is Version A, the Worksheet itself). Deterministic:
 * the same Worksheet and index always give the same Version. An index past the
 * Worksheet's Version count is clamped to its last Version.
 */
export function deriveVersion(ws: Worksheet, index: number): WorksheetVersion {
  const count = versionCount(ws);
  const i = Math.min(count - 1, Math.max(0, Math.floor(index) || 0));
  const label = count > 1 ? `Version ${versionLetter(i)}` : null;
  if (i === 0) return { index: 0, label, worksheet: ws, choiceVariant: 0 };

  switch (ws.versions.mode) {
    case "scramble-choices":
      return { index: i, label, worksheet: ws, choiceVariant: i };
    case "scramble-order":
      return {
        index: i,
        label,
        worksheet: {
          ...ws,
          sections: ws.sections.map((s, si) => ({
            ...s,
            problems: sectionOrder(s, si, i).map((k) => s.problems[k]),
          })),
        },
        choiceVariant: 0,
      };
    case "new-questions":
      return {
        index: i,
        label,
        worksheet: {
          ...ws,
          sections: ws.sections.map((s) =>
            buildSection({
              generatorId: s.generatorId,
              params: s.params,
              directions: s.directions,
              baseSeed: newQuestionsSeed(s.baseSeed, i),
              count: s.problems.length,
            }),
          ),
        },
        choiceVariant: 0,
      };
  }
}

/** The base seed a Section is regenerated from for Version `index` (new-questions). */
export function newQuestionsSeed(baseSeed: number, index: number): number {
  return deriveSeed(deriveSeed(baseSeed, NEW_QUESTIONS_SALT), index);
}

/**
 * The multiple-choice choices for one of a Version's Problems, in the order
 * that Version prints them. The single source of truth for both the student
 * pages and the Answer Key.
 */
export function versionChoices(
  problem: Problem,
  choices: number,
  choiceVariant: number,
): AssembledChoices {
  return assemble(problem, { choices, seed: choiceSeed(problem, choiceVariant) });
}

/**
 * Problem order (indices into the Section's problems) for Version `index` of a
 * Section under scramble-order. Each Version draws a seeded shuffle and, while
 * there are enough distinct orders to go round, re-draws any order an earlier
 * Version (including A's unshuffled order) already uses, so neighbouring
 * Versions never come out identical by chance. Depending on the earlier
 * Versions keeps it deterministic: it is a function of the Section and index.
 */
function sectionOrder(section: Section, sectionIndex: number, index: number): number[] {
  const n = section.problems.length;
  const identity = Array.from({ length: n }, (_, k) => k);
  if (n < 2) return identity;
  const distinctOrders = factorialAtMost(n, 11);
  const used = new Set<string>([identity.join(",")]);
  const stream = deriveSeed(section.baseSeed, ORDER_SALT + sectionIndex);
  let order = identity;
  for (let v = 1; v <= index; v++) {
    const versionSeed = deriveSeed(stream, v);
    for (let attempt = 0; attempt < 32; attempt++) {
      order = shuffled(identity, deriveSeed(versionSeed, attempt));
      if (!used.has(order.join(",")) || used.size >= distinctOrders) break;
    }
    used.add(order.join(","));
  }
  return order;
}

/** n!, capped at `cap` (enough to know whether every Version can differ). */
function factorialAtMost(n: number, cap: number): number {
  let f = 1;
  for (let k = 2; k <= n && f < cap; k++) f *= k;
  return Math.min(f, cap);
}

/** A seeded Fisher-Yates shuffle of a copy of `items`. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const rng = createRng(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * True when every Version of the Worksheet would print identically: the
 * Scramble Mode only scrambles choices but the Worksheet is free response.
 * The UI uses this to explain why the Versions look the same.
 */
export function versionsAreIdentical(
  ws: Pick<Worksheet, "versions" | "responseFormat">,
): boolean {
  return (
    clampVersionCount(ws.versions.count) > 1 &&
    ws.versions.mode === "scramble-choices" &&
    ws.responseFormat.mode !== "multiple-choice"
  );
}
