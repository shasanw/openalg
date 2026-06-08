import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createRng, deriveSeed } from "./rng";

const anySeed = fc.integer({ min: 0, max: 0xffffffff });

describe("createRng", () => {
  it("is deterministic: same seed produces the same sequence", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const a = createRng(seed);
        const b = createRng(seed);
        const seqA = Array.from({ length: 20 }, () => a.next());
        const seqB = Array.from({ length: 20 }, () => b.next());
        expect(seqA).toEqual(seqB);
      }),
    );
  });

  it("next() stays in [0, 1)", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        const r = createRng(seed);
        for (let i = 0; i < 50; i++) {
          const v = r.next();
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        }
      }),
    );
  });

  it("int(min, max) stays within the inclusive bounds", () => {
    fc.assert(
      fc.property(
        anySeed,
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        (seed, x, y) => {
          const [min, max] = x <= y ? [x, y] : [y, x];
          const r = createRng(seed);
          for (let i = 0; i < 30; i++) {
            const v = r.int(min, max);
            expect(v).toBeGreaterThanOrEqual(min);
            expect(v).toBeLessThanOrEqual(max);
            expect(Number.isInteger(v)).toBe(true);
          }
        },
      ),
    );
  });
});

describe("deriveSeed", () => {
  it("is deterministic", () => {
    fc.assert(
      fc.property(anySeed, fc.nat(), (base, i) => {
        expect(deriveSeed(base, i)).toBe(deriveSeed(base, i));
      }),
    );
  });

  it("distinct indices rarely collide for a fixed base", () => {
    const base = 12345;
    const seeds = new Set(
      Array.from({ length: 200 }, (_, i) => deriveSeed(base, i)),
    );
    expect(seeds.size).toBe(200);
  });
});
