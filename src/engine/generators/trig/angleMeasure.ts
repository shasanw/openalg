// "Angles and angle measure": coterminal angles (the one between 0° and 360°,
// or the least positive and greatest negative), the quadrant or axis an
// angle's terminal side lies in, reference angles, and degrees-minutes-seconds
// to and from decimal degrees. Degrees or radians.
//
// Built ANSWER-FROM-CONSTRUCTION: an angle in [0, 2π) is chosen first (it is
// the coterminal Answer, and fixes the location and the reference angle), then
// written turned by whole rotations. A DMS angle is chosen with its seconds a
// multiple of 9 past the degree, so its decimal form is exact; nothing rounds.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { ANSWER_PART_SEPARATOR, gcd, prose } from "../../format";
import { add, decimalString, distinctHints, mul, numLatex, rat, ratEq, sub, type Rat } from "../shared/equationKit";
import {
  angleLatex,
  coterminal,
  coterminalMistakes,
  dmsLatex,
  degreesToDms,
  dmsToDegrees,
  fromDegrees,
  location,
  locationLatex,
  quadrant,
  referenceAngle,
  referenceAngleMistakes,
  roundTo,
  STANDARD_ANGLES,
  type Angle,
  type AngleUnit,
  type Location,
} from "./trigKit";

export const ANGLE_MEASURE_ID = "angle-measure";

export type AngleProblem = "coterminal" | "location" | "reference" | "dms";
export const ANGLE_PROBLEMS: readonly AngleProblem[] = ["coterminal", "location", "reference", "dms"];

export const schema = [
  {
    type: "enum",
    key: "problems",
    label: "Problems",
    default: "mixed",
    options: [
      { value: "coterminal", label: "Coterminal angles" },
      { value: "location", label: "Quadrant or axis of an angle" },
      { value: "reference", label: "Reference angles" },
      { value: "dms", label: "Degrees, minutes and seconds to and from decimal degrees" },
      { value: "mixed", label: "A mix" },
    ],
  },
  {
    type: "enum",
    key: "units",
    label: "Units for non-DMS problems",
    default: "degrees",
    options: [
      { value: "degrees", label: "Degrees" },
      { value: "radians", label: "Radians" },
      { value: "mixed", label: "Both" },
    ],
  },
  {
    type: "enum",
    key: "angles",
    label: "Angles for non-DMS problems",
    default: "any",
    options: [
      { value: "standard", label: "Multiples of 30° and 45° only" },
      { value: "any", label: "Any angle, like 212° or 7π/9" },
    ],
  },
] as const satisfies ParamSchema;

export type AngleMeasureConstruction =
  | { problem: "coterminal"; task: "between" | "pair"; unit: AngleUnit; base: Angle; given: Angle }
  | { problem: "location" | "reference"; unit: AngleUnit; base: Angle; given: Angle }
  | { problem: "dms"; toDecimal: boolean; deg: number; min: number; sec: number };

const QUADRANTAL: readonly Angle[] = [rat(0), rat(1, 2), rat(1), rat(3, 2)];
const RADIAN_DENOMINATORS = [3, 4, 5, 6, 8, 9, 10, 12];

const isQuadrantal = (a: Angle) => quadrant(a) === null;

/** An angle in [0, 2π), never quadrantal. */
function pickBase(rng: Rng, unit: AngleUnit, standard: boolean): Angle {
  if (standard) return rng.pick(STANDARD_ANGLES.filter((a) => !isQuadrantal(a)));
  if (unit === "degrees") {
    for (;;) {
      const deg = rng.int(1, 359);
      if (deg % 90 !== 0) return fromDegrees(deg);
    }
  }
  const d = rng.pick(RADIAN_DENOMINATORS);
  const ks = Array.from({ length: 2 * d - 1 }, (_, i) => i + 1).filter((k) => gcd(k, d) === 1);
  return rat(rng.pick(ks), d);
}

const turned = (a: Angle, turns: number): Angle => add(a, rat(2 * turns));

