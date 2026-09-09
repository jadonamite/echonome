import { describe, it, expect } from "vitest";
import { brierScore, bucketFor, confidenceInOwnCall, edgeScore, reliabilityBuckets } from "./engine.js";

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

/**
 * Edge — the metric that should rank a copy-trading leaderboard.
 *
 * The case these tests exist to pin down: a Brier score and a trader's profit pull in opposite
 * directions. Buying at 30c and being right is a 0.49 squared error (terrible Brier) and a 70c
 * profit (excellent trade). Any leaderboard sorted on Brier therefore sorts against the people
 * most worth copying, which is the exact opposite of the product's job.
 */
describe("edgeScore", () => {
  const d = (p: string, side: "up" | "down", outcome: "up" | "down") => ({
    implied_probability: p,
    side,
    settled_outcome: outcome,
  });

  it("measures profit per unit staked, which is what a follower actually receives", () => {
    // Paid 0.30 for a token that paid out 1. Profit 0.70 per unit staked.
    expect(edgeScore([d("0.3", "up", "up")]).edge).toBeCloseTo(0.7, 9);
    // Paid 0.30 for a token that paid nothing. Lost the 0.30.
    expect(edgeScore([d("0.3", "up", "down")]).edge).toBeCloseTo(-0.3, 9);
  });

  it("prices a down call at the cost of the NO token, not the YES price", () => {
    // Market prices up at 0.80, so NO costs 0.20. They bought down and were right.
    expect(edgeScore([d("0.8", "down", "down")]).edge).toBeCloseTo(0.8, 9);
  });

  it("scores a fairly priced trader at zero over the long run", () => {
    // Seven of ten calls right, each taken at 0.70 — exactly what the price said.
    const fair = [
      ...Array(7).fill(d("0.7", "up", "up")),
      ...Array(3).fill(d("0.7", "up", "down")),
    ];
    expect(edgeScore(fair).edge).toBeCloseTo(0, 9);
  });

  it("ranks the profitable trader ABOVE the accurate one — the whole point", () => {
    // The accurate one: says 70%, right 70% of the time. Perfect calibration, zero profit.
    const accurate = [...Array(7).fill(d("0.7", "up", "up")), ...Array(3).fill(d("0.7", "up", "down"))];
    // The profitable one: buys at 0.30 and is right half the time. Badly "miscalibrated",
    // and makes 20c per dollar staked.
    const profitable = [...Array(5).fill(d("0.3", "up", "up")), ...Array(5).fill(d("0.3", "up", "down"))];

    expect(edgeScore(profitable).edge).toBeGreaterThan(edgeScore(accurate).edge);
    // And Brier says the opposite, which is precisely why it must not rank this leaderboard.
    expect(brierScore(profitable)).toBeGreaterThan(brierScore(accurate));
  });

  it("does not let a good run on a thin sample outrank accumulated evidence", () => {
    // 20 calls taken at 0.40, right 11 times: an apparent +15c edge, on almost nothing.
    const thin = [
      ...Array(11).fill(d("0.4", "up", "up")),
      ...Array(9).fill(d("0.4", "up", "down")),
    ];
    // 400 calls taken at 0.50, right 240 times: a smaller +10c edge, thoroughly evidenced.
    const proven = [
      ...Array(240).fill(d("0.5", "up", "up")),
      ...Array(160).fill(d("0.5", "up", "down")),
    ];

    // On raw edge the thin sample looks better.
    expect(edgeScore(thin).edge).toBeGreaterThan(edgeScore(proven).edge);
    // Ranking uses the conservative end, and there the evidence wins — which is the answer a
    // follower deciding where to put money actually wants.
    expect(edgeScore(proven).edgeLower).toBeGreaterThan(edgeScore(thin).edgeLower);
    expect(edgeScore(proven).edgeLower).toBeGreaterThan(0);
    expect(edgeScore(thin).edgeLower).toBeLessThan(0);
  });

  it("never claims certainty from a run where every outcome agreed", () => {
    // Twenty straight wins has zero SAMPLE variance, which would report a zero-width interval.
    // The outcome is a coin flip, though, and no finite run proves a coin never lands tails.
    const streak = Array(20).fill(d("0.4", "up", "up"));
    const scored = edgeScore(streak);
    expect(scored.edge).toBeCloseTo(0.6, 9);
    expect(scored.standardError).toBeGreaterThan(0);
    expect(scored.edgeLower).toBeLessThan(scored.edge);
  });

  it("refuses to claim an interval from a single observation", () => {
    const one = edgeScore([d("0.3", "up", "up")]);
    expect(one.edge).toBeCloseTo(0.7, 9);
    expect(one.edgeLower).toBeNaN();
  });

  it("returns NaN for an empty history rather than a flattering zero", () => {
    expect(edgeScore([]).edge).toBeNaN();
    expect(edgeScore([]).sampleCount).toBe(0);
  });
});
