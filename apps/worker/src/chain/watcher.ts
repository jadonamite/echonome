import { createReadOnlyExchange, isTargetMarket } from "./client.js";
import { query, queryOne } from "../db/client.js";

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

export async function watchFills(onNewDecision: (decisionId: string) => Promise<void>) {
  const exchange = createReadOnlyExchange();
  await exchange.loadMarkets();

  const targetMarketIds = new Set(
    Object.values(exchange.markets)
      .filter((m: any) => m.type === "binary" && isTargetMarket(m.info))
      .map((m: any) => m.info.marketId as string)
  );

  console.log(`[watcher] tracking ${targetMarketIds.size} target market(s)`);

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
        const side =
          fill.takerOrder?.owner?.toLowerCase() === trader.address.toLowerCase()
            ? fill.takerOrder.side
            : fill.makerSide;

        if (!side) continue; // side not bridged yet — will show up on a later poll

        const existing = await queryOne(
          `SELECT id FROM decision WHERE trader_id = $1 AND market_id = $2 AND created_at = to_timestamp($3)`,
          [trader.id, fill.market, Number(fill.timestamp)]
        );
        if (existing) continue;

        const inserted = await queryOne<{ id: string }>(
          `INSERT INTO decision (trader_id, market_id, side, implied_probability, created_at)
           VALUES ($1, $2, $3, $4, to_timestamp($5))
           RETURNING id`,
          [trader.id, fill.market, side.toLowerCase(), Number(fill.fillPrice), Number(fill.timestamp)]
        );

        if (inserted) {
          console.log(`[watcher] new decision ${inserted.id} — trader ${trader.address} ${side} on ${fill.market}`);
          await onNewDecision(inserted.id);
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
    tick().catch((err) => console.error("[watcher] tick failed", err));
  }, POLL_INTERVAL_MS);
}
