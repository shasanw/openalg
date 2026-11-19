// Every Course Outline, in curriculum order, and the listings they produce.
// Adding a Topic = register its generator in ../registry.ts, then list it here
// in each Course that teaches it.

import { getGenerator } from "../registry";
import { resolveParams, type Generator, type ParamValues } from "../types";
import { algebra1 } from "./algebra1";
import { algebra2 } from "./algebra2";
import { precalculus } from "./precalculus";
import type { CourseOutline } from "./types";

export type { CourseOutline, OutlineEntry, OutlineUnit } from "./types";

/** Curriculum order. A Course with no listed Topics never shows. */
export const COURSE_OUTLINES: readonly CourseOutline[] = [algebra1, algebra2, precalculus];

/** A Topic as listed in one Course and Unit. */
export interface Listing {
  /** Unique across all listings: `${course}/${topic.id}`. */
  key: string;
  course: string;
  unit: string;
  topic: Generator;
  /** The full Topic Options a Section starts with when added from this listing. */
  options: ParamValues;
}

export interface UnitListings {
  course: string;
  name: string;
  listings: Listing[];
}

export function listingsOf(outlines: readonly CourseOutline[]): Listing[] {
  const out: Listing[] = [];
  for (const o of outlines) {
    for (const u of o.units) {
      for (const e of u.topics) {
        const topic = getGenerator(e.topic);
        if (!topic) throw new Error(`${o.course} lists unknown Topic "${e.topic}"`);
        out.push({
          key: `${o.course}/${topic.id}`,
          course: o.course,
          unit: u.name,
          topic,
          options: resolveParams(topic.schema, e.options ?? {}),
        });
      }
    }
  }
  return out;
}

/** Every listing, in curriculum order then outline order. */
export const LISTINGS: readonly Listing[] = listingsOf(COURSE_OUTLINES);

/** Courses with at least one listing, in curriculum order. */
export function coursesOf(listings: readonly Listing[] = LISTINGS): string[] {
  return [...new Set(listings.map((l) => l.course))];
}

/**
 * Group listings by Course and Unit, keeping their order. Units with no
 * listings never appear, since they are built from the listings themselves.
 */
export function groupByUnit(listings: readonly Listing[]): UnitListings[] {
  const groups: UnitListings[] = [];
  const byKey = new Map<string, UnitListings>();
  for (const l of listings) {
    const k = `${l.course}/${l.unit}`;
    let g = byKey.get(k);
    if (!g) {
      g = { course: l.course, name: l.unit, listings: [] };
      byKey.set(k, g);
      groups.push(g);
    }
    g.listings.push(l);
  }
  return groups;
}

/**
 * Where a Topic is listed, preferring `course` when it is listed there, else
 * its first listing in curriculum order. Used to label a Section, which
 * records only its Topic.
 */
export function listingFor(
  topicId: string,
  course?: string | null,
  listings: readonly Listing[] = LISTINGS,
): Listing | undefined {
  return (
    (course ? listings.find((l) => l.topic.id === topicId && l.course === course) : undefined) ??
    listings.find((l) => l.topic.id === topicId)
  );
}
