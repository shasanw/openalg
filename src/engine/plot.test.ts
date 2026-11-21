import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  blankGraph,
  graphSpecProblem,
  numberLineWindow,
  parabolaBezier,
  parabolaSpans,
  canLetter,
  letteringWidth,
  lineSegment,
  placeLabels,
  plot,
  plotLayers,
  PLOT_WIDTH_PT,
  symmetricWindow,
  trigAsymptotes,
  trigSpans,
  trigWindow,
  triangleFromAngles,
  triangleFromSides,
  TRIG_FUNCTIONS,
  type CoordinatePlaneSpec,
  type TriangleSpec,
  type TrigCurve,
  type LineCurve,
  type NumberLineSpec,
  type ParabolaCurve,
} from "./plot";

const blankPlane: CoordinatePlaneSpec = {
  kind: "plane",
  x: { min: -10, max: 10 },
  y: { min: -10, max: 10 },
  xStep: 1,
  yStep: 1,
  labelEvery: 2,
};

const answerPlane: CoordinatePlaneSpec = {
  ...blankPlane,
  curves: [{ kind: "parabola", form: "vertex", a: 1, h: 2, k: -4 }],
  lines: [{ x: 2, dashed: true }],
  points: [
    { x: 2, y: -4, label: "(2, −4)" },
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ],
};

const offOrigin: CoordinatePlaneSpec = {
  kind: "plane",
  x: { min: 2, max: 12 },
  y: { min: 5, max: 25 },
  xStep: 1,
  yStep: 2,
  labelEvery: 1,
  curves: [{ kind: "parabola", form: "standard", a: -1, b: 14, c: -24 }],
};

const linesPlane: CoordinatePlaneSpec = {
  ...blankPlane,
  curves: [
    { kind: "line", form: "slopeIntercept", m: 2 / 3, b: -1 },
    { kind: "line", form: "slopeIntercept", m: -3, b: 4 },
    { kind: "line", form: "slopeIntercept", m: 0, b: 6 },
    { kind: "line", form: "vertical", x: -7 },
  ],
  points: [
    { x: 0, y: -1 },
    { x: 3, y: 1 },
  ],
};

const blankLine: NumberLineSpec = { kind: "numberLine", range: { min: -5, max: 5 }, step: 1 };

const answerLine: NumberLineSpec = {
  ...blankLine,
  points: [
    { x: -1.5, closed: false, label: "−3/2" },
    { x: 2, closed: true },
  ],
  shaded: [
    { from: null, to: -1.5 },
    { from: 2, to: null },
  ],
};

describe("plot: snapshots", () => {
  it("a blank coordinate grid", async () => {
    await expect(plot(blankPlane)).toMatchFileSnapshot("__snapshots__/plot-plane-blank.svg");
  });
  it("a parabola with its axis of symmetry and labelled points, in an ink", async () => {
    await expect(plot(answerPlane, { ink: "#c62828" })).toMatchFileSnapshot(
      "__snapshots__/plot-plane-answer.svg",
    );
  });
  it("straight lines of every kind, clipped to the window, with points on them", async () => {
    await expect(plot(linesPlane, { ink: "#c62828" })).toMatchFileSnapshot(
      "__snapshots__/plot-plane-lines.svg",
    );
  });
  it("a window that does not contain the origin (labels move to the edges)", async () => {
    await expect(plot(offOrigin)).toMatchFileSnapshot("__snapshots__/plot-plane-off-origin.svg");
  });
  it("a blank number line", async () => {
    await expect(plot(blankLine)).toMatchFileSnapshot("__snapshots__/plot-line-blank.svg");
  });
  it("a number line with rays, open and closed dots and a label", async () => {
    await expect(plot(answerLine, { ink: "#c62828" })).toMatchFileSnapshot(
      "__snapshots__/plot-line-answer.svg",
    );
  });
  it("a number line whose close labelled points stack their labels", async () => {
    const close: NumberLineSpec = {
      ...blankLine,
      points: [
        { x: -0.75, closed: true, label: "−3/4" },
        { x: -0.5, closed: true, label: "−1/2" },
      ],
      shaded: [{ from: -0.75, to: -0.5 }],
    };
    await expect(plot(close)).toMatchFileSnapshot("__snapshots__/plot-line-stacked.svg");
  });
});

