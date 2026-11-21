// "Right-triangle trig: finding angles and sides": a missing side from an
// acute angle and a side (to the nearest tenth), a missing angle from two
// sides with inverse trig (to the nearest tenth of a degree), solving the
// whole triangle (every missing angle and side, a multi-part Answer), and
// short word problems (angles of elevation and depression, ladders, ramps).
//
// Built ANSWER-FIRST, then checked the way a student works it:
// - a side: the angle (whole degrees) and a target for the Answer are chosen,
//   the given side is derived from them and rounded to a whole number, and
//   the Answer is then recomputed from the ROUNDED given (x = g·sin θ, g/cos θ,
//   ...), exactly as a student's calculator would;
// - an angle: a target angle and one whole side are chosen, the other side is
//   derived and rounded, and the Answer is the inverse trig of those whole
//   sides;
// - a whole triangle: one of the two, plus the remaining parts the same way.
// A draw whose Answer sits near a rounding boundary (roundsCleanly), or whose
// parts would round differently by another sound route (the third side by
// the Pythagorean theorem from a rounded side, the second angle from a rounded
// side), is redrawn, so a student's answer and the key cannot disagree.
//
// Each diagram is drawn to scale from its givens (legs along the axes), so
// the triangle never contradicts its labels. The student's triangle is the
// question: the givens, the right-angle mark and the unknown marked "x", "θ",
// a side's letter or "?"; the answer graph replaces only those marks with
// the Answer's values. Word problems have no diagram.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { ANSWER_PART_SEPARATOR, prose } from "../../format";
import type { TriangleCorner, TriangleLabel, TriangleSpec } from "../../plot";
import { distinctHints } from "../shared/equationKit";
import {
  decimalLatex,
  degreeText,
  rightTriangleCorners,
  roundsCleanly,
  roundTo,
  truncateTo,
  type RightSide,
} from "./trigKit";

export const RIGHT_TRIANGLE_SOLVING_ID = "right-triangle-solving";

export type ProblemSet = "sides" | "angles" | "mixed" | "solve" | "words" | "everything";

export const schema = [
  {
    type: "enum",
    key: "problems",
    label: "Problems",
    default: "mixed",
    options: [
      { value: "sides", label: "Find a missing side" },
      { value: "angles", label: "Find a missing angle" },
      { value: "mixed", label: "A mix of sides and angles" },
      { value: "solve", label: "Solve the whole triangle" },
      { value: "words", label: "Word problems (elevation, depression, ladders)" },
      { value: "everything", label: "A mix of all of these" },
    ],
  },
  {
    type: "boolean",
    key: "divide",
    label: "Include sides found by dividing (x in the denominator)",
    default: true,
  },
  {
    type: "int",
    key: "maxSide",
    label: "Largest given side",
    min: 10,
    max: 100,
    default: 30,
  },
] as const satisfies ParamSchema;

const RAD = Math.PI / 180;
const ROLES: readonly RightSide[] = ["opp", "adj", "hyp"];

/** sin θ, cos θ or 1: a side's length over the hypotenuse, by its role from θ (θ in degrees). */
function share(role: RightSide, thetaDeg: number, radiansMode = false): number {
  const t = radiansMode ? thetaDeg : thetaDeg * RAD;
  return role === "opp" ? Math.sin(t) : role === "adj" ? Math.cos(t) : 1;
}

/** The unknown side from the given one: g · share(unknown) / share(given). */
export const sideFrom = (thetaDeg: number, given: RightSide, g: number, unknown: RightSide, radiansMode = false): number =>
  (g * share(unknown, thetaDeg, radiansMode)) / share(given, thetaDeg, radiansMode);

/** Whether a student finds this side by dividing: x is in the denominator of the trig ratio. */
export const dividing = (given: RightSide, unknown: RightSide): boolean =>
  unknown === "hyp" || (given === "opp" && unknown === "adj");

