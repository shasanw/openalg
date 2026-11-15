// Graphs (issue #9): one pure function, plot(spec) -> SVG string, draws every
// graph OpenAlg prints. The Typst layout embeds this exact SVG in the Preview,
// Print and PDF (ADR 0002), and the Add Section picker shows the same SVG on
// screen, so a graph can never look different in two places.
//
// A GraphSpec is plain JSON data saved with its Problem in Worksheet Files, so
// a reopened Worksheet draws the same graph forever. It holds only WHAT to draw
// (window, grid, curves, points, shading), never colours or page sizes: the
// caller picks the ink (the Answer Key draws answers in its key colour).
//
// Two kinds of graph:
// - a coordinate plane: x/y window, grid step, axis and tick labels, and
//   optional parabolas, points (with labels) and dashed vertical lines (an
//   axis of symmetry);
// - a number line: range, ticks, open/closed endpoints and shaded intervals
//   or rays.
//
// Output is deterministic (fixed rounding, fixed attribute order), uses single
// quotes only and no backslashes or newlines, so it drops straight into a Typst
// string literal. Labels are New Computer Modern glyph OUTLINES, not <text>
// (see Lettering): on screen a graph is an image, which cannot use web fonts.

import { ITALIC, REGULAR, UNITS_PER_EM, type GlyphTable } from "./plotGlyphs";

/** A closed interval of the real line, min < max. */
export interface PlotRange {
  min: number;
  max: number;
}

/** A parabola, by its vertex form a(x - h)^2 + k or its coefficients a x^2 + b x + c. */
export type ParabolaCurve =
  | { kind: "parabola"; form: "vertex"; a: number; h: number; k: number }
  | { kind: "parabola"; form: "standard"; a: number; b: number; c: number };

export interface PlotPoint {
  x: number;
  y: number;
  /** Plain text printed beside the point, e.g. "(2, −3)". */
  label?: string;
}

export interface VerticalLine {
  x: number;
  /** Dashed, as an axis of symmetry is drawn. */
  dashed?: boolean;
}

export interface CoordinatePlaneSpec {
  kind: "plane";
  /** Window, in graph units; each end a multiple of its step. */
  x: PlotRange;
  y: PlotRange;
  /** Graph units per grid square. */
  xStep: number;
  yStep: number;
  /** Print a tick label every this many grid squares (default 2). */
  labelEvery?: number;
  /** Axis names printed at the positive ends (default "x" and "y"). */
  axisLabels?: { x: string; y: string };
  curves?: ParabolaCurve[];
  lines?: VerticalLine[];
  points?: PlotPoint[];
}

export interface NumberLinePoint {
  x: number;
  /** Filled (included) or hollow (excluded). */
  closed: boolean;
  /** Plain text printed above the point, e.g. "3/2" or "2 − √3". */
  label?: string;
}

/** A shaded run of the line; a null end runs off that end of the line (a ray). */
export interface ShadedInterval {
  from: number | null;
  to: number | null;
}

export interface NumberLineSpec {
  kind: "numberLine";
  /** The labelled range; arrows extend past both ends. */
  range: PlotRange;
  /** Units between ticks. */
  step: number;
  /** Print a tick label every this many ticks (default 1). */
  labelEvery?: number;
  points?: NumberLinePoint[];
  shaded?: ShadedInterval[];
}

export type GraphSpec = CoordinatePlaneSpec | NumberLineSpec;

export interface PlotOptions {
  /** Colour of the graph's content (curves, points, shading). Grid and axes stay grey and black. */
  ink?: string;
}

/** Width every graph is drawn at, in points (2.5in): fits a two-column cell. */
export const PLOT_WIDTH_PT = 180;

const DEFAULT_INK = "#000";
const GRID = "#b4b4b4";
const LABEL_PT = 6.5;
const MINUS = "−";

// --------------------------------------------------------------- windows

/** Grid squares each way from the origin on every coordinate plane. */
export const PLANE_SQUARES = 10;

/**
 * The window shared by a Problem's blank grid and its answer graph: always
 * PLANE_SQUARES squares each way from the origin, so the grid's size and
 * position reveal nothing about the answer, with the smallest step (1, 2, 5,
 * 10, ...) that keeps every value at least one square inside the edge.
 */
