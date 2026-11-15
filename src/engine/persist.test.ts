import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { serializeWorksheet, deserializeWorksheet } from "./persist";
import {
  buildSection,
  buildWorksheet,
  regenerateAll,
  DEFAULT_PRINT_CONFIG,
  type Worksheet,
} from "./worksheet";
import { buildTypstDocument } from "./typst";
import { QUADRATIC_FACTORING_ID } from "./generators/quadraticFactoring";
import { QUADRATIC_FORMULA_ID } from "./generators/quadraticFormula";

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

function twoSectionWorksheet(): Worksheet {
  const ws = sampleWorksheet(3, 4);
  const second = buildSection({
    generatorId: QUADRATIC_FORMULA_ID,
    params: { rootType: "irrational" },
    baseSeed: 9,
    count: 3,
    directions: "Use the quadratic formula.",
  });
  return { ...ws, sections: [...ws.sections, second] };
}

/**
 * The version 1 (desktop-era) file for `ws`, a single-Section Worksheet: its
 * Section's fields at the top level, in the key order v1 files were written.
 */
function asV1File(ws: Worksheet, opts: { print?: boolean } = {}): string {
  const [s] = ws.sections;
  const v1: Record<string, unknown> = {
    version: 1,
    title: ws.title,
    generatorId: s.generatorId,
    params: s.params,
    directions: s.directions,
    baseSeed: s.baseSeed,
    count: s.count,
    problems: s.problems,
  };
  if (opts.print !== false) v1.print = ws.print;
  return JSON.stringify(v1, null, 2);
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

  it("round-trips a multi-Section version 2 Worksheet byte-identically", () => {
    const ws = twoSectionWorksheet();
    const json = serializeWorksheet(ws);
    const loaded = deserializeWorksheet(json);
    expect(loaded).toEqual(ws);
    expect(serializeWorksheet(loaded)).toBe(json);
  });

  it("new Worksheets save as version 2 with exactly one Section", () => {
    const data = JSON.parse(serializeWorksheet(sampleWorksheet()));
    expect(data.version).toBe(2);
    expect(data.sections).toHaveLength(1);
    expect(data.generatorId).toBeUndefined();
    expect(data.problems).toBeUndefined();
  });

  it("the saved file contains both the baked problems and the recipe", () => {
    const ws = sampleWorksheet();
    const data = JSON.parse(serializeWorksheet(ws));
    const [section] = data.sections;

    // Recipe at the Section level.
    expect(section.generatorId).toBe(QUADRATIC_FACTORING_ID);
    expect(typeof section.baseSeed).toBe("number");
    expect(section.count).toBe(ws.sections[0].count);
    expect(section.params).toEqual(ws.sections[0].params);
    expect(section.directions).toBe("Solve each.");

    // Each problem carries its own recipe AND its baked content.
    for (const p of section.problems) {
      expect(typeof p.generatorId).toBe("string"); // recipe
      expect(typeof p.seed).toBe("number"); // recipe
      expect(p.params).toBeTypeOf("object"); // recipe
      expect(typeof p.prompt).toBe("string"); // baked
      expect(typeof p.answer).toBe("string"); // baked
    }
  });

  it("regenerate-all on a loaded sheet keeps params but produces new problems", () => {
    const loaded = deserializeWorksheet(serializeWorksheet(sampleWorksheet(7)));
    const before = loaded.sections[0];
    const fresh = regenerateAll(loaded, before.baseSeed + 1).sections[0];

    expect(fresh.generatorId).toBe(before.generatorId);
    expect(fresh.params).toEqual(before.params);
    expect(fresh.count).toBe(before.count);
    // Same recipe, new seeds -> a different set of baked prompts.
    expect(fresh.problems.map((p) => p.prompt)).not.toEqual(
      before.problems.map((p) => p.prompt),
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
    for (const version of [3, 0, "2", undefined]) {
      const ws = { ...sampleWorksheet(), version };
      expect(() => deserializeWorksheet(JSON.stringify(ws))).toThrow(/version/);
    }
  });

  it("rejects a version 2 worksheet with no Sections", () => {
    const { sections: _omit, ...rest } = sampleWorksheet();
    expect(() => deserializeWorksheet(JSON.stringify(rest))).toThrow(/sections/);
    const empty = { ...sampleWorksheet(), sections: [] };
    expect(() => deserializeWorksheet(JSON.stringify(empty))).toThrow(/sections/);
  });

  it("rejects a Section missing required fields", () => {
    const ws = twoSectionWorksheet();
    const { generatorId: _omit, ...rest } = ws.sections[1];
    const broken = { ...ws, sections: [ws.sections[0], rest] };
    expect(() => deserializeWorksheet(JSON.stringify(broken))).toThrow(
      /section 1 missing generatorId/,
    );
  });

  it("rejects a problem with baked content missing", () => {
    const ws = sampleWorksheet();
    const s = ws.sections[0];
    const broken = {
      ...ws,
      sections: [
        {
          ...s,
          problems: [{ ...s.problems[0], prompt: undefined }, ...s.problems.slice(1)],
        },
      ],
    };
    expect(() => deserializeWorksheet(JSON.stringify(broken))).toThrow(/prompt/);
  });

  it("backfills the print config on a file with no print block", () => {
    const { print: _drop, ...legacy } = sampleWorksheet();
    const loaded = deserializeWorksheet(JSON.stringify(legacy));
    expect(loaded.print).toEqual(DEFAULT_PRINT_CONFIG);
  });
});

describe("version 1 upgrade", () => {
  it("opens a v1 file as an identical single-Section v2 Worksheet", () => {
    fc.assert(
      fc.property(anySeed, (baseSeed) => {
        const ws = sampleWorksheet(baseSeed);
        expect(deserializeWorksheet(asV1File(ws))).toEqual(ws);
      }),
    );
  });

  it("a v1 file prints exactly like the Worksheet it came from", () => {
    const ws = {
      ...sampleWorksheet(11, 6),
      print: { ...DEFAULT_PRINT_CONFIG, paper: "a4" as const, spacing: "roomy" as const },
    };
    const upgraded = deserializeWorksheet(asV1File(ws));
    expect(buildTypstDocument(upgraded)).toEqual(buildTypstDocument(ws));
  });

  it("backfills print on a pre-#7 v1 file", () => {
    const ws = sampleWorksheet();
    expect(deserializeWorksheet(asV1File(ws, { print: false }))).toEqual(ws);
  });

  it("saves an upgraded v1 file back out as version 2", () => {
    const ws = sampleWorksheet();
    const resaved = serializeWorksheet(deserializeWorksheet(asV1File(ws)));
    expect(resaved).toBe(serializeWorksheet(ws));
    expect(JSON.parse(resaved).version).toBe(2);
  });

  it("still validates v1 files", () => {
    const v1 = JSON.parse(asV1File(sampleWorksheet()));
    delete v1.generatorId;
    expect(() => deserializeWorksheet(JSON.stringify(v1))).toThrow(/generatorId/);
    const v1b = JSON.parse(asV1File(sampleWorksheet()));
    v1b.problems[0].answer = 3;
    expect(() => deserializeWorksheet(JSON.stringify(v1b))).toThrow(/answer/);
  });
});
