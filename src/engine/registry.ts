// The generator registry. Topics in the UI are driven by this list; adding a
// topic later = registering one generator here (no UI changes needed).

import type { Generator } from "./types";
import { generator as quadraticFactoring } from "./generators/quadraticFactoring";
import { generator as quadraticFormula } from "./generators/quadraticFormula";

export const GENERATORS: readonly Generator[] = [
  quadraticFactoring,
  quadraticFormula,
];

const byId: Record<string, Generator> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g]),
);

export function getGenerator(id: string): Generator | undefined {
  return byId[id];
}

export interface Chapter {
  name: string;
  generators: Generator[];
}

/**
 * Group the registered generators by chapter for the topic tree. Chapters and
 * the topics within them preserve registration order, so the tree is stable and
 * adding a generator never reshuffles the existing ones.
 */
export function groupByChapter(
  generators: readonly Generator[] = GENERATORS,
): Chapter[] {
  const chapters: Chapter[] = [];
  const byName = new Map<string, Chapter>();
  for (const g of generators) {
    let chapter = byName.get(g.chapter);
    if (!chapter) {
      chapter = { name: g.chapter, generators: [] };
      byName.set(g.chapter, chapter);
      chapters.push(chapter);
    }
    chapter.generators.push(g);
  }
  return chapters;
}
