import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { serializeWorksheet, deserializeWorksheet } from "./persist";
import {
  buildWorksheet,
  regenerateAll,
  DEFAULT_PRINT_CONFIG,
  type Worksheet,
} from "./worksheet";
import { QUADRATIC_FACTORING_ID } from "./generators/quadraticFactoring";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });

function sampleWorksheet(baseSeed = 42, count = 8): Worksheet {
  return buildWorksheet({
    generatorId: QUADRATIC_FACTORING_ID,
    baseSeed,
    count,
    title: "My Sheet",
    directions: "Solve each.",
  });
}

describe("serializeWorksheet / deserializeWorksheet", () => {
  it("round-trips: save then load yields an equivalent worksheet model", () => {
    fc.assert(
      fc.property(anySeed, (baseSeed) => {
        const ws = sampleWorksheet(baseSeed);
        const loaded = deserializeWorksheet(serializeWorksheet(ws));
        expect(loaded).toEqual(ws);
      }),
    );
  });

  it("reopens byte-identical: the loaded JSON matches the saved JSON", () => {
    const ws = sampleWorksheet();
    const json = serializeWorksheet(ws);
    // A second serialize of the loaded sheet reproduces the exact same bytes —
    // the baked content survives a save/load with no drift.
    expect(serializeWorksheet(deserializeWorksheet(json))).toBe(json);
  });

  it("the saved file contains both the baked problems and the recipe", () => {
    const ws = sampleWorksheet();
    const data = JSON.parse(serializeWorksheet(ws));

    // Recipe at the sheet level.
    expect(data.generatorId).toBe(QUADRATIC_FACTORING_ID);
    expect(typeof data.baseSeed).toBe("number");
    expect(data.count).toBe(ws.count);
    expect(data.params).toEqual(ws.params);

    // Each problem carries its own recipe AND its baked content.
    for (const p of data.problems) {
      expect(typeof p.generatorId).toBe("string"); // recipe
      expect(typeof p.seed).toBe("number"); // recipe
      expect(p.params).toBeTypeOf("object"); // recipe
      expect(typeof p.prompt).toBe("string"); // baked
      expect(typeof p.answer).toBe("string"); // baked
    }
  });

  it("regenerate-all on a loaded sheet keeps params but produces new problems", () => {
    const loaded = deserializeWorksheet(serializeWorksheet(sampleWorksheet(7)));
    const fresh = regenerateAll(loaded, loaded.baseSeed + 1);

    expect(fresh.generatorId).toBe(loaded.generatorId);
    expect(fresh.params).toEqual(loaded.params);
    expect(fresh.count).toBe(loaded.count);
    // Same recipe, new seeds -> a different set of baked prompts.
    expect(fresh.problems.map((p) => p.prompt)).not.toEqual(
      loaded.problems.map((p) => p.prompt),
    );
  });
});

describe("deserializeWorksheet validation", () => {
  it("rejects malformed JSON", () => {
    expect(() => deserializeWorksheet("{ not json")).toThrow(/valid JSON/);
  });

  it("rejects JSON that isn't a worksheet object", () => {
    expect(() => deserializeWorksheet("[]")).toThrow(/JSON object/);
    expect(() => deserializeWorksheet("42")).toThrow(/JSON object/);
  });

  it("rejects an unsupported version", () => {
    const ws = { ...sampleWorksheet(), version: 2 };
    expect(() => deserializeWorksheet(JSON.stringify(ws))).toThrow(/version/);
  });

  it("rejects a worksheet missing required fields", () => {
    const { generatorId: _omit, ...rest } = sampleWorksheet();
    expect(() => deserializeWorksheet(JSON.stringify(rest))).toThrow(
      /generatorId/,
    );
  });

  it("rejects a problem with baked content missing", () => {
    const ws = sampleWorksheet();
    const broken = {
      ...ws,
      problems: [{ ...ws.problems[0], prompt: undefined }, ...ws.problems.slice(1)],
    };
    expect(() => deserializeWorksheet(JSON.stringify(broken))).toThrow(/prompt/);
  });

  it("backfills the print config on a pre-#7 file with no print block", () => {
    const { print: _drop, ...legacy } = sampleWorksheet();
    const loaded = deserializeWorksheet(JSON.stringify(legacy));
    expect(loaded.print).toEqual(DEFAULT_PRINT_CONFIG);
  });
});
