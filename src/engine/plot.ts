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
// Three kinds of graph:
// - a coordinate plane: x/y window, grid step, axis and tick labels (x ticks
//   optionally as multiples of pi), and optional parabolas, straight lines
//   (any slope, vertical included), trig curves (with their asymptotes),
//   points (with labels) and dashed vertical lines (an axis of symmetry);
// - a number line: range, ticks, open/closed endpoints and shaded intervals
//   or rays;
// - a triangle diagram, drawn to scale from its corners: corner names, side
//   and angle labels (with an arc), right-angle marks.
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

/**
 * A straight line, y = m x + b or the vertical line x = c, drawn across the
 * whole window (clipped to it, see lineSegment).
 */
export type LineCurve =
  | { kind: "line"; form: "slopeIntercept"; m: number; b: number }
  | { kind: "line"; form: "vertical"; x: number };

/** The six trig functions a TrigCurve can draw. */
export type TrigFunction = "sin" | "cos" | "tan" | "csc" | "sec" | "cot";

export const TRIG_FUNCTIONS: readonly TrigFunction[] = ["sin", "cos", "tan", "csc", "sec", "cot"];

/**
 * y = a·fn(b(x − c)) + d, in radians, drawn as smooth pieces broken at its
 * vertical asymptotes (tan, sec, csc and cot), which are drawn dashed with it.
 * a and b are nonzero; a negative b reflects the curve as usual.
 */
