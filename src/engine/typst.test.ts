import { describe, it, expect } from "vitest";
import { buildTypstDocument, escapeTypstText } from "./typst";
import { buildWorksheet, DEFAULT_PRINT_CONFIG, type PrintConfig } from "./worksheet";
import { QUADRATIC_FACTORING_ID } from "./generators/quadraticFactoring";

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
    expect(doc.source).toContain(escapeTypstText(w.directions));
  });

  it("is deterministic", () => {
    expect(buildTypstDocument(ws(4))).toEqual(buildTypstDocument(ws(4)));
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
