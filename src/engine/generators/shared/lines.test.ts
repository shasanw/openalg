import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  equationLatex,
  lineThrough,
  perpendicular,
  pointSlopeLatex,
  q,
  slope,
  slopeInterceptLatex,
  slopeLatex,
  standardCoefficients,
  standardLatex,
  type EquationForm,
} from "./lines";
import { satisfies } from "./lines.testUtil";

describe("lines: equations in each form", () => {
  it.each([
    [slope(2, 1), 0, 3, "y = 2x + 3", "y - 3 = 2x", "2x - y = -3"],
    [slope(-1, 1), 2, 1, "y = -x + 3", "y - 1 = -(x - 2)", "x + y = 3"],
    [slope(1, 1), -2, -5, "y = x - 3", "y + 5 = x + 2", "x - y = 3"],
    [slope(2, 3), 3, 1, "y = \\frac{2}{3}x - 1", "y - 1 = \\frac{2}{3}(x - 3)", "2x - 3y = 3"],
    [slope(-3, 4), -4, 0, "y = -\\frac{3}{4}x - 3", "y = -\\frac{3}{4}(x + 4)", "3x + 4y = -12"],
    [slope(0, 1), 5, -2, "y = -2", "y = -2", "y = -2"],
    [slope(1, 0), 4, 7, "x = 4", "x = 4", "x = 4"],
    [slope(1, 2), 1, 0, "y = \\frac{1}{2}x - \\frac{1}{2}", "y = \\frac{1}{2}(x - 1)", "x - 2y = 1"],
  ])("slope %o through (%i, %i)", (s, x, y, si, ps, st) => {
    const l = lineThrough(s, x, y);
    expect(slopeInterceptLatex(l)).toBe(si);
    expect(pointSlopeLatex(l, q(x), q(y))).toBe(ps);
    expect(standardLatex(l)).toBe(st);
  });

  it("every form of every line passes through the point it was built from", () => {
    const anySlope = fc
      .tuple(fc.integer({ min: -6, max: 6 }), fc.integer({ min: 0, max: 5 }))
      .map(([r, n]) => slope(n === 0 ? 1 : r, n));
    fc.assert(
      fc.property(
        anySlope,
        fc.integer({ min: -9, max: 9 }),
        fc.integer({ min: -9, max: 9 }),
        fc.constantFrom<EquationForm>("slopeIntercept", "pointSlope", "standard"),
        (s, x, y, form) => {
          const tex = equationLatex(lineThrough(s, x, y), form, [x, y]);
          expect(satisfies(tex, x, y)).toBe(true);
          if (s.run === 0) expect(satisfies(tex, x, y + 3)).toBe(true);
          else expect(satisfies(tex, x + s.run, y + s.rise)).toBe(true);
          expect(tex).not.toMatch(/\+ -|- -|(^|[^\d])1[xy]|-0|\{-/);
        },
      ),
    );
  });

  it("standard form has coprime integers with a positive leading coefficient", () => {
    fc.assert(
      fc.property(fc.integer({ min: -9, max: 9 }), fc.integer({ min: 1, max: 6 }), fc.integer({ min: -9, max: 9 }), (r, n, b) => {
        const [A, B, C] = standardCoefficients(lineThrough(slope(r, n), 0, b));
        for (const v of [A, B, C]) expect(Number.isInteger(v)).toBe(true);
        expect(A > 0 || (A === 0 && B > 0)).toBe(true);
        const g = (a: number, c: number): number => (c ? g(c, a % c) : Math.abs(a));
        expect(g(g(A, B), C)).toBe(1);
      }),
    );
  });
});

describe("lines: slopes", () => {
  it("perpendicular slopes multiply to -1, and horizontal and vertical swap", () => {
    expect(perpendicular(slope(2, 3))).toEqual(slope(-3, 2));
    expect(perpendicular(slope(-4, 1))).toEqual(slope(1, 4));
    expect(perpendicular(slope(0, 1))).toEqual(slope(1, 0));
    expect(perpendicular(slope(1, 0))).toEqual(slope(0, 1));
  });

  it("prints slopes reduced, with zero and undefined", () => {
    expect(slopeLatex(slope(4, -6))).toBe("-\\frac{2}{3}");
    expect(slopeLatex(slope(0, -3))).toBe("0");
    expect(slopeLatex(slope(-5, 0))).toBe("\\text{undefined}");
  });
});
