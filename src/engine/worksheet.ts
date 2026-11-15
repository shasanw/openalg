// Worksheet model: a titled, ordered list of Sections plus Print Settings.
// Each Section is one Topic (generatorId) with its Topic Options (params), its
// own Directions and its Problems. A Section's Recipe is
// (generatorId, params, baseSeed, count): each Problem gets a seed derived from
// the Section's baseSeed, so the Section is reproducible, while the baked
// Problems are also stored for byte-identical reopen.

import { clampChoices, DEFAULT_CHOICES } from "./mc";
import { deriveSeed } from "./rng";
import { getGenerator } from "./registry";
import type { ParamValues, Problem } from "./types";

/**
 * Print/layout configuration (issue #7). Owned by the worksheet so it persists
 * across save/load and so the live preview and the exported PDF read from the
 * exact same settings — the preview is print-truth. The Typst layout
 * (buildTypstDocument) is the single consumer.
 */
export interface PrintConfig {
  paper: "us-letter" | "a4" | "legal";
  orientation: "portrait" | "landscape";
  /** Page margin preset; mapped to inches by the Typst layout. */
  margin: "narrow" | "normal" | "wide";
  /** Body text size preset; mapped to points by the Typst layout. */
  fontSize: "small" | "normal" | "large";
  /** Print a page number in the footer. */
  pageNumbers: boolean;
  /** Vertical work space under each free-response problem. */
  spacing: "tight" | "normal" | "roomy";
  /** Render the Name / Date / Period blanks in the header. */
  showNameDatePeriod: boolean;
}

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  paper: "us-letter",
  orientation: "portrait",
  margin: "normal",
  fontSize: "normal",
  pageNumbers: true,
  spacing: "normal",
  showNameDatePeriod: true,
};

/**
 * How every Problem on the Worksheet is answered (issue #5): free response, or
 * multiple choice with `choices` options each (2 to 5). This is a whole-sheet
 * setting, so it lives on the Worksheet rather than on each Section. `choices`
 * is kept while the sheet is free response, so toggling back to multiple
 * choice restores the teacher's count.
 */
export interface ResponseFormat {
  mode: "free-response" | "multiple-choice";
  choices: number;
}

export const DEFAULT_RESPONSE_FORMAT: ResponseFormat = {
  mode: "free-response",
  choices: DEFAULT_CHOICES,
};

/**
 * Which Answer Key the Worksheet prints after its Problems:
 * - "full": every Answer, numbered to match the Problems;
 * - "odds": only odd-numbered Problems (numbering runs across Sections);
 * - "in-context": a second copy of the Worksheet with each Answer printed
 *   under its Problem (for multiple choice, the correct letter circled);
 * - "none": no key pages at all.
 * A whole-Worksheet content choice (not a Print Setting), shared by every
 * Version so each Version's key is rendered in the same format.
 */
export type AnswerKeyFormat = "full" | "odds" | "in-context" | "none";

export const ANSWER_KEY_FORMATS: readonly AnswerKeyFormat[] = [
  "full",
  "odds",
  "in-context",
  "none",
];

export const DEFAULT_ANSWER_KEY_FORMAT: AnswerKeyFormat = "full";

export function isAnswerKeyFormat(v: unknown): v is AnswerKeyFormat {
  return (ANSWER_KEY_FORMATS as readonly unknown[]).includes(v);
}

/**
 * How a Worksheet's Versions differ from one another (its Scramble Mode):
 * - "scramble-choices": same Problems in the same order; only the order of
 *   each multiple-choice Problem's choices changes (so in free response every
 *   Version prints identically);
 * - "scramble-order": same Problems, shuffled within each Section (Sections
 *   and their Directions stay put);
 * - "new-questions": each Section regenerated from its Recipe with a new seed.
 */
export type ScrambleMode = "scramble-choices" | "scramble-order" | "new-questions";

export const SCRAMBLE_MODES: readonly ScrambleMode[] = [
  "scramble-choices",
  "scramble-order",
  "new-questions",
];

export const MIN_VERSIONS = 1;
export const MAX_VERSIONS = 10;