export function symmetricWindow(values: readonly number[], squares = PLANE_SQUARES): {
  range: PlotRange;
  step: number;
} {
  const reach = Math.max(0, ...values.map(Math.abs));
  let step = 1;
  for (let i = 0; reach > (squares - 1) * step; i++) {
    step = [1, 2, 5][(i + 1) % 3] * 10 ** Math.floor((i + 1) / 3);
  }
  return { range: { min: -squares * step, max: squares * step }, step };
}

/** 1, 2, 5, 10, 20, 50, ...: the i-th "nice" step. */
const niceStep = (i: number) => [1, 2, 5][i % 3] * 10 ** Math.floor(i / 3);

/**
 * A number line around the origin for the given marked values: -R to R with R
 * the first multiple of 5 that keeps every value at least one tick in from the
 * ends. Ticks fall on whole numbers (at most 40 of them) and labels are thinned
 * to at most 13, so they never crowd at PLOT_WIDTH_PT.
 */
export function numberLineWindow(values: readonly number[]): {
  range: PlotRange;
  step: number;
  labelEvery: number;
} {
  const reach = Math.max(0, ...values.map(Math.abs));
  let r = 5;
  let step = 1;
  for (;;) {
    for (let i = 0; (2 * r) / step > 40; i++) step = niceStep(i);
    if (reach <= r - step) break;
    r += 5;
  }
  let labelEvery = 1;
  for (let i = 0; (2 * r) / (step * labelEvery) > 12; i++) labelEvery = niceStep(i);
  return { range: { min: -r, max: r }, step, labelEvery };
}

// ----------------------------------------------------------- validation

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isRange = (v: unknown): v is PlotRange => isObj(v) && isNum(v.min) && isNum(v.max) && v.min < v.max;

/** Most grid squares or ticks a graph may have on one axis (keeps a bad file from hanging the renderer). */
const MAX_DIVISIONS = 200;

/**
 * Why `spec` is not a graph plot() can draw, or null when it is. Worksheet
 * Files are checked with this on load, so a damaged file fails loudly instead
 * of breaking the Preview.
 */
export function graphSpecProblem(spec: unknown): string | null {
  if (!isObj(spec)) return "is not an object";
  // plot() letters labels from a fixed set of glyphs (see Lettering).
  const label = (v: unknown) => typeof v === "string" && canLetter(v);
  const optionalArray = (key: string, ok: (v: unknown) => boolean): string | null => {
    const v = spec[key];
    if (v === undefined) return null;
    if (!Array.isArray(v) || !v.every(ok)) return `has invalid ${key}`;
    return null;
  };
  if (spec.kind === "plane") {
    if (!isRange(spec.x) || !isRange(spec.y)) return "has an invalid window";
    if (!isNum(spec.xStep) || spec.xStep <= 0 || !isNum(spec.yStep) || spec.yStep <= 0) {
      return "has an invalid grid step";
    }
    if ((spec.x.max - spec.x.min) / spec.xStep > MAX_DIVISIONS) return "has too many grid squares";
    if ((spec.y.max - spec.y.min) / spec.yStep > MAX_DIVISIONS) return "has too many grid squares";
    if (spec.labelEvery !== undefined && !(isNum(spec.labelEvery) && spec.labelEvery >= 1)) {
      return "has an invalid labelEvery";
    }
    const al = spec.axisLabels;
    const name = (v: unknown) => typeof v === "string" && canLetter(v, "italic");
    if (al !== undefined && !(isObj(al) && name(al.x) && name(al.y))) {
      return "has invalid axisLabels";
    }
    return (
      optionalArray("curves", (c) =>
        isObj(c) &&
        c.kind === "parabola" &&
        isNum(c.a) &&
        c.a !== 0 &&
        ((c.form === "vertex" && isNum(c.h) && isNum(c.k)) ||
          (c.form === "standard" && isNum(c.b) && isNum(c.c))),
      ) ??
      optionalArray("lines", (l) => isObj(l) && isNum(l.x)) ??
      optionalArray(
        "points",
        (p) => isObj(p) && isNum(p.x) && isNum(p.y) && (p.label === undefined || label(p.label)),
      )
    );
  }
  if (spec.kind === "numberLine") {
    if (!isRange(spec.range)) return "has an invalid range";
    if (!isNum(spec.step) || spec.step <= 0) return "has an invalid step";
    if ((spec.range.max - spec.range.min) / spec.step > MAX_DIVISIONS) return "has too many ticks";
    if (spec.labelEvery !== undefined && !(isNum(spec.labelEvery) && spec.labelEvery >= 1)) {
      return "has an invalid labelEvery";
    }
    const end = (v: unknown) => v === null || isNum(v);
    return (
      optionalArray(
        "points",
        (p) =>
          isObj(p) &&
          isNum(p.x) &&
          typeof p.closed === "boolean" &&
          (p.label === undefined || label(p.label)),
      ) ?? optionalArray("shaded", (s) => isObj(s) && end(s.from) && end(s.to))
    );
  }
  return "has an unknown kind";
}

