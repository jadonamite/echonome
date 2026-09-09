import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

/**
 * Turns a raw `decision.market_id` / `echo.market_id` into something a person can read.
 *
 * The database only stores the market id (it's what `fill.market` gives the watcher), and
 * `shortMarket()` in lib/format.ts renders that as `#a3f9c1` — still a hash, just a shorter
 * one. TECHNICAL_ARCHITECTURE.md is explicit that raw chain data is never the primary
 * display, so we resolve the parts that matter — `asset` ("BTC") and `interval` ("1h") —
 * from the SDK here rather than asking the worker to denormalise new columns into `decision`.
 *
 * Server-side only. It reaches the indexer, so it must never run in a client component.
 *
 * Three deliberate choices:
 * - `loadMarkets(true)`. A bare `loadMarkets()` returns a CACHE and is a no-op after the
 *   first call — that cost the backend an hour of frozen market data (FEEDBACK.md, and
 *   HANDOVER.md §7 lists it first among the things that bite). Forcing the refresh matters
 *   less here than it does in the worker, since each miss builds a new client, but the
 *   habit is worth keeping consistent across the repo.
 * - Live AND recently-past markets, because a settled decision's market has already left
 *   the live set — and settled decisions are exactly the ones on these pages.
 * - Every failure degrades to null instead of throwing. A page that can't reach the indexer
 *   should still render its data; the market label is the least important thing on the row.
 */

export interface MarketLabel {
  asset: string | null;
  interval: string | null;
}

const TTL_MS = 60_000;
const PAST_MARKET_LIMIT = 100;

/**
 * A deadline, because this runs inside a page render and the SDK's own call has none.
 *
 * Measured, not guessed: `loadMarkets(true)` takes ~3.5s against Shannon from a healthy
 * connection. A 4s budget sat right on top of that and failed intermittently — the label
 * vanished on a merely slow run rather than a broken one. 10s clears the real latency while
 * still bounding a stall, and the 60s cache means only a cold read ever waits at all.
 */
const INDEXER_TIMEOUT_MS = 10_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("indexer timed out")), ms).unref?.()
    ),
  ]);
}

// Same defaults lib/somnia.ts uses. Duplicated rather than exported from there because that
// module builds a browser-bound exchange and this one must stay server-side.
const INDEXER_URL =
  process.env.NEXT_PUBLIC_SHANNON_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql";
const WS_RPC_URL =
  process.env.NEXT_PUBLIC_SHANNON_WS_URL ?? "wss://api.infra.testnet.somnia.network/ws";
const VENUE_ID =
  process.env.NEXT_PUBLIC_EC_VENUE_ID ??
  "0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c";

// Survives dev hot-reloads, so one edit doesn't mean one more round trip to the indexer.
const globalForMarkets = globalThis as unknown as {
  _echonomeMarketLabels?: { at: number; labels: Map<string, MarketLabel> };
};

function collect(labels: Map<string, MarketLabel>, info: any) {
  const id = info?.marketId;
  if (!id || labels.has(id)) return;
  labels.set(id, { asset: info.asset ?? null, interval: info.interval ?? null });
}

export async function loadMarketLabels(): Promise<Map<string, MarketLabel>> {
  const cached = globalForMarkets._echonomeMarketLabels;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.labels;

  const labels = new Map<string, MarketLabel>();
  try {
    const exchange = new SomniaMarkets({
      indexerUrl: INDEXER_URL,
      chain: somniaShannon,
      wsRpcUrl: WS_RPC_URL,
      addresses: SOMNIA_TESTNET_ADDRESSES,
    });

    await withTimeout(exchange.loadMarkets(true), INDEXER_TIMEOUT_MS);
    for (const market of Object.values(exchange.markets) as any[]) {
      if (market?.type === "binary") collect(labels, market.info);
    }

    try {
      const past = await withTimeout(
        exchange.client.listPastBinaryMarkets({
          venueId: VENUE_ID,
          limit: PAST_MARKET_LIMIT,
        }),
        INDEXER_TIMEOUT_MS
      );
      for (const market of past as any[]) collect(labels, market?.info ?? market);
    } catch {
      // Past markets are a nicety — live ones already cover anything still open.
    }
  } catch (err) {
    // Indexer unreachable or the SDK refused. Cache the empty result briefly so one outage
    // doesn't turn every row on the page into its own failing round trip — but say WHY.
    // An earlier version of this block swallowed the error entirely, and the labels silently
    // never resolved while the page looked fine; the reason took a debug session to recover.
    console.warn("[markets] label lookup failed:", (err as Error)?.message ?? String(err));
  }

  // Worth keeping: an empty map is the difference between "BTC 1-hour" and a hex id on every
  // row, and it fails silently by design. HANDOVER.md §7 — every failure in this project has
  // been a healthy process writing nothing — so this one says so out loud.
  if (labels.size === 0) {
    console.warn("[markets] no market labels resolved; rows will fall back to short ids");
  }

  globalForMarkets._echonomeMarketLabels = { at: Date.now(), labels };
  return labels;
}

/** "1h" reads as jargon in a sentence; "1-hour" doesn't. */
function spellInterval(interval: string | null): string | null {
  if (!interval) return null;
  const match = /^(\d+)([mhd])$/.exec(interval);
  if (!match) return interval;
  const [, count, unit] = match;
  const word = unit === "m" ? "minute" : unit === "h" ? "hour" : "day";
  return `${count}-${word}`;
}

/**
 * "BTC 1-hour" when we know the market, null when we don't — callers fall back to
 * `shortMarket()` so an unknown market still renders something stable rather than a blank.
 */
export function describeMarket(label: MarketLabel | undefined): string | null {
  if (!label?.asset) return null;
  const interval = spellInterval(label.interval);
  return interval ? `${label.asset} ${interval}` : label.asset;
}
