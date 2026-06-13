// Serialization for worksheet persistence (issue #3). The engine owns the
// on-disk format so every platform adapter (Tauri today, a web build later)
// reads and writes byte-identical files through one tested path — the adapters
// only move bytes, never parse them.
//
// A saved file holds BOTH the baked problems (prompt/answer, so a reopen renders
// identically forever, regardless of later engine changes) AND the recipe
// (generatorId/params/seed per problem, plus the sheet's baseSeed/count, so it
// can be regenerated with fresh seeds). See the PRD "save both" decision.

import { normalizeWorksheet, type Worksheet } from "./worksheet";
import type { Problem } from "./types";

/** The only format version we write; load rejects anything else. */
const CURRENT_VERSION = 1;

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
 * Structural validation of a parsed object. We check the recipe and baked fields
 * the rest of the app depends on; `print` is intentionally NOT required here
 * because `normalizeWorksheet` backfills it for older files.
 */
function validateWorksheet(data: unknown): Worksheet {
  if (!isObject(data)) fail("expected a JSON object");

  if (data.version !== CURRENT_VERSION) {
    fail(
      `unsupported version ${JSON.stringify(data.version)} (expected ${CURRENT_VERSION})`,
    );
  }
  if (typeof data.generatorId !== "string" || data.generatorId === "") {
    fail("missing generatorId");
  }
  if (typeof data.title !== "string") fail("missing title");
  if (typeof data.directions !== "string") fail("missing directions");
  if (typeof data.baseSeed !== "number") fail("missing baseSeed");
  if (typeof data.count !== "number") fail("missing count");
  if (!isParams(data.params)) fail("invalid params");
  if (!Array.isArray(data.problems)) fail("missing problems array");

  data.problems.forEach((p, i) => validateProblem(p, i));

  // Cast is sound now that every consumed field is checked; print is backfilled
  // downstream by normalizeWorksheet.
  return data as unknown as Worksheet;
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
}