// ------------------------------------------------------------- drawing

/** A coordinate rounded to 2 decimals, "-0" printed as "0". */
function n(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r === 0 ? 0 : r);
}

/** A tick value as printed: a true minus sign, at most 2 decimals. */
function tickText(v: number): string {
  const s = n(v);
  return s.startsWith("-") ? MINUS + s.slice(1) : s;
}

/** Ticks of a range at a step, as exact multiples (no float drift). */
function ticks(range: PlotRange, step: number): number[] {
  const out: number[] = [];
  const first = Math.ceil(range.min / step - 1e-9);
  const last = Math.floor(range.max / step + 1e-9);
  for (let i = first; i <= last; i++) out.push(i * step);
  return out;
}

const isMultiple = (v: number, of: number) => Math.abs(v / of - Math.round(v / of)) < 1e-9;

function svgOpen(width: number, height: number): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${n(width)}pt' height='${n(height)}pt' viewBox='0 0 ${n(width)} ${n(height)}'>`;
}

/** One label: its text, and its anchor point on the baseline. */
interface LabelItem {
  x: number;
  y: number;
  text: string;
}

type GlyphStyle = "regular" | "italic";

const GLYPHS: Record<GlyphStyle, GlyphTable> = { regular: REGULAR, italic: ITALIC };

/** Whether plot() can letter `text` in `style` (every character has an outline). */
export function canLetter(text: string, style: GlyphStyle = "regular"): boolean {
  return [...text].every((ch) => ch in GLYPHS[style]);
}

/** Printed width of `text` at `size` points; a character with no outline counts as half an em. */
export function letteringWidth(text: string, size = LABEL_PT, style: GlyphStyle = "regular"): number {
  let units = 0;
  for (const ch of text) units += GLYPHS[style][ch]?.[0] ?? UNITS_PER_EM / 2;
  return (units * size) / UNITS_PER_EM;
}

/**
 * Labels, drawn as New Computer Modern glyph outlines rather than SVG <text>.
 * A graph reaches the screen as an image (a data: URI inside Typst's SVG
 * pages, an <img> in the picker), and an image cannot use the page's fonts:
 * <text> would show a system serif on screen and New Computer Modern in the
 * PDF. Outlines are the same everywhere. Each glyph used is defined once in
 * the SVG's <defs> and placed with <use>.
 */
class Lettering {
  private readonly defs = new Map<string, string>();

  private glyphId(ch: string, style: GlyphStyle): string | null {
    const glyph = GLYPHS[style][ch];
    if (!glyph || !glyph[1]) return null; // unknown, or blank (a space)
    const id = `${style[0]}${ch.codePointAt(0)!.toString(16)}`;
    this.defs.set(id, glyph[1]);
    return id;
  }