/** θ in degrees from two sides, by their roles (the inverse sine, cosine or tangent). */
export function angleFrom(sides: Partial<Record<RightSide, number>>, radiansMode = false): number {
  const { opp, adj, hyp } = sides;
  const t =
    opp !== undefined && hyp !== undefined
      ? Math.asin(opp / hyp)
      : adj !== undefined && hyp !== undefined
        ? Math.acos(adj / hyp)
        : Math.atan(opp! / adj!);
  return radiansMode ? t : t / RAD;
}

/** All three sides from two (Pythagorean theorem). */
function completeSides(sides: Partial<Record<RightSide, number>>): Record<RightSide, number> {
  const { opp, adj, hyp } = sides;
  if (hyp === undefined) return { opp: opp!, adj: adj!, hyp: Math.hypot(opp!, adj!) };
  if (opp === undefined) return { opp: Math.sqrt(hyp * hyp - adj! * adj!), adj: adj!, hyp };
  return { opp, adj: Math.sqrt(hyp * hyp - opp * opp), hyp };
}

// ------------------------------------------------------------------ word problems

/**
 * A word problem: what is given and asked, by role from the angle the story
 * names (the ladder's angle with the ground, the angle of elevation, the
 * angle of depression, which equals the angle of elevation from the bottom).
 */
export interface Scenario {
  id: string;
  /** The given side(s); for a side problem, `asks` is the side asked for. */
  given: RightSide[];
  asks: RightSide | "angle";
  /** Angle range in whole degrees, and the given sides' range. */
  angle: [number, number];
  length: [number, number];
  unit: "ft" | "m";
  /** The prose, with the angle (degrees) and given lengths in the `given` order. */
  text(angle: string, lengths: number[]): string;
}

const deg = (a: string) => `${a}^{\\circ}`;

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "ladder-height",
    given: ["hyp"],
    asks: "opp",
    angle: [55, 80],
    length: [10, 30],
    unit: "ft",
    text: (a, [l]) =>
      `${prose(`A ${l}-foot ladder leans against a wall, making an angle of`)} ${deg(a)} ${prose("with the ground. How high up the wall does the ladder reach?")}`,
  },
  {
    id: "ladder-foot",
    given: ["hyp"],
    asks: "adj",
    angle: [55, 80],
    length: [10, 30],
    unit: "ft",
    text: (a, [l]) =>
      `${prose(`A ${l}-foot ladder leans against a wall, making an angle of`)} ${deg(a)} ${prose("with the ground. How far is the foot of the ladder from the wall?")}`,
  },
  {
    id: "kite",
    given: ["hyp"],
    asks: "opp",
    angle: [30, 70],
    length: [20, 100],
    unit: "m",
    text: (a, [l]) =>
      `${prose(`A kite flies on a straight string ${l} meters long that makes an angle of`)} ${deg(a)} ${prose("with the ground. How high is the kite?")}`,
  },
  {
    id: "shadow",
    given: ["adj"],
    asks: "opp",
    angle: [25, 65],
    length: [5, 40],
    unit: "m",
    text: (a, [s]) =>
      `${prose(`A tree casts a shadow ${s} meters long when the angle of elevation of the sun is`)} ${deg(a)}${prose(". How tall is the tree?")}`,
  },
  {
    id: "lighthouse",
    given: ["opp"],
    asks: "adj",
    angle: [10, 40],
    length: [10, 60],
    unit: "m",
    text: (a, [h]) =>
      `${prose(`From the top of a lighthouse ${h} meters tall, the angle of depression to a boat is`)} ${deg(a)}${prose(". How far is the boat from the base of the lighthouse?")}`,
  },
  {
    id: "ramp",
    given: ["opp"],
    asks: "hyp",
    angle: [6, 20],
    length: [2, 8],
    unit: "ft",
    text: (a, [h]) =>
      `${prose(`A ramp rises ${h} feet and makes an angle of`)} ${deg(a)} ${prose("with the ground. How long is the ramp?")}`,
  },
  {
    id: "guy-wire",
    given: ["opp"],
    asks: "hyp",
    angle: [40, 70],
    length: [10, 40],
    unit: "ft",
    text: (a, [h]) =>
      `${prose(`A wire runs from the top of a pole ${h} feet tall to the ground, making an angle of`)} ${deg(a)} ${prose("with the ground. How long is the wire?")}`,
  },
  {
    id: "ladder-angle",
    given: ["hyp", "opp"],
    asks: "angle",
    angle: [55, 80],
    length: [10, 30],
    unit: "ft",
    text: (_, [l, h]) =>
      prose(`A ${l}-foot ladder leans against a wall and reaches ${h} feet up the wall. What angle does the ladder make with the ground?`),
  },
  {
    id: "flagpole-sun",
    given: ["opp", "adj"],
    asks: "angle",
    angle: [20, 70],
    length: [5, 40],
    unit: "m",
    text: (_, [h, s]) =>
      prose(`A flagpole ${h} meters tall casts a shadow ${s} meters long. What is the angle of elevation of the sun?`),
  },
  {
    id: "cliff-boat",
    given: ["opp", "adj"],
    asks: "angle",
    angle: [10, 45],
    length: [10, 80],
    unit: "m",
    text: (_, [h, d]) =>
      prose(`From the top of a cliff ${h} meters high, a boat is seen ${d} meters from the base of the cliff. What is the angle of depression to the boat?`),
  },
  {
    id: "ramp-angle",
    given: ["hyp", "opp"],
    asks: "angle",
    angle: [6, 20],
    length: [10, 30],
    unit: "ft",
    text: (_, [l, h]) => prose(`A ramp ${l} feet long rises ${h} feet. What angle does the ramp make with the ground?`),
  },
];

