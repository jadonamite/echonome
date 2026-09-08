import { createReadOnlyExchange, EC_VENUE_ID, EC_TARGET_CADENCE } from "./client.js";
import { query, queryOne } from "../db/client.js";
import { recomputeCalibration } from "../calibration/engine.js";

/**
 * Polls resolved (past) markets on the target venue/cadence, fills in Decision and
 * Echo outcomes, and triggers a calibration recompute for every affected trader.
 *
 * winningOutcome mapping: DECIDED, not a placeholder. Every market's outcomes array
 * carries index 0 = YES, index 1 = NO (confirmed on-chain 2026-09-08), and every
 * sampled question is phrased as the affirmative/upward condition — "will X be AT OR
 * ABOVE strike" — so YES is definitionally the Up outcome. Re-verify only if a market
 * with a differently-phrased question (e.g. "at or below") ever appears on this venue.
 */

const POLL_INTERVAL_MS = 15_000;

function mapWinningOutcome(winningOutcome: string | null): "up" | "down" | null {
  if (winningOutcome === "YES") return "up";
  if (winningOutcome === "NO") return "down";
  return null;
}

async function settleOnce() {
  const exchange = createReadOnlyExchange();

  const past = await exchange.client.listPastBinaryMarkets({
    venueId: EC_VENUE_ID,
    limit: 50,
  });

  for (const market of past) {
    const info: any = (market as any).info ?? market;
    if (info.interval !== EC_TARGET_CADENCE) continue;

    const outcome = mapWinningOutcome(info.winningOutcome);
    if (!outcome) continue; // voided or not yet finalized

    const pendingDecisions = await query<{ id: string; trader_id: string }>(
      `SELECT id, trader_id FROM decision WHERE market_id = $1 AND settled_outcome IS NULL`,
      [info.marketId]
    );

    if (pendingDecisions.length === 0) continue;

    const resolvedAt = info.resolvedAtTimestamp ? Number(info.resolvedAtTimestamp) : Math.floor(Date.now() / 1000);
    const touchedTraders = new Set<string>();

    for (const d of pendingDecisions) {
      await queryOne(
        `UPDATE decision SET settled_outcome = $1, resolved_at = to_timestamp($2) WHERE id = $3`,
        [outcome, resolvedAt, d.id]
      );
      touchedTraders.add(d.trader_id);

      await query(
        `UPDATE echo SET status = 'settled', settled_outcome = $1 WHERE source_decision_id = $2 AND status = 'pending'`,
        [outcome, d.id]
      );
    }

    console.log(`[settlement] market ${info.marketId} resolved ${outcome} — ${pendingDecisions.length} decision(s) settled`);

    for (const traderId of touchedTraders) {
      await recomputeCalibration(traderId);
    }
  }
}

export function watchSettlement() {
  settleOnce().catch((err) => console.error("[settlement] initial pass failed", err));
  setInterval(() => {
    settleOnce().catch((err) => console.error("[settlement] tick failed", err));
  }, POLL_INTERVAL_MS);
}
