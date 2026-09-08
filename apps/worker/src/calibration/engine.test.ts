import { describe, it, expect } from "vitest";
import { brierScore, bucketFor, confidenceInOwnCall, reliabilityBuckets } from "./engine.js";

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

describe("confidenceInOwnCall", () => {
  // The one place the side-flip IS correct, and worth pinning precisely because the Brier
  // calculation above must NOT flip — an earlier version of this file confused the two and
  // inverted every down call.
  it("reads an up call at face value and a down call as the complement", () => {
    expect(confidenceInOwnCall(0.7, "up")).toBeCloseTo(0.7, 9);
    expect(confidenceInOwnCall(0.3, "down")).toBeCloseTo(0.7, 9);
  });

  it("treats a contrarian call as the low-confidence call it is", () => {
    // Buying DOWN while the market prices up at 0.9 is a 10%-confidence call by their own
    // stated numbers. That is a real behaviour, not an error, and it belongs in a low bucket.
    expect(confidenceInOwnCall(0.9, "down")).toBeCloseTo(0.1, 9);
  });
});

describe("bucketFor", () => {
  it("assigns a confidence to its band", () => {
    expect(bucketFor(0.0)).toBe(0);
    expect(bucketFor(0.55)).toBe(0.5);
    expect(bucketFor(0.699)).toBe(0.6);
    expect(bucketFor(0.7)).toBe(0.7);
  });

  it("puts certainty in the top bucket rather than inventing an eleventh", () => {
    expect(bucketFor(1)).toBe(0.9);
  });
});

describe("reliabilityBuckets", () => {
  const d = (p: string, side: "up" | "down", outcome: "up" | "down") => ({
    implied_probability: p,
    side,
    settled_outcome: outcome,
  });

  it("reports, per confidence band, how often the trader was actually right", () => {
    const buckets = reliabilityBuckets([
      d("0.75", "up", "up"),
      d("0.72", "up", "up"),
      d("0.78", "up", "down"),
      d("0.78", "up", "down"),
      d("0.95", "up", "up"),
    ]);
    expect(buckets).toEqual([
      { bucket: 0.7, observedFrequency: 0.5, sampleCount: 4 },
      { bucket: 0.9, observedFrequency: 1, sampleCount: 1 },
    ]);
  });

  it("buckets a down call by confidence in the down call, not by P(up)", () => {
    // Priced 0.2 up means 80% confidence in down. It belongs at 0.8, and they were right.
    expect(reliabilityBuckets([d("0.2", "down", "down")])).toEqual([
      { bucket: 0.8, observedFrequency: 1, sampleCount: 1 },
    ]);
  });

  it("omits empty buckets rather than reporting them as zero", () => {
    // A band with no calls in it is not a band where they were wrong every time, and
    // plotting it at zero would say exactly that.
    const buckets = reliabilityBuckets([d("0.95", "up", "up")]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].bucket).toBe(0.9);
  });

  it("separates two traders a single Brier score would call identical", () => {
    // The whole reason this exists. Both of these score the same overall; only one of them
    // is followable, and the buckets are where that becomes visible.
    const uninformative = reliabilityBuckets([
      d("0.5", "up", "up"), d("0.5", "up", "down"), d("0.5", "up", "up"), d("0.5", "up", "down"),
    ]);
    const overconfidentAtExtremes = reliabilityBuckets([
      d("0.95", "up", "down"), d("0.95", "up", "down"),
      d("0.55", "up", "up"), d("0.55", "up", "up"),
    ]);
    expect(uninformative).toEqual([{ bucket: 0.5, observedFrequency: 0.5, sampleCount: 4 }]);
    expect(overconfidentAtExtremes).toEqual([
      { bucket: 0.5, observedFrequency: 1, sampleCount: 2 },
      { bucket: 0.9, observedFrequency: 0, sampleCount: 2 },
    ]);
  });

  it("returns nothing for an empty history", () => {
    expect(reliabilityBuckets([])).toEqual([]);
  });
});