export interface TrigCurve {
  kind: "trig";
  fn: TrigFunction;
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Anything plot() can draw as a curve on a coordinate plane. */
export type PlotCurve = ParabolaCurve | LineCurve | TrigCurve;

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
  /**
   * "pi" prints the x tick labels as multiples of π (π/2, π, 3π/2, −π), for
   * a trig window whose xStep is a fraction of π (see trigWindow). The window
   * and curves stay in plain radians.
   */
  xTickLabels?: "pi";
  curves?: PlotCurve[];
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

/**
 * A label in a triangle diagram. With `answer` it is the Answer: drawn in the
 * ink, on the content layer, and dropped by blankGraph (see TriangleSpec).
 */
export interface TriangleLabel {
  /** Plain text, e.g. "12", "8.5 cm", "35°", "x", "θ" or "?". Empty: an arc with no label. */
  text: string;
  answer?: boolean;
}

/** One corner of a triangle diagram, and what is printed at it. */
export interface TriangleCorner {
  /** Position, in any units: only the shape counts (see TriangleSpec). */
  x: number;
  y: number;
  /** Printed just outside the corner, e.g. "A". */
  name?: string;
  /** The angle at this corner, marked with an arc and labelled inside it. */
  angle?: TriangleLabel;
  /** A right-angle square at this corner (the angle must be 90°). */
  rightAngle?: boolean;
  /** The label of the side opposite this corner (side a opposite A), printed outside the side. */
  opposite?: TriangleLabel;
}

/**
 * A triangle diagram, drawn to scale from its three corners (y up), scaled to
 * fit the column. Everything but the Answer's labels is its frame; labels
 * marked `answer` are its content, in the ink. A Problem's student graph
 * shows the givens and marks the unknown ("x", "θ" or "?"); its answer graph
 * is the same triangle with the unknown's label replaced by the Answer,
 * marked `answer`.
 */
export interface TriangleSpec {
  kind: "triangle";
  corners: [TriangleCorner, TriangleCorner, TriangleCorner];
}

export type GraphSpec = CoordinatePlaneSpec | NumberLineSpec | TriangleSpec;

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

/** Grid squares above and below the x-axis on a trig window. */
export const TRIG_Y_SQUARES = 6;

/**
 * The blank plane every trig graph is drawn on, shared by the student's grid
 * and the answer graph: x over [−xMaxPi·π, xMaxPi·π] (1 to 4) in steps of π/4
 * (π/2 past 2π), tick labels as multiples of π every two squares; y
 * TRIG_Y_SQUARES squares each way with the smallest step (1, 2, 5, ...) that
 * keeps every value at least one square inside the edge (as symmetricWindow).
 * Pass y-values that bound what the student draws, never the Answer's
 * features alone: for y = a sin(b(x − c)) + d that is d + a and d − a; for
 * tan, cot, sec and csc the same two values (the curve runs off the window
 * at its asymptotes anyway). Pick xMaxPi from the Topic Options or from
 * every possible period alike, not from this Problem's period, so the window
 * never hints at it.
 */
export function trigWindow(yValues: readonly number[], xMaxPi = 2): CoordinatePlaneSpec {
  if (!Number.isInteger(xMaxPi) || xMaxPi < 1 || xMaxPi > 4) {
    throw new RangeError(`trigWindow: xMaxPi must be 1, 2, 3 or 4, not ${xMaxPi}`);
  }
  const { range, step } = symmetricWindow(yValues, TRIG_Y_SQUARES);
  return {
    kind: "plane",
    x: { min: -xMaxPi * Math.PI, max: xMaxPi * Math.PI },
    y: range,
    xStep: xMaxPi <= 2 ? Math.PI / 4 : Math.PI / 2,
    yStep: step,
    labelEvery: 2,
    xTickLabels: "pi",
  };
}

/** A point of a triangle laid out by triangleFromSides or triangleFromAngles. */
export interface PlotXY {
  x: number;
  y: number;
}

/**
 * The corners A, B, C of the triangle with sides a = BC, b = CA, c = AB: A at
 * the origin, B on the positive x-axis, C above. Throws if no such triangle.
 */
export function triangleFromSides(a: number, b: number, c: number): [PlotXY, PlotXY, PlotXY] {
  if (!(a > 0 && b > 0 && c > 0 && a < b + c && b < a + c && c < a + b)) {
    throw new RangeError(`triangleFromSides: no triangle has sides ${a}, ${b}, ${c}`);
  }
  const cosA = (b * b + c * c - a * a) / (2 * b * c);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  return [
    { x: 0, y: 0 },
    { x: c, y: 0 },
    { x: b * cosA, y: b * sinA },
  ];
}

/**
 * The corners A, B, C of the triangle with angles A and B (in degrees) and
 * side c = AB between them: A at the origin, B on the positive x-axis, C above.
 */
export function triangleFromAngles(angleA: number, angleB: number, c: number): [PlotXY, PlotXY, PlotXY] {
  const angleC = 180 - angleA - angleB;
  if (!(angleA > 0 && angleB > 0 && angleC > 0 && c > 0)) {
    throw new RangeError(`triangleFromAngles: no triangle has angles ${angleA}° and ${angleB}°`);
  }
  const rad = Math.PI / 180;
  const b = (c * Math.sin(angleB * rad)) / Math.sin(angleC * rad);
  return [
    { x: 0, y: 0 },
    { x: c, y: 0 },
    { x: b * Math.cos(angleA * rad), y: b * Math.sin(angleA * rad) },
  ];
}

/**
 * Whether a number line prints a tick label at `v`. A point anywhere else
 * (a fraction, a radical, or an integer between labelled ticks) needs its own
 * label for a reader to know where it is.
 */
export function isLabelledTick(
  spec: Pick<NumberLineSpec, "range" | "step" | "labelEvery">,
  v: number,
): boolean {
  return v >= spec.range.min && v <= spec.range.max && isMultiple(v, spec.step * (spec.labelEvery ?? 1));
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
  const label = (v: unknown) => typeof v === "string" && canLetter(v, "math");
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
    if (spec.xTickLabels !== undefined) {
      if (spec.xTickLabels !== "pi") return "has invalid xTickLabels";
      if (piFraction(spec.xStep) === null) return "has an x step that is not a simple fraction of π";
    }
    const xWidth = spec.x.max - spec.x.min;
    return (
      optionalArray(
        "curves",
        (c) =>
          isObj(c) &&
          ((c.kind === "parabola" &&
            isNum(c.a) &&
            c.a !== 0 &&
            ((c.form === "vertex" && isNum(c.h) && isNum(c.k)) ||
              (c.form === "standard" && isNum(c.b) && isNum(c.c)))) ||
            (c.kind === "line" &&
              ((c.form === "slopeIntercept" && isNum(c.m) && isNum(c.b)) ||
                (c.form === "vertical" && isNum(c.x)))) ||
            (c.kind === "trig" &&
              TRIG_FUNCTIONS.includes(c.fn as TrigFunction) &&
              isNum(c.a) &&
              c.a !== 0 &&
              isNum(c.b) &&
              c.b !== 0 &&
              isNum(c.c) &&
              isNum(c.d) &&
              // at most MAX_DIVISIONS half-periods across the window
              (xWidth * Math.abs(c.b)) / Math.PI <= MAX_DIVISIONS)),
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
  if (spec.kind === "triangle") {
    const corners = spec.corners;
    if (!Array.isArray(corners) || corners.length !== 3) return "has invalid corners";
    for (const c of corners) {
      if (!isObj(c) || !isNum(c.x) || !isNum(c.y)) return "has invalid corners";
      const tl = (v: unknown) =>
        v === undefined || (isObj(v) && label(v.text) && (v.answer === undefined || typeof v.answer === "boolean"));
      if (c.name !== undefined && !label(c.name)) return "has an invalid corner name";
      if (!tl(c.angle) || !tl(c.opposite)) return "has an invalid label";
      if (c.rightAngle !== undefined && typeof c.rightAngle !== "boolean") return "has an invalid rightAngle";
    }
    const pts = corners as TriangleCorner[];
    const angles = triangleAngles(pts);
    // A sliver too thin to draw (or three points on a line).
    if (angles.some((a) => !(a >= MIN_TRIANGLE_ANGLE))) return "is too thin to draw";
    if (pts.some((c, i) => c.rightAngle && Math.abs(angles[i] - Math.PI / 2) > 1e-6)) {
      return "marks a right angle that is not 90°";
    }
    return null;
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

/**
 * How a label is lettered: all upright, all italic, or "math": letters as in
 * a formula, each single letter and every Greek letter italic (x, θ, 3π/2,
 * A) and runs of lowercase letters upright (units and names: cm, ft, sin),
 * everything else upright.
 */
type LetterStyle = GlyphStyle | "math";

const GLYPHS: Record<GlyphStyle, GlyphTable> = { regular: REGULAR, italic: ITALIC };

/** The glyph style of each character of `text` (see LetterStyle). */
function glyphStyles(text: string, style: LetterStyle): GlyphStyle[] {
  const chars = [...text];
  if (style !== "math") return chars.map(() => style);
  const latin = (ch: string | undefined) => !!ch && /[A-Za-z]/.test(ch);
  const lower = (ch: string | undefined) => !!ch && /[a-z]/.test(ch);
  return chars.map((ch, i) => {
    if (/[α-ω]/.test(ch)) return "italic";
    if (!latin(ch)) return "regular";
    // a lowercase letter in a run of two or more Latin letters is part of a word
    const word = lower(ch) && (latin(chars[i - 1]) || latin(chars[i + 1]));
    return word ? "regular" : "italic";
  });
}

/** Whether plot() can letter `text` in `style` (every character has an outline). */
export function canLetter(text: string, style: LetterStyle = "regular"): boolean {
  const styles = glyphStyles(text, style);
  return [...text].every((ch, i) => ch in GLYPHS[styles[i]]);
}

/** Printed width of `text` at `size` points; a character with no outline counts as half an em. */
export function letteringWidth(text: string, size = LABEL_PT, style: LetterStyle = "regular"): number {
  const styles = glyphStyles(text, style);
  let units = 0;
  [...text].forEach((ch, i) => (units += GLYPHS[styles[i]][ch]?.[0] ?? UNITS_PER_EM / 2));
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
    }: { fill?: string; size?: number; style?: LetterStyle; halo?: boolean } = {},
  ): string {
    if (!items.length) return "";
    const scale = size / UNITS_PER_EM;
    const sc = String(Math.round(scale * 1e6) / 1e6);
    const body = items
      .map(({ x, y, text }) => {
        const width = letteringWidth(text, size, style);
        const x0 = anchor === "start" ? x : anchor === "middle" ? x - width / 2 : x - width;
        const styles = glyphStyles(text, style);
        let advance = 0;
        let uses = "";
        [...text].forEach((ch, i) => {
          const id = this.glyphId(ch, styles[i]);
          if (id) uses += `<use href='#${id}'${advance ? ` x='${advance}'` : ""}/>`;
          advance += GLYPHS[styles[i]][ch]?.[0] ?? UNITS_PER_EM / 2;
        });
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

/**
 * The piece of a straight line inside the window, as its two ends in graph
 * units (left to right, or bottom to top for a vertical line), or null when
 * the line misses the window or only touches a corner of it.
 */
export function lineSegment(
  curve: LineCurve,
  x: PlotRange,
  y: PlotRange,
): [[number, number], [number, number]] | null {
  if (curve.form === "vertical") {
    if (curve.x < x.min || curve.x > x.max) return null;
    return [
      [curve.x, y.min],
      [curve.x, y.max],
    ];
  }
  const { m, b } = curve;
  let lo = x.min;
  let hi = x.max;
  if (m === 0) {
    if (b < y.min || b > y.max) return null;
  } else {
    // The x-values where the line is inside the window's y-range.
    const u = (y.min - b) / m;
    const v = (y.max - b) / m;
    lo = Math.max(lo, Math.min(u, v));
    hi = Math.min(hi, Math.max(u, v));
  }
  if (hi - lo < 1e-9) return null;
  return [
    [lo, m * lo + b],
    [hi, m * hi + b],
  ];
}

/** f(u) and f'(u) of each trig function, and where its asymptotes fall (u = first + kπ). */
const TRIG: Record<TrigFunction, { f: (u: number) => number; df: (u: number) => number; poles: number | null }> = {
  sin: { f: Math.sin, df: Math.cos, poles: null },
  cos: { f: Math.cos, df: (u) => -Math.sin(u), poles: null },
  tan: { f: Math.tan, df: (u) => 1 / Math.cos(u) ** 2, poles: Math.PI / 2 },
  sec: { f: (u) => 1 / Math.cos(u), df: (u) => Math.sin(u) / Math.cos(u) ** 2, poles: Math.PI / 2 },
  csc: { f: (u) => 1 / Math.sin(u), df: (u) => -Math.cos(u) / Math.sin(u) ** 2, poles: 0 },
  cot: { f: (u) => Math.cos(u) / Math.sin(u), df: (u) => -1 / Math.sin(u) ** 2, poles: 0 },
};

/** y = a·fn(b(x − c)) + d and its derivative, as functions of x. */
function trigFn(curve: TrigCurve): { f: (x: number) => number; df: (x: number) => number } {
  const { a, b, c, d } = curve;
  const t = TRIG[curve.fn];
  return { f: (x) => a * t.f(b * (x - c)) + d, df: (x) => a * b * t.df(b * (x - c)) };
}

/**
 * The x of every vertical asymptote of a trig curve strictly inside the
 * x-range, left to right (none for sin and cos). plot() draws them dashed.
 */
export function trigAsymptotes(curve: TrigCurve, x: PlotRange): number[] {
  const first = TRIG[curve.fn].poles;
  if (first === null) return [];
  const { b, c } = curve;
  // u = b(x - c) over the window, and the poles u = first + k pi in it.
  const u0 = Math.min(b * (x.min - c), b * (x.max - c));
  const u1 = Math.max(b * (x.min - c), b * (x.max - c));
  const out: number[] = [];
  for (let k = Math.ceil((u0 - first) / Math.PI); k <= Math.floor((u1 - first) / Math.PI); k++) {
    const at = c + (first + k * Math.PI) / b;
    if (at > x.min + 1e-9 && at < x.max - 1e-9) out.push(at);
  }
  return out.sort((p, q) => p - q);
}

/**
 * The pieces of a trig curve inside the window, as [x0, x1] spans: between
 * its asymptotes, split where it crosses y = min or y = max. Each piece
 * between two asymptotes is sampled 32 times a period and every crossing
 * found by bisection, so a span ends exactly on the window's edge.
 */
export function trigSpans(curve: TrigCurve, x: PlotRange, y: PlotRange): [number, number][] {
  const { f } = trigFn(curve);
  const inside = (v: number) => v >= y.min && v <= y.max;
  const breaks = [x.min, ...trigAsymptotes(curve, x), x.max];
  const dx = Math.PI / Math.abs(curve.b) / 16;
  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < breaks.length; i++) {
    // Stay a hair off the asymptotes, where the curve is infinite.
    const eps = 1e-9 * (breaks[i + 1] - breaks[i]);
    const lo = breaks[i] + (i > 0 ? eps : 0);
    const hi = breaks[i + 1] - (i + 2 < breaks.length ? eps : 0);
    const count = Math.max(8, Math.ceil((hi - lo) / dx));
    const at = (j: number) => lo + ((hi - lo) * j) / count;
    // The x where the curve leaves (or enters) the window between p and q.
    const edge = (p: number, q: number): number => {
      const inP = inside(f(p));
      for (let k = 0; k < 60; k++) {
        const m = (p + q) / 2;
        if (inside(f(m)) === inP) p = m;
        else q = m;
      }
      return inP ? p : q;
    };
    let start: number | null = inside(f(lo)) ? lo : null;
    for (let j = 1; j <= count; j++) {
      const p = at(j - 1);
      const q = at(j);
      const inQ = inside(f(q));
      if (start === null && inQ) start = edge(p, q);
      else if (start !== null && !inQ) {
        spans.push([start, edge(p, q)]);
        start = null;
      }
    }
    if (start !== null) spans.push([start, hi]);
  }
  return spans.filter(([u, v]) => v - u > 1e-9);
}

/**
 * SVG path data for a trig curve: each visible span as cubic Béziers, every
 * piece matching the curve's value and slope at both its ends (Hermite), cut
 * in half until it is within 0.05pt of the curve.
 */
function trigPath(
  curve: TrigCurve,
  x: PlotRange,
  y: PlotRange,
  px: (v: number) => number,
  py: (v: number) => number,
): string {
  const { f, df } = trigFn(curve);
  const sx = px(1) - px(0);
  const sy = py(0) - py(1);
  const start = Math.PI / Math.abs(curve.b) / 8;
  let d = "";
  const piece = (u: number, v: number, depth: number): string => {
    const h = v - u;
    const [f0, f1, d0, d1] = [f(u), f(v), df(u), df(v)];
    const c1 = f0 + (d0 * h) / 3;
    const c2 = f1 - (d1 * h) / 3;
    const bez = (t: number) => (1 - t) ** 3 * f0 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * f1;
    const off = Math.max(...[0.25, 0.5, 0.75].map((t) => Math.abs(bez(t) - f(u + t * h)) * sy));
    if (depth < 12 && (off > 0.05 || h * sx > 40)) {
      const m = (u + v) / 2;
      return piece(u, m, depth + 1) + piece(m, v, depth + 1);
    }
    return `C${n(px(u + h / 3))} ${n(py(c1))} ${n(px(v - h / 3))} ${n(py(c2))} ${n(px(v))} ${n(py(f1))}`;
  };
  for (const [u, v] of trigSpans(curve, x, y)) {
    d += `M${n(px(u))} ${n(py(f(u)))}`;
    const count = Math.max(1, Math.ceil((v - u) / start));
    for (let i = 0; i < count; i++) d += piece(u + ((v - u) * i) / count, u + ((v - u) * (i + 1)) / count, 0);
  }
  return d;
}

/**
 * A multiple of π as a reduced fraction p/q (q at most 12), or null when
 * `v` is not one.
 */
function piFraction(v: number): [number, number] | null {
  const r = v / Math.PI;
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(r * q);
    if (Math.abs(r * q - p) < 1e-6) return [p, q];
  }
  return null;
}

/** A multiple of π as printed on an axis: 0, π, −π, 3π, π/2, −3π/4. */
function piText(v: number): string {
  const [p, q] = piFraction(v) ?? [Math.round(v / Math.PI), 1];
  if (p === 0) return "0";
  const sign = p < 0 ? MINUS : "";
  const num = `${Math.abs(p) === 1 ? "" : Math.abs(p)}π`;
  return sign + (q === 1 ? num : `${num}/${q}`);
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
  // A trig curve's asymptotes, dashed, under the curves.
  const asymptotes = (spec.curves ?? []).flatMap((c) => (c.kind === "trig" ? trigAsymptotes(c, spec.x) : []));
  if (asymptotes.length) {
    content.push(
      `<path d='${asymptotes.map((v) => `M${n(px(v))} ${n(padT)}V${n(padT + gridH)}`).join("")}' stroke='${ink}' stroke-width='0.9' stroke-dasharray='3 2'/>`,
    );
  }

  // Tick labels every `labelEvery` squares (never 0: the axes meet there).
  const every = spec.labelEvery ?? 2;
  const xLabels = xs
    .filter((v) => v !== 0 && isMultiple(v, spec.xStep * every))
    .filter((v) => v > spec.x.min && v < spec.x.max)
    .map((v) => ({ x: px(v), y: axisY + 7.5, text: spec.xTickLabels === "pi" ? piText(v) : tickText(v) }));
  const yLabels = ys
    .filter((v) => v !== 0 && isMultiple(v, spec.yStep * every))
    .filter((v) => v > spec.y.min && v < spec.y.max)
    .map((v) => ({ x: axisX - 2, y: py(v) + 2.2, text: tickText(v) }));
  const tickMarks =
    xs.filter((v) => isMultiple(v, spec.xStep * every)).map((v) => `M${n(px(v))} ${n(axisY - 1.5)}v3`).join("") +
    ys.filter((v) => isMultiple(v, spec.yStep * every)).map((v) => `M${n(axisX - 1.5)} ${n(py(v))}h3`).join("");
  if (tickMarks) frame.push(`<path d='${tickMarks}' stroke='#000' stroke-width='0.6'/>`);
  frame.push(frame.letters.group("middle", xLabels, { style: "math" }), frame.letters.group("end", yLabels));

  for (const curve of spec.curves ?? []) {
    if (curve.kind === "trig") {
      const d = trigPath(curve, spec.x, spec.y, px, py);
      if (d) content.push(`<path d='${d}' fill='none' stroke='${ink}' stroke-width='1.2' stroke-linejoin='round'/>`);
      continue;
    }
    if (curve.kind === "line") {
      const seg = lineSegment(curve, spec.x, spec.y);
      if (!seg) continue;
      const [[x0, y0], [x1, y1]] = seg;
      content.push(
        `<path d='M${n(px(x0))} ${n(py(y0))}L${n(px(x1))} ${n(py(y1))}' fill='none' stroke='${ink}' stroke-width='1.2' stroke-linecap='round'/>`,
      );
      continue;
    }
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
    content.push(content.letters.group("start", labels, { fill: ink, style: "math" }));
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
  const all = ticks(spec.range, spec.step);
  const labelled = (v: number) => isLabelledTick(spec, v);
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
        { fill: ink, halo: false, style: "math" },
      ),
    );
  }
  return { width, height, frame, content };
}

/** Smallest angle a triangle diagram may have (1°): anything thinner cannot be labelled. */
const MIN_TRIANGLE_ANGLE = Math.PI / 180;

/** The angle at each corner of a triangle, in radians (NaN for a degenerate one). */
function triangleAngles(pts: readonly PlotXY[]): number[] {
  return pts.map((p, i) => {
    const q = pts[(i + 1) % 3];
    const r = pts[(i + 2) % 3];
    const [ux, uy, vx, vy] = [q.x - p.x, q.y - p.y, r.x - p.x, r.y - p.y];
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (!(lu > 0 && lv > 0)) return NaN;
    return Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy) / (lu * lv))));
  });
}