/**
 * How many Versions the Worksheet prints and how they differ. Versions are
 * always derived from the Worksheet (see ./versions), never stored as content:
 * this setting is all that is saved.
 */
export interface VersionSettings {
  /** 1 to 10. One Version is the Worksheet itself, unlabelled. */
  count: number;
  mode: ScrambleMode;
}

export const DEFAULT_VERSION_SETTINGS: VersionSettings = {
  count: 1,
  mode: "scramble-order",
};

export function isScrambleMode(v: unknown): v is ScrambleMode {
  return (SCRAMBLE_MODES as readonly unknown[]).includes(v);
}

/** Clamp a requested Version count into the supported 1 to 10 range. */
export function clampVersionCount(n: number): number {
  if (!Number.isFinite(n)) return MIN_VERSIONS;
  return Math.min(MAX_VERSIONS, Math.max(MIN_VERSIONS, Math.round(n)));
}

/** True when the Worksheet prints lettered choices under each Problem. */
export function isMultipleChoice(ws: Worksheet): boolean {
  return ws.responseFormat.mode === "multiple-choice";
}

/**
 * A run of consecutive Problems from one Topic sharing one set of Directions.
 * `baseSeed` and `count` complete the Section's Recipe; `count` is kept equal to
 * `problems.length` once the Section has been curated.
 */
export interface Section {
  generatorId: string;
  params: ParamValues;
  directions: string;
  baseSeed: number;
  count: number;
  problems: Problem[];
}

export interface Worksheet {
  version: 2;
  title: string;
  /** Ordered Sections; Problem numbering runs continuously across them. */
  sections: Section[];
  /** Print Settings. Optional in older saved files; see normalizeWorksheet. */
  print: PrintConfig;
  /**
   * Free response or multiple choice. Optional in files saved before #5; see
   * normalizeWorksheet.
   */
  responseFormat: ResponseFormat;
  /**
   * The Answer Key format. Optional in files saved before #6; see
   * normalizeWorksheet (defaults to "full", the only key older files printed).
   */
  answerKeyFormat: AnswerKeyFormat;
  /**
   * Version count and Scramble Mode. Optional in files saved before #11; see
   * normalizeWorksheet (defaults to one Version).
   */
  versions: VersionSettings;
}

export interface SectionOptions {
  generatorId: string;
  params?: ParamValues;
  baseSeed: number;
  count: number;
  directions?: string;
}

export interface BuildOptions extends SectionOptions {
  title?: string;
  print?: PrintConfig;
  responseFormat?: ResponseFormat;
  answerKeyFormat?: AnswerKeyFormat;
  versions?: VersionSettings;
}

/** Build one Section from its Recipe. */
export function buildSection(opts: SectionOptions): Section {
  const generator = getGenerator(opts.generatorId);
  if (!generator) {
    throw new Error(`Unknown generator: ${opts.generatorId}`);
  }
  const params = opts.params ?? {};

  // Reject-and-resample so a Section never shows the same question twice: draw
  // seeds deterministically from the base seed and skip any problem whose prompt
  // duplicates one already placed. The draw budget is bounded, so when the
  // requested count approaches the Topic's finite problem space we still
  // terminate instead of spinning forever hunting for a uniqueness that can't
  // exist.
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const maxDraws = opts.count * 64;
  let draw = 0;
  while (problems.length < opts.count && draw < maxDraws) {
    const problem = generator.generate(params, deriveSeed(opts.baseSeed, draw));
    draw++;
    if (seen.has(problem.prompt)) continue;
    seen.add(problem.prompt);
    problems.push(problem);
  }
  // If the option-space was too small to fill uniquely, top up with repeats so
  // the teacher still gets the count they asked for (degrades gracefully).
  while (problems.length < opts.count) {
    problems.push(generator.generate(params, deriveSeed(opts.baseSeed, draw++)));
  }

  return {
    generatorId: generator.id,
    params,
    directions: opts.directions ?? generator.defaultDirections,
    baseSeed: opts.baseSeed,
    count: opts.count,
    problems,
  };
}

