// What the Add Section picker shows, worked out from the listings, the search
// and the chosen Course and Unit, without any React. The picker renders this.
//
// With an empty search the picker browses one Course: its Units with Topics,
// and either all of them or one Unit. Typing searches every Course at once
// (fuzzy, via MiniSearch), grouped Course > Unit with the chosen Course first.
// It also decides which Course the picker opens on (initialCourse).

import MiniSearch from "minisearch";
import { coursesOf, groupByUnit, LISTINGS, listingFor, type Listing, type UnitListings } from "@/engine/courses";
import { plot } from "@/engine/plot";
import { resolveParams, type Generator, type Latex, type ParamValues } from "@/engine/types";
import { sectionLetter } from "@/engine/worksheet";

/**
 * A very light stemmer, applied to indexed and searched words alike, so
 * "factoring", "factor" and a typo like "factr" meet at "factor", and plurals
 * match singulars. Short words are left alone.
 */
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

interface SearchIndex {
  search: MiniSearch<{ key: string; title: string; unit: string; course: string }>;
  byKey: Map<string, Listing>;
  /** Outline position of each listing, to break score ties. */
  order: Map<string, number>;
}

const indexes = new WeakMap<readonly Listing[], SearchIndex>();

/** One document per listing, so a Topic in two Courses is found under each. */
function indexOf(listings: readonly Listing[]): SearchIndex {
  let ix = indexes.get(listings);
  if (!ix) {
    const search = new MiniSearch<{ key: string; title: string; unit: string; course: string }>({
      idField: "key",
      fields: ["title", "unit", "course"],
      processTerm: stem,
      searchOptions: {
        boost: { title: 3, unit: 2, course: 1 },
        prefix: true,
        fuzzy: 0.2,
        combineWith: "AND",
      },
    });
    search.addAll(listings.map((l) => ({ key: l.key, title: l.topic.title, unit: l.unit, course: l.course })));
    ix = {
      search,
      byKey: new Map(listings.map((l) => [l.key, l])),
      order: new Map(listings.map((l, i) => [l.key, i])),
    };
    indexes.set(listings, ix);
  }
  return ix;
}

/**
 * Listings matching every word of the query (by Topic title, Unit or Course;
 * prefix and typo tolerant), best match first, ties in outline order. An
 * empty query matches everything, in outline order.
 */
export function searchListings(query: string, listings: readonly Listing[] = LISTINGS): Listing[] {
  if (!query.trim()) return [...listings];
  const ix = indexOf(listings);
  return ix.search
    .search(query)
    .map((r) => ({ l: ix.byKey.get(r.id as string)!, score: r.score }))
    .sort((a, b) => b.score - a.score || ix.order.get(a.l.key)! - ix.order.get(b.l.key)!)
    .map((r) => r.l);
}

/** A Unit in the Units list; Units are only unique within their Course. */
export interface UnitRef {
  course: string;
  name: string;
}

export interface TopicBrowse {
  /**
   * "course" browses the chosen Course; "all" is a search across every
   * Course, which happens whenever the query is non-empty.
   */
  scope: "course" | "all";
  /** Units with at least one matching Topic, with their match counts, in display order. */
  units: (UnitRef & { count: number })[];
  /** Matches in scope (the "All Units" count). */
  total: number;
  /** The Unit actually shown: the chosen one, or null (All Units) if it has no matches. */
  unit: UnitRef | null;
  /** The listings shown, grouped by Course and Unit. */
  groups: UnitListings[];
  /** The listings shown in display order, for arrow-key movement. */
  flat: Listing[];
}

export const sameUnit = (a: UnitRef | null, b: UnitRef | null) =>
  a === b || (!!a && !!b && a.course === b.course && a.name === b.name);

/**
 * With an empty query: the chosen Course's listings in outline order, its
 * Units with Topics, and the chosen Unit (null = All Units).
 *
 * With a query: matches from every Course, grouped Course > Unit. The chosen
 * Course's groups come first, then the other Courses; within each, Units and
 * Topics follow the best match score. The Units list then holds every Unit
 * with matches, in that same order, each tagged with its Course.
 *
 * Unit counts follow the search and Units with no matches are left out. A
 * chosen Unit that the search empties falls back to All Units, so the list
 * never goes blank while matches exist elsewhere.
 */
export function browseTopics({
  listings = LISTINGS,
  course,
  unit,
  query,
}: {
  listings?: readonly Listing[];
  course: string;
  unit: UnitRef | null;
  query: string;
}): TopicBrowse {
  const scope = query.trim() ? "all" : "course";
  let all: UnitListings[];
  if (scope === "course") {
    all = groupByUnit(listings.filter((l) => l.course === course));
  } else {
    const matches = searchListings(query, listings);
    const courses = [course, ...coursesOf(matches).filter((c) => c !== course)];
    all = courses.flatMap((c) => groupByUnit(matches.filter((l) => l.course === c)));
  }
  const units = all.map((u) => ({ course: u.course, name: u.name, count: u.listings.length }));
  const total = units.reduce((n, u) => n + u.count, 0);
  const shown = unit && all.some((u) => sameUnit(u, unit)) ? { course: unit.course, name: unit.name } : null;
  const groups = shown === null ? all : all.filter((u) => sameUnit(u, shown));
  return { scope, units, total, unit: shown, groups, flat: groups.flatMap((u) => u.listings) };
}

/**
 * The Course the picker opens on: the Course of the Worksheet's last Section
 * (its remembered-Course listing if that Course lists the Topic, else the
 * Topic's first listing), else the remembered Course, else the first Course.
 */
export function initialCourse({
  sections,
  remembered,
  listings = LISTINGS,
}: {
  /** The generatorId of each Section, in outline order. */
  sections: readonly string[];
  remembered: string | null;
  listings?: readonly Listing[];
}): string {
  const courses = coursesOf(listings);
  const last = sections.at(-1);
  const fromSection = last ? listingFor(last, remembered, listings)?.course : undefined;
  if (fromSection) return fromSection;
  if (remembered && courses.includes(remembered)) return remembered;
  return courses[0] ?? "";
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
