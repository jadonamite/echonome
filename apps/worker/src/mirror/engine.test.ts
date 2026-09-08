import { describe, it, expect } from "vitest";
import { sizeFor } from "./engine.js";

/**
 * Echo sizing. This replaced a `followerStake = 1` placeholder that made every echo the same
 * size regardless of what the follower chose — which would have shipped a product whose size
 * control was decorative. That is the worst class of bug, because it looks like it works.
 *
 * Quantities are raw base units (1e6 = one whole outcome share on this venue).
 */
describe("sizeFor", () => {
  it("scales the leader's own fill by the follower's chosen fraction", () => {
    expect(sizeFor({ quantity: "1000000" }, { size_fraction: "0.25" })).toBe(250_000n);
    expect(sizeFor({ quantity: "4000000" }, { size_fraction: "0.5" })).toBe(2_000_000n);
    expect(sizeFor({ quantity: "1000000" }, { size_fraction: "1" })).toBe(1_000_000n);
  });

  it("floors rather than rounding up — never trade a follower larger than they asked", () => {
    // 3 * 0.5 = 1.5 raw units. Rounding up would size them above their own instruction.
    expect(sizeFor({ quantity: "3" }, { size_fraction: "0.5" })).toBe(1n);
  });

  it("returns null when the leader's size was never recorded", () => {
    // Rows written before `decision.quantity` existed. Inventing a size for them would mean
    // trading real money against a number nobody chose.
    expect(sizeFor({ quantity: null }, { size_fraction: "0.25" })).toBeNull();
  });

  it("returns null when the scaled size rounds away to nothing", () => {
    // A tiny leader fill at a small fraction floors to zero. A zero-quantity order is either
    // a revert or a no-op, and either way recording it as an echo would be a lie.
    expect(sizeFor({ quantity: "1" }, { size_fraction: "0.25" })).toBeNull();
    expect(sizeFor({ quantity: "0" }, { size_fraction: "0.5" })).toBeNull();
  });

  it("refuses a nonsensical fraction instead of trading on it", () => {
    expect(sizeFor({ quantity: "1000000" }, { size_fraction: "0" })).toBeNull();
    expect(sizeFor({ quantity: "1000000" }, { size_fraction: "-0.5" })).toBeNull();
    expect(sizeFor({ quantity: "1000000" }, { size_fraction: "not-a-number" })).toBeNull();
  });
});