  /**
   * A run of labels in one style and colour, with a white halo so each stays
   * legible over grid lines. The halos are all drawn before any glyph, so a
   * glyph's halo never eats into its neighbour.
   */
  group(
    anchor: "start" | "middle" | "end",
    items: readonly LabelItem[],
    {
      fill = "#000",
      size = LABEL_PT,
      style = "regular",
      halo = true,
    }: { fill?: string; size?: number; style?: GlyphStyle; halo?: boolean } = {},
  ): string {
    if (!items.length) return "";
    const scale = size / UNITS_PER_EM;
    const sc = String(Math.round(scale * 1e6) / 1e6);
    const body = items
      .map(({ x, y, text }) => {
        const width = letteringWidth(text, size, style);
        const x0 = anchor === "start" ? x : anchor === "middle" ? x - width / 2 : x - width;
        let advance = 0;
        let uses = "";
        for (const ch of text) {
          const id = this.glyphId(ch, style);
          if (id) uses += `<use href='#${id}'${advance ? ` x='${advance}'` : ""}/>`;
          advance += GLYPHS[style][ch]?.[0] ?? UNITS_PER_EM / 2;
        }
        return `<g transform='matrix(${sc} 0 0 -${sc} ${n(x0)} ${n(y)})'>${uses}</g>`;
      })
      .join("");
    const ink = `<g fill='${fill}'>${body}</g>`;
    if (!halo) return ink;
    // 2.2pt of halo, in the glyphs' font units.
    return `<g fill='none' stroke='#fff' stroke-width='${n(2.2 / scale)}' stroke-linejoin='round'>${body}</g>${ink}`;
  }

  /** The <defs> holding every glyph the given letterings used. */
  static defsMarkup(...all: Lettering[]): string {
    const defs = new Map(all.flatMap((l) => [...l.defs]));
    if (!defs.size) return "";
    const paths = [...defs]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, d]) => `<path id='${id}' d='${d}'/>`)
      .join("");
    return `<defs>${paths}</defs>`;
  }
}

/** An arrowhead whose tip is at (x, y), pointing in direction (dx, dy). */
function arrowhead(x: number, y: number, dx: number, dy: number, fill: string): string {
  const len = 4.5;
  const half = 2.2;
  const bx = x - dx * len;
  const by = y - dy * len;
  const p1 = `${n(bx - dy * half)} ${n(by + dx * half)}`;
  const p2 = `${n(bx + dy * half)} ${n(by - dx * half)}`;
  return `<path d='M${n(x)} ${n(y)}L${p1}L${p2}Z' fill='${fill}'/>`;
}

function vertexForm(c: ParabolaCurve): { a: number; h: number; k: number } {
  if (c.form === "vertex") return { a: c.a, h: c.h, k: c.k };
  const h = -c.b / (2 * c.a);
  return { a: c.a, h, k: c.c - (c.b * c.b) / (4 * c.a) };
}

/**
 * The pieces of a parabola inside the window, as [x0, x1] spans. The curve
 * leaves the window only where it crosses y = min or y = max, so splitting
 * at those crossings and keeping the spans whose middle is inside is exact.
 */
export function parabolaSpans(curve: ParabolaCurve, x: PlotRange, y: PlotRange): [number, number][] {
  const { a, h, k } = vertexForm(curve);
  const f = (t: number) => a * (t - h) ** 2 + k;
  const cuts = [x.min, x.max];
  for (const level of [y.min, y.max]) {
    const sq = (level - k) / a;
    if (sq < 0) continue;
    for (const t of [h - Math.sqrt(sq), h + Math.sqrt(sq)]) if (t > x.min && t < x.max) cuts.push(t);
  }
  cuts.sort((u, v) => u - v);
  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [u, v] = [cuts[i], cuts[i + 1]];
    if (v - u < 1e-9) continue;
    const mid = f((u + v) / 2);
    if (mid >= y.min - 1e-9 && mid <= y.max + 1e-9) spans.push([u, v]);
  }
  return spans;
}

/**
 * One visible span [u, v] of a parabola as a quadratic Bézier, in graph units:
 * its two ends on the curve and the control point where the tangents at both
 * ends meet. A parabola IS a quadratic Bézier and the window's affine map
 * keeps it one, so the drawn curve is exact: it passes through every marked
 * point, not just near it.
 */
export function parabolaBezier(
  curve: ParabolaCurve,
  [u, v]: [number, number],
): [[number, number], [number, number], [number, number]] {
  const { a, h, k } = vertexForm(curve);
  const f = (t: number) => a * (t - h) ** 2 + k;
  const m = (u + v) / 2;
  return [
    [u, f(u)],
    [m, f(u) + 2 * a * (u - h) * (m - u)],
    [v, f(v)],
  ];
}