// ------------------------------------------------------------------ construction

/** How a diagram is drawn: where θ sits (end of the horizontal leg, or top of the vertical) and whether it is mirrored. */
export interface Layout {
  thetaAt: "run" | "rise";
  flip: boolean;
}

/** Given one whole-degree angle θ and one whole side: find another side. */
export interface SideProblem {
  form: "side";
  theta: number;
  given: RightSide;
  g: number;
  unknown: RightSide;
}

/** Given two whole sides: find θ. */
export interface AngleProblem {
  form: "angle";
  sides: Partial<Record<RightSide, number>>;
}

/** The construction, exposed for property tests. */
export type SolvingConstruction =
  | ((SideProblem | AngleProblem) & { layout: Layout; scenario: Scenario | null })
  | {
      form: "solve";
      layout: Layout;
      /** The corner named A is θ's (otherwise B is). */
      thetaIsA: boolean;
      given: SideProblem | AngleProblem;
    };

/** The angle range for diagrams, in whole degrees: no sliver too thin to label. */
const DIAGRAM_ANGLE: [number, number] = [20, 70];
/** Angles found to the tenth stay in this range. */
const FOUND_ANGLE: [number, number] = [15, 75];

/** A random tenth in [lo, hi], or NaN when there is none. */
function tenth(rng: Rng, lo: number, hi: number): number {
  const [a, b] = [Math.ceil(lo * 10), Math.floor(hi * 10)];
  return a <= b ? rng.int(a, b) / 10 : NaN;
}

/** A side problem, answer first: θ, then the Answer, then the whole given side; null when this draw fails. */
function drawSide(
  rng: Rng,
  pairs: [RightSide, RightSide][],
  angle: [number, number],
  length: [number, number],
): SideProblem | null {
  const theta = rng.int(angle[0], angle[1]);
  const [given, unknown] = rng.pick(pairs);
  const f = sideFrom(theta, given, 1, unknown);
  const x0 = tenth(rng, Math.max(1, length[0] * f), length[1] * f);
  const g = Math.round(x0 / f);
  if (!(g >= length[0] && g <= length[1])) return null;
  const x = sideFrom(theta, given, g, unknown);
  if (!roundsCleanly(x, 1) || roundTo(x, 1) <= 0) return null;
  return { form: "side", theta, given, g, unknown };
}

