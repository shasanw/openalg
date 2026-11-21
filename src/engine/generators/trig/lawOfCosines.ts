// "The Law of Cosines": find the third side from two sides and the angle
// between them (SAS), or an angle from three sides (SSS), from a diagram or
// in a word problem (two boats, a lake, a garden). A diagram can ask for the
// whole triangle.
//
// Choose a complete triangle, round the measurements that will be printed,
// then recompute the requested parts from those givens at full precision.


import { createRng, type Rng } from "../../rng";
import { prose } from "../../format";
import type { TriangleSpec } from "../../plot";
import { resolveParams, type Generator, type ParamSchema, type ParamValues, type Problem } from "../../types";
import { distinctHints } from "../shared/equationKit";
import { roundTo } from "./trigKit";
import {
  ANGLE_NAMES,
  SIDE_NAMES,
  VERTICES,
  acosD,
  asinD,
  cosD,
  degLabel,
  degTex,
  isClean,
  lenLabel,
  lenTex,
  minAngle,
  others,
  parts,
  pickTriangle,
  third,
  placeWord,
  placesOf,
  plausible,
  rounded,
  sideSpread,
  sinD,
  triFromSAS,
  triFromSides,
  triDiagram,
  type Mark,
  type Marks,
  type Places,
  type Tri,
  type Vertex,
} from "./obliqueKit";

export const LAW_OF_COSINES_ID = "law-of-cosines";

export const schema = [
  {
    type: "enum",
    key: "problems",
    label: "Problems",
    default: "mixed",
    options: [
      { value: "mixed", label: "Find a side or an angle" },
      { value: "side", label: "Find a side (SAS)" },
      { value: "angle", label: "Find an angle (SSS)" },
    ],
  },
  { type: "boolean", key: "solveTriangle", label: "Solve the whole triangle", default: false },
  {
    type: "enum",
    key: "context",
    label: "Problems are",
    default: "diagrams",
    options: [
      { value: "diagrams", label: "Triangle diagrams" },
      { value: "mixed", label: "Diagrams and word problems" },
      { value: "word", label: "Word problems only" },
    ],
  },
  {
    type: "enum",
    key: "rounding",
    label: "Round to",
    default: "tenth",
    options: [
      { value: "tenth", label: "The nearest tenth" },
      { value: "hundredth", label: "The nearest hundredth" },
    ],
  },
] as const satisfies ParamSchema;

const MIN_DRAWN = 15;
const MIN_UNDRAWN = 10;
const MAX_SPREAD = 4;

/** A word problem's setting: how its numbers are dressed, and its unit. */
export interface Story {
  template: number;
  unit: string;
  /** Sides are this many times the chosen whole numbers (a lake is hundreds of meters across). */
  scale: number;
  /** SSS: whether the largest or the smallest angle is asked for. */
  extreme?: "largest" | "smallest";
}

export interface LawOfCosinesConstruction {
  /** side: SAS, find side g; angle: SSS, find angle g. */
  kind: "side" | "angle";
  t: Tri;
  g: Vertex;
  places: Places;
  whole: boolean;
  story: Story | null;
}

const r2 = (x: number) => roundTo(x, 2);

/** The angle opposite side x, from sides x, y, z (Law of Cosines). */
export const angleOpposite = (x: number, y: number, z: number): number => acosD((y * y + z * z - x * x) / (2 * y * z));

const SAS_STORIES = [
  { unit: "mi", scale: 1 },
  { unit: "m", scale: 10 },
  { unit: "km", scale: 10 },
] as const;
const SSS_STORIES = [{ unit: "ft" }, { unit: "ft" }, { unit: "km" }] as const;
/** Solving the whole triangle in words: a surveyed plot of land, in feet or tens of meters. */
const PLOT_STORIES = [
  { unit: "ft", scale: 1 },
  { unit: "m", scale: 10 },
] as const;

