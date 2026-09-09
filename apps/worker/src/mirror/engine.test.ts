import { describe, it, expect } from "vitest";
import { sizeFor, toLotQuantity } from "./engine.js";

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

/**
 * REGRESSION, found on the first two real echoes this engine ever placed — both reverted on
 * chain with `InvalidQuantity`. The pool enforces a lot grid and a minimum order size and
 * refuses anything off it, exactly as it refuses an off-tick price. A 25% copy of a 55,000-unit
 * fill is 13,750, which is not a multiple of the 1,000-unit lot.
 */
describe("toLotQuantity", () => {
  const LOT = 1000n;   // 10^(6 baseDecimals - 3 amount precision)
  const MIN = 1000n;   // limits.amount.min of 0.001

  it("floors a quantity onto the lot grid", () => {
    // The exact value that reverted on chain.
    expect(toLotQuantity(13_750n, LOT, MIN)).toBe(13_000n);
    expect(toLotQuantity(1_999n, LOT, MIN)).toBe(1_000n);
  });

  it("leaves an already-aligned quantity alone", () => {
    expect(toLotQuantity(13_000n, LOT, MIN)).toBe(13_000n);
    expect(toLotQuantity(1_000_000n, LOT, MIN)).toBe(1_000_000n);
  });

  it("refuses anything under the market's minimum rather than paying gas to be told no", () => {
    // The other value that reverted: 25% of a 2,000-unit fill is 500, below the minimum.
    expect(toLotQuantity(500n, LOT, MIN)).toBeNull();
    expect(toLotQuantity(999n, LOT, MIN)).toBeNull();
    expect(toLotQuantity(0n, LOT, MIN)).toBeNull();
  });

  it("refuses when flooring lands on zero even with no minimum set", () => {
    expect(toLotQuantity(999n, LOT, 0n)).toBeNull();
  });

  it("never rounds up — a follower is never traded larger than they asked", () => {
    for (const raw of [1_001n, 1_500n, 1_999n]) {
      expect(toLotQuantity(raw, LOT, MIN)!).toBeLessThanOrEqual(raw);
    }
  });

  it("honours a market whose grid is not this one rather than hardcoding it", () => {
    expect(toLotQuantity(13_750n, 100n, 100n)).toBe(13_700n);
    expect(toLotQuantity(13_750n, 1n, 1n)).toBe(13_750n);
  });
});