function pickDms(rng: Rng): AngleMeasureConstruction {
  const deg = rng.int(1, 359);
  const toDecimal = rng.bool();
  if (rng.bool(0.4)) return { problem: "dms", toDecimal, deg, min: 3 * rng.int(1, 19), sec: 0 };
  // A multiple of 1/400 degree is an exact decimal and a whole number of seconds.
  const decimal = add(rat(deg), rat(rng.int(1, 399), 400));
  return { problem: "dms", toDecimal, ...degreesToDms(decimal)! };
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): AngleMeasureConstruction {
  const p = resolveParams(schema, params);
  const problem: AngleProblem = p.problems === "mixed" ? rng.pick(ANGLE_PROBLEMS) : (p.problems as AngleProblem);
  if (problem === "dms") return pickDms(rng);
  const unit: AngleUnit = p.units === "mixed" ? rng.pick(["degrees", "radians"] as const) : (p.units as AngleUnit);
  const standard = p.angles === "standard";
  if (problem === "coterminal") {
    const task = rng.bool() ? "between" : "pair";
    const base = pickBase(rng, unit, standard);
    // "between" must need a turn; a pair may start anywhere
    const turns = task === "between" ? rng.pick([-2, -1, -1, 1, 1, 2]) : rng.int(-2, 2);
    return { problem, task, unit, base, given: turned(base, turns) };
  }
  if (problem === "location") {
    const base = rng.bool(0.15) ? rng.pick(QUADRANTAL) : pickBase(rng, unit, standard);
    const turns = rng.bool(0.25) ? 0 : rng.pick([-2, -1, -1, 1, 1, 2]);
    return { problem, unit, base, given: turned(base, turns) };
  }
  const base = pickBase(rng, unit, standard);
  // an angle already in Quadrant I is its own reference angle: turn it
  const inFirst = quadrant(base) === 1;
  const turns = !inFirst && rng.bool(0.4) ? 0 : rng.pick([-2, -1, -1, 1, 1, 2]);
  return { problem, unit, base, given: turned(base, turns) };
}

/** The decimal degrees of a DMS angle as a Rat (exact by construction). */
export const dmsDecimal = (k: { deg: number; min: number; sec: number }): Rat => dmsToDegrees(k.deg, k.min, k.sec);

const decimalDegreesLatex = (r: Rat): string => `${numLatex(r, "decimal")}^{\\circ}`;
const roundedDegreesLatex = (x: number): string => `${roundTo(x, 4)}^{\\circ}`;

export function promptLatex(k: AngleMeasureConstruction): string {
  if (k.problem === "dms") {
    return k.toDecimal
      ? `${prose("Write in decimal degrees:")} ${dmsLatex(k.deg, k.min, k.sec)}`
      : `${prose("Write in degrees, minutes and seconds:")} ${decimalDegreesLatex(dmsDecimal(k))}`;
  }
  const given = angleLatex(k.given, k.unit);
  if (k.problem === "coterminal") {
    if (k.task === "pair") return `${prose("Find the least positive and the greatest negative angle coterminal with")} ${given}`;
    const full = angleLatex(rat(2), k.unit);
    return `${prose("Find the angle between")} 0${k.unit === "degrees" ? "^{\\circ}" : ""} ${prose("and")} ${full} ${prose("coterminal with")} ${given}`;
  }
  if (k.problem === "location") return `${prose("Where does the terminal side of")} ${given} ${prose("lie?")}`;
  return `${prose("Find the reference angle of")} ${given}`;
}

/** The least positive and greatest negative coterminal angles (in (0, 2π] and [-2π, 0)). */
export function coterminalPair(given: Angle): [Angle, Angle] {
  const c = coterminal(given);
  const positive = c.n === 0 ? rat(2) : c;
  return [positive, sub(c, rat(2))];
}

const pairLatex = (a: Angle, b: Angle, unit: AngleUnit) => `${angleLatex(a, unit)}${ANSWER_PART_SEPARATOR}${angleLatex(b, unit)}`;

export function answerLatex(k: AngleMeasureConstruction): string {
  if (k.problem === "dms") {
    const r = dmsDecimal(k);
    return k.toDecimal ? decimalDegreesLatex(r) : dmsLatex(k.deg, k.min, k.sec);
  }
  if (k.problem === "coterminal") {
    if (k.task === "between") return angleLatex(k.base, k.unit);
    const [pos, negative] = coterminalPair(k.base);
    return pairLatex(pos, negative, k.unit);
  }
  if (k.problem === "location") return locationLatex(location(k.base));
  return angleLatex(referenceAngle(k.base), k.unit);
}

const ALL_LOCATIONS: readonly Location[] = [1, 2, 3, 4, "+x", "+y", "-x", "-y"];

/** Wrong decimal degrees for a DMS angle. */
function toDecimalMistakes(k: { deg: number; min: number; sec: number }): string[] {
  const { deg: d, min: m, sec: s } = k;
  const right = d + m / 60 + s / 3600;
  const truncated = Math.trunc(right * 10) / 10;
  return [
    // the minutes and seconds written as decimal digits: 25° 30' 18'' as 25.3018
    d + m / 100 + s / 10000,
    // seconds over 60, as if they were minutes
    s ? d + m / 60 + s / 60 : null,
    // minutes and seconds swapped
    d + m / 3600 + s / 60,
    // the seconds dropped
    s ? d + m / 60 : null,
    // rounded down to a tenth
    truncated !== right ? truncated : null,
    // single-digit minutes read as tenths: 6' as 0.6
    m < 10 ? d + m / 10 : null,
    d + (m + 1) / 60 + s / 3600,
    d + (m - 1) / 60 + s / 3600,
    // only the whole degrees kept
    d,
  ]
    .filter((x): x is number => x !== null)
    .map(roundedDegreesLatex);
}

