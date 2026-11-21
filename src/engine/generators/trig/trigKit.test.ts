import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "../../rng";
import { NO_SOLUTION, rat, ratEq, ratValue, sub } from "../shared/equationKit";
import { close, evalLatex } from "../shared/latexEval.testkit";
import {
  anglesWithValue,
  coterminal,
  coterminalMistakes,
  decimalLatex,
  degreeText,
  rightTriangleCorners,
  surdText,
  truncateTo,
  degreeLatex,
  degreesToRadiansMistakes,
  dmsLatex,
  dmsToDegrees,
  exactValue,
  fromDegrees,
  fromReference,
  generalSolution,
  generalSolutionLatex,
  inverseLatex,
  inverseOf,
  inverseValue,
  isStandard,
  location,
  locationLatex,
  pickWritten,
  piLatex,
  pointLatex,
  pointMistakes,
  principalAngles,
  principalRange,
  quadrant,
  radianLatex,
  radiansToDegreesMistakes,
  radiansValue,
  referenceAngle,
  referenceAngleMistakes,
  roundedDegreesLatex,
  roundsCleanly,
  roundTo,
  solutionSetLatex,
  STANDARD_ANGLES,
  surd,
  surdDiv,
  surdLatex,
  surdValue,
  swappedSpecialAngle,
  toDegrees,
  TRIG_FNS,
  trigNumber,
  trigOf,
  trigValueLatex,
  trigValueNumber,
  unitPoint,
  valueMistakes,
  writeAngle,
  writtenLatex,
  writtenValue,
  type Angle,
  type TrigFn,
  degreesToDms,
  pointValue,
  pointValueMistakes,
  trigValueEq,
} from "./trigKit";
import {
  anySeed,
  anyStandardAngle,
  evalTrig,
  expectLowestTerms,
  expectRationalized,
  expectRenders,
  sameTrigValue,
  solutionAngles,
} from "./trig.testkit";

const anyFn = fc.constantFrom(...TRIG_FNS);
const anyRational: fc.Arbitrary<Angle> = fc
  .tuple(fc.integer({ min: -100, max: 100 }), fc.integer({ min: 1, max: 24 }))
  .map(([n, d]) => rat(n, d));
const a = (n: number, d = 1) => rat(n, d);

describe("trigKit: angles", () => {
  it("prints radians in lowest terms and degrees, both evaluating to the angle", () => {
    fc.assert(
      fc.property(anyRational, (x) => {
        expect(close(evalLatex(radianLatex(x)), radiansValue(x))).toBe(true);
        expect(close(evalLatex(degreeLatex(x)), radiansValue(x))).toBe(true);
        expectLowestTerms(radianLatex(x));
        expectRenders(radianLatex(x));
        expectRenders(degreeLatex(x));
      }),
    );
  });

  it("prints the usual spellings", () => {
    expect(radianLatex(a(5, 6))).toBe("\\frac{5\\pi}{6}");
    expect(radianLatex(a(-1, 4))).toBe("-\\frac{\\pi}{4}");
    expect(radianLatex(a(1))).toBe("\\pi");
    expect(radianLatex(a(2))).toBe("2\\pi");
    expect(radianLatex(a(0))).toBe("0");
    expect(degreeLatex(a(5, 6))).toBe("150^{\\circ}");
    expect(degreeLatex(a(1, 8))).toBe("22.5^{\\circ}");
    expect(piLatex(2, 3, "k")).toBe("\\frac{2\\pi k}{3}");
  });

  it("converts degrees and radians both ways", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (deg) => {
        expect(ratEq(toDegrees(fromDegrees(deg)), rat(deg))).toBe(true);
      }),
    );
    expect(fromDegrees(150)).toEqual(a(5, 6));
    expect(fromDegrees(rat(45, 2))).toEqual(a(1, 8));
  });
});

