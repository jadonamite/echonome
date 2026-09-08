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

  log.info("recomputed", {
    traderId,
    brier: Number.isNaN(score) ? null : Number(score.toFixed(4)),
    sampleCount,
    ranked: sampleCount >= MIN_CALIBRATION_SAMPLE,
  });
}