/** An angle problem, answer first: a target θ and one whole side, the other derived and rounded; null when it fails. */
function drawAngle(
  rng: Rng,
  given: [RightSide, RightSide],
  angle: [number, number],
  length: [number, number],
): AngleProblem | null {
  const t0 = tenth(rng, angle[0], angle[1]);
  // The first given is drawn, the second derived from it: the hypotenuse
  // first (so the leg derived from it is shorter), two legs either way round.
  const [first, second] = given.includes("hyp")
    ? ([given.find((r) => r === "hyp")!, given.find((r) => r !== "hyp")!] as const)
    : rng.bool()
      ? given
      : ([given[1], given[0]] as const);
  const s1 = rng.int(length[0], length[1]);
  const s2 = Math.round(sideFrom(t0, first, s1, second));
  if (!(s2 >= 1 && s2 <= length[1])) return null;
  const sides = { [first]: s1, [second]: s2 } as Partial<Record<RightSide, number>>;
  if (sides.hyp !== undefined && (sides.opp ?? sides.adj)! >= sides.hyp) return null;
  // two equal legs make a 45° angle that every slip leaves unchanged
  if (sides.opp !== undefined && sides.opp === sides.adj) return null;
  const theta = angleFrom(sides);
  if (!(theta >= angle[0] && theta <= angle[1]) || !roundsCleanly(theta, 1)) return null;
  // a whole number of degrees would make rounding to the whole degree no slip at all
  if (Number.isInteger(roundTo(theta, 1))) return null;
  return { form: "angle", sides };
}

const SIDE_PAIRS: [RightSide, RightSide][] = ROLES.flatMap((g) =>
  ROLES.filter((u) => u !== g).map((u): [RightSide, RightSide] => [g, u]),
);
const ANGLE_PAIRS: [RightSide, RightSide][] = [
  ["opp", "hyp"],
  ["adj", "hyp"],
  ["opp", "adj"],
];

/** The parts a solved triangle reports, by role from θ: the other acute angle and the sides not given. */
export interface Solution {
  /** θ and the other acute angle, in degrees. */
  theta: number;
  other: number;
  sides: Record<RightSide, number>;
}

/** Every part of the triangle from its givens, computed the way a student would. */
export function solve(given: SideProblem | AngleProblem): Solution {
  if (given.form === "side") {
    const sides = Object.fromEntries(
      ROLES.map((r) => [r, r === given.given ? given.g : sideFrom(given.theta, given.given, given.g, r)]),
    ) as Record<RightSide, number>;
    return { theta: given.theta, other: 90 - given.theta, sides };
  }
  const theta = angleFrom(given.sides);
  return { theta, other: 90 - theta, sides: completeSides(given.sides) };
}

/**
 * Whether every reported part of a whole triangle rounds cleanly and agrees
 * with the other sound routes to it: the last side by the Pythagorean theorem
 * from the other side rounded, the second angle by inverse trig from a
 * rounded side.
 */
function solvesCleanly(given: SideProblem | AngleProblem): boolean {
  const s = solve(given);
  const unknownSides = ROLES.filter((r) => (given.form === "side" ? r !== given.given : given.sides[r] === undefined));
  if (!unknownSides.every((r) => roundsCleanly(s.sides[r], 1))) return false;
  const known = (r: RightSide) => (unknownSides.includes(r) ? roundTo(s.sides[r], 1) : s.sides[r]);
  for (const r of unknownSides) {
    // r from the two others (one of them perhaps rounded)
    const others = ROLES.filter((o) => o !== r);
    const alt = completeSides(Object.fromEntries(others.map((o) => [o, known(o)])))[r];
    if (!(alt > 0) || roundTo(alt, 1) !== roundTo(s.sides[r], 1)) return false;
  }
  if (given.form === "angle") {
    if (!roundsCleanly(s.theta, 1)) return false;
    for (const pair of ANGLE_PAIRS) {
      const alt = angleFrom({ [pair[0]]: known(pair[0]), [pair[1]]: known(pair[1]) });
      if (roundTo(alt, 1) !== roundTo(s.theta, 1)) return false;
    }
  }
  return true;
}