describe("plot: output", () => {
  const specs = [blankPlane, answerPlane, linesPlane, offOrigin, blankLine, answerLine];

  it("is deterministic", () => {
    for (const s of specs) expect(plot(s)).toBe(plot(structuredClone(s)));
  });

  it("is one self-contained SVG that drops into a Typst string as is", () => {
    for (const s of specs) {
      const svg = plot(s);
      expect(svg.startsWith("<svg xmlns='http://www.w3.org/2000/svg'")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).not.toMatch(/["\\\n\r]/);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
    }
  });

  it("letters labels as New Computer Modern outlines, never as font-dependent <text>", () => {
    for (const s of specs) {
      const svg = plot(s);
      expect(svg).not.toContain("<text");
      expect(svg).not.toContain("font-family");
      // every glyph placed is defined once, in the same SVG
      const defined = [...svg.matchAll(/<path id='([^']+)'/g)].map((m) => m[1]);
      expect(new Set(defined).size).toBe(defined.length);
      for (const [, id] of svg.matchAll(/href='#([^']+)'/g)) expect(defined).toContain(id);
    }
  });

  it("prints a true minus sign and italic axis names", () => {
    const svg = plot(blankPlane);
    expect(svg).toContain(`id='r${(0x2212).toString(16)}'`); // − (U+2212), not "-"
    expect(svg).not.toContain(`id='r2d'`);
    expect(svg).toContain(`id='i78'`); // italic x
    expect(svg).toContain(`id='i79'`); // italic y
  });

  it("measures labels by their glyphs", () => {
    expect(canLetter("2 − √3")).toBe(true);
    expect(canLetter("(−3 + √17)/4")).toBe(true);
    expect(canLetter("<a>")).toBe(false);
    expect(canLetter("x", "italic")).toBe(true);
    // digits are half an em in New Computer Modern
    expect(letteringWidth("10", 10)).toBe(10);
  });

  it("plotLayers: the frame and content stack into exactly plot()", () => {
    const body = (svg: string) => svg.replace(/^<svg[^>]*>(<defs>.*?<\/defs>)?/, "").replace(/<\/svg>$/, "");
    const open = (svg: string) => svg.match(/^<svg[^>]*>/)![0];
    for (const s of specs) {
      const full = plot(s, { ink: "#c62828" });
      const { frame, content } = plotLayers(s, { ink: "#c62828" });
      expect(open(frame)).toBe(open(full));
      if (content) expect(open(content)).toBe(open(full));
      expect(body(frame) + (content ? body(content) : "")).toBe(body(full));
    }
  });

  it("plotLayers: a plane's frame is the student's blank grid itself, and a blank graph has no content", () => {
    expect(plotLayers(answerPlane, { ink: "#c62828" }).frame).toBe(plot(blankGraph(answerPlane)));
    expect(plotLayers(blankPlane).content).toBeNull();
    expect(plotLayers(blankLine).content).toBeNull();
    expect(plotLayers(answerLine).content).toContain("<circle");
    // a number line's frame is its blank line too, labelled points or not
    expect(plotLayers(answerLine, { ink: "#c62828" }).frame).toBe(plot(blankGraph(answerLine)));
  });

  it("draws the blank grid with no ink at all", () => {
    expect(plot(blankPlane, { ink: "#c62828" })).not.toContain("#c62828");
    expect(plot(blankLine, { ink: "#c62828" })).not.toContain("#c62828");
  });

  it("blankGraph keeps the frame and drops everything drawn on it", () => {
    expect(blankGraph(answerPlane)).toEqual(blankPlane);
    expect(blankGraph(linesPlane)).toEqual(blankPlane);
    expect(blankGraph(answerLine)).toEqual(blankLine);
    expect(plot(blankGraph(answerPlane))).toBe(plot(blankPlane));
  });
});

describe("plot: windows always contain what they must show", () => {
  const value = fc.double({ min: -1e4, max: 1e4, noNaN: true });

  it("symmetricWindow: every value is at least one grid square inside the edge", () => {
    fc.assert(
      fc.property(fc.array(value, { maxLength: 8 }), (values) => {
        const { range, step } = symmetricWindow(values);
        expect(range.min).toBe(-range.max);
        expect(range.max / step).toBe(10);
        for (const v of values) expect(Math.abs(v)).toBeLessThanOrEqual(range.max - step);
        // and the step is the smallest of 1, 2, 5, 10, ... that does it
        const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
        const smaller = steps.filter((s) => s < step);
        for (const s of smaller) {
          expect(values.some((v) => Math.abs(v) > 9 * s)).toBe(true);
        }
      }),
    );
  });

  it("numberLineWindow: every value is at least one unit inside the ends, labels never crowd", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -500, max: 500, noNaN: true }), { maxLength: 6 }), (values) => {
        const { range, step, labelEvery } = numberLineWindow(values);
        expect(range.min).toBe(-range.max);
        expect(range.max % 5).toBe(0);
        for (const v of values) expect(Math.abs(v)).toBeLessThanOrEqual(range.max - step);
        expect((range.max - range.min) / step).toBeLessThanOrEqual(40);
        expect((range.max - range.min) / (step * labelEvery) + 1).toBeLessThanOrEqual(13);
      }),
    );
  });

  it("placeLabels: number-line labels never overlap and never run off the line", () => {
    const label = fc.constantFrom("1/2", "−5/3", "2 − √3", "(−3 + √17)/4", "−11/12");
    fc.assert(
      fc.property(
        fc.array(fc.record({ x: fc.double({ min: -10, max: 10, noNaN: true }), label }), { maxLength: 4 }),
        (pts) => {
          const px = (v: number) => 12 + ((v + 10) / 20) * (PLOT_WIDTH_PT - 24);
          const placed = placeLabels(
            pts.map((p) => ({ ...p, closed: true })),
            px,
            PLOT_WIDTH_PT,
          );
          expect(placed).toHaveLength(pts.length);
          for (const l of placed) {
            expect(l.x - l.half).toBeGreaterThanOrEqual(0);
            expect(l.x + l.half).toBeLessThanOrEqual(PLOT_WIDTH_PT);
          }
          for (const [i, l] of placed.entries()) {
            for (const m of placed.slice(i + 1)) {
              if (l.row === m.row) expect(Math.abs(l.x - m.x)).toBeGreaterThanOrEqual(l.half + m.half);
            }
          }
        },
      ),
    );
  });

  const curve: fc.Arbitrary<ParabolaCurve> = fc.record({
    kind: fc.constant("parabola" as const),
    form: fc.constant("vertex" as const),
    a: fc.integer({ min: -4, max: 4 }).filter((a) => a !== 0),
    h: fc.integer({ min: -12, max: 12 }),
    k: fc.integer({ min: -12, max: 12 }),
  });

  it("parabolaSpans: every visible piece stays inside the window, and every inside point is drawn", () => {
    const x = { min: -10, max: 10 };
    const y = { min: -10, max: 10 };
    fc.assert(
      fc.property(curve, fc.double({ min: -10, max: 10, noNaN: true }), (c, t) => {
        if (c.form !== "vertex") return;
        const f = (s: number) => c.a * (s - c.h) ** 2 + c.k;
        const spans = parabolaSpans(c, x, y);
        for (const [u, v] of spans) {
          expect(u).toBeGreaterThanOrEqual(x.min);
          expect(v).toBeLessThanOrEqual(x.max);
          for (const s of [u, (u + v) / 2, v]) {
            expect(f(s)).toBeGreaterThanOrEqual(y.min - 1e-6);
            expect(f(s)).toBeLessThanOrEqual(y.max + 1e-6);
          }
        }
        // (a point right on the window's edge may go either way)
        const inside = f(t) > y.min + 1e-6 && f(t) < y.max - 1e-6;
        const outside = f(t) < y.min - 1e-6 || f(t) > y.max + 1e-6;
        const drawn = spans.some(([u, v]) => t >= u - 1e-9 && t <= v + 1e-9);
        if (inside || outside) expect(drawn).toBe(inside);
      }),
    );
  });

  it("parabolaBezier: the drawn curve is the parabola itself, not an approximation", () => {
    fc.assert(
      fc.property(
        curve,
        fc.double({ min: -10, max: 10, noNaN: true }),
        fc.double({ min: 0.01, max: 20, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (c, u, width, t) => {
          if (c.form !== "vertex") return;
          const f = (s: number) => c.a * (s - c.h) ** 2 + c.k;
          const [p0, p1, p2] = parabolaBezier(c, [u, u + width]);
          const bx = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
          const by = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
          expect(by).toBeCloseTo(f(bx), 6);
        },
      ),
    );
  });

  const line: fc.Arbitrary<LineCurve> = fc.oneof(
    fc.record({
      kind: fc.constant("line" as const),
      form: fc.constant("slopeIntercept" as const),
      m: fc.oneof(fc.constant(0), fc.double({ min: -20, max: 20, noNaN: true })),
      b: fc.double({ min: -30, max: 30, noNaN: true }),
    }),
    fc.record({
      kind: fc.constant("line" as const),
      form: fc.constant("vertical" as const),
      x: fc.double({ min: -15, max: 15, noNaN: true }),
    }),
  );

  it("lineSegment: the drawn piece lies on the line, inside the window, and covers every inside point", () => {
    const x = { min: -10, max: 10 };
    const y = { min: -10, max: 10 };
    const inside = (px: number, py: number, eps: number) =>
      px >= x.min - eps && px <= x.max + eps && py >= y.min - eps && py <= y.max + eps;
    fc.assert(
      fc.property(line, fc.double({ min: -10, max: 10, noNaN: true }), (c, t) => {
        const seg = lineSegment(c, x, y);
        if (seg) {
          for (const [sx, sy] of seg) {
            expect(inside(sx, sy, 1e-6)).toBe(true);
            if (c.form === "vertical") expect(sx).toBe(c.x);
            else expect(sy).toBeCloseTo(c.m * sx + c.b, 6);
          }
        }
        // a point of the line at parameter t (x = t, or y = t when vertical)
        const [qx, qy] = c.form === "vertical" ? [c.x, t] : [t, c.m * t + c.b];
        if (inside(qx, qy, -1e-6)) {
          expect(seg).not.toBeNull();
          const [[x0, y0], [x1, y1]] = seg!;
          if (c.form === "vertical") expect(qy >= y0 - 1e-9 && qy <= y1 + 1e-9).toBe(true);
          else expect(qx >= x0 - 1e-9 && qx <= x1 + 1e-9).toBe(true);
        }
      }),
    );
  });

  it("lineSegment: a line that misses the window draws nothing", () => {
    const w = { min: -10, max: 10 };
    expect(lineSegment({ kind: "line", form: "vertical", x: 11 }, w, w)).toBeNull();
    expect(lineSegment({ kind: "line", form: "slopeIntercept", m: 0, b: -12 }, w, w)).toBeNull();
    expect(lineSegment({ kind: "line", form: "slopeIntercept", m: 1, b: 25 }, w, w)).toBeNull();
    // through a corner only
    expect(lineSegment({ kind: "line", form: "slopeIntercept", m: -1, b: 20 }, w, w)).toBeNull();
    expect(plot({ ...blankPlane, curves: [{ kind: "line", form: "vertical", x: 11 }] })).toBe(plot(blankPlane));
  });

  it("standard and vertex forms of the same parabola draw the same curve", () => {
    // y = 2(x - 1)^2 - 8 = 2x^2 - 4x - 6
    const v: CoordinatePlaneSpec = { ...blankPlane, curves: [{ kind: "parabola", form: "vertex", a: 2, h: 1, k: -8 }] };
    const s: CoordinatePlaneSpec = { ...blankPlane, curves: [{ kind: "parabola", form: "standard", a: 2, b: -4, c: -6 }] };
    expect(plot(s)).toBe(plot(v));
  });
});