/**
 * Whether a student who finds the whole triangle in another order gets the
 * same Answers: rounding each found part before using it, and finding an
 * angle by the Law of Sines (correct for any angle but the largest).
 */
function studentAgrees(t: Tri, k: Pick<LawOfCosinesConstruction, "kind" | "g">, p: Places): boolean {
  const R = (x: number) => rounded(x, p);
  const S = t.sides;
  const A = t.angles;
  const largest = VERTICES.reduce((m, v) => (S[v] > S[m] ? v : m), 0 as Vertex);
  if (k.kind === "side") {
    const s = [...S];
    s[k.g] = R(S[k.g]);
    for (const first of others(k.g)) {
      const y = third(k.g, first);
      // first by the Law of Cosines, with the rounded side
      const byCos = angleOpposite(s[first], s[k.g], s[y]);
      if (R(byCos) !== R(A[first])) return false;
      if (R(180 - A[k.g] - R(byCos)) !== R(A[y])) return false;
      // or by the Law of Sines, when it is not the largest angle
      if (first !== largest) {
        const bySin = asinD((s[first] * sinD(A[k.g])) / s[k.g]);
        if (R(bySin) !== R(A[first])) return false;
      }
    }
    return true;
  }
  // SSS: the three rounded angles still make 180°, and any angle found from
  // a rounded one by the Law of Sines agrees
  const units = 10 ** p;
  if (Math.round(A.reduce((sum, x) => sum + R(x), 0) * units) !== 180 * units) return false;
  for (const x of VERTICES) {
    for (const y of VERTICES) {
      if (x === y || y === largest) continue;
      if (R(asinD((S[y] * sinD(R(A[x]))) / S[x])) !== R(A[y])) return false;
    }
  }
  return true;
}

function constructOne(rng: Rng, kind: "side" | "angle", places: Places, whole: boolean, word: boolean): LawOfCosinesConstruction {
  const min = word ? MIN_UNDRAWN : MIN_DRAWN;
  for (;;) {
    const g = rng.pick(VERTICES);
    const original = pickTriangle(rng);
    let t: Tri | null;
    let story: Story | null = null;
    if (kind === "side") {
      const stories = whole ? PLOT_STORIES : SAS_STORIES;
      const tpl = word ? rng.int(0, stories.length - 1) : -1;
      const scale = tpl >= 0 ? stories[tpl].scale : 1;
      const [u, v] = others(g);
      const p = Math.round(original.sides[u] * scale);
      const q = Math.round(original.sides[v] * scale);
      if (p === q) continue;
      t = triFromSAS(g, original.angles[g], p, q);
      if (tpl >= 0) story = { template: tpl, unit: stories[tpl].unit, scale };
    } else {
      const s = original.sides.map(Math.round) as [number, number, number];
      if (new Set(s).size < 3) continue;
      t = triFromSides(s);
      if (!t) continue;
      if (word) {
        const tpl = rng.int(0, SSS_STORIES.length - 1);
        const extreme = rng.pick(["largest", "smallest"] as const);
        const pickV = (better: (x: number, y: number) => boolean) =>
          VERTICES.reduce((m, v) => (better(s[v], s[m]) ? v : m), 0 as Vertex);
        const unit = whole ? PLOT_STORIES[tpl % PLOT_STORIES.length].unit : SSS_STORIES[tpl].unit;
        story = { template: tpl, unit, scale: 1, extreme };
        const gv = extreme === "largest" ? pickV((x, y) => x > y) : pickV((x, y) => x < y);
        if (!finish(t, kind, gv)) continue;
        return { kind, t, g: gv, places, whole, story };
      }
    }
    if (!finish(t, kind, g)) continue;
    return { kind, t, g, places, whole, story };
  }

  function finish(t: Tri, kind: "side" | "angle", g: Vertex): boolean {
    if (minAngle(t) < min || (!word && sideSpread(t) > MAX_SPREAD)) return false;
    const asked = whole ? (kind === "side" ? [t.sides[g], ...others(g).map((v) => t.angles[v])] : t.angles) : [kind === "side" ? t.sides[g] : t.angles[g]];
    if (!asked.every((x) => isClean(x, places))) return false;
    if (whole && !studentAgrees(t, { kind, g }, places)) return false;
    return true;
  }
}

