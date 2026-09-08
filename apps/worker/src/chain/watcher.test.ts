import { describe, it, expect } from "vitest";
import { mapBinarySideToOutcome, impliedProbabilityFromFillPrice } from "./watcher.js";

// This is the exact mapping whose absence crashed the entire watcher on the first real
// fill (2026-09-08, see FEEDBACK.md) — a check-constraint violation propagated all the way
// up and killed the process. This test exists so that regression is structurally impossible.
describe("mapBinarySideToOutcome", () => {
  it("maps BUY_YES to up", () => {
    expect(mapBinarySideToOutcome("BUY_YES")).toBe("up");
  });
  it("maps BUY_NO to down", () => {
    expect(mapBinarySideToOutcome("BUY_NO")).toBe("down");
  });
  it("maps SELL_NO to up (equivalent exposure)", () => {
    expect(mapBinarySideToOutcome("SELL_NO")).toBe("up");
  });
  it("maps SELL_YES to down (equivalent exposure)", () => {
    expect(mapBinarySideToOutcome("SELL_YES")).toBe("down");
  });
  it("returns null for anything unrecognized instead of guessing", () => {
    expect(mapBinarySideToOutcome("SOMETHING_NEW")).toBeNull();
    expect(mapBinarySideToOutcome("")).toBeNull();
  });
});

/**
 * REGRESSION, bug found live 2026-09-08: `fill.fillPrice` is raw quote units, not a
 * probability. Writing it through unscaled put values like 960000 into a column the
 * calibration engine reads as a probability.
 */
describe("impliedProbabilityFromFillPrice", () => {
  it("scales a raw fill price down by the market's quote decimals", () => {
    expect(impliedProbabilityFromFillPrice("960000", 6)).toBeCloseTo(0.96, 9);
    expect(impliedProbabilityFromFillPrice("20000", 6)).toBeCloseTo(0.02, 9);
    expect(impliedProbabilityFromFillPrice("500000", 6)).toBeCloseTo(0.5, 9);
  });

  it("honours a market whose quote decimals are not 6 rather than hardcoding the venue's", () => {
    expect(impliedProbabilityFromFillPrice("9600", 4)).toBeCloseTo(0.96, 9);
  });

  it("returns null instead of storing a value that cannot be a probability", () => {
    // What the bug actually produced: the raw price treated as already-scaled.
    expect(impliedProbabilityFromFillPrice("960000", 0)).toBeNull();
    expect(impliedProbabilityFromFillPrice("-1", 6)).toBeNull();
    expect(impliedProbabilityFromFillPrice("not-a-number", 6)).toBeNull();
  });

  it("accepts the exact boundaries — a market can genuinely settle at certainty", () => {
    expect(impliedProbabilityFromFillPrice("0", 6)).toBe(0);
    expect(impliedProbabilityFromFillPrice("1000000", 6)).toBe(1);
  });
});