describe("graphSpecProblem", () => {
  it("accepts every spec plot() draws", () => {
    for (const s of [blankPlane, answerPlane, linesPlane, offOrigin, blankLine, answerLine]) {
      expect(graphSpecProblem(JSON.parse(JSON.stringify(s)))).toBeNull();
    }
  });

  it.each([
    ["not an object", 3],
    ["an unknown kind", { kind: "pie" }],
    ["a reversed window", { ...blankPlane, x: { min: 5, max: -5 } }],
    ["a zero step", { ...blankPlane, xStep: 0 }],
    ["a huge grid", { ...blankPlane, x: { min: -1e6, max: 1e6 } }],
    ["a flat parabola", { ...blankPlane, curves: [{ kind: "parabola", form: "vertex", a: 0, h: 0, k: 0 }] }],
    ["a line without an intercept", { ...blankPlane, curves: [{ kind: "line", form: "slopeIntercept", m: 1 }] }],
    ["a line with an infinite slope", { ...blankPlane, curves: [{ kind: "line", form: "slopeIntercept", m: Infinity, b: 0 }] }],
    ["a vertical line without x", { ...blankPlane, curves: [{ kind: "line", form: "vertical" }] }],
    ["a line of an unknown form", { ...blankPlane, curves: [{ kind: "line", form: "polar", r: 1 }] }],
    ["a point without y", { ...blankPlane, points: [{ x: 1 }] }],
    ["a number line point without closed", { ...blankLine, points: [{ x: 1 }] }],
    ["a shaded run with a string end", { ...blankLine, shaded: [{ from: "a", to: null }] }],
    ["a number line with too many ticks", { ...blankLine, step: 0.0001 }],
    ["a label plot() has no glyphs for", { ...blankPlane, points: [{ x: 1, y: 1, label: "<script>" }] }],
    ["an axis name plot() has no glyphs for", { ...blankPlane, axisLabels: { x: "x", y: "Y!" } }],
  ])("rejects %s", (_, spec) => {
    expect(graphSpecProblem(spec)).not.toBeNull();
  });
});

