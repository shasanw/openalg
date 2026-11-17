// The Course this browser last worked in, kept in localStorage.
//
// The Add Section picker and the home screen's Course tabs share this one key
// on purpose: both answer "which Course does this teacher teach?", so adding a
// Topic from Algebra 1 in the picker should also bring the home screen up on
// Algebra 1, and choosing the Algebra 2 tab at home should open the picker
// there (when the Worksheet's own Sections don't say otherwise). Keeping two
// keys would let them drift apart for no gain.
//
// Storage can be unavailable (private windows, blocked site data), so every
// read and write is guarded and failing just means nothing is remembered.

export const COURSE_KEY = "openalg-course";

/** The remembered Course, if any and if it is still one of `courses`. */
export function rememberedCourse(courses?: readonly string[]): string | null {
  let c: string | null = null;
  try {
    c = localStorage.getItem(COURSE_KEY);
  } catch {
    return null;
  }
  if (!c) return null;
  return !courses || courses.includes(c) ? c : null;
}

export function rememberCourse(course: string): void {
  try {
    localStorage.setItem(COURSE_KEY, course);
  } catch {
    // Storage unavailable: the Course just isn't remembered.
  }
}
