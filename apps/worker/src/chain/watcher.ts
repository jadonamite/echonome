import { createReadOnlyExchange, isTargetMarket } from "./client.js";
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

interface TrackedTrader {
  id: string;
  address: string;
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

export async function watchFills(onNewDecision: (decisionId: string) => Promise<void>) {
  const exchange = createReadOnlyExchange();
  await exchange.loadMarkets();

  const targetMarketIds = new Set(
    Object.values(exchange.markets)
      .filter((m: any) => m.type === "binary" && isTargetMarket(m.info))
      .map((m: any) => m.info.marketId as string)
  );

  log.info("tracking target markets", { count: targetMarketIds.size });

  const tick = async () => {
    const traders = await query<TrackedTrader>(`SELECT id, address FROM trader`);

    for (const trader of traders) {
      const since = lastSeen.get(trader.address) ?? Math.floor(Date.now() / 1000) - 3600;

      const fills = await exchange.client.getUserFills(trader.address, {
        markets: [...targetMarketIds],
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

          // Real idempotency, not a SELECT-then-INSERT race: (trader_id, fill_id) is
          // uniquely indexed (see schema.sql), so a duplicate poll or a watcher restart
          // hitting the same fill twice is a no-op at the DB level, not application logic
          // that could lose a race between two ticks.
          const inserted = await queryOne<{ id: string }>(
            `INSERT INTO decision (trader_id, market_id, side, implied_probability, fill_id, created_at)
             VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
             ON CONFLICT (trader_id, fill_id) WHERE fill_id IS NOT NULL DO NOTHING
             RETURNING id`,
            [trader.id, fill.market, outcome, Number(fill.fillPrice), fill.id, Number(fill.timestamp)]
          );

          if (inserted) {
            log.info("new decision", { decisionId: inserted.id, trader: trader.address, outcome, market: fill.market });
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
