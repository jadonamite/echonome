import { createReadOnlyExchange, EC_VENUE_ID, EC_TARGET_CADENCE } from "./client.js";
import { query, queryOne } from "../db/client.js";
import { recomputeCalibration } from "../calibration/engine.js";
import { createLogger } from "../logger.js";
import { beat } from "../health/heartbeat.js";

const log = createLogger("settlement");

/**
 * Polls resolved (past) markets on the target venue/cadence, fills in Decision and
 * Echo outcomes, and triggers a calibration recompute for every affected trader.
 *
 * winningOutcome mapping: now VERIFIED against real resolved markets (2026-09-08), which
 * closes the open question FEEDBACK.md was carrying. The reasoning was right and the type
 * was wrong: index 0 = YES = up, index 1 = NO = down — corroborated by the sibling
 * `payoutNumerators`, which pays the winning index and zeroes the other
 * (`winningOutcome: 1` <-> `payoutNumerators: ["0", "10000000"]`) — but `winningOutcome`
 * arrives as a NUMERIC INDEX, never the strings "YES"/"NO" this function used to compare
 * against. Every comparison failed, every market was treated as unresolved, and in ~90
 * minutes of live trading not one of 313 decisions was ever settled, so no calibration
 * score was ever computed at all. See FEEDBACK.md.
 *
 * Every question observed on this venue is phrased as the affirmative/upward condition
 * ("BTC closes at or above its opening price"), so YES is definitionally Up. Re-verify
 * only if a differently-phrased question (e.g. "at or below") ever appears here.
 */

const POLL_INTERVAL_MS = 15_000;

/**
 * A past-market page deep enough to cover a worker outage. The venue runs five cadences
 * in parallel and 5m markets dominate the recent-first ordering — at limit 50 only ~2 of
 * the rows come back at our 1h cadence, roughly one hour of history, so any restart after
 * a gap longer than that would leave those decisions permanently unsettled. 200 rows is
 * ~5 hours of 1h markets. A cadence filter on the query itself would be better; the SDK's
 * listPastBinaryMarkets doesn't expose one.
 */
const PAST_MARKET_PAGE = 200;

/** 0 = YES = up, 1 = NO = down. See the mapping note above. */
export function mapWinningOutcome(winningOutcome: unknown): "up" | "down" | null {
  if (winningOutcome === null || winningOutcome === undefined) return null; // not finalized

  // Strings are the shape this code originally (wrongly) assumed. Kept as a defensive
  // branch so a future indexer change back to labels degrades to correct, not to silence.
  if (winningOutcome === "YES") return "up";
  if (winningOutcome === "NO") return "down";

  // Coerce deliberately, not with a bare Number(): both Number(null) and Number("") are
  // 0, i.e. "up" — an unresolved market would settle itself as an Up win on every poll.
  // Number.isInteger rejects the NaN that any other non-numeric string produces.
  const raw = typeof winningOutcome === "string" ? winningOutcome.trim() : winningOutcome;
  if (raw === "") return null;
  const index = Number(raw);
  if (!Number.isInteger(index)) return null;
  if (index === 0) return "up";
  if (index === 1) return "down";
  return null;
}

async function settleOnce() {
  const exchange = createReadOnlyExchange();

  const past = await exchange.client.listPastBinaryMarkets({
    venueId: EC_VENUE_ID,
    limit: PAST_MARKET_PAGE,
  });

  for (const market of past) {
    const info: any = (market as any).info ?? market;
    if (info.interval !== EC_TARGET_CADENCE) continue;
    if (info.voided) continue; // a voided market has no real outcome to score against

    const outcome = mapWinningOutcome(info.winningOutcome);
    if (!outcome) continue; // not yet finalized

    const pendingDecisions = await query<{ id: string; trader_id: string }>(
      `SELECT id, trader_id FROM decision WHERE market_id = $1 AND settled_outcome IS NULL`,
      [info.marketId]
    );

    if (pendingDecisions.length === 0) continue;

    const resolvedAt = info.resolvedAtTimestamp ? Number(info.resolvedAtTimestamp) : Math.floor(Date.now() / 1000);
    const ids = pendingDecisions.map((d) => d.id);
    const touchedTraders = new Set<string>();
    for (const d of pendingDecisions) touchedTraders.add(d.trader_id);

    await query(
      `UPDATE decision SET settled_outcome = $1, resolved_at = to_timestamp($2) WHERE id = ANY($3::uuid[])`,
      [outcome, resolvedAt, ids]
    );

    await query(
      `UPDATE echo SET status = 'settled', settled_outcome = $1 WHERE source_decision_id = ANY($2::uuid[]) AND status = 'pending'`,
      [outcome, ids]
    );

    log.info("market resolved", {
      marketId: info.marketId,
      outcome,
      decisionsSettled: pendingDecisions.length,
      tradersAffected: touchedTraders.size,
    });

    for (const traderId of touchedTraders) {
      await recomputeCalibration(traderId);
    }
  }
}

export function watchSettlement() {
  const tick = () =>
    settleOnce()
      .then(() => beat("settlement"))
      .catch((err) => log.error("tick failed", { err: String(err) }));

  tick();
  setInterval(tick, POLL_INTERVAL_MS);
}
