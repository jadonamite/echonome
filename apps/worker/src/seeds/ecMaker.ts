import type { SomniaMarkets } from "@somnia-chain/markets-sdk";
import { createLogger } from "../logger.js";

const log = createLogger("ec-maker");

/**
 * A simplified retarget of the bot kit's ec-maker: rests two-sided liquidity around
 * the current mid without ever needing pre-owned outcome-token inventory. Instead of
 * BUY_YES + SELL_YES (which requires already holding YES tokens), it rests
 * BUY_YES below mid and BUY_NO below the NO-side mid — the same "no naked shorts"
 * convention the venue enforces everywhere else. Refreshed each tick: cancels its
 * own resting orders and reposts at the current mid, so it never rests on stale prices.
 */

const HALF_SPREAD = 0.02;
const QUOTE_SIZE = 1;
const PRICE_TICK = 1000n; // BUG FOUND LIVE 2026-09-08: pool reverts InvalidPrice unless
// price is a multiple of this (raw 1e6-scaled units = 0.001 human price precision,
// matching the market's own `precision.price = 3`). See FEEDBACK.md.

export function toTickedPrice(humanPrice: number): bigint {
  const raw = BigInt(Math.round(humanPrice * 1e6));
  return (raw / PRICE_TICK) * PRICE_TICK;
}

/**
 * The mid this maker quotes around.
 *
 * BUG FOUND LIVE 2026-09-08: the previous version did `if (bids.length === 0 ||
 * asks.length === 0) continue` — it refused to quote into an empty book. Every Event
 * Contracts market opens empty at its cadence boundary, so from the first hourly rollover
 * onward the maker sat out of every new market it was created to seed, and the taker
 * strategy (which needs a mid to exist) sat out behind it. The result was two hours of a
 * "live" seed fleet placing nothing at all.
 *
 * Bootstrapping an empty book is the entire job of a seed maker, and a binary market with
 * no information in it prices at 0.5 by definition — so an empty book is a mid of 0.5, not
 * a reason to abstain. A one-sided book anchors to the side that exists rather than
 * inventing a spread around nothing.
 */
export function midFromBook(bids: [number, number][], asks: [number, number][]): number {
  const bestBid = bids[0]?.[0];
  const bestAsk = asks[0]?.[0];
  if (bestBid !== undefined && bestAsk !== undefined) return (bestBid + bestAsk) / 2;
  if (bestBid !== undefined) return bestBid;
  if (bestAsk !== undefined) return bestAsk;
  return 0.5; // no book at all — a fresh market, which is exactly what we're here to seed
}

export async function runEcMakerTick(exchange: SomniaMarkets, marketSymbols: string[], ownerAddress: string) {
  const trader = (exchange as any).trader;

  for (const symbol of marketSymbols) {
    const market = exchange.markets[symbol] as any;
    const pool = market.info.poolAddress;

    // Best-effort: clear this trader's own resting orders on this market before requoting.
    try {
      const openOrders = await exchange.fetchOpenOrders(symbol);
      for (const order of openOrders as any[]) {
        if (order.info?.owner?.toLowerCase?.() === ownerAddress.toLowerCase()) {
          await trader.cancelOrder({ pool, orderId: order.info.orderId });
        }
      }
    } catch (err) {
      // Non-fatal: a failed cancel means we requote alongside our own resting order, which
      // the pool may reject as a self-match. Recorded with a name so the frequency is
      // countable — an unstructured stack dump per occurrence is how 314 identical reverts
      // stayed invisible as a pattern. See FEEDBACK.md.
      log.warn("cancel-refresh failed", { symbol, reason: reasonOf(err) });
    }

    const book = await exchange.fetchOrderBook(symbol);
    const mid = midFromBook(book.bids as [number, number][], book.asks as [number, number][]);

    // The two quotes are complements minus a spread on each, so they sum to 1 - 2*HALF_SPREAD
    // and can never cross each other — a BUY_YES at p and a BUY_NO at q only match when
    // p + q >= 1.
    const yesBidPrice = Math.max(0.01, mid - HALF_SPREAD);
    const noBidPrice = Math.max(0.01, 1 - mid - HALF_SPREAD);

    try {
      await trader.placeOrder({
        pool,
        side: "BUY_YES",
        price: toTickedPrice(yesBidPrice),
        quantity: BigInt(QUOTE_SIZE * 1e6),
        orderType: 0, // rest on the book
      });
      await trader.placeOrder({
        pool,
        side: "BUY_NO",
        price: toTickedPrice(noBidPrice),
        quantity: BigInt(QUOTE_SIZE * 1e6),
        orderType: 0,
      });
      log.info("quoted", {
        symbol,
        mid: Number(mid.toFixed(3)),
        yesBid: Number(yesBidPrice.toFixed(3)),
        noBid: Number(noBidPrice.toFixed(3)),
        bookWasEmpty: book.bids.length === 0 && book.asks.length === 0,
      });
    } catch (err) {
      log.warn("quote failed", { symbol, reason: reasonOf(err) });
    }
  }
}

/**
 * A revert's short name, or a truncated message. The point is that repeated failures
 * aggregate: `jq -r 'select(.message=="quote failed") | .reason' | sort | uniq -c` turns two
 * hours of noise into one line, which is exactly the read that would have surfaced
 * `OrderAlreadyExpired` immediately instead of after 314 occurrences.
 */
function reasonOf(err: unknown): string {
  const e = err as { errorName?: string; shortMessage?: string; message?: string };
  return e?.errorName ?? e?.shortMessage ?? String(e?.message ?? err).slice(0, 160);
}
