import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createRng } from "../rng";
import { quadraticToLatex } from "../format";
import {
  answerToLatex,
  construct,
  generator,
  vertexFormToLatex,
  xInterceptsLatex,
  type Ask,
  type ExactRoots,
  type Form,
  type InterceptType,
} from "./parabolaProperties";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });
const FORMS: Form[] = ["standard", "vertex", "mixed"];
const TYPES: InterceptType[] = ["rational", "irrational", "none"];
const ASKS: Ask[] = ["all", "vertexAxis", "intercepts"];

const anyOptions = fc.record({
  form: fc.constantFrom(...FORMS),
  interceptType: fc.constantFrom(...TYPES),
  ask: fc.constantFrom(...ASKS),
  allowLeadingCoefficient: fc.boolean(),
  allowOpensDown: fc.boolean(),
  maxValue: fc.integer({ min: 2, max: 12 }),
});

function isPerfectSquare(n: number): boolean {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

/** Exact: (p ± q√s)/r is a root of a x^2 + b x + c (rational and √s parts). */
function rootsSatisfy(
  a: number,
  b: number,
  c: number,
  { p, q, s, r }: ExactRoots,
): boolean {
  const rationalPart = a * (p * p + q * q * s) + b * p * r + c * r * r;
  const radicalPart = 2 * a * p * q + b * q * r;
  return rationalPart === 0 && radicalPart === 0;
}

describe("parabola-properties: stated properties match the constructed quadratic", () => {
  it("the vertex lies on the parabola, on its axis of symmetry, for any seed and options", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const { a, b, c, facts } = construct(opts, createRng(seed));
        const [h, k] = facts.vertex;
        // axis x = h is the axis of symmetry: f(h + t) = f(h - t) <=> 2ah + b = 0
        expect(2 * a * h.n + b * h.d).toBe(0);
        expect(facts.axis).toEqual(h);
        // f(h) = k, cleared of denominators: k.d (a h.n^2 + b h.n h.d + c h.d^2) = k.n h.d^2
        expect(
          k.d * (a * h.n * h.n + b * h.n * h.d + c * h.d * h.d),
        ).toBe(k.n * h.d * h.d);
      }),
    );
  });

  it("the x-intercepts are exact roots (or there are none when D < 0)", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const { a, b, c, D, facts } = construct(opts, createRng(seed));
        expect(D).toBe(b * b - 4 * a * c);
        if (D < 0) expect(facts.xIntercepts.s).toBeLessThan(0);
        else expect(rootsSatisfy(a, b, c, facts.xIntercepts)).toBe(true);
      }),
    );
  });

  it("the y-intercept is (0, f(0)) = (0, c)", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(opts, createRng(seed));
        expect(k.facts.yIntercept).toEqual([0, k.c]);
      }),
    );
  });

  it("coefficients are integers and a is never zero", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const { a, b, c } = construct(opts, createRng(seed));
        for (const n of [a, b, c]) expect(Number.isInteger(n)).toBe(true);
        expect(a).not.toBe(0);
      }),
    );
  });

  it("vertex form expands to the same a, b, c and prints the vertex it states", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct({ ...opts, form: "vertex" }, createRng(seed));
        const h = k.h as number;
        const kv = k.k as number;
        expect(k.b).toBe(-2 * k.a * h);
        expect(k.c).toBe(k.a * h * h + kv);
        expect(h).not.toBe(0);
        expect(k.facts.vertex[0].n / k.facts.vertex[0].d).toBe(h);
        expect(k.facts.vertex[1].n / k.facts.vertex[1].d).toBe(kv);
      }),
    );
  });

  it("the prompt is the constructed quadratic in the chosen form", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        const k = construct(opts, createRng(seed));
        expect(p.prompt).toBe(
          k.form === "vertex"
            ? vertexFormToLatex(k.a, k.h as number, k.k as number)
            : `y = ${quadraticToLatex(k.a, k.b, k.c)}`,
        );
      }),
    );
  });
});

