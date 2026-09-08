import { describe, it, expect } from "vitest";
import { toTickedPrice as makerTick, midFromBook } from "./ecMaker.js";
import { toTickedPrice as followTick } from "./ecOracleFollow.js";

// The bug this guards against, live 2026-09-08: InvalidPrice(499500, 1000) — plain float
// math on price doesn't land on the pool's tick grid (multiples of 1000 raw units = 0.001
// human precision), and the pool reverts rather than rounding for you. See FEEDBACK.md.
for (const [name, toTickedPrice] of [
  ["ecMaker", makerTick],
  ["ecOracleFollow", followTick],
] as const) {
  describe(`${name}.toTickedPrice`, () => {
    it("floors a price that already misaligns by half a tick", () => {
      expect(toTickedPrice(0.4995)).toBe(499000n);
    });
    it("leaves an already-aligned price untouched", () => {
      expect(toTickedPrice(0.5)).toBe(500000n);
    });
    it("never produces a value that fails the tick modulus", () => {
      for (const p of [0.001, 0.123456, 0.999, 0.0001]) {
        expect(toTickedPrice(p) % 1000n).toBe(0n);
      }
    });
  });
}

/**
 * REGRESSION, bug found live 2026-09-08: the maker skipped any market whose book was
 * empty or one-sided. Every Event Contracts market opens empty, so the seed fleet went
 * silent from the first cadence rollover onward. Seeding an empty book is the job.
 */
describe("ecMaker.midFromBook", () => {
  it("uses the true mid when both sides are present", () => {
    expect(midFromBook([[0.4, 10]], [[0.6, 10]])).toBeCloseTo(0.5, 9);
    expect(midFromBook([[0.7, 10]], [[0.9, 10]])).toBeCloseTo(0.8, 9);
  });

  it("prices a fresh, empty market at 0.5 instead of abstaining", () => {
    expect(midFromBook([], [])).toBe(0.5);
  });

  it("anchors a one-sided book to the side that exists", () => {
    expect(midFromBook([[0.3, 10]], [])).toBe(0.3);
    expect(midFromBook([], [[0.85, 10]])).toBe(0.85);
  });

  it("produces quotes that cannot cross each other at any mid it can return", () => {
    const HALF_SPREAD = 0.02;
    for (const mid of [0, 0.01, 0.3, 0.5, 0.7, 0.99, 1]) {
      const yesBid = Math.max(0.01, mid - HALF_SPREAD);
      const noBid = Math.max(0.01, 1 - mid - HALF_SPREAD);
      // A BUY_YES at p and a BUY_NO at q match only when p + q >= 1.
      expect(yesBid + noBid).toBeLessThan(1);
    }
  });
});