describe("trigKit: written forms", () => {
  it("writes #56's examples", () => {
    expect(writtenLatex(writeAngle(a(5, 3), { factor: 4 }), "radians")).toBe("\\frac{20\\pi}{12}");
    expect(writtenLatex(writeAngle(a(2, 3), { turns: 2 }), "radians")).toBe("\\frac{14\\pi}{3}");
    expect(writtenLatex(writeAngle(a(0), { turns: 1, factor: 6 }), "radians")).toBe("\\frac{12\\pi}{6}");
    expect(writtenLatex(writeAngle(a(5, 4), { turns: -4 }), "radians")).toBe("-\\frac{27\\pi}{4}");
    expect(writtenLatex(writeAngle(a(5, 6), { turns: 1 }), "degrees")).toBe("510^{\\circ}");
  });

  it("every written form prints its value and reduces to the intended standard angle", () => {
    const allowed = fc.record({ unreduced: fc.boolean(), coterminal: fc.boolean(), negative: fc.boolean() });
    fc.assert(
      fc.property(anySeed, fc.constantFrom(...STANDARD_ANGLES), allowed, fc.constantFrom("radians", "degrees"), (seed, x, opts, unit) => {
        const { written, form } = pickWritten(createRng(seed), x, opts, unit as "radians" | "degrees");
        const tex = writtenLatex(written, unit as "radians" | "degrees");
        expect(close(evalLatex(tex), radiansValue(writtenValue(written)))).toBe(true);
        expect(ratEq(coterminal(writtenValue(written)), x)).toBe(true);
        expectRenders(tex);
        const v = ratValue(writtenValue(written));
        if (form === "coterminal") expect(v).toBeGreaterThanOrEqual(2);
        if (form === "negative") expect(v).toBeLessThan(0);
        if (form === "unreduced") {
          expect(unit).toBe("radians");
          expect(written.d).toBeGreaterThan(rat(written.n, written.d).d);
        }
        if (form === "standard") expect(opts.coterminal || opts.negative || (opts.unreduced && unit === "radians" && x.n !== 0)).toBe(false);
      }),
    );
  });
});

describe("trigKit: position", () => {
  it("coterminal lands in [0, 2π) a whole number of turns away", () => {
    fc.assert(
      fc.property(anyRational, (x) => {
        const c = coterminal(x);
        expect(ratValue(c)).toBeGreaterThanOrEqual(0);
        expect(ratValue(c)).toBeLessThan(2);
        const diff = sub(x, c);
        expect(diff.d === 1 && diff.n % 2 === 0).toBe(true);
      }),
    );
  });

  it("location matches the signs of cos and sin; the reference angle is the angle to the x-axis", () => {
    fc.assert(
      fc.property(anyRational, (x) => {
        const r = radiansValue(x);
        const [cx, sy] = [Math.cos(r), Math.sin(r)];
        const l = location(x);
        const expected =
          Math.abs(sy) < 1e-12 ? (cx > 0 ? "+x" : "-x") : Math.abs(cx) < 1e-12 ? (sy > 0 ? "+y" : "-y") : cx > 0 ? (sy > 0 ? 1 : 4) : sy > 0 ? 2 : 3;
        expect(l).toBe(expected);
        expect(quadrant(x)).toBe(typeof expected === "number" ? expected : null);
        const ref = referenceAngle(x);
        expect(ratValue(ref)).toBeGreaterThanOrEqual(0);
        expect(ratValue(ref)).toBeLessThanOrEqual(0.5);
        expect(close(Math.sin(radiansValue(ref)), Math.abs(sy), 1e-9)).toBe(true);
        const q = quadrant(x);
        if (q !== null) expect(ratEq(fromReference(ref, q), coterminal(x))).toBe(true);
      }),
    );
    expect(locationLatex(2)).toBe("\\text{Quadrant II}");
    expect(locationLatex("-y")).toBe("\\text{negative } y\\text{-axis}");
    expectRenders(locationLatex("+x"));
  });

  it("has the 16 standard angles", () => {
    expect(STANDARD_ANGLES.map(radianLatex)).toEqual([
      "0", "\\frac{\\pi}{6}", "\\frac{\\pi}{4}", "\\frac{\\pi}{3}", "\\frac{\\pi}{2}", "\\frac{2\\pi}{3}",
      "\\frac{3\\pi}{4}", "\\frac{5\\pi}{6}", "\\pi", "\\frac{7\\pi}{6}", "\\frac{5\\pi}{4}", "\\frac{4\\pi}{3}",
      "\\frac{3\\pi}{2}", "\\frac{5\\pi}{3}", "\\frac{7\\pi}{4}", "\\frac{11\\pi}{6}",
    ]);
    expect(isStandard(a(-27, 4))).toBe(true);
    expect(isStandard(a(1, 12))).toBe(false);
  });
});