describe("parabola-properties: Topic Options are honored for any seed", () => {
  it("interceptType decides the discriminant's class", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const { D } = construct(opts, createRng(seed));
        if (opts.interceptType === "rational") {
          expect(D).toBeGreaterThan(0);
          expect(isPerfectSquare(D)).toBe(true);
        } else if (opts.interceptType === "irrational") {
          expect(D).toBeGreaterThan(0);
          expect(isPerfectSquare(D)).toBe(false);
        } else {
          expect(D).toBeLessThan(0);
        }
      }),
    );
  });

  it("standard form with rational intercepts has integer roots within maxValue", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct(
          { ...opts, form: "standard", interceptType: "rational" },
          createRng(seed),
        );
        const { p, q, r } = k.facts.xIntercepts;
        for (const n of [p + q, p - q]) {
          expect(Math.abs(n % r)).toBe(0);
          expect(Math.abs(n / r)).toBeLessThanOrEqual(opts.maxValue);
        }
      }),
    );
  });

  it("vertex form keeps h and k within maxValue", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const k = construct({ ...opts, form: "vertex" }, createRng(seed));
        expect(Math.abs(k.h as number)).toBeLessThanOrEqual(opts.maxValue);
        expect(Math.abs(k.k as number)).toBeLessThanOrEqual(opts.maxValue);
      }),
    );
  });

  it("form standard / vertex is honored", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        if (opts.form === "mixed") return;
        expect(construct(opts, createRng(seed)).form).toBe(opts.form);
      }),
    );
  });

  it("mixed form produces both forms across seeds", () => {
    const forms = new Set(
      Array.from({ length: 40 }, (_, s) => construct({ form: "mixed" }, createRng(s)).form),
    );
    expect(forms).toEqual(new Set(["standard", "vertex"]));
  });

  it("leading coefficient and opening direction options are honored", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const { a } = construct(opts, createRng(seed));
        expect(Math.abs(a)).toBeLessThanOrEqual(
          opts.allowLeadingCoefficient ? Math.min(3, opts.maxValue) : 1,
        );
        if (!opts.allowOpensDown) expect(a).toBeGreaterThan(0);
      }),
    );
  });

  it("ask decides which properties the Answer states", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const { answer } = generator.generate(opts, seed);
        const hasVertex = answer.includes("\\text{Vertex: }");
        const hasAxis = answer.includes("\\text{Axis: }");
        const hasIntercepts =
          answer.includes("\\text{$x$-intercepts: }") &&
          answer.includes("\\text{$y$-intercept: }");
        expect(hasVertex).toBe(opts.ask !== "intercepts");
        expect(hasAxis).toBe(opts.ask !== "intercepts");
        expect(hasIntercepts).toBe(opts.ask !== "vertexAxis");
      }),
    );
  });
});

describe("parabola-properties: distractors", () => {
  it("are present, distinct, and never the Answer, for any seed and options", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        const p = generator.generate(opts, seed);
        expect(p.distractorHints.length).toBeGreaterThanOrEqual(2);
        expect(p.distractorHints).not.toContain(p.answer);
        expect(new Set(p.distractorHints).size).toBe(p.distractorHints.length);
      }),
    );
  });

  it("include the flipped-h mistake when h is not zero", () => {
    // y = (x - 3)^2 - 4: reading (x - 3) as h = -3
    const k = construct({ form: "vertex", interceptType: "rational" }, createRng(1));
    const p = generator.generate({ form: "vertex", interceptType: "rational", ask: "vertexAxis" }, 1);
    const h = k.h as number;
    expect(p.distractorHints).toContain(
      `\\text{Vertex: } (${-h}, ${k.k});\\quad \\text{Axis: } x = ${-h}`,
    );
  });
});

describe("parabola-properties: generate()", () => {
  it("is deterministic for the same (params, seed)", () => {
    fc.assert(
      fc.property(anySeed, anyOptions, (seed, opts) => {
        expect(generator.generate(opts, seed)).toEqual(generator.generate(opts, seed));
      }),
    );
  });

  it("bakes the recipe and the default Topic Options onto the Problem", () => {
    const p = generator.generate({}, 42);
    expect(p.kind).toBe("generated");
    expect(p.generatorId).toBe("parabola-properties");
    expect(p.seed).toBe(42);
    expect(p.params).toEqual({
      ask: "all",
      form: "standard",
      interceptType: "rational",
      allowLeadingCoefficient: true,
      allowOpensDown: true,
      maxValue: 6,
    });
    expect(p.prompt).toMatch(/^y = /);
  });
});

describe("parabola-properties: rendering", () => {
  const facts = {
    vertex: [
      { n: 3, d: 2 },
      { n: -1, d: 4 },
    ] as [{ n: number; d: number }, { n: number; d: number }],
    axis: { n: 3, d: 2 },
    xIntercepts: { p: 3, q: 1, s: 1, r: 2 },
    yIntercept: [0, 2] as [number, number],
  };

  it("renders the full multi-part Answer for y = x^2 - 3x + 2", () => {
    expect(answerToLatex(facts, "all")).toBe(
      "\\text{Vertex: } \\left(\\frac{3}{2}, -\\frac{1}{4}\\right);\\quad " +
        "\\text{Axis: } x = \\frac{3}{2};\\quad " +
        "\\text{$x$-intercepts: } (1, 0), (2, 0);\\quad " +
        "\\text{$y$-intercept: } (0, 2)",
    );
  });

  it("renders irrational, centred and missing x-intercepts", () => {
    expect(xInterceptsLatex({ p: -3, q: 1, s: 5, r: 2 })).toBe(
      "\\left(\\frac{-3 \\pm \\sqrt{5}}{2}, 0\\right)",
    );
    expect(xInterceptsLatex({ p: 0, q: 1, s: 10, r: 2 })).toBe(
      "\\left(\\pm \\frac{\\sqrt{10}}{2}, 0\\right)",
    );
    expect(xInterceptsLatex({ p: 2, q: 1, s: 3, r: 1 })).toBe("(2 \\pm \\sqrt{3}, 0)");
    expect(xInterceptsLatex({ p: -1, q: 2, s: -3, r: 1 })).toBe("\\text{none}");
  });

  it("renders vertex form", () => {
    expect(vertexFormToLatex(1, 3, -4)).toBe("y = (x - 3)^2 - 4");
    expect(vertexFormToLatex(-2, -1, 5)).toBe("y = -2(x + 1)^2 + 5");
    expect(vertexFormToLatex(3, 2, 0)).toBe("y = 3(x - 2)^2");
  });
});