/** Build a single-Section Worksheet (a Topic template on the home screen). */
export function buildWorksheet(opts: BuildOptions): Worksheet {
  const section = buildSection(opts);
  return {
    version: 2,
    title: opts.title ?? getGenerator(section.generatorId)!.title,
    sections: [section],
    print: opts.print ?? { ...DEFAULT_PRINT_CONFIG },
    responseFormat: opts.responseFormat ?? { ...DEFAULT_RESPONSE_FORMAT },
    answerKeyFormat: opts.answerKeyFormat ?? DEFAULT_ANSWER_KEY_FORMAT,
    versions: opts.versions ?? { ...DEFAULT_VERSION_SETTINGS },
  };
}

/** Every Problem on the Worksheet, in printed order across Sections. */
export function allProblems(ws: Worksheet): Problem[] {
  return ws.sections.flatMap((s) => s.problems);
}

/** Total Problems across all Sections. */
export function problemCount(ws: Worksheet): number {
  return ws.sections.reduce((n, s) => n + s.problems.length, 0);
}

/** Replace the Section at `sectionIndex`; out-of-range indices are a no-op. */
function withSection(
  ws: Worksheet,
  sectionIndex: number,
  update: (section: Section) => Section,
): Worksheet {
  const target = ws.sections[sectionIndex];
  if (!target) return ws;
  const next = update(target);
  if (next === target) return ws;
  const sections = ws.sections.slice();
  sections[sectionIndex] = next;
  return { ...ws, sections };
}

/** Same Recipe, a new base seed -> a fresh set of Problems for one Section. */
function regenerateSectionFrom(section: Section, newBaseSeed: number): Section {
  return buildSection({
    generatorId: section.generatorId,
    params: section.params,
    baseSeed: newBaseSeed,
    count: section.count,
    directions: section.directions,
  });
}

/** Regenerate one Section, leaving every other Section untouched. */
export function regenerateSection(
  ws: Worksheet,
  sectionIndex: number,
  newBaseSeed: number,
): Worksheet {
  return withSection(ws, sectionIndex, (s) =>
    regenerateSectionFrom(s, newBaseSeed),
  );
}

/**
 * Regenerate: replace every Problem with a fresh set from the same Recipe. Each
 * Section gets its own base seed derived from `newBaseSeed`, except that a
 * single-Section Worksheet uses `newBaseSeed` directly.
 */
export function regenerateAll(ws: Worksheet, newBaseSeed: number): Worksheet {
  const sections = ws.sections.map((s, i) =>
    regenerateSectionFrom(
      s,
      ws.sections.length === 1 ? newBaseSeed : deriveSeed(newBaseSeed, i),
    ),
  );
  return { ...ws, sections };
}

/** Set one Section's Directions. Out-of-range indices are a no-op. */
export function setSectionDirections(
  ws: Worksheet,
  sectionIndex: number,
  directions: string,
): Worksheet {
  return withSection(ws, sectionIndex, (s) => ({ ...s, directions }));
}

// --- Section editing ---------------------------------------------------------
//
// The editor builds multi-Section Worksheets (a test is just a Worksheet with
// several Sections). Every helper returns a new Worksheet and treats an
// out-of-range index as a no-op, so the UI can call them without bounds checks.

/** Fewest and most Problems a teacher can ask a Section for. */
export const MIN_SECTION_PROBLEMS = 1;
export const MAX_SECTION_PROBLEMS = 50;

/** Problems a newly added Section starts with. */
export const DEFAULT_SECTION_PROBLEMS = 10;

/** Clamp a requested Problem count to the Section limits (whole numbers only). */
export function clampSectionCount(count: number): number {
  if (!Number.isFinite(count)) return MIN_SECTION_PROBLEMS;
  return Math.min(MAX_SECTION_PROBLEMS, Math.max(MIN_SECTION_PROBLEMS, Math.round(count)));
}

export interface EmptyWorksheetOptions {
  title?: string;
  print?: PrintConfig;
  responseFormat?: ResponseFormat;
  answerKeyFormat?: AnswerKeyFormat;
  versions?: VersionSettings;
}

