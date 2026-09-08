import { query } from "../db/client.js";
import { createReadOnlyExchange, isTargetMarket, isTradeableTargetMarket } from "../chain/client.js";
import type { HealthFacts } from "./checks.js";

/**
 * Gathers what the checks need, from the chain and the database. Kept apart from
 * `evaluateHealth` so the thresholds stay testable without either.
 *
 * The chain half asks the venue directly rather than trusting our own records — the entire
 * point is to compare "what the venue says is happening" against "what we wrote down", and
 * reading both from our own database would agree with itself no matter how broken we were.
 */

/** Echo failures are judged over this window rather than all time, so an old bad patch
 *  doesn't permanently pin the rate high after it's fixed. */
const ECHO_WINDOW = "30 minutes";

/** Components expected to be stamping heartbeats, with a row per loop we care about. */
export const EXPECTED_COMPONENTS = ["watcher", "settlement"] as const;

export async function gatherFacts(): Promise<HealthFacts> {
  const exchange = createReadOnlyExchange();
  // reload: true, always. A cached market list would make this monitor agree with a stale
  // watcher instead of catching it — which is the specific bug it exists to detect.
  await exchange.loadMarkets(true);
  const nowSec = Math.floor(Date.now() / 1000);

  const targets = (Object.values(exchange.markets) as any[]).filter(
    (m) => m.type === "binary" && isTargetMarket(m.info)
  );
  const live = targets.filter((m) => isTradeableTargetMarket(m.info, nowSec));

  const tradesOnLiveMarkets = live.reduce((n, m) => n + Number(m.info.tradeCount ?? 0), 0);

  // The venue's own most-recent-trade timestamp, across live target markets. A recency, so it
  // can be compared against our own recencies — unlike tradeCount, which is cumulative and
  // made the first version of the decisions-flowing check fire on every quiet minute.
  const lastTradeTimes = live
    .map((m) => Number(m.info.lastTradeAt))
    .filter((t) => Number.isFinite(t) && t > 0);
  const venueLastTradeAgeSec = lastTradeTimes.length ? nowSec - Math.max(...lastTradeTimes) : null;
  const oldestLiveMarketAgeSec = live.length
    ? Math.max(...live.map((m) => nowSec - Number(m.info.tradingStart ?? m.info.createdAtTimestamp ?? nowSec)))
    : null;

  const [ages] = await query<{
    last_decision_age: number | null;
    last_settlement_age: number | null;
    unsettled_resolved: string;
    recent_echoes: string;
    recent_failures: string;
  }>(
    `SELECT
       (SELECT floor(extract(epoch FROM now() - max(created_at))) FROM decision) AS last_decision_age,
       (SELECT floor(extract(epoch FROM now() - max(resolved_at))) FROM decision) AS last_settlement_age,
       (SELECT count(*) FROM decision WHERE settled_outcome IS NULL
          AND market_id = ANY($1::text[])) AS unsettled_resolved,
       (SELECT count(*) FROM echo WHERE created_at > now() - interval '${ECHO_WINDOW}') AS recent_echoes,
       (SELECT count(*) FROM echo WHERE created_at > now() - interval '${ECHO_WINDOW}'
          AND status = 'failed') AS recent_failures`,
    [resolvedMarketIds(targets, nowSec)]
  );

  const beats = await query<{ component: string; age: number }>(
    `SELECT component, floor(extract(epoch FROM now() - last_beat_at)) AS age FROM worker_heartbeat`
  );
  const seen = new Map(beats.map((b) => [b.component, Number(b.age)]));
  const heartbeatAgesSec: Record<string, number | null> = {};
  for (const c of EXPECTED_COMPONENTS) heartbeatAgesSec[c] = seen.get(c) ?? null;

  return {
    liveTargetMarkets: live.length,
    tradesOnLiveMarkets,
    venueLastTradeAgeSec,
    oldestLiveMarketAgeSec,
    lastDecisionAgeSec: ages?.last_decision_age === null ? null : Number(ages.last_decision_age),
    lastSettlementAgeSec: ages?.last_settlement_age === null ? null : Number(ages.last_settlement_age),
    unsettledResolvedDecisions: Number(ages?.unsettled_resolved ?? 0),
    recentEchoes: Number(ages?.recent_echoes ?? 0),
    recentEchoFailures: Number(ages?.recent_failures ?? 0),
    heartbeatAgesSec,
  };
}

/**
 * Target markets whose window has closed, so "we hold unsettled decisions on a market the
 * venue has finished with" is answerable. Uses expiry rather than `status`, so a market the
 * indexer hasn't marked Finalized yet still counts once its clock has run out — the settlement
 * poller having nothing to do is different from it being unable to see the work.
 */
function resolvedMarketIds(targets: any[], nowSec: number): string[] {
  return targets
    .filter((m) => Number(m.info.expiry) <= nowSec)
    .map((m) => m.info.marketId as string);
}