const validDms = (m: number, s: number) => Number.isInteger(m) && Number.isInteger(s) && m >= 0 && m < 60 && s >= 0 && s < 60;

/** Wrong DMS forms of an exact decimal angle. */
function toDmsMistakes(k: { deg: number; min: number; sec: number }): string[] {
  const { deg: d, min: m, sec: s } = k;
  const frac = sub(dmsDecimal(k), rat(d));
  const digits = (decimalString(frac) ?? "0").split(".")[1]?.padEnd(4, "0") ?? "0000";
  const leftover = sub(mul(frac, rat(60)), rat(m)); // minutes past the whole minutes
  const hundredths = mul(frac, rat(100));
  const wholeHundredths = Math.floor(hundredths.n / hundredths.d);
  const candidates: [number, number][] = [
    // the decimal digits read as minutes and seconds: 25.505 as 25° 50' 50''
    [Number(digits.slice(0, 2)), Number(digits.slice(2, 4))],
    // the leftover minutes' decimal read as seconds, not multiplied by 60
    [m, (100 * leftover.n) / leftover.d],
    // multiplied by 100 instead of 60 for the minutes
    [wholeHundredths, (60 * (hundredths.n - wholeHundredths * hundredths.d)) / hundredths.d],
    // minutes and seconds swapped
    [s, m],
    // the seconds dropped
    [m, s ? 0 : -1],
    // one minute off
    [m + 1, s],
    [m - 1, s],
    [m, (s + 1) % 60],
    [m, (s + 59) % 60],
  ];
  return candidates.filter(([mm, ss]) => validDms(mm, ss)).map(([mm, ss]) => dmsLatex(d, mm, ss));
}

/**
 * Mistake-based Distractors, most common first.
 * - Coterminal between 0 and a full turn: one turn too few or too many, the
 *   minus sign dropped, a half turn instead of a full one (coterminalMistakes).
 * - Coterminal pair: a half turn apart instead of a full one, the positive one
 *   negated, a turn too many on either, and the slips above.
 * - Location: the minus sign dropped, counted from the wrong axis (a quarter or
 *   half turn off), then the other quadrants and axes.
 * - Reference angle: the angle itself, measured to the y-axis, the wrong side
 *   of the x-axis (referenceAngleMistakes), the angle as given, the complement
 *   and twice the reference angle.
 * - DMS: minutes and seconds written as decimal digits, seconds over 60,
 *   minutes and seconds swapped, seconds dropped; and back: the decimal digits
 *   read as minutes and seconds, the leftover not multiplied by 60.
 */
export function distractors(k: AngleMeasureConstruction): string[] {
  const answer = answerLatex(k);
  if (k.problem === "dms") return distinctHints(answer, k.toDecimal ? toDecimalMistakes(k) : toDmsMistakes(k));
  const { unit, given } = k;
  if (k.problem === "coterminal") {
    if (k.task === "between") return distinctHints(answer, [...coterminalMistakes(given), add(coterminal(given), rat(1, 2))].map((a) => angleLatex(a, unit)));
    const [pos, negative] = coterminalPair(given);
    const pairs: [Angle, Angle][] = [
      [pos, sub(pos, rat(1))],
      [pos, rat(-pos.n, pos.d)],
      [add(pos, rat(2)), negative],
      [pos, sub(negative, rat(2))],
      ...coterminalMistakes(given)
        .filter((m) => !ratEq(coterminal(m), coterminal(pos)))
        .map((m) => coterminalPair(m)),
    ];
    return distinctHints(answer, pairs.map(([a, b]) => pairLatex(a, b, unit)));
  }
  if (k.problem === "location") {
    const locations = [
      location(rat(-given.n, given.d)),
      location(add(given, rat(1, 2))),
      location(sub(given, rat(1, 2))),
      location(add(given, rat(1))),
      ...ALL_LOCATIONS,
    ];
    // a quadrantal angle's wrong answers are the other axes first
    const ordered = isQuadrantal(given)
      ? [...locations.filter((l) => typeof l === "string"), ...locations]
      : [...locations.filter((l) => typeof l === "number"), ...locations];
    return distinctHints(answer, ordered.map(locationLatex));
  }
  const ref = referenceAngle(given);
  const wrong = [
    ...referenceAngleMistakes(given),
    // the angle as given, turns and all
    given,
    // the complement (the angle to the y-axis, measured the other way)
    sub(rat(1, 2), ref),
    // twice the reference angle
    mul(ref, rat(2)),
    sub(rat(1), ref),
    rat(-ref.n, ref.d),
  ];
  return distinctHints(answer, wrong.map((a) => angleLatex(a, unit)));
}

export const generator: Generator = {
  id: ANGLE_MEASURE_ID,
  title: "Angles and angle measure",
  defaultDirections: "Answer each question about the angle.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: ANGLE_MEASURE_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
