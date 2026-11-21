import { expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { anySeed } from "./trig.testkit";
import { measure } from "./oblique.testkit";
import { areaTex, degLabel, degTex, isClean, lenLabel, lenTex, pickTriangle, triFromSAS, triFromSides, triDiagram, others, VERTICES } from "./obliqueKit";

it("rebuilds the chosen triangle from SAS or SSS at every vertex", () => {
  fc.assert(fc.property(anySeed, seed => {
    const rng = createRng(seed);
    const triangle = pickTriangle(rng);
    const fromSides = triFromSides(triangle.sides)!;
    for (const v of VERTICES) {
      const [u, w] = others(v);
      const fromSAS = triFromSAS(v, triangle.angles[v], triangle.sides[u], triangle.sides[w]);
      expect(fromSAS.sides[v]).toBeCloseTo(triangle.sides[v], 9);
      expect(fromSides.angles[v]).toBeCloseTo(triangle.angles[v], 9);
    }
    const { graph } = triDiagram(rng, triangle, { angles: [null, null, null], sides: [null, null, null] });
    const drawn = measure(graph.corners);
    for (const v of VERTICES) expect(drawn.sides[v]).toBeCloseTo(triangle.sides[v], 5);
  }));
  expect(triFromSides([3, 4, 7])).toBeNull();
  expect(triFromSides([0, 2, 2])).toBeNull();
});

it("prints rounded lengths, areas and angles with a thin space before any unit", () => {
  expect(lenTex(12.449, 1)).toBe("12.4");
  expect(lenTex(12.45001, 1, "cm")).toBe("12.5\\,\\text{cm}");
  expect(areaTex(24.5, 2, "ft")).toBe("24.5\\,\\text{ft}^{2}");
  expect(degTex(38.2049, 2)).toBe("38.2^{\\circ}");
  expect(lenLabel(8, 1, "in")).toBe("8 in");
  expect(degLabel(35, 1)).toBe("35°");
});

it("isClean rejects values within a tenth of the last place of a rounding boundary", () => {
  expect(isClean(12.32, 1)).toBe(true);
  expect(isClean(12.351, 1)).toBe(false);
  expect(isClean(12.3449, 2)).toBe(false);
  expect(isClean(NaN, 1)).toBe(false);
});
