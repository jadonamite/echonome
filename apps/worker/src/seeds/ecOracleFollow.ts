import type { SomniaMarkets } from "@somnia-chain/markets-sdk";

/**
 * A simplified retarget of the bot kit's documented ec-oracle-follow strategy:
 * momentum-only mode (the "fallback" model from its own README), since it needs no
 * external price-feed indexer — just the market's own book, which we already read.
 * Real strike/vol pricing (the "primary" model) is a Phase 5 (full trader ecosystem)
 * upgrade once the price-feed indexer URL is found — see FEEDBACK.md if it's added.
 *
 * Edge band and BUY-only convention match the bot kit's own documented defaults:
 * no naked shorts on this venue (a bearish view is BUY_NO, never SELL_YES).
 */

const OF_EDGE = 0.03; // minimum edge required to trade
const OF_MAX_DISAGREEMENT = 0.1; // refuse to trade if the model disagrees with the market by more than this
const MOMENTUM_WINDOW_MS = 60_000;
const SAMPLE_INTERVAL_MS = 15_000;
const ORDER_SIZE = 1; // whole outcome tokens — small, testnet-scale
const PRICE_TICK = 1000n; // price must be a multiple of this — see ecMaker.ts, found live 2026-09-08

function toTickedPrice(humanPrice: number): bigint {
  const raw = BigInt(Math.round(humanPrice * 1e6));
  return (raw / PRICE_TICK) * PRICE_TICK;
}

interface MidSample {
  t: number;
  mid: number;
}

const history = new Map<string, MidSample[]>(); // keyed by market symbol

function midOf(bids: [number, number][], asks: [number, number][]): number | null {
  if (bids.length === 0 || asks.length === 0) return null;
  return (bids[0][0] + asks[0][0]) / 2;
}

export async function runEcOracleFollowTick(exchange: SomniaMarkets, marketSymbols: string[]) {
  for (const symbol of marketSymbols) {
    const book = await exchange.fetchOrderBook(symbol);
    const mid = midOf(book.bids as [number, number][], book.asks as [number, number][]);
    if (mid === null) continue;

    const now = Date.now();
    const samples = history.get(symbol) ?? [];
    samples.push({ t: now, mid });
    const pruned = samples.filter((s) => now - s.t <= MOMENTUM_WINDOW_MS);
    history.set(symbol, pruned);

    if (pruned.length < 2) continue; // not enough history yet

    const oldest = pruned[0];
    const momentum = mid - oldest.mid; // simple short-window return
    const fairValue = Math.min(0.99, Math.max(0.01, mid + momentum));
    const edge = fairValue - mid;

    if (Math.abs(edge) < OF_EDGE || Math.abs(edge) > OF_MAX_DISAGREEMENT) continue;

    const side = edge > 0 ? "BUY_YES" : "BUY_NO";
    const crossPrice = edge > 0 ? book.asks[0][0] : 1 - book.bids[0][0];

    try {
      const trader = (exchange as any).trader;
      await trader.placeOrder({
        pool: (exchange.markets[symbol] as any).info.poolAddress,
        side,
        price: toTickedPrice(crossPrice),
        quantity: BigInt(ORDER_SIZE * 1e6),
        orderType: 2, // IOC — cross now or cancel
      });
      console.log(`[ec-oracle-follow] ${symbol}: edge=${edge.toFixed(3)} → ${side} @ ${crossPrice.toFixed(3)}`);
    } catch (err) {
      console.error(`[ec-oracle-follow] order failed on ${symbol}`, err);
    }
  }
}
