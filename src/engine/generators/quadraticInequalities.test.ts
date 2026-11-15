import { describe, it, expect } from "vitest";
import fc from "fast-check";
import katex from "katex";
import { createRng } from "../rng";
import {
  construct,
  exactValue,
  generator,
  numToLatex,
  solutionToLatex,
  type CriticalPointType,
  type ExactNum,
  type Notation,
  type Op,
  type SymbolMode,
} from "./quadraticInequalities";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const POINT_TYPES: CriticalPointType[] = ["integer", "rational", "irrational"];
const NOTATIONS: Notation[] = ["interval", "inequality"];
const SYMBOLS: SymbolMode[] = ["mixed", "strict", "nonStrict"];

const anyParams = fc.record({
  notation: fc.constantFrom(...NOTATIONS),
  criticalPoints: fc.constantFrom(...POINT_TYPES),
  symbols: fc.constantFrom(...SYMBOLS),
  allowNegativeLeading: fc.boolean(),
  allowLeadingCoefficient: fc.boolean(),
  allowSpecialCases: fc.boolean(),
  standardForm: fc.boolean(),
  maxCriticalPoint: fc.integer({ min: 2, max: 12 }),
});

// ------------------------------------------------------------------ parsing
// The tests read the BAKED strings back (prompt and answer), so they defend what
// actually prints, not just the internal construction.

/** A piece of a solution set: an interval with optional endpoints. */
interface Piece {
  lo: ExactNum | null; // null = -infinity
  hi: ExactNum | null; // null = +infinity
  loClosed: boolean;
  hiClosed: boolean;
}

/** Parse a number rendered by numToLatex back to its exact form. */
function parseNum(t: string): ExactNum {
  t = t.trim();
  let m = t.match(/^(-?)\\frac\{(.+)\}\{(\d+)\}$/);
  if (m) {
    const inner = parseNum(m[2]);
    const sg = m[1] ? -1 : 1;
    return { p: sg * inner.p, q: sg * inner.q, s: inner.s, r: inner.r * Number(m[3]) };
  }
  m = t.match(/^(-?\d+)$/);
  if (m) return { p: Number(m[1]), q: 0, s: 1, r: 1 };
  m = t.match(/^(?:(-?\d+) ([+-]) |(-?))(\d*)\\sqrt\{(\d+)\}$/);
  if (m) {
    const p = m[1] ? Number(m[1]) : 0;
    const neg = m[2] ? m[2] === "-" : m[3] === "-";
    const q = (m[4] ? Number(m[4]) : 1) * (neg ? -1 : 1);
    return { p, q, s: Number(m[5]), r: 1 };
  }
  throw new Error(`unparsed number: ${t}`);
}

function parseInterval(tex: string): Piece[] {
  if (tex === "\\varnothing") return [];
  const point = tex.match(/^\\\{(.+)\\\}$/);
  if (point) {
    const x = parseNum(point[1]);
    return [{ lo: x, hi: x, loClosed: true, hiClosed: true }];
  }
  return tex.split(" \\cup ").map((part) => {
    const m = part.match(/^([[(])(.+), (.+)([\])])$/);
    if (!m) throw new Error(`unparsed interval: ${part}`);
    const lo = m[2] === "-\\infty" ? null : parseNum(m[2]);
    const hi = m[3] === "\\infty" ? null : parseNum(m[3]);
    return { lo, hi, loClosed: m[1] === "[", hiClosed: m[4] === "]" };
  });
}

