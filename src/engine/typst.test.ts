import { describe, it, expect } from "vitest";
import { buildTypstDocument, escapeTypstText } from "./typst";
import {
  buildSection,
  buildWorksheet,
  DEFAULT_PRINT_CONFIG,
  type PrintConfig,
  type Worksheet,
} from "./worksheet";
import { QUADRATIC_FACTORING_ID } from "./generators/quadraticFactoring";
import { QUADRATIC_FORMULA_ID } from "./generators/quadraticFormula";

function ws(count: number, print?: Partial<PrintConfig>) {
  return buildWorksheet({
    generatorId: QUADRATIC_FACTORING_ID,
    baseSeed: 1,
    count,
    print: print ? { ...DEFAULT_PRINT_CONFIG, ...print } : undefined,
  });
}

describe("buildTypstDocument", () => {
  it("emits one math placeholder per prompt + answer with a full key", () => {
    const doc = buildTypstDocument(ws(5), { keyFormat: "full" });
    expect(doc.math).toHaveLength(10); // 5 prompts + 5 answers
    for (let i = 0; i < doc.math.length; i++) {
      expect(doc.source).toContain(`@@M${i}@@`);
    }
  });

  it("omits answers when keyFormat is none", () => {
    const doc = buildTypstDocument(ws(5), { keyFormat: "none" });
    expect(doc.math).toHaveLength(5);
    expect(doc.source).not.toContain("Answer Key");
  });

  it("every placeholder has a corresponding math entry and vice versa", () => {
    const doc = buildTypstDocument(ws(7), { keyFormat: "full" });
    const found = [...doc.source.matchAll(/@@M(\d+)@@/g)].map((m) =>
      Number(m[1]),
    );
    expect(found.sort((a, b) => a - b)).toEqual(
      doc.math.map((_, i) => i),
    );
  });

  it("includes the title and directions", () => {
    const w = ws(2);
    const doc = buildTypstDocument(w);
    expect(doc.source).toContain(escapeTypstText(w.title));
    expect(doc.source).toContain(escapeTypstText(w.sections[0].directions));
  });

  it("is deterministic", () => {
    expect(buildTypstDocument(ws(4))).toEqual(buildTypstDocument(ws(4)));
  });
});

describe("buildTypstDocument Sections", () => {
  /** Hand-built: 3 factoring Problems, then 2 quadratic-formula Problems. */
  function twoSections(): Worksheet {
    const ws = buildWorksheet({
      generatorId: QUADRATIC_FACTORING_ID,
      baseSeed: 1,
      count: 3,
      directions: "Solve each equation by factoring.",
    });
    const second = buildSection({
      generatorId: QUADRATIC_FORMULA_ID,
      baseSeed: 2,
      count: 2,
      directions: "Solve using the quadratic formula.",
    });
    return { ...ws, sections: [...ws.sections, second] };
  }

  it("prints each Section's Directions above its own Problems", () => {
    const ws = twoSections();
    const { source } = buildTypstDocument(ws, { keyFormat: "none" });
    const first = source.indexOf("#emph[Solve each equation by factoring.]");
    const second = source.indexOf("#emph[Solve using the quadratic formula.]");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    // Problems 1-3 sit between the two Directions; 4-5 come after the second.
    const label = (n: number) => source.indexOf(`[${n}\\)]`);
    [1, 2, 3].forEach((n) => {
      expect(label(n)).toBeGreaterThan(first);
      expect(label(n)).toBeLessThan(second);
    });
    [4, 5].forEach((n) => expect(label(n)).toBeGreaterThan(second));
  });

  it("numbers Problems continuously across Sections, in the Answer Key too", () => {
    const ws = twoSections();
    const doc = buildTypstDocument(ws, { keyFormat: "full" });
    const labels = [...doc.source.matchAll(/\[(\d+)\\\)\]/g)].map((m) => Number(m[1]));
    expect(labels).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
    const problems = ws.sections.flatMap((s) => s.problems);
    expect(doc.math).toEqual([
      ...problems.map((p) => p.prompt),
      ...problems.map((p) => p.answer),
    ]);
  });
});

describe("buildTypstDocument print config", () => {
  it("reflects paper size, mapping legal to Typst's us-legal", () => {
    expect(buildTypstDocument(ws(2, { paper: "us-letter" })).source).toContain(
      `paper: "us-letter"`,
    );
    expect(buildTypstDocument(ws(2, { paper: "a4" })).source).toContain(
      `paper: "a4"`,
    );
    expect(buildTypstDocument(ws(2, { paper: "legal" })).source).toContain(
      `paper: "us-legal"`,
    );
  });

  it("reflects orientation via the flipped flag", () => {
    expect(
      buildTypstDocument(ws(2, { orientation: "portrait" })).source,
    ).toContain("flipped: false");
    expect(
      buildTypstDocument(ws(2, { orientation: "landscape" })).source,
    ).toContain("flipped: true");
  });

  it("reflects body font size in points", () => {
    expect(buildTypstDocument(ws(2, { fontSize: "small" })).source).toContain(
      "text(size: 10pt)",
    );
    expect(buildTypstDocument(ws(2, { fontSize: "large" })).source).toContain(
      "text(size: 14pt)",
    );
  });

  it("reflects margin presets in inches", () => {
    expect(buildTypstDocument(ws(2, { margin: "narrow" })).source).toContain(
      "margin: 0.5in",
    );
    expect(buildTypstDocument(ws(2, { margin: "normal" })).source).toContain(
      "margin: 1in",
    );
    expect(buildTypstDocument(ws(2, { margin: "wide" })).source).toContain(
      "margin: 1.5in",
    );
  });

  it("toggles page numbering", () => {
    expect(buildTypstDocument(ws(2, { pageNumbers: true })).source).toContain(
      `numbering: "1"`,
    );
    expect(buildTypstDocument(ws(2, { pageNumbers: false })).source).toContain(
      "numbering: none",
    );
  });

  it("reflects work-space spacing as the problem grid's row gutter", () => {
    expect(buildTypstDocument(ws(2, { spacing: "tight" })).source).toContain(
      "row-gutter: 1.2em",
    );
    expect(buildTypstDocument(ws(2, { spacing: "roomy" })).source).toContain(
      "row-gutter: 7em",
    );
  });

  it("shows or hides the name/date/period blanks", () => {
    expect(
      buildTypstDocument(ws(2, { showNameDatePeriod: true })).source,
    ).toContain("Name");
    expect(
      buildTypstDocument(ws(2, { showNameDatePeriod: false })).source,
    ).not.toContain("Name");
  });
});

describe("escapeTypstText", () => {
  it("escapes Typst markup characters", () => {
    expect(escapeTypstText("a #b [c] *d* @e")).toBe(
      "a \\#b \\[c\\] \\*d\\* \\@e",
    );
  });
});