describe("trigKit: exact values", () => {
  it("surds print rationalized and simplified", () => {
    expect(surdLatex(surd(1, 3, 2))).toBe("\\frac{\\sqrt{3}}{2}");
    expect(surdLatex(surd(-2, 3, 3))).toBe("-\\frac{2\\sqrt{3}}{3}");
    expect(surdLatex(surd(-1, 3))).toBe("-\\sqrt{3}");
    expect(surdLatex(surd(2, 12, 4))).toBe("\\sqrt{3}");
    expect(surdDiv(surd(1), surd(1, 3, 2))).toEqual(surd(2, 3, 3));
    expect(surdDiv(surd(1), surd(0))).toBeNull();
  });

  it("all six functions at every standard angle (any coterminal form) match the numeric value", () => {
    fc.assert(
      fc.property(anyFn, anyStandardAngle, (fn, x) => {
        const v = exactValue(fn, x);
        const num = trigNumber(fn, radiansValue(x));
        const tex = trigValueLatex(v);
        if (v === "undefined") expect(Math.abs(num)).toBeGreaterThan(1e12);
        else {
          expect(close(trigValueNumber(v), num, 1e-9)).toBe(true);
          expect(close(evalTrig(tex), num, 1e-9)).toBe(true);
        }
        expectRationalized(tex);
        expectRenders(tex);
        // the printed question evaluates to the printed answer
        const prompt = trigOf(fn, radianLatex(x));
        expectRenders(prompt);
        if (v !== "undefined") expect(sameTrigValue(prompt, tex)).toBe(true);
      }),
    );
  });

  it("knows the table", () => {
    const tex = (fn: TrigFn, x: Angle) => trigValueLatex(exactValue(fn, x));
    expect(tex("sin", a(1, 6))).toBe("\\frac{1}{2}");
    expect(tex("cos", a(5, 6))).toBe("-\\frac{\\sqrt{3}}{2}");
    expect(tex("tan", a(2, 3))).toBe("-\\sqrt{3}");
    expect(tex("sec", a(1, 6))).toBe("\\frac{2\\sqrt{3}}{3}");
    expect(tex("csc", a(5, 4))).toBe("-\\sqrt{2}");
    expect(tex("cot", a(1, 2))).toBe("0");
    expect(tex("tan", a(3, 2))).toBe("\\text{undefined}");
    expect(tex("cos", a(0))).toBe("1");
    expect(pointLatex(unitPoint(a(1, 6)))).toBe("\\left(\\frac{\\sqrt{3}}{2}, \\frac{1}{2}\\right)");
    expect(pointLatex(unitPoint(a(-27, 4)))).toBe("\\left(-\\frac{\\sqrt{2}}{2}, -\\frac{\\sqrt{2}}{2}\\right)");
    expect(() => exactValue("sin", a(1, 12))).toThrow();
  });

  it("prints function applications that evaluate", () => {
    expect(trigOf("sin", "\\frac{5\\pi}{6}")).toBe("\\sin \\frac{5\\pi}{6}");
    expect(trigOf("tan", "-\\frac{\\pi}{4}")).toBe("\\tan\\left(-\\frac{\\pi}{4}\\right)");
    expect(trigOf("cos", "x", 2)).toBe("\\cos^{2} x");
    expect(close(evalTrig(trigOf("cos", "150^{\\circ}")), -Math.sqrt(3) / 2)).toBe(true);
    expect(close(evalTrig("\\sin^{2} x + \\cos^{2} x", { x: 0.7 }), 1)).toBe(true);
    expect(close(evalTrig("2\\sin x \\cos x", { x: 0.7 }), Math.sin(1.4))).toBe(true);
    expect(close(evalTrig("\\sin 2\\theta", { theta: 0.7 }), Math.sin(1.4))).toBe(true);
  });
});