/** One layer of a drawing: its SVG elements and the glyphs its labels use. */
class Layer {
  readonly parts: string[] = [];
  readonly letters = new Lettering();
  push(...items: string[]): void {
    this.parts.push(...items.filter(Boolean));
  }
}

/**
 * A graph laid out and drawn in two layers of one size: the frame (grid or
 * line, axes, ticks and their labels, all black and grey) and the content
 * drawn on it in the ink (curves, points, shading and their labels).
 */
interface Drawing {
  width: number;
  height: number;
  frame: Layer;
  content: Layer;
}

function planeDrawing(spec: CoordinatePlaneSpec, ink: string): Drawing {
  const cellsX = (spec.x.max - spec.x.min) / spec.xStep;
  const cellsY = (spec.y.max - spec.y.min) / spec.yStep;
  const zeroX = spec.x.min <= 0 && spec.x.max >= 0;
  const zeroY = spec.y.min <= 0 && spec.y.max >= 0;
  // Room for the axis names at the positive ends, and for tick labels outside
  // the grid when an axis is off the window.
  const padL = zeroX ? 7 : 16;
  const padB = zeroY ? 7 : 11;
  const padR = 10;
  const padT = 10;
  const cell = Math.min((PLOT_WIDTH_PT - padL - padR) / cellsX, 14);
  const gridW = cell * cellsX;
  const gridH = cell * cellsY;
  const width = padL + gridW + padR;
  const height = padT + gridH + padB;
  const px = (v: number) => padL + ((v - spec.x.min) / spec.xStep) * cell;
  const py = (v: number) => padT + ((spec.y.max - v) / spec.yStep) * cell;

  const frame = new Layer();
  const content = new Layer();

  // Grid: one path of every grid line.
  const xs = ticks(spec.x, spec.xStep);
  const ys = ticks(spec.y, spec.yStep);
  const grid =
    xs.map((v) => `M${n(px(v))} ${n(padT)}V${n(padT + gridH)}`).join("") +
    ys.map((v) => `M${n(padL)} ${n(py(v))}H${n(padL + gridW)}`).join("");
  frame.push(`<path d='${grid}' fill='none' stroke='${GRID}' stroke-width='0.4'/>`);

  // Axes, with arrowheads and names at their positive ends. An axis off the
  // window is not drawn; its tick labels move to the grid's edge instead.
  const axisX = zeroX ? px(0) : padL; // where the y-axis (and its labels) sit
  const axisY = zeroY ? py(0) : padT + gridH;
  const names = spec.axisLabels ?? { x: "x", y: "y" };
  // Axes run past the grid with an arrowhead at each end.
  const left = padL - 6;
  const right = padL + gridW + 6;
  const top = padT - 6;
  const bottom = padT + gridH + 6;
  if (zeroY) {
    frame.push(
      `<path d='M${n(left)} ${n(axisY)}H${n(right)}' stroke='#000' stroke-width='0.8'/>`,
      arrowhead(left, axisY, -1, 0, "#000"),
      arrowhead(right, axisY, 1, 0, "#000"),
    );
  }
  if (zeroX) {
    frame.push(
      `<path d='M${n(axisX)} ${n(bottom)}V${n(top)}' stroke='#000' stroke-width='0.8'/>`,
      arrowhead(axisX, bottom, 0, 1, "#000"),
      arrowhead(axisX, top, 0, -1, "#000"),
    );
  }
  const nameItems: LabelItem[] = [];
  if (zeroY) nameItems.push({ x: right + 1, y: axisY + 2.2, text: names.x });
  if (zeroX) nameItems.push({ x: axisX + 3, y: top + 3, text: names.y });
  frame.push(frame.letters.group("start", nameItems, { size: 8, style: "italic" }));

  // Content, in the ink: dashed lines, then curves, then points on top.
  for (const line of spec.lines ?? []) {
    if (line.x < spec.x.min || line.x > spec.x.max) continue;
    const dash = line.dashed ? ` stroke-dasharray='3 2'` : "";
    content.push(
      `<path d='M${n(px(line.x))} ${n(padT)}V${n(padT + gridH)}' stroke='${ink}' stroke-width='0.9'${dash}/>`,
    );
  }

  // Tick labels every `labelEvery` squares (never 0: the axes meet there).
  const every = spec.labelEvery ?? 2;
  const xLabels = xs
    .filter((v) => v !== 0 && isMultiple(v, spec.xStep * every))
    .filter((v) => v > spec.x.min && v < spec.x.max)
    .map((v) => ({ x: px(v), y: axisY + 7.5, text: tickText(v) }));
  const yLabels = ys
    .filter((v) => v !== 0 && isMultiple(v, spec.yStep * every))
    .filter((v) => v > spec.y.min && v < spec.y.max)
    .map((v) => ({ x: axisX - 2, y: py(v) + 2.2, text: tickText(v) }));
  const tickMarks =
    xs.filter((v) => isMultiple(v, spec.xStep * every)).map((v) => `M${n(px(v))} ${n(axisY - 1.5)}v3`).join("") +
    ys.filter((v) => isMultiple(v, spec.yStep * every)).map((v) => `M${n(axisX - 1.5)} ${n(py(v))}h3`).join("");
  if (tickMarks) frame.push(`<path d='${tickMarks}' stroke='#000' stroke-width='0.6'/>`);
  frame.push(frame.letters.group("middle", xLabels), frame.letters.group("end", yLabels));

  for (const curve of spec.curves ?? []) {
    const d = parabolaSpans(curve, spec.x, spec.y)
      .map((span) => {
        const [[x0, y0], [x1, y1], [x2, y2]] = parabolaBezier(curve, span);
        return `M${n(px(x0))} ${n(py(y0))}Q${n(px(x1))} ${n(py(y1))} ${n(px(x2))} ${n(py(y2))}`;
      })
      .join("");
    if (d) content.push(`<path d='${d}' fill='none' stroke='${ink}' stroke-width='1.2'/>`);
  }
  const shown = (spec.points ?? []).filter(
    (p) => p.x >= spec.x.min && p.x <= spec.x.max && p.y >= spec.y.min && p.y <= spec.y.max,
  );
  if (shown.length) {
    content.push(
      `<g fill='${ink}'>${shown.map((p) => `<circle cx='${n(px(p.x))}' cy='${n(py(p.y))}' r='2.2'/>`).join("")}</g>`,
    );
    const labels = shown
      .filter((p) => p.label)
      .map((p) => ({ x: px(p.x) + 3.5, y: py(p.y) - 3.5, text: p.label! }));
    content.push(content.letters.group("start", labels, { fill: ink }));
  }

  return { width, height, frame, content };
}