export function construct(params: ParamValues, rng: Rng): SolvingConstruction {
  const p = resolveParams(schema, params);
  const maxSide = p.maxSide as number;
  const divide = p.divide as boolean;
  const set = p.problems as ProblemSet;
  const kind =
    set === "mixed"
      ? rng.pick(["side", "angle"] as const)
      : set === "everything"
        ? rng.pick(["side", "angle", "solve", "word"] as const)
        : ({ sides: "side", angles: "angle", solve: "solve", words: "word" } as const)[set];
  const layout: Layout = { thetaAt: rng.bool() ? "run" : "rise", flip: rng.bool() };
  const sidePairs = SIDE_PAIRS.filter(([g, u]) => divide || !dividing(g, u));
  const lengths: [number, number] = [3, maxSide];
  for (;;) {
    if (kind === "side") {
      const k = drawSide(rng, sidePairs, DIAGRAM_ANGLE, lengths);
      if (k) return { ...k, layout, scenario: null };
    } else if (kind === "angle") {
      const k = drawAngle(rng, rng.pick(ANGLE_PAIRS), FOUND_ANGLE, lengths);
      if (k) return { ...k, layout, scenario: null };
    } else if (kind === "solve") {
      // A side and an angle given (only the hypotenuse when dividing is off), or two sides.
      const k = rng.bool()
        ? drawSide(rng, divide ? SIDE_PAIRS : [["hyp", "opp"]], DIAGRAM_ANGLE, lengths)
        : drawAngle(rng, rng.pick(ANGLE_PAIRS), FOUND_ANGLE, lengths);
      if (k && solvesCleanly(k)) return { form: "solve", layout, thetaIsA: rng.bool(), given: k };
    } else {
      const scenarios = SCENARIOS.filter((s) => divide || s.asks === "angle" || !dividing(s.given[0], s.asks));
      const s = rng.pick(scenarios);
      const length: [number, number] = [Math.min(s.length[0], maxSide), Math.min(s.length[1], maxSide)];
      const k =
        s.asks === "angle"
          ? drawAngle(rng, s.given as [RightSide, RightSide], s.angle, length)
          : drawSide(rng, [[s.given[0], s.asks]], s.angle, length);
      if (k) return { ...k, layout, scenario: s };
    }
  }
}

// ------------------------------------------------------------------ printing

const SEP = ANSWER_PART_SEPARATOR;
const sideLatex = (x: number) => decimalLatex(x, 1);
const angleLatex = (a: number) => `${decimalLatex(a, 1)}^{\\circ}`;

/** Corner and side names in a "solve" problem: θ's corner is A or B, the right angle C. */
function names(thetaIsA: boolean): { theta: string; other: string; side: Record<RightSide, string> } {
  const [t, o] = thetaIsA ? ["A", "B"] : ["B", "A"];
  return { theta: t, other: o, side: { opp: t.toLowerCase(), adj: o.toLowerCase(), hyp: "c" } };
}