describe("trigKit: inverse trig", () => {
  it("principal angles lie in range, invert their own values, and match the numeric inverse", () => {
    for (const fn of TRIG_FNS) {
      const { lo, hi } = principalRange(fn);
      for (const x of principalAngles(fn)) {
        expect(ratValue(x)).toBeGreaterThanOrEqual(ratValue(lo));
        expect(ratValue(x)).toBeLessThanOrEqual(ratValue(hi));
        const v = exactValue(fn, x);
        if (v === "undefined") throw new Error("defined by construction");
        expect(ratEq(inverseValue(fn, v)!, x)).toBe(true);
        for (const notation of ["arc", "power"] as const) {
          const prompt = inverseOf(fn, surdLatex(v), notation);
          expectRenders(prompt);
          expect(close(evalTrig(prompt), radiansValue(x), 1e-9), prompt).toBe(true);
        }
      }
    }
    expect(principalAngles("sin")).toHaveLength(9);
    expect(principalAngles("cos")).toHaveLength(9);
    expect(principalAngles("tan")).toHaveLength(7);
    expect(principalAngles("cot")).toHaveLength(7);
    expect(principalAngles("sec")).toHaveLength(8);
    expect(principalAngles("csc")).toHaveLength(8);
  });

  it("returns null outside the domain or off the table", () => {
    expect(inverseValue("sin", surd(2))).toBeNull();
    expect(inverseValue("cos", surd(1, 5, 3))).toBeNull();
    expect(inverseValue("cos", surd(-1, 1, 2))).toEqual(a(2, 3));
    expect(inverseValue("sin", surd(-1, 1, 2))).toEqual(a(-1, 6));
    expect(inverseLatex("sec")).toBe("\\operatorname{arcsec}");
    expect(inverseLatex("tan", "power")).toBe("\\tan^{-1}");
  });
});

