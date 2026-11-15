// Every graph any Topic attaches to a Problem must be one plot() can draw in
// full: a valid spec (the check Worksheet Files are loaded with), every label
// in characters plot() has glyphs for, and a student graph that never shows
// more than the Answer Key's graph on the same frame.

import { describe, expect, it } from "vitest";
import { GENERATORS } from "./registry";
import { blankGraph, graphSpecProblem, plotLayers, type GraphSpec } from "./plot";
import type { ParamValues } from "./types";

function variants(schema: (typeof GENERATORS)[number]["schema"]): ParamValues[] {
  const out: ParamValues[] = [{}];
  for (const f of schema) {
    if (f.type === "enum") for (const o of f.options) out.push({ [f.key]: o.value });
    if (f.type === "boolean") out.push({ [f.key]: !f.default });
    if (f.type === "int") out.push({ [f.key]: f.min }, { [f.key]: f.max });
  }
  return out;
}

describe("graphs across every Topic", () => {
  for (const g of GENERATORS) {
    it(`${g.id}: every graph is valid and fully lettered`, () => {
      for (const params of variants(g.schema)) {
        for (let seed = 1; seed <= 60; seed++) {
          const p = g.generate(params, seed);
          for (const spec of [p.graph, p.answerGraph].filter((s): s is GraphSpec => !!s)) {
            expect(graphSpecProblem(JSON.parse(JSON.stringify(spec)))).toBeNull();
          }
          if (p.graph) {
            // the student's graph is blank, and the Answer is drawn on that very frame
            expect(p.graph).toEqual(blankGraph(p.graph));
            if (p.answerGraph) {
              expect(plotLayers(p.answerGraph).frame).toBe(plotLayers(p.graph).frame);
            }
          }
        }
      }
    });
  }
});