/** The parts a "solve" Answer reports, with the values a (possibly mistaken) solution gives. */
function solveLatex(k: Extract<SolvingConstruction, { form: "solve" }>, s: Solution): string {
  const n = names(k.thetaIsA);
  const parts: { name: string; tex: string }[] = [];
  if (k.given.form === "side") {
    parts.push({ name: n.other, tex: `${n.other} = ${angleLatex(s.other)}` });
  } else {
    parts.push({ name: n.theta, tex: `${n.theta} \\approx ${angleLatex(s.theta)}` });
    parts.push({ name: n.other, tex: `${n.other} \\approx ${angleLatex(s.other)}` });
  }
  for (const r of ROLES) {
    const isGiven = k.given.form === "side" ? r === k.given.given : k.given.sides[r] !== undefined;
    if (isGiven) continue;
    const v = s.sides[r];
    const exact = k.given.form === "angle" && Number.isInteger(v);
    parts.push({ name: n.side[r], tex: `${n.side[r]} ${exact ? "=" : "\\approx"} ${exact ? v : sideLatex(v)}` });
  }
  // Angles (capitals) first, then sides, each alphabetical.
  parts.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  return parts.map((p) => p.tex).join(SEP);
}

/** The Answer's value(s) for a side or angle problem, as printed (units for a word problem). */
function valueLatex(k: Exclude<SolvingConstruction, { form: "solve" }>, v: number): string {
  if (k.scenario) return k.form === "side" ? `${sideLatex(v)} \\text{ ${k.scenario.unit}}` : angleLatex(v);
  return k.form === "side" ? `x \\approx ${sideLatex(v)}` : `\\theta \\approx ${angleLatex(v)}`;
}

export function answerLatex(k: SolvingConstruction): string {
  if (k.form === "solve") return solveLatex(k, solve(k.given));
  return valueLatex(k, k.form === "side" ? sideFrom(k.theta, k.given, k.g, k.unknown) : angleFrom(k.sides));
}

export function promptLatex(k: SolvingConstruction): string {
  if (k.form === "solve") return prose("Solve the triangle.");
  if (k.scenario) {
    const lengths = k.form === "side" ? [k.g] : k.scenario.given.map((r) => k.sides[r]!);
    return k.scenario.text(k.form === "side" ? String(k.theta) : "", lengths);
  }
  return `${prose("Find")} ${k.form === "side" ? "x" : "\\theta"}`;
}

// ------------------------------------------------------------------ mistakes

/**
 * Wrong values for a side, most common first: sin and cos swapped (the
 * complement angle, or opposite and adjacent mixed up; for tan, its
 * reciprocal), multiplied where it should divide (or the reverse), the
 * calculator in radians mode, a wrong ratio (the hypotenuse's sin or cos
 * where tan was needed, and the reverse), and the right value truncated or
 * rounded to a whole number.
 */
export function sideMistakes(p: SideProblem): number[] {
  const { theta, given, g, unknown } = p;
  const x = sideFrom(theta, given, g, unknown);
  const f = x / g;
  const swapped = sideFrom(90 - theta, given, g, unknown);
  const s = Math.sin(theta * RAD);
  const c = Math.cos(theta * RAD);
  const t = Math.tan(theta * RAD);
  return [
    swapped,
    g / f,
    sideFrom(theta, given, g, unknown, true),
    ...[s, c, t].flatMap((r) => [g * r, g / r]),
    truncateTo(x, 1),
    Math.round(x),
    // the wrong special triangle: a 45° angle read as 30-60-90 (legs g, g√3; hypotenuse 2g),
    // a 30° or 60° angle as 45-45-90 (hypotenuse g√2)
    ...(theta === 45 ? [g * Math.sqrt(3), g / Math.sqrt(3), 2 * g, g / 2] : theta === 30 || theta === 60 ? [g * Math.SQRT2, g / Math.SQRT2] : []),
    // the trig value rounded to two places before multiplying or dividing
    ...[s, c, t].flatMap((r) => [g * (Math.round(r * 100) / 100), g / (Math.round(r * 100) / 100)]),
    // solved for the third side instead of the one asked for
    sideFrom(theta, given, g, ROLES.find((r) => r !== given && r !== unknown)!),
  ];
}

/**
 * Wrong values for an angle, most common first: the other acute angle (the
 * wrong inverse, or the ratio upside down), another inverse of the same
 * ratio, the calculator in radians mode, and the right value truncated or
 * rounded to a whole number.
 */
