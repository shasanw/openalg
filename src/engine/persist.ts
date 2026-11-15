// Serialization for worksheet persistence (issue #3). The engine owns the
// on-disk format so every platform adapter (the web build today, any other later)
// reads and writes byte-identical files through one tested path — the adapters
// only move bytes, never parse them.
//
// A saved file holds BOTH the baked problems (prompt/answer, so a reopen renders
// identically forever, regardless of later engine changes) AND the Recipe
// (generatorId/params/seed per problem, plus each Section's baseSeed/count, so it
// can be regenerated with fresh seeds). See the PRD "save both" decision.
//
// Format versions:
// - 1: one Topic per Worksheet, with generatorId/params/directions/baseSeed/
//   count/problems at the top level (desktop-era files). Read only: upgraded on
//   load to a single-Section version 2 Worksheet.
// - 2: `sections[]`, each with its own Topic, Topic Options, Directions and
//   Problems. The only version we write. Later additions are optional fields
//   backfilled by normalizeWorksheet, so they need no version bump:
//   `responseFormat` (#5, free response vs multiple choice) and
//   `answerKeyFormat` (#6, full / odds / in-context / none; absent means full)
//   and `versions` (#11, Version count and Scramble Mode; absent means one
//   Version). Versions themselves are never saved: they are derived on load.
//   Problems may carry `graph` and `answerGraph` (#9, GraphSpec data drawn by
//   plot()); files without them load unchanged, and an older app reading a
//   newer file still prints its text, so they need no version bump either.

import {
  ANSWER_KEY_FORMATS,
  isAnswerKeyFormat,
  isScrambleMode,
  normalizeWorksheet,
  SCRAMBLE_MODES,
  type Section,
  type Worksheet,
} from "./worksheet";
import type { Problem } from "./types";
import { graphSpecProblem } from "./plot";

/** The only format version we write. */
const CURRENT_VERSION = 2;

/**
 * Serialize a worksheet to the JSON we write to disk. Pretty-printed so saved
 * files stay human-readable and diffable in version control.
 */
export function serializeWorksheet(ws: Worksheet): string {
  return JSON.stringify(ws, null, 2);
}

/**
 * Parse and validate JSON read back from disk into a Worksheet. Throws a
 * descriptive Error if the text isn't a worksheet file we understand, so a
 * mistakenly-picked file fails loudly instead of corrupting the workspace. The
 * result is run through `normalizeWorksheet`, so older files (e.g. pre-#7, no
 * print block) come back fully populated.
 */
export function deserializeWorksheet(json: string): Worksheet {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Not a valid worksheet file: the file is not valid JSON.");
  }
  return normalizeWorksheet(validateWorksheet(data));
}