/** Height of one row of number-line point labels. */
const LABEL_ROW = 7;
/** Label rows every number line has room for (two critical points never need more). */
const LABEL_ROWS = 2;

/**
 * Where each point label goes: centred over its point (pulled in from the
 * line's ends so it never clips), on the lowest row where it clears every
 * label already there. Close critical points such as 1/3 and 1/2 stack their
 * labels instead of printing them over each other.
 */
export function placeLabels(
  points: readonly NumberLinePoint[],
  px: (v: number) => number,
  width: number,
): { x: number; text: string; row: number; half: number }[] {
  const out: { x: number; text: string; row: number; half: number }[] = [];
  const labelled = points.filter((p) => p.label).sort((p, q) => p.x - q.x);
  for (const p of labelled) {
    const half = letteringWidth(p.label!) / 2;
    const x = Math.min(Math.max(px(p.x), half + 1), width - half - 1);
    let row = 0;
    while (out.some((l) => l.row === row && Math.abs(l.x - x) < l.half + half + 2)) row++;
    out.push({ x, text: p.label!, row, half });
  }
  return out;
}

function numberLineDrawing(spec: NumberLineSpec, ink: string): Drawing {
  const width = PLOT_WIDTH_PT;
  // The labelled range sits inside the arrows.
  const ends = 12;
  const px = (v: number) => ends + ((v - spec.range.min) / (spec.range.max - spec.range.min)) * (width - 2 * ends);
  const placed = placeLabels(spec.points ?? [], px, width);
  // Room for two rows of point labels on every line, labelled or blank, so a
  // line's frame depends only on its range: the Answer Key's line is the
  // student's blank line with the solution drawn over it.
  const rows = Math.max(LABEL_ROWS, ...placed.map((l) => l.row + 1));
  const lineY = 8 + rows * LABEL_ROW;
  const height = lineY + 14;
  const leftTip = 1.5;
  const rightTip = width - 1.5;

  const frame = new Layer();
  const content = new Layer();
  frame.push(
    `<path d='M${n(leftTip)} ${n(lineY)}H${n(rightTip)}' stroke='#000' stroke-width='0.8'/>`,
    arrowhead(leftTip, lineY, -1, 0, "#000"),
    arrowhead(rightTip, lineY, 1, 0, "#000"),
  );
  const every = spec.labelEvery ?? 1;
  const all = ticks(spec.range, spec.step);
  const labelled = (v: number) => isMultiple(v, spec.step * every);
  frame.push(
    `<path d='${all.map((v) => `M${n(px(v))} ${n(lineY - (labelled(v) ? 3 : 2))}V${n(lineY + (labelled(v) ? 3 : 2))}`).join("")}' stroke='#000' stroke-width='0.6'/>`,
  );
  frame.push(
    frame.letters.group(
      "middle",
      all.filter(labelled).map((v) => ({ x: px(v), y: lineY + 10, text: tickText(v) })),
      { halo: false },
    ),
  );

  // Shading: a thick run in the ink; an open end becomes a ray with its own arrowhead.
  for (const s of spec.shaded ?? []) {
    const x0 = s.from === null ? leftTip + 3 : px(s.from);
    const x1 = s.to === null ? rightTip - 3 : px(s.to);
    if (x1 <= x0) continue;
    content.push(`<path d='M${n(x0)} ${n(lineY)}H${n(x1)}' stroke='${ink}' stroke-width='2.4'/>`);
    if (s.from === null) content.push(arrowhead(leftTip - 0.5, lineY, -1, 0, ink));
    if (s.to === null) content.push(arrowhead(rightTip + 0.5, lineY, 1, 0, ink));
  }
  const points = spec.points ?? [];
  if (points.length) {
    content.push(
      points
        .map(
          (p) =>
            `<circle cx='${n(px(p.x))}' cy='${n(lineY)}' r='2.6' fill='${p.closed ? ink : "#fff"}' stroke='${ink}' stroke-width='1'/>`,
        )
        .join(""),
    );
    content.push(
      content.letters.group(
        "middle",
        placed.map((l) => ({ x: l.x, y: lineY - 6 - l.row * LABEL_ROW, text: l.text })),
        { fill: ink, halo: false },
      ),
    );
  }
  return { width, height, frame, content };
}

