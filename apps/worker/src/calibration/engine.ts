import { query, queryOne } from "../db/client.js";
import { createLogger } from "../logger.js";

const log = createLogger("calibration");

/**
 * Calibration engine — retargeted from ~/Projects/jadonamite/delta-agent, which runs
 * this exact discipline against Polymarket's structurally identical 5-minute Up/Down
 * markets. Brier score only for the foundational pass (T016); reliability buckets
 * land in P2 (T025) — see specs/echonome/tasks.md.
 *
 * A strictly proper scoring rule: a trader maximises their expected score only by
 * reporting their true belief. Lower is better; 0 is a perfect forecaster, 0.25 is
 * "no better than always guessing 50/50", 1 is a perfect forecaster who was always wrong.
 */

const MIN_CALIBRATION_SAMPLE = 20; // keep in sync with packages/shared/src/types.ts

interface ResolvedDecision {
  implied_probability: string;
  side: "up" | "down";
  settled_outcome: "up" | "down";
}

export function brierScore(decisions: ResolvedDecision[]): number {
  if (decisions.length === 0) return NaN;

  const squaredErrors = decisions.map((d) => {
    // `implied_probability` is P(up) directly, for a 'down' decision as much as an 'up'
    // one — a binary fill's price is always quoted in YES terms no matter which side the
    // wallet took ("the NO leg enters at the complement", derivedReads.d.ts), and the
    // watcher stores exactly that. So no side-dependent conversion belongs here.
    //
    // BUG FIXED 2026-09-08: this line used to flip to `1 - p` for every 'down' decision,
    // treating the stored value as "confidence in the side taken". That inverted the
    // forecast on every down call — a trader who bought NO at a YES price of 0.96 (i.e.
    // reading the market as 96% up) was being scored as if they had said 4% up. The
    // comment above this code even stated the correct rule; the code contradicted it.
    const pUp = Number(d.implied_probability);
    const outcomeUp = d.settled_outcome === "up" ? 1 : 0;
    return (pUp - outcomeUp) ** 2;
  });

  return squaredErrors.reduce((a, b) => a + b, 0) / squaredErrors.length;
}

/**
 * The confidence a trader expressed in the side they actually took.
 *
 * `implied_probability` is always P(up). A trader who buys DOWN while the market prices up at
 * 0.30 is stating 70% confidence in their own call, so confidence is the complement for a
 * down decision. This is the one place that flip IS correct — and it is worth being explicit
 * about, because the Brier calculation above must NOT flip (it scores P(up) against the
 * outcome directly), and an earlier version of this file did exactly that by mistake and
 * inverted every down call.
 */
export function confidenceInOwnCall(impliedProbability: number, side: "up" | "down"): number {
  return side === "up" ? impliedProbability : 1 - impliedProbability;
}

/** Ten buckets of width 0.1, covering [0,1]. 1.0 lands in the top bucket, not an eleventh. */
export const BUCKET_WIDTH = 0.1;

export function bucketFor(confidence: number): number {
  // The epsilon is not decoration. `0.7 / 0.1` is 6.999999999999999 in IEEE 754, so a plain
  // floor puts a trader who was exactly 70% confident into the 60% band — a silent off-by-one
  // at every bucket boundary, biased consistently downward, which would tilt an entire
  // reliability diagram left and make every trader look slightly overconfident. Caught by a
  // test asserting the boundary itself rather than only the interiors.
  const index = Math.min(9, Math.max(0, Math.floor(confidence / BUCKET_WIDTH + 1e-9)));
  return Number((index * BUCKET_WIDTH).toFixed(1));
}

export interface ReliabilityBucket {
  bucket: number;
  observedFrequency: number;
  sampleCount: number;
}

/**
 * The reliability breakdown: for each confidence band, how often the trader was actually right.
 *
 * A single Brier score compresses two very different traders into the same number. Both seed
 * traders here sit within a whisker of 0.25, which reads as "no better than a coin flip" and
 * tells a follower nothing about WHY. One might be genuinely uninformative everywhere; another
 * might be well judged in the middle and wildly overconfident at the extremes — the second is
 * followable with a rule, the first is not. That distinction only exists in the buckets.
 *
 * A perfectly calibrated trader's points lie on the diagonal: of the calls they made at 70%
 * confidence, 70% came true. Above the diagonal is underconfidence, below is overconfidence.
 *
 * Empty buckets are omitted rather than reported as zero. A bucket with no calls in it is not
 * a bucket where the trader was wrong every time, and plotting it at zero would say exactly
 * that.
 */
export function reliabilityBuckets(decisions: ResolvedDecision[]): ReliabilityBucket[] {
  const tally = new Map<number, { right: number; total: number }>();

  for (const d of decisions) {
    const confidence = confidenceInOwnCall(Number(d.implied_probability), d.side);
    if (!Number.isFinite(confidence)) continue;
    const bucket = bucketFor(confidence);
    const entry = tally.get(bucket) ?? { right: 0, total: 0 };
    entry.total += 1;
    if (d.side === d.settled_outcome) entry.right += 1;
    tally.set(bucket, entry);
  }

  return [...tally.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, { right, total }]) => ({
      bucket,
      observedFrequency: right / total,
      sampleCount: total,
    }));
}

export async function recomputeCalibration(traderId: string): Promise<void> {
  const resolved = await query<ResolvedDecision>(
    `SELECT implied_probability, side, settled_outcome
     FROM decision
     WHERE trader_id = $1 AND settled_outcome IS NOT NULL`,
    [traderId]
  );

  const score = brierScore(resolved);
  const buckets = reliabilityBuckets(resolved);
  const sampleCount = resolved.length;

  await queryOne(
    `INSERT INTO calibration_score (trader_id, brier_score, reliability, sample_count, computed_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (trader_id) DO UPDATE
       SET brier_score = EXCLUDED.brier_score,
           reliability = EXCLUDED.reliability,
           sample_count = EXCLUDED.sample_count,
           computed_at = now()`,
    [traderId, Number.isNaN(score) ? null : score, JSON.stringify(buckets), sampleCount]
  );

  log.info("recomputed", {
    traderId,
    brier: Number.isNaN(score) ? null : Number(score.toFixed(4)),
    sampleCount,
    ranked: sampleCount >= MIN_CALIBRATION_SAMPLE,
    buckets: buckets.length,
  });
}
