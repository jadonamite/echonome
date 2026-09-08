import { createReadOnlyExchange, isTargetMarket, isTradeableTargetMarket } from "./client.js";
import { query, queryOne } from "../db/client.js";
import { createLogger } from "../logger.js";

const log = createLogger("watcher");

/**
 * Detects new fills for tracked traders on our target markets (1h BTC/ETH, the
 * confirmed Event Contracts venue) via the indexer's getUserFills — a one-shot
 * GraphQL read, not the flaky REST /v0/trades endpoint. Polling at 10s against a
 * 5-minute mirror cutoff leaves enormous margin; see TECHNICAL_ARCHITECTURE.md.
 *
 * On each new fill for a tracked trader: writes a Decision row (T014), then hands
 * off to the mirror engine (T017) to fan it out to that trader's active CopyLinks.
 */

const POLL_INTERVAL_MS = 10_000;

/**
 * How long a market stays in the watched set after it stops being live. Event Contracts
 * markets roll over on their cadence boundary (hourly, for our 1h targets), and the last
 * fills on an expiring market can land in the indexer after it has already left the live
 * market list — dropping it from the query the instant it expires would silently lose
 * them. 15 minutes is well past any observed indexer lag.
 */
const EXPIRED_MARKET_RETENTION_MS = 15 * 60 * 1000;

interface TrackedTrader {
  id: string;
  address: string;
}

interface WatchedMarket {
  quoteDecimals: number;
  /** Last tick at which this market was still in the live target set. */
  lastSeenLiveAt: number;
}

// Last-seen fill timestamp per trader address, so each poll only asks for new rows.
const lastSeen = new Map<string, number>();

/**
 * BUG FOUND LIVE 2026-09-08: the raw SDK side ("BUY_YES"/"SELL_YES"/"BUY_NO"/"SELL_NO")
 * was being lowercased and inserted directly — violates decision_side_check ('up'/'down'
 * only) and crashed the entire watcher process on the first real fill. See FEEDBACK.md.
 * No naked shorts on this venue (confirmed via ec-oracle-follow's own documented
 * convention), so SELL_YES/SELL_NO are unexpected but mapped defensively rather than
 * silently dropped.
 */
export function mapBinarySideToOutcome(side: string): "up" | "down" | null {
  switch (side) {
    case "BUY_YES":
    case "SELL_NO":
      return "up";
    case "BUY_NO":
    case "SELL_YES":
      return "down";
    default:
      return null;
  }
}

/**
 * BUG FOUND LIVE 2026-09-08 (second one on this path): `fill.fillPrice` is a RAW
 * quote-unit string, not a probability — the SDK documents it as "raw quote units per
 * whole base (binary: YES-probability scale)" (`fills.d.ts`). It was being written into
 * `decision.implied_probability` unscaled, so 313 live rows held values like `960000`
 * where the calibration engine expects `0.96`. Every Brier score computed off those rows
 * would have been meaningless.
 *
 * Two facts, both confirmed against the SDK's own type docs, that this function encodes:
 *  1. Scale: divide by 10^quoteDecimals (6 on every observed market on this venue).
 *  2. Frame: a binary fill's price is ALWAYS in YES terms regardless of which side the
 *     wallet took — "A binary fill's `fillPrice` is always YES-terms, so the NO leg
 *     enters at the complement" (`derivedReads.d.ts`). So this is P(up) directly, for
 *     both an up and a down decision. It is NOT "probability of the side taken".
 *
 * Returns null when the result isn't a probability at all, which would mean the decimals
 * assumption is wrong — the caller skips and logs rather than storing a nonsense number.
 */
export function impliedProbabilityFromFillPrice(
  fillPrice: string | number,
  quoteDecimals: number
): number | null {
  const pUp = Number(fillPrice) / 10 ** quoteDecimals;
  if (!Number.isFinite(pUp) || pUp < 0 || pUp > 1) return null;
  return pUp;
}