function draw(spec: GraphSpec, opts: PlotOptions): Drawing {
  const ink = opts.ink ?? DEFAULT_INK;
  return spec.kind === "plane" ? planeDrawing(spec, ink) : numberLineDrawing(spec, ink);
}

function svgOf(d: Drawing, layers: Layer[]): string {
  return (
    svgOpen(d.width, d.height) +
    Lettering.defsMarkup(...layers.map((l) => l.letters)) +
    layers.flatMap((l) => l.parts).join("") +
    "</svg>"
  );
}

/** Draw a graph as a self-contained SVG string. Pure and deterministic. */
export function plot(spec: GraphSpec, opts: PlotOptions = {}): string {
  const d = draw(spec, opts);
  return svgOf(d, [d.frame, d.content]);
}

/**
 * The same graph as two SVGs of one size, to be stacked: `frame` (grid or
 * line, axes, ticks, labels) under `content` (what is drawn on it, in the
 * ink), or null when nothing is. Stacked, they look exactly like plot(spec).
 * A plane's frame depends only on its window, so it is the very same SVG as
 * the blank grid on the student copy: the Answer Key draws the Answer on the
 * student's own grid, and a sheet of graphs carries the grid once.
 */
export function plotLayers(spec: GraphSpec, opts: PlotOptions = {}): { frame: string; content: string | null } {
  const d = draw(spec, opts);
  return { frame: svgOf(d, [d.frame]), content: d.content.parts.length ? svgOf(d, [d.content]) : null };
}

/** The same graph with nothing drawn on it: only its grid or line, axes and labels. */
export function blankGraph(spec: GraphSpec): GraphSpec {
  if (spec.kind === "plane") {
    const { curves: _c, lines: _l, points: _p, ...frame } = spec;
    return frame;
  }
  const { points: _p, shaded: _s, ...frame } = spec;
  return frame;
}