/** Size of side and angle labels on a triangle diagram, and of its corner names. */
const TRIANGLE_LABEL_PT = 7.5;
const TRIANGLE_NAME_PT = 8.5;
/** Most of the column a triangle's own outline may take: room is left round it for labels. */
const TRIANGLE_MAX_W = PLOT_WIDTH_PT - 56;
const TRIANGLE_MAX_H = 96;

type Vec = [number, number];
const sub = (p: Vec, q: Vec): Vec => [p[0] - q[0], p[1] - q[1]];
const add = (p: Vec, q: Vec, k = 1): Vec => [p[0] + q[0] * k, p[1] + q[1] * k];
const unit = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
};
const dot = (p: Vec, q: Vec) => p[0] * q[0] + p[1] * q[1];

/** A label's box, by its centre and half-sizes, in points. */
interface Box {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}
/** How far a box reaches from its centre in direction `u` (a unit vector). */
const reach = (b: Pick<Box, "hw" | "hh">, u: Vec) => Math.abs(u[0]) * b.hw + Math.abs(u[1]) * b.hh;
const overlaps = (a: Box, b: Box, gap = 1) =>
  Math.abs(a.cx - b.cx) < a.hw + b.hw + gap && Math.abs(a.cy - b.cy) < a.hh + b.hh + gap;