/** A Worksheet with no Sections yet: what "New Worksheet" starts from. */
export function emptyWorksheet(opts: EmptyWorksheetOptions = {}): Worksheet {
  return {
    version: 2,
    title: opts.title ?? "Untitled worksheet",
    sections: [],
    print: opts.print ?? { ...DEFAULT_PRINT_CONFIG },
    responseFormat: opts.responseFormat ?? { ...DEFAULT_RESPONSE_FORMAT },
    answerKeyFormat: opts.answerKeyFormat ?? DEFAULT_ANSWER_KEY_FORMAT,
    versions: opts.versions ?? { ...DEFAULT_VERSION_SETTINGS },
  };
}

/**
 * Insert a Section at `at` (default: the end). `at` is clamped into range, so
 * any index is safe.
 */
export function addSection(ws: Worksheet, section: Section, at?: number): Worksheet {
  const index = at === undefined ? ws.sections.length : Math.max(0, Math.min(ws.sections.length, at));
  const sections = ws.sections.slice();
  sections.splice(index, 0, section);
  return { ...ws, sections };
}

/** Remove the Section at `index`. */
export function removeSection(ws: Worksheet, index: number): Worksheet {
  if (!ws.sections[index]) return ws;
  return { ...ws, sections: ws.sections.filter((_, i) => i !== index) };
}

/**
 * Move the Section at `from` to the slot at `to`, shifting the rest to fill the
 * gap. Out-of-range indices, or `from === to`, leave the Worksheet unchanged.
 */
export function moveSection(ws: Worksheet, from: number, to: number): Worksheet {
  const n = ws.sections.length;
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return ws;
  const sections = ws.sections.slice();
  const [moved] = sections.splice(from, 1);
  sections.splice(to, 0, moved);
  return { ...ws, sections };
}

/**
 * Duplicate the Section at `index`, inserting the copy right after it. The copy
 * keeps the Topic, Topic Options, Problem count and Directions but gets fresh
 * Problems from `newBaseSeed`, since two identical runs of Problems are rarely
 * what a teacher wants.
 */
export function duplicateSection(ws: Worksheet, index: number, newBaseSeed: number): Worksheet {
  const source = ws.sections[index];
  if (!source) return ws;
  return addSection(ws, regenerateSectionFrom(source, newBaseSeed), index + 1);
}

/**
 * Change a Section's Topic Options. The Section is rebuilt from its Recipe with
 * the new options (same base seed and count), keeping its Directions.
 */
export function setSectionParams(ws: Worksheet, index: number, params: ParamValues): Worksheet {
  return withSection(ws, index, (s) =>
    buildSection({
      generatorId: s.generatorId,
      params,
      baseSeed: s.baseSeed,
      count: s.count,
      directions: s.directions,
    }),
  );
}

/**
 * Change how many Problems a Section has, clamped to the Section limits. The
 * Section is rebuilt from its Recipe with the same base seed, so an
 * un-curated Section keeps its first Problems and only gains or loses some at
 * the end.
 */
export function setSectionCount(ws: Worksheet, index: number, count: number): Worksheet {
  const next = clampSectionCount(count);
  return withSection(ws, index, (s) =>
    next === s.count && s.problems.length === next
      ? s
      : buildSection({
          generatorId: s.generatorId,
          params: s.params,
          baseSeed: s.baseSeed,
          count: next,
          directions: s.directions,
        }),
  );
}

/** The printed Problem numbers a Section covers, first and last (1-based). */
export interface ProblemRange {
  first: number;
  last: number;
}

/**
 * Each Section's printed Problem range. Numbering runs continuously across
 * Sections, so ranges always join up; an empty Section has `last < first`.
 */
export function sectionRanges(ws: Worksheet): ProblemRange[] {
  let n = 0;
  return ws.sections.map((s) => {
    const first = n + 1;
    n += s.problems.length;
    return { first, last: n };
  });
}

/** The letter a Section is labelled with in the editor: A, B, ..., Z, AA, AB... */
export function sectionLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Backfill defaults onto a worksheet loaded from disk. Files saved before
 * issue #7 have no `print` block, files saved before #5 have no
 * `responseFormat`, files saved before #6 have no `answerKeyFormat`, and files
 * saved before #11 have no `versions`; give them the defaults (free response,
 * full key, one Version) so the rest of the app can assume all four are always
 * present.
 */
