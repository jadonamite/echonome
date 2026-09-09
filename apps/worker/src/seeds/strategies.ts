import type { SomniaMarkets } from "@somnia-chain/markets-sdk";
import { createLogger } from "../logger.js";

/**
 * A field of simple, deliberately different traders, so the leaderboard has something to
 * actually distinguish.
 *
 * Every one of these is a real wallet placing real orders — none of it is simulated. They exist
 * because a ranking you cannot see working is a ranking nobody should believe, and two
 * market-making bots that score almost identically prove nothing either way.
 *
 * The most valuable of them is `ec-coinflip`, which picks a side at random. It is the CONTROL.
 * If a scoring system cannot tell a coin flip apart from judgement, it is measuring noise, and
 * the honest way to find that out is to put a coin flip in the field and see where it lands.
 * Its expected edge is exactly zero, and anything that ranks it well is broken.
 *
 * The other two probe a real and well-documented market bias — the tendency of long shots to be
 * overpriced and favourites underpriced. `ec-longshot` always buys the cheap side and
 * `ec-favourite` always buys the expensive one, so between them they measure whether this venue
 * exhibits it. Neither is expected to be good; both are expected to be INFORMATIVE, which is a
 * different and more useful thing for testing a metric.
 */

const PRICE_TICK = 1000n;
const ORDER_SIZE = 1; // whole outcome tokens, testnet scale

export function toTickedPrice(humanPrice: number): bigint {
  const raw = BigInt(Math.round(humanPrice * 1e6));
  return (raw / PRICE_TICK) * PRICE_TICK;
}

interface Book {
  bids: [number, number][];
  asks: [number, number][];
}

/** What it costs to take each side right now, or null when that side has no liquidity. */
function crossPrices(book: Book): { yes: number | null; no: number | null } {
  const bestAsk = book.asks[0]?.[0];
  const bestBid = book.bids[0]?.[0];
  return {
    yes: bestAsk ?? null,
    no: bestBid === undefined ? null : 1 - bestBid,
  };
}

async function take(
  exchange: SomniaMarkets,
  symbol: string,
  side: "BUY_YES" | "BUY_NO",
  price: number,
  log: ReturnType<typeof createLogger>
) {
  try {
    await (exchange as any).trader.placeOrder({
      pool: (exchange.markets[symbol] as any).info.poolAddress,
      side,
      price: toTickedPrice(price),
      quantity: BigInt(ORDER_SIZE * 1e6),
      orderType: 2, // IOC — cross now or cancel, never rest
    });
    log.info("crossed", { symbol, side, price: Number(price.toFixed(3)) });
  } catch (err) {
    const e = err as { errorName?: string; shortMessage?: string; message?: string };
    log.warn("order failed", {
      symbol,
      reason: e?.errorName ?? e?.shortMessage ?? String(e?.message ?? err).slice(0, 120),
    });
  }
}

/**
 * The control. Picks a side uniformly at random and takes it at whatever the book charges.
 *
 * Its edge should be zero within noise, and if the leaderboard ever ranks it highly, the
 * leaderboard is wrong. Running a deliberate null hypothesis in production is cheap here and it
 * is the only way to know the metric has teeth.
 */
export async function runCoinflipTick(exchange: SomniaMarkets, symbols: string[]) {
  const log = createLogger("ec-coinflip");
  for (const symbol of symbols) {
    const book = (await exchange.fetchOrderBook(symbol)) as unknown as Book;
    const { yes, no } = crossPrices(book);
    const wantYes = Math.random() < 0.5;
    if (wantYes && yes !== null) await take(exchange, symbol, "BUY_YES", yes, log);
    else if (!wantYes && no !== null) await take(exchange, symbol, "BUY_NO", no, log);
  }
}

/**
 * Always buys the CHEAP side — the long shot.
 *
 * If this venue prices long shots fairly, its edge lands near zero. If long shots are
 * systematically overpriced (the classic bias, seen in almost every betting market ever
 * studied), its edge is reliably negative. Either answer is worth having.
 */
export async function runLongshotTick(exchange: SomniaMarkets, symbols: string[]) {
  const log = createLogger("ec-longshot");
  for (const symbol of symbols) {
    const book = (await exchange.fetchOrderBook(symbol)) as unknown as Book;
    const { yes, no } = crossPrices(book);
    if (yes === null || no === null) continue;
    // Skip a market that has already effectively resolved: taking the 2c side of a settled
    // question is not a long-shot bet, it is buying a lottery ticket after the draw.
    if (Math.min(yes, no) < 0.05) continue;
    if (yes < no) await take(exchange, symbol, "BUY_YES", yes, log);
    else await take(exchange, symbol, "BUY_NO", no, log);
  }
}

/**
 * Always buys the EXPENSIVE side — the favourite.
 *
 * The mirror image of the long shot, and the pair is the point: if one shows positive edge and
 * the other negative by a similar margin, that is a real market bias rather than either bot
 * being clever.
 */
export async function runFavouriteTick(exchange: SomniaMarkets, symbols: string[]) {
  const log = createLogger("ec-favourite");
  for (const symbol of symbols) {
    const book = (await exchange.fetchOrderBook(symbol)) as unknown as Book;
    const { yes, no } = crossPrices(book);
    if (yes === null || no === null) continue;
    // Refuse a side priced above 0.95: a near-certainty pays almost nothing and its edge is
    // dominated by fees and timing, which says nothing about judgement.
    if (Math.max(yes, no) > 0.95) continue;
    if (yes > no) await take(exchange, symbol, "BUY_YES", yes, log);
    else await take(exchange, symbol, "BUY_NO", no, log);
  }
}