/**
 * A triangle laid out at a scale, in points (y down), with every label
 * placed: side labels just outside their side's midpoint (clear of it by
 * construction, since the triangle lies wholly on its inner side), angle
 * labels inside their arc along the bisector and far enough in to clear both
 * sides, corner names outside the corner. A label that would hit one placed
 * before it moves further out.
 */
function layoutTriangle(spec: TriangleSpec, scale: number) {
  const cs = spec.corners;
  const minX = Math.min(...cs.map((c) => c.x));
  const maxY = Math.max(...cs.map((c) => c.y));
  const P: Vec[] = cs.map((c) => [(c.x - minX) * scale, (maxY - c.y) * scale]);
  const centroid: Vec = [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3];
  const labels: { box: Box; text: string; size: number; answer: boolean; name: boolean }[] = [];
  const boxes = () => labels.map((l) => l.box);
  const box = (text: string, size: number): Pick<Box, "hw" | "hh"> => ({
    hw: letteringWidth(text, size, "math") / 2,
    hh: 0.36 * size,
  });
  // Move a box along `dir` until it clears every label placed so far.
  const clear = (b: Box, dir: Vec): Box => {
    for (let i = 0; i < 60 && boxes().some((o) => overlaps(o, b)); i++) {
      b = { ...b, cx: b.cx + dir[0], cy: b.cy + dir[1] };
    }
    return b;
  };
  const marks: string[] = [];
  const gap = 2;

  // Angles: an arc (or a right-angle square) and the label inside it.
  cs.forEach((c, i) => {
    if (!c.angle && !c.rightAngle) return;
    const p = P[i];
    const q = P[(i + 1) % 3];
    const r = P[(i + 2) % 3];
    const e1 = unit(sub(q, p));
    const e2 = unit(sub(r, p));
    const theta = Math.acos(Math.max(-1, Math.min(1, dot(e1, e2))));
    const shortest = Math.min(Math.hypot(...sub(q, p)), Math.hypot(...sub(r, p)));
    const u = unit(add(e1, e2));
    const half = c.angle?.text ? box(c.angle.text, TRIANGLE_LABEL_PT) : null;
    let radius: number;
    if (c.rightAngle) {
      radius = Math.min(6, shortest * 0.3);
      const a = add(p, e1, radius);
      const b = add(a, e2, radius);
      const d = add(p, e2, radius);
      marks.push(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}L${n(d[0])} ${n(d[1])}`);
      radius *= Math.SQRT2;
    } else {
      radius = Math.min(9, shortest * 0.4);
    }
    let placed: Box | null = null;
    if (half) {
      // Inside, along the bisector, far enough in to clear both sides.
      const n1: Vec = dot([-e1[1], e1[0]], u) > 0 ? [-e1[1], e1[0]] : [e1[1], -e1[0]];
      const n2: Vec = dot([-e2[1], e2[0]], u) > 0 ? [-e2[1], e2[0]] : [e2[1], -e2[0]];
      const sin = Math.sin(theta / 2);
      const t = Math.max(
        radius + gap + reach(half, u),
        (reach(half, n1) + gap) / sin,
        (reach(half, n2) + gap) / sin,
      );
      // ...and of the opposite side, near its own arc, and clear of other labels.
      const oe = unit(sub(r, q));
      let on: Vec = [-oe[1], oe[0]];
      if (dot(on, sub(centroid, q)) < 0) on = [oe[1], -oe[0]];
      const at = add(p, u, t);
      const inside = { cx: at[0], cy: at[1], ...half };
      const moved = clear(inside, u);
      const ok =
        t <= Math.min(40, shortest * 0.7) &&
        Math.hypot(moved.cx - inside.cx, moved.cy - inside.cy) <= 4 &&
        dot(sub([moved.cx, moved.cy], q), on) >= reach(half, on) + gap;
      if (ok) {
        placed = moved;
        // A sharp angle's arc widens to meet its label.
        if (!c.rightAngle) radius = Math.max(radius, Math.min(t - reach(half, u) - gap, shortest * 0.7));
      } else {
        // Too sharp or too crowded: just outside the corner, beside the arc,
        // across whichever side leaves the label more room sideways.
        const sides: [Vec, Vec][] = [
          [e1, [-n1[0], -n1[1]]],
          [e2, [-n2[0], -n2[1]]],
        ];
        const [e, out] = Math.abs(sides[0][1][0]) >= Math.abs(sides[1][1][0]) ? sides[0] : sides[1];
        const o = add(add(p, e, radius + reach(half, e)), out, reach(half, out) + gap);
        placed = clear({ cx: o[0], cy: o[1], ...half }, out);
      }
    }
    if (!c.rightAngle) {
      const a = add(p, e1, radius);
      const b = add(p, e2, radius);
      const sweep = e1[0] * e2[1] - e1[1] * e2[0] > 0 ? 1 : 0;
      marks.push(`M${n(a[0])} ${n(a[1])}A${n(radius)} ${n(radius)} 0 0 ${sweep} ${n(b[0])} ${n(b[1])}`);
    }
    if (!placed || !c.angle) return;
    const b = placed;
    const size = TRIANGLE_LABEL_PT;
    labels.push({ box: b, text: c.angle.text, size, answer: !!c.angle.answer, name: false });
  });

  // Corner names, outside each corner along its bisector.
  cs.forEach((c, i) => {
    if (!c.name) return;
    const p = P[i];
    const u = unit(add(unit(sub(P[(i + 1) % 3], p)), unit(sub(P[(i + 2) % 3], p))));
    const out: Vec = [-u[0], -u[1]];
    const half = box(c.name, TRIANGLE_NAME_PT);
    const at = add(p, out, reach(half, out) + gap + 0.5);
    const b = clear({ cx: at[0], cy: at[1], ...half }, out);
    labels.push({ box: b, text: c.name, size: TRIANGLE_NAME_PT, answer: false, name: true });
  });

  // Side labels, outside the midpoint of the side opposite each corner.
  cs.forEach((c, i) => {
    if (!c.opposite?.text) return;
    const q = P[(i + 1) % 3];
    const r = P[(i + 2) % 3];
    const e = unit(sub(r, q));
    let out: Vec = [-e[1], e[0]];
    if (dot(out, sub(P[i], q)) > 0) out = [e[1], -e[0]];
    const mid: Vec = [(q[0] + r[0]) / 2, (q[1] + r[1]) / 2];
    const half = box(c.opposite.text, TRIANGLE_LABEL_PT);
    const at = add(mid, out, reach(half, out) + gap);
    const b = clear({ cx: at[0], cy: at[1], ...half }, out);
    labels.push({ box: b, text: c.opposite.text, size: TRIANGLE_LABEL_PT, answer: !!c.opposite.answer, name: false });
  });

  const xs = [...P.map((p) => p[0]), ...labels.flatMap((l) => [l.box.cx - l.box.hw, l.box.cx + l.box.hw])];
  const ys = [...P.map((p) => p[1]), ...labels.flatMap((l) => [l.box.cy - l.box.hh, l.box.cy + l.box.hh])];
  return {
    P,
    labels,
    marks,
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
  };
}

function triangleDrawing(spec: TriangleSpec, ink: string): Drawing {
  const cs = spec.corners;
  const w0 = Math.max(...cs.map((c) => c.x)) - Math.min(...cs.map((c) => c.x));
  const h0 = Math.max(...cs.map((c) => c.y)) - Math.min(...cs.map((c) => c.y));
  // The outline's scale depends on its corners alone, so the student's
  // triangle and the answer graph's are drawn the same size; only labels too
  // wide for the column shrink it.
  let scale = Math.min(TRIANGLE_MAX_W / w0, TRIANGLE_MAX_H / h0);
  let lay = layoutTriangle(spec, scale);
  for (let i = 0; i < 4; i++) {
    const over = lay.bounds.maxX - lay.bounds.minX - (PLOT_WIDTH_PT - 4);
    if (over <= 0) break;
    scale *= Math.max(0.2, (w0 * scale - over) / (w0 * scale));
    lay = layoutTriangle(spec, scale);
  }
  const { P, labels, marks, bounds } = lay;
  const margin = 3;
  const width = PLOT_WIDTH_PT;
  const height = bounds.maxY - bounds.minY + 2 * margin;
  const ox = (width - (bounds.maxX - bounds.minX)) / 2 - bounds.minX;
  const oy = margin - bounds.minY;
  const X = (v: number) => n(v + ox);
  const Y = (v: number) => n(v + oy);

  const frame = new Layer();
  const content = new Layer();
  frame.push(
    `<path d='M${X(P[0][0])} ${Y(P[0][1])}L${X(P[1][0])} ${Y(P[1][1])}L${X(P[2][0])} ${Y(P[2][1])}Z' fill='none' stroke='#000' stroke-width='1' stroke-linejoin='round'/>`,
  );
  if (marks.length) {
    // Marks were laid out at the origin; shift them like everything else.
    frame.push(
      `<g transform='translate(${n(ox)} ${n(oy)})'><path d='${marks.join("")}' fill='none' stroke='#000' stroke-width='0.6'/></g>`,
    );
  }
  // Labels sit on their baselines: 0.34 em below the middle of their box.
  const item = (l: (typeof labels)[number]) => ({ x: l.box.cx + ox, y: l.box.cy + oy + 0.34 * l.size, text: l.text });
  for (const size of [TRIANGLE_NAME_PT, TRIANGLE_LABEL_PT]) {
    const ofSize = labels.filter((l) => l.size === size);
    frame.push(frame.letters.group("middle", ofSize.filter((l) => !l.answer).map(item), { size, style: "math" }));
    content.push(
      content.letters.group("middle", ofSize.filter((l) => l.answer).map(item), { size, style: "math", fill: ink }),
    );
  }
  return { width, height, frame, content };
}

function draw(spec: GraphSpec, opts: PlotOptions): Drawing {
  const ink = opts.ink ?? DEFAULT_INK;
  if (spec.kind === "triangle") return triangleDrawing(spec, ink);
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

/**
 * The same graph with nothing drawn on it: only its grid or line, axes and
 * labels; for a triangle, the triangle without its Answer's labels.
 */
export function blankGraph(spec: GraphSpec): GraphSpec {
  if (spec.kind === "triangle") {
    const corners = spec.corners.map((c) => {
      const { angle, opposite, ...rest } = c;
      return {
        ...rest,
        ...(angle && !angle.answer ? { angle } : {}),
        ...(opposite && !opposite.answer ? { opposite } : {}),
      };
    }) as TriangleSpec["corners"];
    return { kind: "triangle", corners };
  }
  if (spec.kind === "plane") {
    const { curves: _c, lines: _l, points: _p, ...frame } = spec;
    return frame;
  }
  const { points: _p, shaded: _s, ...frame } = spec;
  return frame;
}