function parseInequality(tex: string): Piece[] {
  if (tex === "\\text{no solution}") return [];
  if (tex === "\\text{all real numbers}") {
    return [{ lo: null, hi: null, loClosed: false, hiClosed: false }];
  }
  let m = tex.match(/^x = (.+)$/);
  if (m) {
    const x = parseNum(m[1]);
    return [{ lo: x, hi: x, loClosed: true, hiClosed: true }];
  }
  m = tex.match(/^x \\ne (.+)$/);
  if (m) {
    const x = parseNum(m[1]);
    return [
      { lo: null, hi: x, loClosed: false, hiClosed: false },
      { lo: x, hi: null, loClosed: false, hiClosed: false },
    ];
  }
  return tex.split(" \\text{ or } ").map((part) => {
    let r = part.match(/^(.+) (<|\\le) x (<|\\le) (.+)$/);
    if (r) {
      return { lo: parseNum(r[1]), hi: parseNum(r[4]), loClosed: r[2] === "\\le", hiClosed: r[3] === "\\le" };
    }
    r = part.match(/^x (<|\\le|>|\\ge) (.+)$/);
    if (!r) throw new Error(`unparsed inequality: ${part}`);
    const x = parseNum(r[2]);
    const closed = r[1] === "\\le" || r[1] === "\\ge";
    return r[1] === "<" || r[1] === "\\le"
      ? { lo: null, hi: x, loClosed: false, hiClosed: closed }
      : { lo: x, hi: null, loClosed: closed, hiClosed: false };
  });
}

function parseAnswer(tex: string, notation: Notation): Piece[] {
  return notation === "interval" ? parseInterval(tex) : parseInequality(tex);
}

/** Parse the prompt "poly op rhs" into a x^2 + b x + c op 0 (moving rhs left). */
function parsePrompt(tex: string): { a: number; b: number; c: number; op: Op } {
  const m = tex.match(/^(.+) (<|>|\\le|\\ge) (-?\d+)$/);
  if (!m) throw new Error(`unparsed prompt: ${tex}`);
  const op: Op = ({ "<": "<", ">": ">", "\\le": "<=", "\\ge": ">=" } as const)[m[2] as "<"];
  let a = 0;
  let b = 0;
  let c = -Number(m[3]);
  const terms = m[1].replace(/ - /g, " + -").split(" + ");
  for (const term of terms) {
    const t = term.match(/^(-?)(\d*)(x\^2|x|)$/);
    if (!t) throw new Error(`unparsed term: ${term}`);
    const coef = (t[1] ? -1 : 1) * (t[2] ? Number(t[2]) : 1);
    if (t[3] === "x^2") a += coef;
    else if (t[3] === "x") b += coef;
    else c += (t[1] ? -1 : 1) * Number(t[2]);
  }
  return { a, b, c, op };
}

// ------------------------------------------------------------- exact checks

/** Sign of a x^2 + b x + c at x = (p + q√s)/r, computed EXACTLY in integers.
 * r^2·q(x) = A + B√s with A, B integers; the sign of A + B√s is decided by
 * comparing A^2 with B^2·s when A and B disagree in sign. */
function exactSign(a: number, b: number, c: number, x: ExactNum): number {
  return rawSign(a, b, c, x) + 0; // normalize -0
}

function rawSign(a: number, b: number, c: number, { p, q, s, r }: ExactNum): number {
  const A = a * (p * p + q * q * s) + b * p * r + c * r * r;
  const B = 2 * a * p * q + b * q * r;
  const sA = Math.sign(A);
  const sB = Math.sign(B);
  if (sB === 0 || s === 1) return Math.sign(A + B * (s === 1 ? 1 : 0));
  if (sA === 0) return sB;
  if (sA === sB) return sA;
  const cmp = Math.sign(A * A - B * B * s); // |A| vs |B|√s
  return cmp === 0 ? 0 : cmp > 0 ? sA : sB;
}

function satisfies(op: Op, sign: number): boolean {
  switch (op) {
    case "<":
      return sign < 0;
    case ">":
      return sign > 0;
    case "<=":
      return sign <= 0;
    case ">=":
      return sign >= 0;
  }
}

/** Membership of a rational sample strictly away from every endpoint. */
function inSet(pieces: Piece[], x: number): boolean {
  return pieces.some(
    (pc) => (pc.lo === null || x > exactValue(pc.lo)) && (pc.hi === null || x < exactValue(pc.hi)),
  );
}

