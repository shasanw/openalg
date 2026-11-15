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

/** Build a single-Section Worksheet (the only kind the UI creates today). */
export function buildWorksheet(opts: BuildOptions): Worksheet {
  const section = buildSection(opts);
  return {
    version: 2,
    title: opts.title ?? getGenerator(section.generatorId)!.title,
    sections: [section],
    print: opts.print ?? { ...DEFAULT_PRINT_CONFIG },
    responseFormat: opts.responseFormat ?? { ...DEFAULT_RESPONSE_FORMAT },
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

/**
 * Backfill defaults onto a worksheet loaded from disk. Files saved before
 * issue #7 have no `print` block, and files saved before #5 have no
 * `responseFormat`; give them the defaults (free response) so the rest of the
 * app can assume both are always present.
 */
export function normalizeWorksheet(ws: Worksheet): Worksheet {
  const response = { ...DEFAULT_RESPONSE_FORMAT, ...ws.responseFormat };
  return {
    ...ws,
    print: { ...DEFAULT_PRINT_CONFIG, ...ws.print },
    responseFormat: { ...response, choices: clampChoices(response.choices) },
  };
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