describe("trigKit: equations", () => {
  const anyValue = fc.tuple(anyFn, fc.constantFrom(...STANDARD_ANGLES)).map(([fn, x]) => [fn, exactValue(fn, x)] as const);

  it("anglesWithValue finds exactly the solutions in [0, 2π)", () => {
    fc.assert(
      fc.property(anyValue, fc.integer({ min: 1, max: 4 }), ([fn, v], coef) => {
        if (v === "undefined") return;
        const found = anglesWithValue(fn, v, coef);
        // every solution has a denominator dividing 12·coef: scan them all numerically
        const scan: number[] = [];
        for (let j = 0; j < 24 * coef; j++) {
          const x = (j / (12 * coef)) * Math.PI;
          const y = trigNumber(fn, coef * x);
          if (Math.abs(y) < 1e6 && close(y, surdValue(v), 1e-9)) scan.push(x);
        }
        expect(found.map(radiansValue).map((x) => x.toFixed(9))).toEqual(scan.map((x) => x.toFixed(9)));
        const tex = solutionSetLatex("x", found, "radians");
        expectRenders(tex);
        expectLowestTerms(tex);
        expect(solutionAngles(tex).map((x) => x.toFixed(9))).toEqual(scan.map((x) => x.toFixed(9)));
        const deg = solutionSetLatex("\\theta", found, "degrees");
        expect(solutionAngles(deg).map((x) => x.toFixed(9))).toEqual(scan.map((x) => x.toFixed(9)));
      }),
    );
    expect(solutionSetLatex("x", anglesWithValue("sin", surd(2)), "radians")).toBe(NO_SOLUTION);
  });

  it("the general solution covers every solution and nothing else", () => {
    fc.assert(
      fc.property(anyValue, fc.integer({ min: 1, max: 3 }), ([fn, v], coef) => {
        if (v === "undefined") return;
        const sol = generalSolution(fn, v, coef);
        const members = sol.starts.flatMap((s) => Array.from({ length: 25 }, (_, i) => i - 12).map((k) => ratValue(s) + k * ratValue(sol.period)));
        for (const m of members) expect(close(trigNumber(fn, coef * m * Math.PI), surdValue(v), 1e-9)).toBe(true);
        for (const x of anglesWithValue(fn, v, coef))
          expect(members.some((m) => close(m, ratValue(x)))).toBe(true);
        expectRenders(generalSolutionLatex(sol, "x", "radians"));
        expectRenders(generalSolutionLatex(sol, "x", "degrees"));
      }),
    );
  });

  it("prints general solutions the usual way", () => {
    const tex = (fn: TrigFn, v: ReturnType<typeof surd>, coef = 1, unit: "radians" | "degrees" = "radians") =>
      generalSolutionLatex(generalSolution(fn, v, coef), "x", unit);
    expect(tex("sin", surd(1, 1, 2))).toBe("x = \\frac{\\pi}{6} + 2\\pi k, \\frac{5\\pi}{6} + 2\\pi k");
    expect(tex("tan", surd(1))).toBe("x = \\frac{\\pi}{4} + \\pi k");
    expect(tex("sin", surd(0))).toBe("x = \\pi k");
    expect(tex("cos", surd(1))).toBe("x = 2\\pi k");
    expect(tex("cos", surd(0), 2)).toBe("x = \\frac{\\pi}{4} + \\frac{\\pi k}{2}");
    expect(tex("sin", surd(1, 1, 2), 1, "degrees")).toBe("x = 30^{\\circ} + 360^{\\circ} k, 150^{\\circ} + 360^{\\circ} k");
    expect(tex("sin", surd(3))).toBe(NO_SOLUTION);
  });
});

