import { describe, it, expect } from "vitest";
import { toTickedPrice as makerTick } from "./ecMaker.js";
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