function endpoints(pieces: Piece[]): { x: ExactNum; closed: boolean }[] {
  const out: { x: ExactNum; closed: boolean }[] = [];
  for (const pc of pieces) {
    if (pc.lo) out.push({ x: pc.lo, closed: pc.loClosed });
    if (pc.hi) out.push({ x: pc.hi, closed: pc.hiClosed });
  }
  return out;
}

// Rational sample grid with step 1/24: every gap between two distinct critical
// points the generator can produce (denominators 2, 3, 4; surds) contains one.
const GRID: number[] = [];
for (let n = -24 * 20; n <= 24 * 20; n++) GRID.push(n);

function checkProblem(prompt: string, answer: string, notation: Notation) {
  const { a, b, c, op } = parsePrompt(prompt);
  const pieces = parseAnswer(answer, notation);

  // Every finite endpoint is an exact zero, and is included iff non-strict.
  for (const { x, closed } of endpoints(pieces)) {
    expect(exactSign(a, b, c, x)).toBe(0);
    expect(closed).toBe(satisfies(op, 0));
  }
  // Every sample point: in the stated set <=> it satisfies the inequality.
  const ends = endpoints(pieces).map((e) => exactValue(e.x));
  for (const n of GRID) {
    const sign = exactSign(a, b, c, { p: n, q: 0, s: 1, r: 24 });
    const x = n / 24;
    if (sign === 0) {
      // a zero not drawn as an endpoint must be a removed/kept point consistent with op
      if (!ends.some((e) => Math.abs(e - x) < 1e-9)) {
        expect(inSet(pieces, x)).toBe(satisfies(op, 0));
      }
      continue;
    }
    if (ends.some((e) => Math.abs(e - x) < 1e-9)) continue;
    expect(inSet(pieces, x)).toBe(satisfies(op, sign));
  }
}

// -------------------------------------------------------------------- tests

describe("quadratic-inequalities: the baked answer is the solution set", () => {
  it("points inside satisfy the inequality, points outside do not, endpoints exact (any params, any seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        checkProblem(p.prompt, p.answer, params.notation);
      }),
      { numRuns: 300 },
    );
  });

  it("both notations describe the same set for the same seed", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const iv = generator.generate({ ...params, notation: "interval" }, seed);
        const ie = generator.generate({ ...params, notation: "inequality" }, seed);
        expect(iv.prompt).toBe(ie.prompt);
        const norm = (ps: Piece[]) =>
          JSON.stringify(ps.map((x) => [x.lo && exactValue(x.lo), x.hi && exactValue(x.hi), x.loClosed, x.hiClosed]));
        expect(norm(parseAnswer(iv.answer, "interval"))).toBe(norm(parseAnswer(ie.answer, "inequality")));
      }),
    );
  });
});