describe("trigKit: mistakes", () => {
  it("value mistakes are distinct, never right, and model the slips", () => {
    fc.assert(
      fc.property(anyFn, fc.constantFrom(...STANDARD_ANGLES), (fn, x) => {
        const right = trigValueLatex(exactValue(fn, x));
        const wrong = valueMistakes(fn, x).map(trigValueLatex);
        expect(new Set(wrong).size).toBe(wrong.length);
        expect(wrong).not.toContain(right);
      }),
    );
    // sin 5π/6 = 1/2: wrong sign, swapped with cos, √3/2 vs 1/2, reciprocal
    expect(valueMistakes("sin", a(5, 6)).map(trigValueLatex)).toEqual([
      "-\\frac{1}{2}",
      "-\\frac{\\sqrt{3}}{2}",
      "\\frac{\\sqrt{3}}{2}",
      "2",
    ]);
    expect(swappedSpecialAngle(a(5, 6))).toEqual(a(2, 3));
    expect(swappedSpecialAngle(a(1, 4))).toBeNull();
  });

  it("point mistakes swap x and y and flip signs", () => {
    fc.assert(
      fc.property(fc.constantFrom(...STANDARD_ANGLES), (x) => {
        const right = pointLatex(unitPoint(x));
        const wrong = pointMistakes(x).map(pointLatex);
        expect(wrong).not.toContain(right);
        expect(new Set(wrong).size).toBe(wrong.length);
        expect(wrong.length).toBeGreaterThanOrEqual(1);
      }),
    );
    expect(pointLatex(pointMistakes(a(1, 6))[0])).toBe("\\left(\\frac{1}{2}, \\frac{\\sqrt{3}}{2}\\right)");
  });

  it("angle mistakes are never the right angle", () => {
    fc.assert(
      fc.property(anyRational, (x) => {
        const ref = referenceAngle(x);
        for (const m of referenceAngleMistakes(x)) {
          expect(ratEq(m, ref)).toBe(false);
          expect(m.n).toBeGreaterThanOrEqual(0);
        }
        for (const m of coterminalMistakes(x)) expect(ratEq(m, coterminal(x))).toBe(false);
      }),
    );
    // 5π/6: the angle itself, π/3 to the y-axis
    expect(referenceAngleMistakes(a(5, 6)).map(radianLatex)).toContain("\\frac{\\pi}{3}");
    // -27π/4 -> 5π/4; dropping the sign gives 3π/4
    expect(coterminalMistakes(a(-27, 4)).map(radianLatex)).toContain("\\frac{3\\pi}{4}");
  });

  it("conversion mistakes evaluate to other values", () => {
    fc.assert(
      fc.property(fc.integer({ min: -720, max: 720 }).filter((d) => d !== 0), (deg) => {
        const x = fromDegrees(deg);
        for (const m of degreesToRadiansMistakes(x)) {
          expectRenders(m);
          expect(close(evalLatex(m), radiansValue(x))).toBe(false);
        }
        for (const m of radiansToDegreesMistakes(x)) {
          expectRenders(m);
          expect(close(evalLatex(m), radiansValue(x))).toBe(false);
        }
      }),
    );
    expect(degreesToRadiansMistakes(a(5, 6))).toEqual(["\\frac{5}{6}", "\\frac{27000}{\\pi}", "\\frac{5\\pi}{12}", "\\frac{5\\pi}{3}"]);
    expect(radiansToDegreesMistakes(a(5, 6))[0]).toBe("150\\pi^{\\circ}");
  });
});

describe("trigKit: rounding", () => {
  it("rounds to the nearest tenth the way other Topics print it", () => {
    expect(decimalLatex(36.869897, 1)).toBe("36.9");
    expect(decimalLatex(6.0001, 1)).toBe("6");
    expect(decimalLatex(-0.04, 1)).toBe("0");
    expect(decimalLatex(2.25, 1)).toBe("2.3");
    expect(decimalLatex(1.005, 2)).toBe("1.01");
    expect(roundedDegreesLatex(53.130102)).toBe("53.1^{\\circ}");
    expect(roundTo(-2.25, 1)).toBe(-2.3);
    expect(roundsCleanly(2.25, 1)).toBe(false);
    expect(roundsCleanly(2.21, 1)).toBe(true);
  });

  it("prints degrees, minutes and seconds", () => {
    expect(dmsLatex(25, 30, 15)).toBe("25^{\\circ} 30' 15''");
    expect(dmsLatex(40, 0)).toBe("40^{\\circ}");
    expect(dmsToDegrees(25, 30)).toEqual(rat(51, 2));
    expectRenders(dmsLatex(25, 30, 15));
  });
});

describe("trigKit: degreesToDms", () => {
  it("inverts dmsToDegrees for whole seconds, and is null otherwise", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 359 }), fc.integer({ min: 0, max: 59 }), fc.integer({ min: 0, max: 59 }), (d, m, s) => {
        expect(degreesToDms(dmsToDegrees(d, m, s))).toEqual({ deg: d, min: m, sec: s });
      }),
    );
    expect(degreesToDms(rat(5101, 200))).toEqual({ deg: 25, min: 30, sec: 18 });
    expect(degreesToDms(rat(1, 7))).toBeNull();
  });
});

