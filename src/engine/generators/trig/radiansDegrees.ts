// "Radians and degrees": convert a degree measure to radians as an exact
// multiple of π (150° = 5π/6), a radian measure to degrees (7π/4 = 315°), and
// optionally a radian measure without π to degrees rounded to the nearest
// tenth (2.5 radians ≈ 143.2°).
//
// Built ANSWER-FROM-CONSTRUCTION: the angle is chosen as an exact multiple of
// π (a multiple of 5°, 15°, or a standard angle), and both measures are
// printed from it. For rounded conversions, choose the answer in tenths of a degree
// and write its radian measure to four places.

import { createRng, type Rng } from "../../rng";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { prose } from "../../format";
import { distinctHints, rat } from "../shared/equationKit";
import {
  degreeLatex,
  degreesToRadiansMistakes,
  fromDegrees,
  radianLatex,
  radiansToDegreesMistakes,
  roundedDegreesLatex,
  roundTo,
  STANDARD_ANGLES,
  toDegrees,
  type Angle,
} from "./trigKit";

export const RADIANS_DEGREES_ID = "radians-degrees";

export const schema = [
  {
    type: "enum",
    key: "direction",
    label: "Convert",
    default: "both",
    options: [
      { value: "toRadians", label: "Degrees to radians" },
      { value: "toDegrees", label: "Radians to degrees" },
      { value: "both", label: "Both ways" },
    ],
  },
  {
    type: "enum",
    key: "angles",
    label: "Angles",
    default: "15",
    options: [
      { value: "standard", label: "Multiples of 30° and 45°" },
      { value: "15", label: "Multiples of 15°" },
      { value: "5", label: "Multiples of 5°" },
    ],
  },
  {
    type: "boolean",
    key: "wide",
    label: "Include negative angles and angles past a full turn",
    default: true,
  },
  {
    type: "boolean",
    key: "nonPi",
    label: "Include radian measures without π, like 2.5 radians (degrees to the nearest tenth)",
    default: false,
  },
] as const satisfies ParamSchema;

export type RadiansDegreesConstruction =
  | { kind: "exact"; toRadians: boolean; a: Angle }
  | { kind: "decimal"; radians: number; degrees: number };

/** A whole number of degrees in (0°, 360°] of the kind asked for. */
function pickDegrees(rng: Rng, angles: string): number {
  if (angles === "standard") {
    const degs = STANDARD_ANGLES.map((a) => toDegrees(a).n).filter((d) => d > 0);
    return rng.pick([...degs, 360]);
  }
  if (angles === "15") return 15 * rng.int(1, 24);
  // multiples of 5° that are not also multiples of 15° most of the time
  for (;;) {
    const d = 5 * rng.int(1, 72);
    if (d % 15 !== 0 || rng.bool(0.3)) return d;
  }
}

/** The degrees after making it negative or turning it past a full turn, sometimes. */
function widen(rng: Rng, deg: number): number {
  const roll = rng.next();
  if (roll < 0.35) return -deg;
  if (roll < 0.6) return deg + 360;
  return deg;
}

// Four decimal places of radians introduce less than 0.003° of error,
// so the printed input always rounds back to the selected tenth of a degree.
function pickDecimal(rng: Rng, wide: boolean): RadiansDegreesConstruction {
  const degrees = rng.int(10, wide ? 7200 : 3599) / 10 * (wide && rng.bool() ? -1 : 1);
  return { kind: "decimal", degrees, radians: roundTo(degrees * Math.PI / 180, 4) };
}

/** Pure construction from params + an RNG. */
export function construct(params: ParamValues, rng: Rng): RadiansDegreesConstruction {
  const p = resolveParams(schema, params);
  const toRadians = p.direction === "both" ? rng.bool() : p.direction === "toRadians";
  if (!toRadians && p.nonPi && rng.bool(0.4)) return pickDecimal(rng, p.wide as boolean);
  const base = pickDegrees(rng, p.angles as string);
  const deg = p.wide ? widen(rng, base) : base;
  return { kind: "exact", toRadians, a: fromDegrees(deg) };
}

const radiansText = (r: number) => `${r} ${prose("radians")}`;
const degreesOf = (r: number) => (r * 180) / Math.PI;

export function promptLatex(k: RadiansDegreesConstruction): string {
  if (k.kind === "decimal") return radiansText(k.radians);
  return k.toRadians ? degreeLatex(k.a) : radianLatex(k.a);
}

export function answerLatex(k: RadiansDegreesConstruction): string {
  if (k.kind === "decimal") return roundedDegreesLatex(k.degrees, 1);
  return k.toRadians ? radianLatex(k.a) : degreeLatex(k.a);
}

/** A degree measure that is a whole number or a terminating decimal (not "\frac{1080}{7}^{\circ}"). */
const plainDegrees = (s: string) => !s.includes("\\frac");

/**
 * Mistake-based Distractors, most common first.
 * - Degrees to radians: the π dropped, the factor flipped (deg·180/π),
 *   divided by 360 or by 90 instead of 180 (degreesToRadiansMistakes), and the
 *   minus sign dropped.
 * - Radians to degrees: the π kept, multiplied by 360 or 90 instead of 180
 *   (radiansToDegreesMistakes), the minus sign dropped, and the fraction
 *   flipped (5π/6 as 180·6/5 = 216°).
 * - Without π: multiplied by 180 without dividing by π, the factor flipped,
 *   multiplied by 360/π or 90/π, and cut off instead of rounded.
 */
export function distractors(k: RadiansDegreesConstruction): string[] {
  const answer = answerLatex(k);
  if (k.kind === "decimal") {
    const r = k.radians;
    const right = degreesOf(r);
    const cut = Math.trunc(right * 10) / 10;
    return distinctHints(answer, [
      roundedDegreesLatex(r * 180, 1),
      roundedDegreesLatex((r * Math.PI) / 180, 3),
      roundedDegreesLatex(2 * right, 1),
      roundedDegreesLatex(right / 2, 1),
      roundTo(right, 1) !== cut ? roundedDegreesLatex(cut, 1) : null,
    ]);
  }
  const { a } = k;
  const flipped = rat(-a.n, a.d);
  if (k.toRadians) {
    return distinctHints(answer, [...degreesToRadiansMistakes(a), a.n < 0 ? radianLatex(flipped) : null]);
  }
  const reciprocal = a.n === 0 ? null : degreeLatex(rat(a.d, a.n));
  return distinctHints(
    answer,
    [
      ...radiansToDegreesMistakes(a),
      a.n < 0 ? degreeLatex(flipped) : null,
      reciprocal,
      roundedDegreesLatex((a.n / a.d) * 60, 1),
    ].filter((s): s is string => s !== null && plainDegrees(s)),
  );
}

export const generator: Generator = {
  id: RADIANS_DEGREES_ID,
  title: "Radians and degrees",
  defaultDirections:
    "Convert each degree measure to radians and each radian measure to degrees. Round to the nearest tenth of a degree if needed.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const k = construct(resolved, createRng(seed));
    return {
      kind: "generated",
      generatorId: RADIANS_DEGREES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
  },
};
