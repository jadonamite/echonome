import { describe, it, expect } from "vitest";
import { brierScore } from "./engine.js";

/**
 * Known inputs -> known Brier scores. brierScore = mean((P(up) - outcomeUp)^2).
 *
 * The critical fixture rule, and the thing an earlier version of this file got wrong:
 * `implied_probability` is ALWAYS P(up), for a 'down' decision exactly as much as an 'up'
 * one, because a binary fill's price is always quoted in YES terms. `side` records which
 * way the trader traded; it does not change how the probability is read.
 */
describe("brierScore", () => {
  it("scores a perfect forecaster at 0", () => {
    const decisions = [
      { implied_probability: "1", side: "up" as const, settled_outcome: "up" as const },
      { implied_probability: "0", side: "down" as const, settled_outcome: "down" as const },
    ];
    expect(brierScore(decisions)).toBeCloseTo(0, 6);
  });

  it("scores a perfectly wrong forecaster at 1", () => {
    const decisions = [
      { implied_probability: "1", side: "up" as const, settled_outcome: "down" as const },
    ];
    expect(brierScore(decisions)).toBeCloseTo(1, 6);
  });

  it("scores always-50/50 at 0.25 regardless of outcome", () => {
    const decisions = [
      { implied_probability: "0.5", side: "up" as const, settled_outcome: "up" as const },
      { implied_probability: "0.5", side: "up" as const, settled_outcome: "down" as const },
    ];
    expect(brierScore(decisions)).toBeCloseTo(0.25, 6);
  });

  // REGRESSION, bug fixed 2026-09-08: this used to flip a 'down' decision to 1 - p,
  // which inverted the forecast on every down call. A wallet that buys NO while the
  // YES price is 0.96 is reading the market as 96% UP — and if it did settle up, that
  // reading was very nearly right. The old code scored it as a 0.92 error instead.
  it("does not invert a 'down' decision — the price is already P(up)", () => {
    const settledUp = [
      { implied_probability: "0.96", side: "down" as const, settled_outcome: "up" as const },
    ];
    // P(up)=0.96, outcome=up(1) -> (0.96 - 1)^2 = 0.0016, not (0.04 - 1)^2 = 0.9216.
    expect(brierScore(settledUp)).toBeCloseTo(0.0016, 6);

    const settledDown = [
      { implied_probability: "0.96", side: "down" as const, settled_outcome: "down" as const },
    ];
    // Same reading, opposite outcome: the market was badly wrong, and so was the trader.
    expect(brierScore(settledDown)).toBeCloseTo(0.9216, 6);
  });

  it("returns NaN for an empty history rather than throwing or silently returning 0", () => {
    expect(brierScore([])).toBeNaN();
  });
});