export function construct(params: ParamValues, rng: Rng): LawOfCosinesConstruction {
  const r = resolveParams(schema, params);
  const places = placesOf(r.rounding);
  const kind = r.problems === "mixed" ? rng.pick(["side", "angle"] as const) : (r.problems as "side" | "angle");
  const word = r.context === "word" || (r.context === "mixed" && rng.bool(0.4));
  return constructOne(rng, kind, places, r.solveTriangle === true, word);
}

// ------------------------------------------------------------------ printing

interface Unknowns {
  angles: Vertex[];
  sides: Vertex[];
}

function unknownsOf(k: LawOfCosinesConstruction): Unknowns {
  if (!k.whole) return k.kind === "side" ? { angles: [], sides: [k.g] } : { angles: [k.g], sides: [] };
  return k.kind === "side" ? { angles: others(k.g), sides: [k.g] } : { angles: [...VERTICES], sides: [] };
}

function solvedLatex(k: LawOfCosinesConstruction, angles: readonly number[], sides: readonly number[]): string | null {
  const u = unknownsOf(k);
  const p = k.places;
  const vals = [...u.angles.map((v) => angles[v]), ...u.sides.map((v) => sides[v])];
  if (!vals.every(plausible) || u.angles.some((v) => angles[v] >= 180)) return null;
  const unit = k.story?.unit ?? "";
  if (!k.whole) return u.angles.length ? degTex(angles[u.angles[0]], p) : lenTex(sides[u.sides[0]], p, unit);
  return parts([
    ...u.angles.map((v) => `${ANGLE_NAMES[v]} = ${degTex(angles[v], p)}`),
    ...u.sides.map((v) => `${SIDE_NAMES[v]} = ${lenTex(sides[v], p, unit)}`),
  ]);
}

export const answerLatex = (k: LawOfCosinesConstruction): string => solvedLatex(k, k.t.angles, k.t.sides)!;

const roundText = (p: Places) => `to the nearest ${placeWord(p)}`;
const UNIT_WORDS: Record<string, string> = { mi: "miles", m: "meters", km: "kilometers", ft: "feet" };

function storyLatex(k: LawOfCosinesConstruction, s: Story): string {
  const round = roundText(k.places);
  const deg = (x: number) => `${x}^{\\circ}`;
  if (k.whole) {
    const side = (v: Vertex) => SIDE_NAMES[v] + " = " + k.t.sides[v];
    const sides = k.kind === "side" ? others(k.g) : VERTICES;
    const lengths = sides.map(side).join(", ");
    const angle = k.kind === "side" ? ", " + ANGLE_NAMES[k.g] + " = " + deg(k.t.angles[k.g]) : "";
    return prose("A surveyor measures a triangular plot ABC. With lengths in " + UNIT_WORDS[s.unit] + ", ")
      + lengths + angle + prose(". Find all missing measurements, " + round + ".");
  }
  if (k.kind === "side") {
    const [u, v] = others(k.g);
    const [p, q] = [k.t.sides[u], k.t.sides[v]];
    const A = k.t.angles[k.g];
    const w = UNIT_WORDS[s.unit];
    if (s.template === 0) {
      return `${prose("Two boats leave a harbor at the same time on straight courses ")}${deg(A)}${prose(
        ` apart. One sails ${p} ${w} and the other sails ${q} ${w}. How far apart are the boats, ${round} of a mile?`,
      )}`;
    }
    if (s.template === 1) {
      return `${prose(
        `A surveyor stands ${p} ${w} from one end of a lake and ${q} ${w} from the other end. The angle between the two lines of sight is `,
      )}${deg(A)}${prose(`. How long is the lake, ${round} of a meter?`)}`;
    }
    return `${prose(`A plane flies ${p} ${w}, turns, and flies ${q} ${w}. At the turning point, the angle between the lines to the starting point and destination is `)}${deg(
      A,
    )}${prose(`. How far is the plane from where it started, ${round} of a kilometer?`)}`;
  }
  const [a, b, c] = k.t.sides;
  const w = UNIT_WORDS[s.unit];
  const which = s.extreme!;
  const tail = `${round} of a degree.`;
  if (s.template === 0) return prose(`A triangular garden has sides of ${a} ${w}, ${b} ${w} and ${c} ${w}. Find its ${which} angle, ${tail}`);
  if (s.template === 1) return prose(`The edges of a triangular sail measure ${a} ${w}, ${b} ${w} and ${c} ${w}. Find the ${which} angle of the sail, ${tail}`);
  return prose(
    `Three towns are joined by straight roads ${a} ${w}, ${b} ${w} and ${c} ${w} long. Find the ${which} angle of the triangle the roads make, ${tail}`,
  );
}