describe("quadratic-inequalities: Topic Options are honored for any seed", () => {
  it("critical points have the requested type and stay within maxCriticalPoint", () => {
    fc.assert(
      fc.property(
        anySeed,
        fc.constantFrom(...POINT_TYPES),
        fc.integer({ min: 2, max: 12 }),
        (seed, criticalPoints, maxCriticalPoint) => {
          const k = construct({ criticalPoints, maxCriticalPoint }, createRng(seed));
          expect(k.zeros.kind).toBe("two");
          if (k.zeros.kind !== "two") return;
          const pts = [k.zeros.lo, k.zeros.hi];
          expect(exactValue(k.zeros.lo)).toBeLessThan(exactValue(k.zeros.hi));
          for (const x of pts) {
            expect(Math.abs(exactValue(x))).toBeLessThanOrEqual(maxCriticalPoint);
            if (criticalPoints === "integer") expect(x.q === 0 && x.r === 1).toBe(true);
            if (criticalPoints === "irrational") expect(x.q !== 0 && x.s > 1).toBe(true);
            if (criticalPoints === "rational") expect(x.q).toBe(0);
          }
          if (criticalPoints === "rational") {
            expect(pts.some((x) => x.r > 1)).toBe(true);
          }
        },
      ),
    );
  });

  it("strict / non-strict symbol modes", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        expect(["<", ">"]).toContain(construct({ symbols: "strict" }, createRng(seed)).op);
        expect(["<=", ">="]).toContain(construct({ symbols: "nonStrict" }, createRng(seed)).op);
      }),
    );
  });

  it("the leading coefficient is positive unless negatives are allowed, and ±1 unless |a| > 1 is allowed (integer/irrational)", () => {
    fc.assert(
      fc.property(anySeed, fc.constantFrom<CriticalPointType>("integer", "irrational"), (seed, criticalPoints) => {
        const k = construct({ criticalPoints }, createRng(seed));
        expect(k.a).toBe(1);
        const n = construct({ criticalPoints, allowNegativeLeading: true }, createRng(seed));
        expect(Math.abs(n.a)).toBe(1);
      }),
    );
    // both signs and |a| > 1 do actually occur when allowed
    const as = Array.from({ length: 200 }, (_, s) =>
      construct({ allowNegativeLeading: true, allowLeadingCoefficient: true }, createRng(s)).a,
    );
    expect(as.some((a) => a < 0)).toBe(true);
    expect(as.some((a) => a > 0)).toBe(true);
    expect(as.some((a) => Math.abs(a) > 1)).toBe(true);
  });

  it("special cases only appear when allowed, and do appear when allowed", () => {
    fc.assert(
      fc.property(anySeed, fc.constantFrom(...POINT_TYPES), (seed, criticalPoints) => {
        expect(construct({ criticalPoints }, createRng(seed)).zeros.kind).toBe("two");
      }),
    );
    const kinds = new Set(
      Array.from({ length: 300 }, (_, s) =>
        construct({ allowSpecialCases: true, symbols: "mixed" }, createRng(s)).solution.kind,
      ),
    );
    for (const kind of ["between", "outside", "all", "none", "point", "allBut"]) {
      expect(kinds).toContain(kind);
    }
  });

  it("standardForm: zero on the right, or the constant moved across", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        expect(generator.generate({}, seed).prompt).toMatch(/ 0$/);
        const moved = generator.generate({ standardForm: false }, seed).prompt;
        // left side has no constant term
        expect(moved).toMatch(/^[^=]*x(\^2)? (<|>|\\le|\\ge) -?\d+$/);
      }),
    );
  });
});

describe("quadratic-inequalities: distractors", () => {
  it("are present, mutually distinct, never the answer, and parse as solution sets", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        expect(p.distractorHints.length).toBeGreaterThan(0);
        expect(p.distractorHints).not.toContain(p.answer);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
        for (const d of p.distractorHints) expect(() => parseAnswer(d, params.notation)).not.toThrow();
      }),
    );
  });

  it("two-critical-point problems offer at least three distractors", () => {
    fc.assert(
      fc.property(anySeed, fc.constantFrom(...POINT_TYPES), fc.constantFrom(...NOTATIONS), (seed, criticalPoints, notation) => {
        expect(generator.generate({ criticalPoints, notation }, seed).distractorHints.length).toBeGreaterThanOrEqual(3);
      }),
    );
  });

  it("special-case problems offer at least two distractors", () => {
    fc.assert(
      fc.property(anySeed, fc.constantFrom(...NOTATIONS), (seed, notation) => {
        const k = construct({ allowSpecialCases: true }, createRng(seed));
        if (k.zeros.kind === "two") return;
        const p = generator.generate({ allowSpecialCases: true, notation }, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(2);
      }),
    );
  });

  it("include the flipped region and the wrong endpoint inclusion", () => {
    // x^2 - x - 6 = (x + 2)(x - 3); find a seed producing it with "<=".
    const lo = { p: -2, q: 0, s: 1, r: 1 };
    const hi = { p: 3, q: 0, s: 1, r: 1 };
    const answer = solutionToLatex({ kind: "between", lo, hi, closed: true }, "interval");
    expect(answer).toBe("[-2, 3]");
    for (let seed = 0; seed < 5000; seed++) {
      const p = generator.generate({}, seed);
      if (p.prompt !== "x^2 - x - 6 \\le 0") continue;
      expect(p.answer).toBe("[-2, 3]");
      expect(p.distractorHints).toContain("(-\\infty, -2] \\cup [3, \\infty)"); // flipped
      expect(p.distractorHints).toContain("(-2, 3)"); // inclusion
      expect(p.distractorHints).toContain("[-3, 2]"); // sign error on the zeros
      return;
    }
    throw new Error("no seed produced x^2 - x - 6 <= 0");
  });
});