export function angleMistakes(p: AngleProblem): number[] {
  const theta = angleFrom(p.sides);
  const [a, b] = Object.values(p.sides) as number[];
  const r = Math.min(a, b) / Math.max(a, b);
  // the ratio the student writes (by roles) and the inverse function that undoes it
  const { opp, adj, hyp } = p.sides;
  const [ratio, inverse] =
    opp !== undefined && hyp !== undefined
      ? ([opp / hyp, Math.asin] as const)
      : adj !== undefined && hyp !== undefined
        ? ([adj / hyp, Math.acos] as const)
        : ([opp! / adj!, Math.atan] as const);
  return [
    90 - theta,
    ...[Math.asin(r), Math.acos(r), Math.atan(r), Math.atan(1 / r)].map((v) => v / RAD),
    angleFrom(p.sides, true),
    truncateTo(theta, 1),
    Math.round(theta),
    // forgot the inverse: the ratio itself (or its reciprocal) given as the angle
    ratio,
    1 / ratio,
    // the ratio rounded to two places before taking the inverse
    inverse(Math.round(ratio * 100) / 100) / RAD,
  ];
}

/** Whole-triangle Answers with one slip each (see distractors). */
function solveMistakes(k: Extract<SolvingConstruction, { form: "solve" }>): string[] {
  const s = solve(k.given);
  const out: Solution[] = [];
  /** later mistakes, after the ones above so their order is kept */
  const later: Solution[] = [];
  const truncated: Solution = {
    theta: truncateTo(s.theta, 1),
    other: truncateTo(s.other, 1),
    sides: { opp: truncateTo(s.sides.opp, 1), adj: truncateTo(s.sides.adj, 1), hyp: truncateTo(s.sides.hyp, 1) },
  };
  if (k.given.form === "side") {
    const { theta, given, g } = k.given;
    const sides = (fn: (r: RightSide) => number) =>
      Object.fromEntries(ROLES.map((r) => [r, r === given ? g : fn(r)])) as Record<RightSide, number>;
    out.push({ ...s, sides: sides((r) => sideFrom(90 - theta, given, g, r)) });
    out.push({ ...s, other: 180 - theta });
    out.push({ ...s, sides: sides((r) => (g * g) / s.sides[r]) });
    out.push({ ...s, sides: sides((r) => sideFrom(theta, given, g, r, true)) });
    // one side wrong in the ways a single side goes wrong, the rest right
    for (const r of ROLES) {
      if (r === given) continue;
      for (const v of sideMistakes({ form: "side", theta, given, g, unknown: r }).filter((x) => roundTo(x, 1) > 0 && x < 1e4)) later.push({ ...s, sides: { ...s.sides, [r]: v } });
    }
  } else {
    const sides = k.given.sides;
    out.push({ ...s, theta: s.other, other: s.theta });
    const missing = ROLES.find((r) => sides[r] === undefined)!;
    const [u, v] = Object.values(sides) as number[];
    const wrong = missing === "hyp" ? Math.sqrt(Math.abs(u * u - v * v)) : Math.hypot(u, v);
    if (wrong > 0) out.push({ ...s, sides: { ...s.sides, [missing]: wrong } });
    out.push({ ...s, other: 180 - s.theta });
    const rad = angleFrom(sides, true);
    out.push({ ...s, theta: rad, other: 90 - rad });
    // the angle wrong in the ways an angle goes wrong, the other angle taken from it
    for (const v of angleMistakes({ form: "angle", sides }).filter((x) => roundTo(x, 1) > 0 && x < 180)) later.push({ ...s, theta: v, other: 90 - v });
  }
  out.push(truncated, ...later);
  return out.filter((m) => [m.theta, m.other, ...Object.values(m.sides)].every((v) => v > 0 && Number.isFinite(v))).map((m) => solveLatex(k, m));
}

