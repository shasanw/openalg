// Which Start-new templates the home screen shows for a Course, without any
// React: the one-row pick (recently used Topics first) and the expanded view
// (every listing, under its Unit).

import { groupByUnit, type Listing, type UnitListings } from "@/engine/courses";
import type { LibraryEntry } from "@/platform/types";

/**
 * Topics the teacher used most recently, newest first, without repeats. A
 * Library entry records only its first Section's Topic, so that is what
 * counts as "used".
 */
export function recentTopics(recents: readonly LibraryEntry[]): string[] {
  const ids = [...recents]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((r) => r.generatorId)
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * The collapsed row for a Course: its listings of recently used Topics
 * (newest first), then the rest in Course Outline order, cut to `size`.
 */
export function rowTemplates(
  listings: readonly Listing[],
  course: string,
  recent: readonly string[],
  size: number,
): Listing[] {
  const inCourse = listings.filter((l) => l.course === course);
  const used = recent
    .map((id) => inCourse.find((l) => l.topic.id === id))
    .filter((l): l is Listing => l !== undefined);
  const rest = inCourse.filter((l) => !used.includes(l));
  return [...used, ...rest].slice(0, Math.max(0, size));
}

/** The expanded view: the Course's Units with listings, in Course Outline order. */
export function unitTemplates(listings: readonly Listing[], course: string): UnitListings[] {
  return groupByUnit(listings.filter((l) => l.course === course));
}