export function promptLatex(k: LawOfCosinesConstruction): string {
  if (k.story) return storyLatex(k, k.story);
  if (k.whole) return prose(`Solve the triangle. Round ${roundText(k.places)}.`);
  if (k.kind === "angle") return `${prose("Find ")}\\theta${prose(` ${roundText(k.places)} of a degree.`)}`;
  return `${prose("Find ")}x${prose(` ${roundText(k.places)}.`)}`;
}

function marksOf(k: LawOfCosinesConstruction): Marks {
  const u = unknownsOf(k);
  const p = k.places;
  const angles: [Mark, Mark, Mark] = [null, null, null];
  const sides: [Mark, Mark, Mark] = [null, null, null];
  if (k.kind === "side") {
    angles[k.g] = { text: `${k.t.angles[k.g]}°` };
    for (const v of others(k.g)) sides[v] = { text: String(k.t.sides[v]) };
  } else {
    for (const v of VERTICES) sides[v] = { text: String(k.t.sides[v]) };
  }
  for (const v of u.angles) angles[v] = { text: k.whole ? "?" : "θ", answer: degLabel(k.t.angles[v], p) };
  for (const v of u.sides) sides[v] = { text: k.whole ? "?" : "x", answer: lenLabel(k.t.sides[v], p) };
  return { angles, sides };
}

/**
 * Mistake-based Distractors, printed like the Answer:
 * - SAS: the sign of 2bc cos A flipped (+), the square root forgotten (a²),
 *   (b² + c² − 2bc) multiplied by cos A, cos A dropped (as if right-angled);
 * - SSS: the angle opposite the wrong side, the supplement (a sign slip in
 *   the numerator), cos θ rounded to two places before cos⁻¹;
 * - solving: the next angle by sin⁻¹ when it is obtuse (the acute one taken),
 *   found angles swapped, the side rounded to a whole number before going on;
 * - the calculator in radians mode.
 */
