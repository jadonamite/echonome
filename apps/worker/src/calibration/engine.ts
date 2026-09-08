import { query, queryOne } from "../db/client.js";

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
    // impliedProbability is always expressed as P(side==up) at entry — see watcher.ts,
    // where fillPrice is the YES/Up probability-scaled price. Convert to "P(outcome was up)".
    const pUp = d.side === "up" ? Number(d.implied_probability) : 1 - Number(d.implied_probability);
    const outcomeUp = d.settled_outcome === "up" ? 1 : 0;
    return (pUp - outcomeUp) ** 2;
  });

  return squaredErrors.reduce((a, b) => a + b, 0) / squaredErrors.length;
}

export async function recomputeCalibration(traderId: string): Promise<void> {
  const resolved = await query<ResolvedDecision>(
    `SELECT implied_probability, side, settled_outcome
     FROM decision
     WHERE trader_id = $1 AND settled_outcome IS NOT NULL`,
    [traderId]
  );

  const score = brierScore(resolved);
  const sampleCount = resolved.length;

  await queryOne(
    `INSERT INTO calibration_score (trader_id, brier_score, reliability, sample_count, computed_at)
     VALUES ($1, $2, '[]', $3, now())
     ON CONFLICT (trader_id) DO UPDATE
       SET brier_score = EXCLUDED.brier_score,
           sample_count = EXCLUDED.sample_count,
           computed_at = now()`,
    [traderId, Number.isNaN(score) ? null : score, sampleCount]
  );

  const status = sampleCount >= MIN_CALIBRATION_SAMPLE ? "ranked" : "warming up";
  console.log(`[calibration] trader ${traderId}: brier=${score.toFixed(4)} n=${sampleCount} (${status})`);
}
