import { describe, it, expect } from "vitest";
import { buildTypstDocument, escapeTypstText } from "./typst";
import { buildWorksheet } from "./worksheet";
import { QUADRATIC_FACTORING_ID } from "./generators/quadraticFactoring";

function ws(count: number) {
  return buildWorksheet({
    generatorId: QUADRATIC_FACTORING_ID,
    baseSeed: 1,
    count,
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

describe("escapeTypstText", () => {
  it("escapes Typst markup characters", () => {
    expect(escapeTypstText("a #b [c] *d* @e")).toBe(
      "a \\#b \\[c\\] \\*d\\* \\@e",
    );
  });
});