export function distractors(k: LawOfCosinesConstruction): string[] {
  const answer = answerLatex(k);
  const S = k.t.sides;
  const A = k.t.angles;
  const g = k.g;
  const cands: (string | null)[] = [];
  const show = (angles: readonly number[], sides: readonly number[]) => solvedLatex(k, angles, sides);
  if (k.kind === "side") {
    const [u, v] = others(g);
    const [p, q, G] = [S[u], S[v], A[g]];
    // the whole triangle as a student with side x finds it: the angle at u by the Law of Cosines
    const solveFrom = (x: number, angleU?: number) => {
      const s = [...S];
      s[g] = x;
      const a = [...A];
      // by the Law of Cosines, or (when the wrong side makes that impossible) the Law of Sines
      const byCos = angleOpposite(p, x, q);
      a[u] = angleU ?? (Number.isNaN(byCos) ? asinD((p * sinD(G)) / x) : byCos);
      a[v] = 180 - G - a[u];
      return k.whole && !(a[v] > 0 && a[u] > 0) ? null : show(a, s);
    };
    const side = (sq: number) => (sq > 0 ? Math.sqrt(sq) : NaN);
    cands.push(solveFrom(side(p * p + q * q + 2 * p * q * cosD(G))));
    cands.push(show(A, sidesWith(S, g, p * p + q * q - 2 * p * q * cosD(G))));
    cands.push(solveFrom(side(p * p + q * q - 2 * p * q * Math.cos(G))));
    cands.push(solveFrom(side((p * p + q * q - 2 * p * q) * cosD(G))));
    cands.push(solveFrom(side(p * p + q * q)));
    if (k.whole) {
      const big = S[u] > S[v] ? u : v;
      if (A[big] > 90) {
        // the larger angle found by sin⁻¹: its acute supplement
        const acute = 180 - A[big];
        cands.push(solveFrom(S[g], big === u ? acute : 180 - G - acute));
      }
      const swapped = [...A];
      [swapped[u], swapped[v]] = [A[v], A[u]];
      cands.push(show(swapped, S));
      cands.push(solveFrom(Math.round(S[g]), angleOpposite(p, Math.round(S[g]), q)));
    }
    cands.push(solveFrom(side(p * p + q * q - 2 * p * q * r2(cosD(G)))));
  } else {
    const angle = (x: number, y: number, z: number, f = acosD) => f((y * y + z * z - x * x) / (2 * y * z));
    const at = (v: Vertex, f = acosD) => {
      const [y, z] = others(v);
      return angle(S[v], S[y], S[z], f);
    };
    const withAngles = (f: (v: Vertex) => number) => show(VERTICES.map(f), S);
    if (k.whole) {
      cands.push(withAngles((v) => A[(v + 1) % 3]));
      cands.push(withAngles((v) => A[(v + 2) % 3]));
      cands.push(withAngles((v) => at(v, (c) => Math.acos(c))));
      cands.push(withAngles((v) => at(v, (c) => acosD(r2(c)))));
      const big = VERTICES.reduce((m, v) => (S[v] > S[m] ? v : m), 0 as Vertex);
      // the largest angle's cosine taken with the wrong sign (its supplement), the third angle from it
      const sup = 180 - A[big];
      const [y] = others(big);
      cands.push(withAngles((v) => (v === big ? sup : v === y ? A[y] : 180 - sup - A[y])));
    } else {
      for (const v of others(g)) cands.push(degTex(A[v], k.places));
      cands.push(degTex(180 - A[g], k.places));
      const rad = at(g, (c) => Math.acos(c));
      cands.push(degTex(rad, k.places));
      cands.push(degTex(at(g, (c) => acosD(r2(c))), k.places));
    }
  }
  return distinctHints(answer, cands).slice(0, 6);
}

function sidesWith(S: readonly number[], v: Vertex, x: number): number[] {
  const s = [...S];
  s[v] = x;
  return s;
}

export const generator: Generator = {
  id: LAW_OF_COSINES_ID,
  title: "The Law of Cosines",
  defaultDirections: "Use the Law of Cosines to solve each problem.",
  schema,
  generate(params: ParamValues, seed: number): Problem {
    const resolved = resolveParams(schema, params);
    const rng = createRng(seed);
    const k = construct(resolved, rng);
    const problem: Problem = {
      kind: "generated",
      generatorId: LAW_OF_COSINES_ID,
      params: resolved,
      seed,
      prompt: promptLatex(k),
      answer: answerLatex(k),
      distractorHints: distractors(k),
    };
    if (!k.story) {
      const { graph, answerGraph } = triDiagram(rng, k.t, marksOf(k));
      problem.graph = graph;
      problem.answerGraph = answerGraph as TriangleSpec;
    }
    return problem;
  },
};