// ------------------------------------------------- trig curves and triangles

const trigCurves: TrigCurve[] = TRIG_FUNCTIONS.map((fn, i) => ({
  kind: "trig",
  fn,
  a: [3, -2, 1, 2, 1, -2][i],
  b: [2, 0.5, 1, 1, 2, 0.5][i],
  c: [Math.PI / 4, 0, Math.PI / 4, 0, 0, Math.PI / 2][i],
  d: [1, -1, 0, 1, -2, 0][i],
}));
const trigPlanes: CoordinatePlaneSpec[] = trigCurves.map((c) => ({
  ...trigWindow([c.d + c.a, c.d - c.a]),
  curves: [c],
}));

/** A right triangle (C), a skinny obtuse one and an equilateral one, with every kind of label. */
const rightTriangle: TriangleSpec = {
  kind: "triangle",
  corners: [
    { x: 0, y: 0, name: "C", rightAngle: true, opposite: { text: "x" } },
    { x: 4, y: 0, name: "A", angle: { text: "37°" }, opposite: { text: "3" } },
    { x: 0, y: 3, name: "B", opposite: { text: "4 cm" } },
  ],
};
const [sA, sB, sC] = triangleFromAngles(8, 12, 20);
const skinnyTriangle: TriangleSpec = {
  kind: "triangle",
  corners: [
    { ...sA, name: "A", angle: { text: "8°" }, opposite: { text: "a" } },
    { ...sB, name: "B", angle: { text: "12°" }, opposite: { text: "b" } },
    { ...sC, name: "C", angle: { text: "θ" }, opposite: { text: "20" } },
  ],
};
const answeredSkinny: TriangleSpec = {
  ...skinnyTriangle,
  corners: [
    skinnyTriangle.corners[0],
    skinnyTriangle.corners[1],
    { ...skinnyTriangle.corners[2], angle: { text: "160°", answer: true } },
  ],
};
const [eA, eB, eC] = triangleFromSides(5, 5, 5);
const equilateral: TriangleSpec = {
  kind: "triangle",
  corners: [
    { ...eA, name: "P", angle: { text: "" }, opposite: { text: "5" } },
    { ...eB, name: "Q", angle: { text: "" }, opposite: { text: "5" } },
    { ...eC, name: "R", angle: { text: "?" }, opposite: { text: "5" } },
  ],
};
const newSpecs = [...trigPlanes, trigWindow([4, -4]), rightTriangle, skinnyTriangle, answeredSkinny, equilateral];

