// Every graph any Topic attaches to a Problem must be one plot() can draw in
// full: a valid spec (the check Worksheet Files are loaded with), every label
// in characters plot() has glyphs for, and a student graph that never gives
// the Answer away. A Problem with an answer graph prints a BLANK student graph
// on that very frame (the student draws the Answer); a Problem without one may
// print a graph that is the question itself (a given line to find the slope
// of), which states nothing the Answer does. A triangle diagram is always the
// question itself: its answer graph only swaps the unknown's label for the
// Answer.

import { describe, expect, it } from "vitest";
import { GENERATORS } from "./registry";
import { blankGraph, graphSpecProblem, plotLayers, type GraphSpec } from "./plot";
import { topicVariants } from "./topicVariants.testkit";

describe("graphs across every Topic", () => {
  for (const g of GENERATORS) {
    it(`${g.id}: every graph is valid and fully lettered`, () => {
      for (const params of topicVariants(g.schema)) {
        for (let seed = 1; seed <= 60; seed++) {
          const p = g.generate(params, seed);
          for (const spec of [p.graph, p.answerGraph].filter((s): s is GraphSpec => !!s)) {
            expect(graphSpecProblem(JSON.parse(JSON.stringify(spec)))).toBeNull();
          }
          if (p.graph?.kind === "triangle") {
            // no label on the student's triangle is marked as the Answer
            expect(p.graph).toEqual(blankGraph(p.graph));
            // a triangle's student graph is the question (givens, the unknown
            // marked); its answer graph is that same triangle with the
            // unknown's label replaced by the Answer (a drawing of its own, not
            // an overlay on the student's: see TriangleSpec)
            if (p.answerGraph) {
              expect(p.answerGraph.kind).toBe("triangle");
              if (p.answerGraph.kind !== "triangle") continue;
              expect(p.answerGraph.corners.map(({ x, y }) => ({ x, y }))).toEqual(
                p.graph.corners.map(({ x, y }) => ({ x, y })),
              );
            }
            continue;
          }
          if (p.graph && p.answerGraph) {
            // the student's graph is blank, and the Answer is drawn on that very frame
            expect(p.graph).toEqual(blankGraph(p.graph));
            expect(plotLayers(p.answerGraph).frame).toBe(plotLayers(p.graph).frame);
          }
          if (p.graph && !p.answerGraph) {
            // a given graph labels nothing: no printed text can state the Answer
            const points: readonly { label?: string }[] = p.graph.points ?? [];
            expect(points.every((pt) => pt.label === undefined)).toBe(true);
          }
        }
      }
    });
  }
});