/** Mistake-based Distractors: the slips above, printed like the Answer, distinct and never the Answer. */
export function distractors(k: SolvingConstruction): string[] {
  if (k.form === "solve") return distinctHints(answerLatex(k), solveMistakes(k)).slice(0, 8);
  const values = k.form === "side" ? sideMistakes(k) : angleMistakes(k);
  return distinctHints(
    answerLatex(k),
    values.filter((v) => Number.isFinite(v) && roundTo(v, 1) > 0 && v < 1e4).map((v) => valueLatex(k, v)),
  );
}

// ------------------------------------------------------------------ the diagram

/**
 * The triangle drawn to scale from its givens, legs along the axes. Labels
 * per role from θ: the givens as printed, the unknown marked ("x" and "θ";
 * in a whole triangle, the corners named A, B, C, missing sides by their
 * letter and the missing angles "?"), or, on the answer graph, the unknown's
 * value marked `answer`.
 */
export function graphOf(k: SolvingConstruction, answered: boolean): TriangleSpec {
  const given = k.form === "solve" ? k.given : k;
  const s = solve(given);
  const named = k.form === "solve" ? names(k.thetaIsA) : null;
  const isGivenSide = (r: RightSide) => (given.form === "side" ? r === given.given : given.sides[r] !== undefined);
  const mark = (unknownText: string, value: string): TriangleLabel =>
    answered ? { text: value, answer: true } : { text: unknownText };
  const sideLabel = (r: RightSide): TriangleLabel | undefined => {
    if (isGivenSide(r)) return { text: String(s.sides[r]) };
    const exact = Number.isInteger(s.sides[r]) && given.form === "angle";
    const value = exact ? String(s.sides[r]) : decimalLatex(s.sides[r], 1);
    if (named) return mark(named.side[r], value);
    if (given.form === "side" && r === given.unknown) return mark("x", value);
    return undefined;
  };
  let thetaLabel: TriangleLabel;
  let otherLabel: TriangleLabel | undefined;
  if (given.form === "side") {
    thetaLabel = { text: `${given.theta}°` };
    otherLabel = named ? mark("?", `${s.other}°`) : undefined;
  } else {
    thetaLabel = mark(named ? "?" : "θ", degreeText(s.theta));
    otherLabel = named ? mark("?", degreeText(s.other)) : undefined;
  }
  const { opp, adj } = s.sides;
  const [run, rise] = k.layout.thetaAt === "run" ? [adj, opp] : [opp, adj];
  const [R, H, V] = rightTriangleCorners(run, rise, k.layout.flip);
  const at = (corner: "run" | "rise") => (k.layout.thetaAt === corner ? "theta" : "other");
  const corner = (which: "theta" | "other") => ({
    ...(named ? { name: which === "theta" ? named.theta : named.other } : {}),
    ...(which === "theta" ? { angle: thetaLabel } : otherLabel ? { angle: otherLabel } : {}),
    // the side opposite θ is "opp"; opposite the other acute angle, "adj"
    ...((l) => (l ? { opposite: l } : {}))(sideLabel(which === "theta" ? "opp" : "adj")),
  });
  const hyp = sideLabel("hyp");
  const corners: [TriangleCorner, TriangleCorner, TriangleCorner] = [
    { ...R, ...(named ? { name: "C" } : {}), rightAngle: true, ...(hyp ? { opposite: hyp } : {}) },
    { ...H, ...corner(at("run")) },
    { ...V, ...corner(at("rise")) },
  ];
  return { kind: "triangle", corners };
}

export const generator: Generator = {
  id: RIGHT_TRIANGLE_SOLVING_ID,
  title: "Right-triangle trig: finding angles and sides",
  defaultDirections:
    "Find each missing side or angle. Round sides to the nearest tenth and angles to the nearest tenth of a degree.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    const diagram = k.form === "solve" || !k.scenario;
    return {
      kind: "generated",
      generatorId: RIGHT_TRIANGLE_SOLVING_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
      ...(diagram ? { graph: graphOf(k, false), answerGraph: graphOf(k, true) } : {}),
    };
  },
};