describe("plot: trig curves and triangles", () => {
  it("snapshots", async () => {
    await expect(plot(trigPlanes[0], { ink: "#c62828" })).toMatchFileSnapshot("__snapshots__/plot-trig-sin.svg");
    await expect(plot(trigPlanes[2], { ink: "#c62828" })).toMatchFileSnapshot("__snapshots__/plot-trig-tan.svg");
    await expect(plot(rightTriangle)).toMatchFileSnapshot("__snapshots__/plot-triangle-right.svg");
    await expect(plot(answeredSkinny, { ink: "#c62828" })).toMatchFileSnapshot(
      "__snapshots__/plot-triangle-answer.svg",
    );
  });

  it("is deterministic, self-contained, and drops into a Typst string as is", () => {
    for (const s of newSpecs) {
      const svg = plot(s, { ink: "#c62828" });
      expect(svg).toBe(plot(structuredClone(s), { ink: "#c62828" }));
      expect(svg.startsWith("<svg xmlns='http://www.w3.org/2000/svg'")).toBe(true);
      expect(svg).not.toMatch(/["\\\n\r]/);
      expect(svg).not.toMatch(/NaN|Infinity|<text/);
      const defined = [...svg.matchAll(/<path id='([^']+)'/g)].map((m) => m[1]);
      for (const [, id] of svg.matchAll(/href='#([^']+)'/g)) expect(defined).toContain(id);
      expect(svg).toContain(`width='${PLOT_WIDTH_PT}pt'`);
    }
  });

  it("is valid, also after a trip through JSON", () => {
    for (const s of newSpecs) expect(graphSpecProblem(JSON.parse(JSON.stringify(s)))).toBeNull();
  });

  it("plotLayers stack into exactly plot()", () => {
    const body = (svg: string) => svg.replace(/^<svg[^>]*>(<defs>.*?<\/defs>)?/, "").replace(/<\/svg>$/, "");
    for (const s of newSpecs) {
      const full = plot(s, { ink: "#c62828" });
      const { frame, content } = plotLayers(s, { ink: "#c62828" });
      expect(body(frame) + (content ? body(content) : "")).toBe(body(full));
    }
  });

  it("trig: the window's blank grid is the answer graph's frame, with π tick labels", () => {
    for (const s of trigPlanes) {
      expect(plotLayers(s, { ink: "#c62828" }).frame).toBe(plot(blankGraph(s)));
      expect(plot(blankGraph(s), { ink: "#c62828" })).not.toContain("#c62828");
    }
    const svg = plot(trigWindow([1, -1]));
    expect(svg).toContain(`id='i${(0x3c0).toString(16)}'`); // italic π
    expect(svg).toContain(`id='r2f'`); // the slash of π/2
  });

  it("trigWindow: x over ±xMaxPi·π, y keeps every value a square inside, steps are fractions of π", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -60, max: 60, noNaN: true }), { maxLength: 4 }),
        fc.integer({ min: 1, max: 4 }),
        (values, k) => {
          const w = trigWindow(values, k);
          expect(w.x).toEqual({ min: -k * Math.PI, max: k * Math.PI });
          expect(w.y.max / w.yStep).toBe(6);
          for (const v of values) expect(Math.abs(v)).toBeLessThanOrEqual(w.y.max - w.yStep);
          expect(graphSpecProblem(JSON.parse(JSON.stringify(w)))).toBeNull();
        },
      ),
    );
    expect(() => trigWindow([1], 5)).toThrow(RangeError);
  });

  const trig: fc.Arbitrary<TrigCurve> = fc.record({
    kind: fc.constant("trig" as const),
    fn: fc.constantFrom(...TRIG_FUNCTIONS),
    a: fc.constantFrom(-3, -2, -1, -0.5, 0.5, 1, 2, 3),
    b: fc.constantFrom(-2, -1, 0.5, 1, 2, 3, 4),
    c: fc.constantFrom(0, Math.PI / 6, -Math.PI / 4, Math.PI / 2, -Math.PI),
    d: fc.integer({ min: -3, max: 3 }),
  });

  it("trigSpans: every piece lies inside the window and between asymptotes; every inside point is drawn", () => {
    const x = { min: -2 * Math.PI, max: 2 * Math.PI };
    const y = { min: -6, max: 6 };
    const value = (c: TrigCurve, t: number) => {
      const u = c.b * (t - c.c);
      const f = { sin: Math.sin(u), cos: Math.cos(u), tan: Math.tan(u), csc: 1 / Math.sin(u), sec: 1 / Math.cos(u), cot: 1 / Math.tan(u) }[c.fn];
      return c.a * f + c.d;
    };
    fc.assert(
      fc.property(trig, fc.double({ min: x.min, max: x.max, noNaN: true }), (c, t) => {
        const spans = trigSpans(c, x, y);
        const asym = trigAsymptotes(c, x);
        for (const [u, v] of spans) {
          for (let i = 0; i <= 10; i++) {
            const s = u + ((v - u) * i) / 10;
            expect(value(c, s)).toBeGreaterThanOrEqual(y.min - 1e-6);
            expect(value(c, s)).toBeLessThanOrEqual(y.max + 1e-6);
          }
          expect(asym.some((p) => p > u && p < v)).toBe(false);
        }
        const f = value(c, t);
        const nearPole = asym.some((p) => Math.abs(p - t) < 1e-6);
        if (!nearPole && f > y.min + 1e-6 && f < y.max - 1e-6) {
          expect(spans.some(([u, v]) => t >= u - 1e-9 && t <= v + 1e-9)).toBe(true);
        }
      }),
    );
  });

  it("trigAsymptotes: where cos (tan, sec) or sin (csc, cot) of b(x − c) is zero; none for sin and cos", () => {
    const x = { min: -2 * Math.PI, max: 2 * Math.PI };
    expect(trigAsymptotes({ kind: "trig", fn: "sin", a: 1, b: 1, c: 0, d: 0 }, x)).toEqual([]);
    const tan = trigAsymptotes({ kind: "trig", fn: "tan", a: 1, b: 1, c: 0, d: 0 }, x).map((v) => v / Math.PI);
    expect(tan.map((v) => Math.round(v * 2) / 2)).toEqual([-1.5, -0.5, 0.5, 1.5]);
    const cot = trigAsymptotes({ kind: "trig", fn: "cot", a: 1, b: 2, c: Math.PI / 4, d: 0 }, x);
    for (const v of cot) expect(Math.abs(Math.sin(2 * (v - Math.PI / 4)))).toBeLessThan(1e-9);
    expect(cot).toHaveLength(8);
    // drawn dashed, in the ink
    expect(plot(trigPlanes[2], { ink: "#c62828" })).toContain(`stroke='#c62828' stroke-width='0.9' stroke-dasharray='3 2'`);
  });

  it("triangles: the answer's label is the only content, and blankGraph drops it", () => {
    expect(plotLayers(skinnyTriangle).content).toBeNull();
    expect(plotLayers(answeredSkinny, { ink: "#c62828" }).content).toContain("#c62828");
    expect(plotLayers(answeredSkinny, { ink: "#c62828" }).frame).not.toContain("#c62828");
    const blank = blankGraph(answeredSkinny) as TriangleSpec;
    expect(blank.corners[2].angle).toBeUndefined();
    expect(blank.corners[2].name).toBe("C");
    expect(blankGraph(skinnyTriangle)).toEqual(skinnyTriangle);
  });

  it("triangles: the outline's size depends on its corners only, so the key's triangle matches the student's", () => {
    const outline = (svg: string) => svg.match(/<path d='M[^']*Z'/)![0];
    const a = plot(skinnyTriangle);
    const b = plot(answeredSkinny);
    const dims = (s: string) => outline(s).match(/[\d.]+/g)!.map(Number);
    const [da, db] = [dims(a), dims(b)];
    // same shape and size (the drawing may shift to centre its labels)
    for (let i = 2; i < 6; i++) expect(da[i] - da[i % 2]).toBeCloseTo(db[i] - db[i % 2], 1);
  });

  it("triangles: labels never overlap each other and stay inside the column", () => {
    const sides = fc.tuple(
      fc.integer({ min: 1, max: 30 }),
      fc.integer({ min: 1, max: 30 }),
      fc.integer({ min: 1, max: 30 }),
    ).filter(([a, b, c]) => a < b + c && b < a + c && c < a + b && Math.min(a, b, c) * 8 > Math.max(a, b, c));
    fc.assert(
      fc.property(sides, ([a, b, c]) => {
        const [A, B, C] = triangleFromSides(a, b, c);
        const spec: TriangleSpec = {
          kind: "triangle",
          corners: [
            { ...A, name: "A", angle: { text: "35.5°" }, opposite: { text: `${a} cm` } },
            { ...B, name: "B", angle: { text: "θ" }, opposite: { text: `${b}` } },
            { ...C, name: "C", angle: { text: "x" }, opposite: { text: "x", answer: true } },
          ],
        };
        if (graphSpecProblem(spec)) return;
        const svg = plot(spec);
        const [w] = svg.match(/viewBox='0 0 ([\d.]+)/)!.slice(1).map(Number);
        expect(w).toBe(PLOT_WIDTH_PT);
        // every glyph run starts inside the drawing
        for (const [, x] of svg.matchAll(/matrix\([\d.]+ 0 0 -[\d.]+ (-?[\d.]+) /g)) {
          expect(Number(x)).toBeGreaterThanOrEqual(0);
          expect(Number(x)).toBeLessThan(PLOT_WIDTH_PT);
        }
      }),
      { numRuns: 60 },
    );
  });

  it("triangleFromSides and triangleFromAngles lay out the triangle asked for", () => {
    const [A, B, C] = triangleFromSides(5, 4, 3);
    const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    expect(d(B, C)).toBeCloseTo(5, 9);
    expect(d(C, A)).toBeCloseTo(4, 9);
    expect(d(A, B)).toBeCloseTo(3, 9);
    expect(() => triangleFromSides(1, 2, 3)).toThrow(RangeError);
    const [P, Q, R] = triangleFromAngles(30, 60, 10);
    expect(d(P, Q)).toBeCloseTo(10, 9);
    expect(d(Q, R)).toBeCloseTo(5, 9); // opposite 30° in a 30-60-90 with hypotenuse 10
    expect(() => triangleFromAngles(100, 80, 1)).toThrow(RangeError);
    // a right angle laid out this way passes the 90° check
    expect(graphSpecProblem({ kind: "triangle", corners: [{ ...A, rightAngle: true }, B, C] })).toBeNull();
  });

  it("letters math labels: single letters and Greek italic, unit words and digits upright", () => {
    expect(canLetter("8.5 cm", "math")).toBe(true);
    expect(canLetter("35°", "math")).toBe(true);
    expect(canLetter("3π/2", "math")).toBe(true);
    expect(canLetter("θ", "regular")).toBe(false);
    const svg = plot(rightTriangle);
    expect(svg).toContain(`id='i78'`); // italic x
    expect(svg).toContain(`id='r63'`); // upright c of cm
    expect(svg).toContain(`id='rb0'`); // degree sign
    expect(svg).toContain(`id='i41'`); // italic A
  });
});