export async function watchFills(onNewDecision: (decisionId: string) => Promise<void>) {
  const exchange = createReadOnlyExchange();

  // Market id -> what we need to read its fills. Refreshed every tick, NOT computed once
  // at startup. BUG FOUND LIVE 2026-09-08: the previous version resolved the target set a
  // single time in this function's prologue, so the moment the 1h markets rolled over on
  // the hour, the watcher kept polling two dead market ids and recorded zero decisions
  // for the entire next hour while the seed traders traded on normally. The seed runner
  // already reloads markets every tick (`runSeedTraders.ts`); the watcher didn't.
  const watched = new Map<string, WatchedMarket>();

  const refreshTargets = async () => {
    // `reload: true` is load-bearing, not defensive. A bare `loadMarkets()` early-returns
    // the SDK's CACHED registry — it is documented as a no-op after the first call — so the
    // first version of this function re-read the same frozen market list every 10 seconds
    // and believed it was refreshing. It fixed the rollover bug only in the sense that
    // restarting the worker warmed a fresh cache for one window. See FEEDBACK.md.
    await exchange.loadMarkets(true);
    const now = Date.now();
    const nowSec = Math.floor(now / 1000);

    for (const market of Object.values(exchange.markets) as any[]) {
      if (market.type !== "binary" || !isTargetMarket(market.info)) continue;

      const marketId = market.info.marketId as string;
      const existing = watched.get(marketId);
      // Only a market that is genuinely still trading refreshes its liveness stamp.
      // Stamping every market the registry remembers — and it remembers expired ones, keyed
      // by their own per-window symbol — would hold every dead market in the watched set
      // forever, which is the retention window failing open instead of expiring.
      const live = isTradeableTargetMarket(market.info, nowSec);

      watched.set(marketId, {
        quoteDecimals: Number(market.info.quoteDecimals ?? 6),
        lastSeenLiveAt: live ? now : (existing?.lastSeenLiveAt ?? now),
      });
    }

    for (const [marketId, entry] of watched) {
      if (now - entry.lastSeenLiveAt > EXPIRED_MARKET_RETENTION_MS) watched.delete(marketId);
    }
  };

  const tick = async () => {
    await refreshTargets();
    if (watched.size === 0) {
      log.warn("no target markets in the live set this tick", {});
      return;
    }

    const marketIds = [...watched.keys()];
    const traders = await query<TrackedTrader>(`SELECT id, address FROM trader`);

    for (const trader of traders) {
      const since = lastSeen.get(trader.address) ?? Math.floor(Date.now() / 1000) - 3600;

      const fills = await exchange.client.getUserFills(trader.address, {
        markets: marketIds,
        since,
        limit: 50,
      });

      for (const fill of fills) {
        try {
          const rawSide =
            fill.takerOrder?.owner?.toLowerCase() === trader.address.toLowerCase()
              ? fill.takerOrder.side
              : fill.makerSide;

          if (!rawSide) continue; // side not bridged yet — will show up on a later poll

          const outcome = mapBinarySideToOutcome(rawSide);
          if (!outcome) {
            log.warn("unmapped side, skipped rather than guessed", { side: rawSide, fillId: fill.id });
            continue;
          }

          const quoteDecimals = watched.get(fill.market)?.quoteDecimals ?? 6;
          const impliedProbability = impliedProbabilityFromFillPrice(fill.fillPrice, quoteDecimals);
          if (impliedProbability === null) {
            log.warn("fill price is not a probability at the assumed decimals, skipped", {
              fillId: fill.id,
              fillPrice: fill.fillPrice,
              quoteDecimals,
            });
            continue;
          }

          // Real idempotency, not a SELECT-then-INSERT race: (trader_id, fill_id) is
          // uniquely indexed (see schema.sql), so a duplicate poll or a watcher restart
          // hitting the same fill twice is a no-op at the DB level, not application logic
          // that could lose a race between two ticks.
          const inserted = await queryOne<{ id: string }>(
            `INSERT INTO decision (trader_id, market_id, side, implied_probability, fill_id, created_at)
             VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
             ON CONFLICT (trader_id, fill_id) WHERE fill_id IS NOT NULL DO NOTHING
             RETURNING id`,
            [trader.id, fill.market, outcome, impliedProbability, fill.id, Number(fill.timestamp)]
          );

          if (inserted) {
            log.info("new decision", {
              decisionId: inserted.id,
              trader: trader.address,
              outcome,
              market: fill.market,
              impliedProbability,
            });
            await onNewDecision(inserted.id);
          }
        } catch (err) {
          // One bad fill must never take the whole watcher down — see FEEDBACK.md.
          log.error("failed to process fill", { fillId: fill.id, trader: trader.address, err: String(err) });
        }
      }

      if (fills.length > 0) {
        const latest = Math.max(...fills.map((f) => Number(f.timestamp)));
        lastSeen.set(trader.address, latest + 1);
      }
    }
  };

  await tick();
  setInterval(() => {
    tick().catch((err) => log.error("tick failed", { err: String(err) }));
  }, POLL_INTERVAL_MS);
}