describe("trigKit: points on the terminal side", () => {
  const FNS: TrigFn[] = ["sin", "cos", "tan", "csc", "sec", "cot"];
  const anyPoint = fc
    .tuple(fc.integer({ min: -30, max: 30 }), fc.integer({ min: -30, max: 30 }))
    .filter(([x, y]) => x !== 0 || y !== 0);

  it("pointValue matches the angle through the point", () => {
    fc.assert(
      fc.property(anyPoint, fc.constantFrom(...FNS), ([x, y], fn) => {
        const v = pointValue(fn, x, y);
        const t = Math.atan2(y, x);
        const expected = { sin: Math.sin(t), cos: Math.cos(t), tan: Math.tan(t), csc: 1 / Math.sin(t), sec: 1 / Math.cos(t), cot: 1 / Math.tan(t) }[fn];
        if (v === "undefined") expect(Math.abs(expected)).toBeGreaterThan(1e12);
        else {
          expect(close(evalLatex(trigValueLatex(v)), expected, 1e-9)).toBe(true);
          expect(trigValueLatex(v)).not.toMatch(/\\frac\{[^}]*\}\{[^}]*\\sqrt/);
        }
      }),
    );
    expect(trigValueLatex(pointValue("sin", -3, 4))).toBe("\\frac{4}{5}");
    expect(trigValueLatex(pointValue("cos", 2, -3))).toBe("\\frac{2\\sqrt{13}}{13}");
    expect(pointValue("tan", 0, 5)).toBe("undefined");
  });

  it("pointValueMistakes are distinct and never the right value", () => {
    fc.assert(
      fc.property(anyPoint, fc.constantFrom(...FNS), ([x, y], fn) => {
        const right = pointValue(fn, x, y);
        const wrong = pointValueMistakes(fn, x, y);
        for (const [i, w] of wrong.entries()) {
          expect(trigValueEq(w, right)).toBe(false);
          for (const o of wrong.slice(i + 1)) expect(trigValueEq(w, o)).toBe(false);
        }
      }),
    );
    // (-3, 4): cos = -3/5; sign ignored, x and y swapped, reciprocal, r as 3 + 4
    expect(pointValueMistakes("cos", -3, 4).map(trigValueLatex).slice(0, 4)).toEqual([
      "\\frac{3}{5}",
      "\\frac{4}{5}",
      "-\\frac{5}{3}",
      "-\\frac{3}{7}",
    ]);
  });
});

describe("trigKit: right triangles", () => {
  it("truncates instead of rounding", () => {
    expect(truncateTo(12.38, 1)).toBe(12.3);
    expect(truncateTo(12.3, 1)).toBe(12.3);
    expect(truncateTo(-2.25, 1)).toBe(-2.2);
    expect(truncateTo(0.04, 1)).toBe(0);
  });

  it("prints sides and angles as triangle labels", () => {
    expect(surdText(surd(12))).toBe("12");
    expect(surdText(surd(1, 13))).toBe("√13");
    expect(surdText(surd(1, 20))).toBe("2√5");
    expect(surdText(surd(1, 3, 2))).toBe("√3/2");
    expect(surdText(surd(-1, 1, 2))).toBe("−1/2");
    expect(degreeText(36.869897)).toBe("36.9°");
    expect(degreeText(35)).toBe("35°");
  });

  it("lays a right triangle out with its legs on the axes", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 100, noNaN: true }), fc.double({ min: 0.1, max: 100, noNaN: true }), fc.boolean(), (run, rise, flip) => {
        const [r, h, v] = rightTriangleCorners(run, rise, flip);
        expect(r).toEqual({ x: 0, y: 0 });
        expect(Math.abs(h.x)).toBe(run);
        expect(h.x < 0).toBe(flip);
        expect(h.y).toBe(0);
        expect(v).toEqual({ x: 0, y: rise });
      }),
    );
    expect(() => rightTriangleCorners(0, 3)).toThrow();
  });
});