export function normalizeWorksheet(ws: Worksheet): Worksheet {
  const response = { ...DEFAULT_RESPONSE_FORMAT, ...ws.responseFormat };
  return {
    ...ws,
    print: { ...DEFAULT_PRINT_CONFIG, ...ws.print },
    responseFormat: { ...response, choices: clampChoices(response.choices) },
    answerKeyFormat: isAnswerKeyFormat(ws.answerKeyFormat)
      ? ws.answerKeyFormat
      : DEFAULT_ANSWER_KEY_FORMAT,
    versions: normalizeVersionSettings(ws.versions),
  };
}

function normalizeVersionSettings(v: Partial<VersionSettings> | undefined): VersionSettings {
  return {
    count: clampVersionCount(v?.count ?? DEFAULT_VERSION_SETTINGS.count),
    mode: isScrambleMode(v?.mode) ? v.mode : DEFAULT_VERSION_SETTINGS.mode,
  };
}

/** Set the Version count (clamped to 1 to 10) and Scramble Mode. */
export function setVersionSettings(ws: Worksheet, versions: VersionSettings): Worksheet {
  return { ...ws, versions: normalizeVersionSettings(versions) };
}

/** Set the whole-sheet Response Format, clamping the choice count to 2 to 5. */
export function setResponseFormat(
  ws: Worksheet,
  responseFormat: ResponseFormat,
): Worksheet {
  return {
    ...ws,
    responseFormat: {
      mode: responseFormat.mode,
      choices: clampChoices(responseFormat.choices),
    },
  };
}

// --- Per-problem curation (issue #4) -----------------------------------------
//
// Curation works within one Section, on its `problems[]` array, which is the
// source of truth once a Section has been hand-edited. Each Problem
// self-carries its Recipe (generatorId, params, seed), so a single Problem can be
// re-rolled from its own Recipe without touching the rest of the Worksheet,
// staying answer-from-construction. A Section's `count` is kept equal to
// `problems.length` so its Recipe always stays consistent with what's displayed.

function withProblems(section: Section, problems: Problem[]): Section {
  return { ...section, problems, count: problems.length };
}

/**
 * Re-roll a single Problem: regenerate it from its OWN Recipe with a new seed,
 * leaving every other Problem byte-identical. Out-of-range indices are a no-op.
 */
export function rerollProblem(
  ws: Worksheet,
  sectionIndex: number,
  index: number,
  newSeed: number,
): Worksheet {
  return withSection(ws, sectionIndex, (section) => {
    const target = section.problems[index];
    if (!target) return section;
    const generator = getGenerator(target.generatorId);
    if (!generator) {
      throw new Error(`Unknown generator: ${target.generatorId}`);
    }
    const problems = section.problems.slice();
    problems[index] = generator.generate(target.params, newSeed);
    return withProblems(section, problems);
  });
}

/** Remove a single Problem from a Section. Out-of-range indices are a no-op. */
export function removeProblem(
  ws: Worksheet,
  sectionIndex: number,
  index: number,
): Worksheet {
  return withSection(ws, sectionIndex, (section) => {
    if (index < 0 || index >= section.problems.length) return section;
    const problems = section.problems.slice();
    problems.splice(index, 1);
    return withProblems(section, problems);
  });
}

/**
 * Within one Section, move the Problem at `from` to the slot at `to`, shifting
 * the rest to fill the gap (drag-and-drop reorder semantics). Out-of-range
 * indices, or a no-op move (from === to), return the Worksheet unchanged.
 */
export function reorderProblem(
  ws: Worksheet,
  sectionIndex: number,
  from: number,
  to: number,
): Worksheet {
  return withSection(ws, sectionIndex, (section) => {
    const n = section.problems.length;
    if (from === to || from < 0 || from >= n || to < 0 || to >= n) return section;
    const problems = section.problems.slice();
    const [moved] = problems.splice(from, 1);
    problems.splice(to, 0, moved);
    return withProblems(section, problems);
  });
}
