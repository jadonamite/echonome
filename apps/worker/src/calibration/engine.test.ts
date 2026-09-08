import { describe, it, expect } from "vitest";
import { brierScore } from "./engine.js";

// Known inputs -> known Brier scores. brierScore(p, outcome) = (p - outcome)^2, averaged.
describe("brierScore", () => {
  it("scores a perfect forecaster at 0", () => {
    const decisions = [
      { implied_probability: "1", side: "up" as const, settled_outcome: "up" as const },
      { implied_probability: "1", side: "down" as const, settled_outcome: "down" as const },
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

  it("converts a 'down' call's implied probability correctly (1 - p is P(up))", () => {
    // side=down at implied_probability 0.8 means "80% confident it goes down" —
    // P(up) is 0.2. If it actually went down, error should be small, not large.
    const decisions = [
      { implied_probability: "0.8", side: "down" as const, settled_outcome: "down" as const },
    ];
    // P(up)=0.2, outcome=down(0) -> squared error = (0.2 - 0)^2 = 0.04
    expect(brierScore(decisions)).toBeCloseTo(0.04, 6);
  });

  it("returns NaN for an empty history rather than throwing or silently returning 0", () => {
    expect(brierScore([])).toBeNaN();
  });
});