describe("graphSpecProblem: trig and triangles", () => {
  const tri = rightTriangle;
  it.each([
    ["a trig curve of an unknown function", { ...blankPlane, curves: [{ kind: "trig", fn: "sinh", a: 1, b: 1, c: 0, d: 0 }] }],
    ["a flat trig curve", { ...blankPlane, curves: [{ kind: "trig", fn: "sin", a: 0, b: 1, c: 0, d: 0 }] }],
    ["a trig curve with b = 0", { ...blankPlane, curves: [{ kind: "trig", fn: "tan", a: 1, b: 0, c: 0, d: 0 }] }],
    ["a trig curve without d", { ...blankPlane, curves: [{ kind: "trig", fn: "cos", a: 1, b: 1, c: 0 }] }],
    ["a trig curve too dense to draw", { ...blankPlane, curves: [{ kind: "trig", fn: "sin", a: 1, b: 1000, c: 0, d: 0 }] }],
    ["unknown xTickLabels", { ...blankPlane, xTickLabels: "degrees" }],
    ["π labels on a step that is not a fraction of π", { ...blankPlane, xTickLabels: "pi" }],
    ["a triangle with two corners", { kind: "triangle", corners: tri.corners.slice(0, 2) }],
    ["a triangle with a corner without y", { kind: "triangle", corners: [{ x: 0 }, tri.corners[1], tri.corners[2]] }],
    ["three corners on a line", { kind: "triangle", corners: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }],
    ["two corners at one point", { kind: "triangle", corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 1 }] }],
    ["a right-angle mark on an angle that is not 90°", { kind: "triangle", corners: [{ ...tri.corners[0] }, { ...tri.corners[1], rightAngle: true }, tri.corners[2]] }],
    ["a label plot() cannot letter", { kind: "triangle", corners: [{ ...tri.corners[0], opposite: { text: "<b>" } }, tri.corners[1], tri.corners[2]] }],
    ["a label that is not text", { kind: "triangle", corners: [{ ...tri.corners[0], angle: { text: 35 } }, tri.corners[1], tri.corners[2]] }],
    ["a corner name plot() cannot letter", { kind: "triangle", corners: [{ ...tri.corners[0], name: "A!" }, tri.corners[1], tri.corners[2]] }],
  ])("rejects %s", (_, spec) => {
    expect(graphSpecProblem(spec)).not.toBeNull();
  });
});