function fail(detail: string): never {
  throw new Error(`Not a valid worksheet file: ${detail}.`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isParams(v: unknown): v is Record<string, boolean | number | string> {
  if (!isObject(v)) return false;
  return Object.values(v).every(
    (x) =>
      typeof x === "boolean" || typeof x === "number" || typeof x === "string",
  );
}

/**
 * Structural validation of a parsed object, upgrading version 1 files to the
 * current shape. We check the Recipe and baked fields the rest of the app
 * depends on; `print` is intentionally NOT required here because
 * `normalizeWorksheet` backfills it for older files.
 */
function validateWorksheet(data: unknown): Worksheet {
  if (!isObject(data)) fail("expected a JSON object");
  if (data.version === 1) return upgradeV1(data);
  if (data.version !== CURRENT_VERSION) {
    fail(
      `unsupported version ${JSON.stringify(data.version)} (expected 1 or ${CURRENT_VERSION})`,
    );
  }
  if (typeof data.title !== "string") fail("missing title");
  // An empty list is valid: a new Worksheet has no Sections until the teacher
  // adds one, and the Library autosaves it in that state too.
  if (!Array.isArray(data.sections)) {
    fail("missing sections");
  }
  data.sections.forEach((s, i) => validateSection(s, `section ${i}`));
  if (data.responseFormat !== undefined) validateResponseFormat(data.responseFormat);
  if (data.answerKeyFormat !== undefined && !isAnswerKeyFormat(data.answerKeyFormat)) {
    fail(
      `answerKeyFormat must be one of ${ANSWER_KEY_FORMATS.join(", ")}`,
    );
  }

  if (data.versions !== undefined) validateVersions(data.versions);

  // Cast is sound now that every consumed field is checked; print is backfilled
  // downstream by normalizeWorksheet.
  return data as unknown as Worksheet;
}

/**
 * A version 1 file is one Topic: its Recipe fields sit at the top level. Lift
 * them into a single Section so it prints exactly as it did before.
 */
function upgradeV1(data: Record<string, unknown>): Worksheet {
  if (typeof data.title !== "string") fail("missing title");
  validateSection(data, "worksheet");
  const section: Section = {
    generatorId: data.generatorId,
    params: data.params,
    directions: data.directions,
    baseSeed: data.baseSeed,
    count: data.count,
    problems: data.problems,
  };
  return {
    version: CURRENT_VERSION,
    title: data.title,
    sections: [section],
    print: data.print,
  } as Worksheet;
}

/**
 * `responseFormat` (#5) is optional: files saved before it load as free
 * response via normalizeWorksheet. When present it must be well formed; an
 * out-of-range choice count is clamped rather than rejected.
 */
function validateResponseFormat(r: unknown): void {
  if (!isObject(r)) fail("responseFormat is not an object");
  if (r.mode !== "free-response" && r.mode !== "multiple-choice") {
    fail("responseFormat has an invalid mode");
  }
  if (typeof r.choices !== "number") fail("responseFormat missing choices");
}

/**
 * `versions` (#11) is optional: files saved before it load as one Version via
 * normalizeWorksheet. When present it must be well formed; an out-of-range
 * count is clamped rather than rejected.
 */
function validateVersions(v: unknown): void {
  if (!isObject(v)) fail("versions is not an object");
  if (typeof v.count !== "number") fail("versions missing count");
  if (!isScrambleMode(v.mode)) {
    fail(`versions mode must be one of ${SCRAMBLE_MODES.join(", ")}`);
  }
}

function validateSection(
  s: unknown,
  where: string,
): asserts s is Record<string, unknown> & Section {
  if (!isObject(s)) fail(`${where} is not an object`);
  if (typeof s.generatorId !== "string" || s.generatorId === "") {
    fail(`${where} missing generatorId`);
  }
  if (typeof s.directions !== "string") fail(`${where} missing directions`);
  if (typeof s.baseSeed !== "number") fail(`${where} missing baseSeed`);
  if (typeof s.count !== "number") fail(`${where} missing count`);
  if (!isParams(s.params)) fail(`${where} has invalid params`);
  if (!Array.isArray(s.problems)) fail(`${where} missing problems array`);
  s.problems.forEach((p, i) => validateProblem(p, i));
}

function validateProblem(p: unknown, index: number): asserts p is Problem {
  if (!isObject(p)) fail(`problem ${index} is not an object`);
  if (p.kind !== "generated" && p.kind !== "custom") {
    fail(`problem ${index} has an invalid kind`);
  }
  if (typeof p.generatorId !== "string") fail(`problem ${index} missing generatorId`);
  if (typeof p.seed !== "number") fail(`problem ${index} missing seed`);
  if (!isParams(p.params)) fail(`problem ${index} has invalid params`);
  if (typeof p.prompt !== "string") fail(`problem ${index} missing prompt`);
  if (typeof p.answer !== "string") fail(`problem ${index} missing answer`);
  if (!Array.isArray(p.distractorHints)) {
    fail(`problem ${index} missing distractorHints`);
  }
  for (const key of ["graph", "answerGraph"] as const) {
    if (p[key] === undefined) continue;
    const problem = graphSpecProblem(p[key]);
    if (problem) fail(`problem ${index} ${key} ${problem}`);
  }
}
