// The shape of a Course Outline: a Course's Units in teaching order, and the
// Topics listed in each. A Topic can be listed in several Courses, each time
// with its own starting Topic Options (see GLOSSARY.md, "Course Outline").

import type { ParamValues } from "../types";

/** One Topic listed in a Unit, by generator id, with optional starting Topic Options. */
export interface OutlineEntry {
  topic: string;
  /** Starting Topic Options for this Course; the Topic's own defaults fill the rest. */
  options?: ParamValues;
}

export interface OutlineUnit {
  name: string;
  /** May be empty while a Unit's Topics are unbuilt; empty Units never show. */
  topics: readonly OutlineEntry[];
}

export interface CourseOutline {
  course: string;
  units: readonly OutlineUnit[];
}
