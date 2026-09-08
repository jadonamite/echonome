import type { SomniaMarkets } from "@somnia-chain/markets-sdk";

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
      console.error(`[ec-maker] cancel-refresh failed on ${symbol}`, err);
    }

    const book = await exchange.fetchOrderBook(symbol);
    if (book.bids.length === 0 || book.asks.length === 0) continue;
    const mid = ((book.bids[0][0] as number) + (book.asks[0][0] as number)) / 2;

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
      console.log(`[ec-maker] ${symbol}: quoting YES@${yesBidPrice.toFixed(3)} / NO@${noBidPrice.toFixed(3)}`);
    } catch (err) {
      console.error(`[ec-maker] quote failed on ${symbol}`, err);
    }
  }
}
