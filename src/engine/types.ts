// The core generation contract. Everything downstream (display, MC, versions,
// answer keys, save/load, PDF) is a transformation of the `Problem` produced by
// a `Generator`. This file is the keystone the whole MVP hangs off of.

import type { GraphSpec } from "./plot";

export type Latex = string;

export type Kind = "generated" | "custom";

export type ParamValue = boolean | number | string;
export type ParamValues = Record<string, ParamValue>;

/**
 * A generator declares its options as a typed schema; a single generic UI
 * component renders the options panel from this declaration (no per-topic UI).
 */
export type ParamField =
  | { type: "boolean"; key: string; label: string; default: boolean }
  | {
      type: "int";
      key: string;
      label: string;
      min: number;
      max: number;
      default: number;
    }
  | {
      type: "enum";
      key: string;
      label: string;
      default: string;
      options: { value: string; label: string }[];
    };

export type ParamSchema = readonly ParamField[];

/**
 * A single generated problem. Carries both the BAKED content (prompt/answer —
 * reopens identically forever) and the RECIPE (generatorId/params/seed — lets it
 * be re-rolled). See the PRD "save both" decision.
 */
export interface Problem {
  kind: Kind;
  // recipe
  generatorId: string;
  params: ParamValues;
  seed: number;
  // baked
  prompt: Latex;
  /** Known by CONSTRUCTION, never solved by a CAS. */
  answer: Latex;
  /** Reserved for worked steps (post-MVP); unused in the MVP. */
  steps?: Latex[];
  /** Mistake-based wrong answers, supplied for the MC assembler (slice #4). */
  distractorHints: Latex[];
  /**
   * A graph printed with the prompt on the student copy (#9), e.g. a blank
   * coordinate grid to draw on. It must never give the Answer away.
   */
  graph?: GraphSpec;
  /**
   * The Answer drawn as a graph, printed on the Answer Key under the text
   * Answer. The in-context key draws it in place of `graph`, so it uses the
   * same window as `graph` whenever both are present.
   */
  answerGraph?: GraphSpec;
}

export interface Generator {
  id: string;
  /** Shown in the topic tree. */
  title: string;
  /** Default directions line, editable per worksheet (e.g. "Solve each…"). */
  defaultDirections: string;
  schema: ParamSchema;
  /** Pure + seed-deterministic: same (params, seed) => identical Problem. */
  generate(params: ParamValues, seed: number): Problem;
}

/** Merge caller-supplied params over the schema defaults, producing a full set. */
export function resolveParams(
  schema: ParamSchema,
  params: ParamValues,
): ParamValues {
  const out: ParamValues = {};
  for (const f of schema) {
    out[f.key] = f.key in params ? params[f.key] : f.default;
  }
  return out;
}
