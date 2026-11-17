// What the Add Section picker shows, worked out from the Topics, the search
// and the chosen Course and Unit, without any React. The picker renders this.

import { groupByUnit, LISTINGS, type Listing, type UnitListings } from "@/engine/courses";
import { plot } from "@/engine/plot";
import { resolveParams, type Generator, type Latex, type ParamValues } from "@/engine/types";
import { sectionLetter } from "@/engine/worksheet";

/** Listings matching every word of the query, by Topic title, Unit or Course. */
export function searchListings(query: string, listings: readonly Listing[] = LISTINGS): Listing[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return listings.filter((l) => {
    const haystack = `${l.topic.title} ${l.unit} ${l.course}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export interface TopicBrowse {
  /** Units of the Course with at least one matching Topic, with their match counts. */
  units: { name: string; count: number }[];
  /** Matches across the whole Course (the "All Units" count). */
  total: number;
  /** The Unit actually shown: the chosen one, or null (All Units) if it has no matches. */
  unit: string | null;
  /** The listings shown, grouped by Unit. */
  groups: UnitListings[];
  /** The listings shown in display order, for arrow-key movement. */
  flat: Listing[];
}

/**
 * Narrow the listings to one Course, then the search, then one Unit (null =
 * All Units). Unit counts follow the search, and Units with no matches are
 * left out. A chosen Unit that the search empties falls back to All Units, so
 * the list never goes blank while matches exist elsewhere in the Course.
 */
export function browseTopics({
  listings = LISTINGS,
  course,
  unit,
  query,
}: {
  listings?: readonly Listing[];
  course: string;
  unit: string | null;
  query: string;
}): TopicBrowse {
  const matches = searchListings(query, listings.filter((l) => l.course === course));
  const all = groupByUnit(matches);
  const units = all.map((u) => ({ name: u.name, count: u.listings.length }));
  const shown = unit !== null && all.some((u) => u.name === unit) ? unit : null;
  const groups = shown === null ? all : all.filter((u) => u.name === shown);
  return { units, total: matches.length, unit: shown, groups, flat: groups.flatMap((u) => u.listings) };
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
  /**
   * The first sample's student graph as an SVG string (e.g. the blank grid a
   * graphing Topic prints), or null when its Problems print without one.
   */
  graph: string | null;
  /** Labels of the Topic Options a teacher can set. */
  options: string[];
  directions: string;
}

/** Fixed seeds, so a Topic's sample Problems are the same every time. */
export const SAMPLE_SEEDS = [11, 23] as const;

const samples = new WeakMap<Generator, Map<string, TopicSample>>();

/**
 * A Topic's preview from the given starting Topic Options (a listing's, or the
 * Topic's own defaults), generated once and cached so arrowing through stays
 * instant.
 */
export function topicSample(g: Generator, options: ParamValues = {}): TopicSample {
  const params = resolveParams(g.schema, options);
  const key = JSON.stringify(params);
  let byOptions = samples.get(g);
  if (!byOptions) samples.set(g, (byOptions = new Map()));
  let s = byOptions.get(key);
  if (!s) {
    const generated = SAMPLE_SEEDS.map((seed) => g.generate(params, seed));
    const graph = generated[0].graph;
    s = {
      problems: generated.map((p) => p.prompt),
      graph: graph ? plot(graph) : null,
      options: g.schema.map((f) => f.label),
      directions: g.defaultDirections,
    };
    byOptions.set(key, s);
  }
  return s;
}
