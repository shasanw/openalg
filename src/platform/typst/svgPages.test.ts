import { describe, expect, it } from "vitest";
import { splitSvgPages } from "./svgPages";

// The shape typst.ts 0.7.0's renderer produces, cut down.
const doc =
  '<svg class="typst-doc" viewBox="0 0 300 500" width="300" height="500" data-width="300" data-height="500" xmlns="http://www.w3.org/2000/svg">' +
  "<style>svg { fill: none; }\n.tsel { color: transparent; }</style>" +
  '<defs class="glyph"><path id="gA" d="M 1"/><path id="gB" d="M 2"/></defs>' +
  '<defs class="clip-path"></defs>' +
  '<g class="typst-page" transform="translate(0, 0)" data-page-width="300" data-page-height="200"><use href="#gA"/></g>' +
  '<g class="typst-page" transform="translate(0, 200)" data-page-width="300" data-page-height="300"><use href="#gB"/><use href="#gSpace"/></g>' +
  '<script type="text/javascript">alert(1)</script></svg>';

describe("splitSvgPages", () => {
  const pages = splitSvgPages(doc);

  it("returns one SVG per page, each sized to its page", () => {
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatch(/^<svg [^>]*viewBox="0 0 300 200" width="300" height="200"/);
    expect(pages[1]).toMatch(/^<svg [^>]*viewBox="0 0 300 300" width="300" height="300"/);
    for (const p of pages) expect(p.endsWith("</g></svg>")).toBe(true);
  });

  it("moves each page to the origin", () => {
    expect(pages[1]).toContain('<g class="typst-page" transform="translate(0, 0)"');
    expect(pages[1]).not.toContain("translate(0, 200)");
  });

  it("keeps only the glyphs each page uses", () => {
    expect(pages[0]).toContain('id="gA"');
    expect(pages[0]).not.toContain('id="gB"');
    expect(pages[1]).toContain('id="gB"');
    expect(pages[1]).not.toContain('id="gA"');
  });

  it("drops the script and scopes the bare svg rule to Typst documents", () => {
    for (const p of pages) {
      expect(p).not.toContain("<script");
      expect(p).toContain("svg.typst-doc { fill: none; }");
      expect(p).not.toMatch(/(^|[\s,}>])svg \{/);
    }
  });

  it("passes through markup it doesn't recognise", () => {
    expect(splitSvgPages("<svg></svg>")).toEqual(["<svg></svg>"]);
  });
});
