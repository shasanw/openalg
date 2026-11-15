// What the Add Section picker shows, worked out from the Topics, the search
// and the chosen Course and Unit, without any React. The picker renders this.

import { GENERATORS, groupByUnit, type Unit } from "@/engine/registry";
import { resolveParams, type Generator, type Latex } from "@/engine/types";
import { sectionLetter } from "@/engine/worksheet";

/** Topics matching every word of the query, by Topic title or Unit name. */
export function searchTopics(query: string, topics: readonly Generator[] = GENERATORS): Generator[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return topics.filter((g) => {
    const haystack = `${g.title} ${g.unit}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** Search results grouped by Unit. */
export function filterTopics(query: string, topics: readonly Generator[] = GENERATORS): Unit[] {
  return groupByUnit(searchTopics(query, topics));
}

export interface TopicBrowse {
  /** Units of the Course with at least one matching Topic, with their match counts. */
  units: { name: string; count: number }[];
  /** Matches across the whole Course (the "All Units" count). */
  total: number;
  /** The Unit actually shown: the chosen one, or null (All Units) if it has no matches. */
  unit: string | null;
  /** The Topics listed, grouped by Unit. */
  groups: Unit[];
  /** The listed Topics in display order, for arrow-key movement. */
  flat: Generator[];
}

/**
 * Narrow the Topics to one Course, then the search, then one Unit (null = All
 * Units). Unit counts follow the search, and Units with no matches are left
 * out. A chosen Unit that the search empties falls back to All Units, so the
 * list never goes blank while matches exist elsewhere in the Course.
 */
export function browseTopics({
  topics = GENERATORS,
  course,
  unit,
  query,
}: {
  topics?: readonly Generator[];
  course: string;
  unit: string | null;
  query: string;
}): TopicBrowse {
  const matches = searchTopics(query, topics.filter((g) => g.course === course));
  const all = groupByUnit(matches);
  const units = all.map((u) => ({ name: u.name, count: u.generators.length }));
  const shown = unit !== null && all.some((u) => u.name === unit) ? unit : null;
  const groups = shown === null ? all : all.filter((u) => u.name === shown);
  return { units, total: matches.length, unit: shown, groups, flat: groups.flatMap((u) => u.generators) };
}

/** The letters of the Sections each Topic is used in, keyed by generatorId. */
export function sectionsByTopic(generatorIds: readonly string[]): Map<string, string[]> {
  const used = new Map<string, string[]>();
  generatorIds.forEach((id, i) => {
    const letters = used.get(id) ?? [];
    letters.push(sectionLetter(i));
    used.set(id, letters);
  });
  return used;
}

/** "Used in Section A", "Used in Sections B and C", "Used in Sections A, B and D". */
export function usedLabel(letters: readonly string[]): string {
  if (letters.length === 0) return "";
  if (letters.length === 1) return `Used in Section ${letters[0]}`;
  return `Used in Sections ${letters.slice(0, -1).join(", ")} and ${letters.at(-1)}`;
}

export interface TopicSample {
  /** Two sample Problem prompts from the default Topic Options. */
  problems: Latex[];
  /** Labels of the Topic Options a teacher can set. */
  options: string[];
  directions: string;
}

/** Fixed seeds, so a Topic's sample Problems are the same every time. */
export const SAMPLE_SEEDS = [11, 23] as const;

const samples = new WeakMap<Generator, TopicSample>();

/** A Topic's preview, generated once and cached so arrowing through stays instant. */
export function topicSample(g: Generator): TopicSample {
  let s = samples.get(g);
  if (!s) {
    const params = resolveParams(g.schema, {});
    s = {
      problems: SAMPLE_SEEDS.map((seed) => g.generate(params, seed).prompt),
      options: g.schema.map((f) => f.label),
      directions: g.defaultDirections,
    };
    samples.set(g, s);
  }
  return s;
}