describe("quadratic-inequalities: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        expect(generator.generate(params, seed)).toEqual(generator.generate(params, seed));
      }),
    );
  });

  it("bakes the recipe (generatorId, params, seed) onto the problem", () => {
    const p = generator.generate({ notation: "inequality" }, 42);
    expect(p.generatorId).toBe("quadratic-inequalities");
    expect(p.seed).toBe(42);
    expect(p.params.notation).toBe("inequality");
    expect(p.params.criticalPoints).toBe("integer");
    expect(p.kind).toBe("generated");
  });

  it("prompt, answer and distractors all render with KaTeX", () => {
    fc.assert(
      fc.property(anySeed, anyParams, (seed, params) => {
        const p = generator.generate(params, seed);
        for (const tex of [p.prompt, p.answer, ...p.distractorHints]) {
          expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow();
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("quadratic-inequalities: rendering", () => {
  const n = (p: number, r = 1, q = 0, s = 1): ExactNum => ({ p, q, s, r });

  it("renders numbers exactly", () => {
    expect(numToLatex(n(-3))).toBe("-3");
    expect(numToLatex(n(-3, 2))).toBe("-\\frac{3}{2}");
    expect(numToLatex(n(4, 1, -1, 7))).toBe("4 - \\sqrt{7}");
    expect(numToLatex(n(0, 1, -1, 5))).toBe("-\\sqrt{5}");
    expect(numToLatex(n(0, 1, 1, 5))).toBe("\\sqrt{5}");
  });

  it("renders every solution-set shape in both notations", () => {
    const lo = n(-2);
    const hi = n(5, 1, 1, 3);
    const cases: [Parameters<typeof solutionToLatex>[0], string, string][] = [
      [{ kind: "between", lo, hi, closed: false }, "(-2, 5 + \\sqrt{3})", "-2 < x < 5 + \\sqrt{3}"],
      [{ kind: "between", lo, hi, closed: true }, "[-2, 5 + \\sqrt{3}]", "-2 \\le x \\le 5 + \\sqrt{3}"],
      [
        { kind: "outside", lo, hi, closed: true },
        "(-\\infty, -2] \\cup [5 + \\sqrt{3}, \\infty)",
        "x \\le -2 \\text{ or } x \\ge 5 + \\sqrt{3}",
      ],
      [{ kind: "outside", lo, hi, closed: false }, "(-\\infty, -2) \\cup (5 + \\sqrt{3}, \\infty)", "x < -2 \\text{ or } x > 5 + \\sqrt{3}"],
      [{ kind: "all" }, "(-\\infty, \\infty)", "\\text{all real numbers}"],
      [{ kind: "none" }, "\\varnothing", "\\text{no solution}"],
      [{ kind: "point", at: lo }, "\\{-2\\}", "x = -2"],
      [{ kind: "allBut", at: lo }, "(-\\infty, -2) \\cup (-2, \\infty)", "x \\ne -2"],
    ];
    for (const [set, interval, inequality] of cases) {
      expect(solutionToLatex(set, "interval")).toBe(interval);
      expect(solutionToLatex(set, "inequality")).toBe(inequality);
    }
  });
});
