import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

// Verified live against Shannon testnet 2026-09-08 — see specs/echonome/plan.md in the
// Inertia vault for the probe that confirmed this venue and its cadence ladder.
export const EC_VENUE_ID =
  process.env.EC_VENUE_ID ??
  "0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c";

export const EC_TARGET_CADENCE = "1h";
export const EC_TARGET_ASSETS = ["BTC", "ETH"] as const;

const indexerUrl = process.env.SHANNON_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql";
const wsRpcUrl = process.env.SHANNON_WS_URL ?? "wss://api.infra.testnet.somnia.network/ws";

/**
 * A read-only exchange instance — no private key. Use createOperatorExchange() for
 * anything that needs to sign (the mirror engine, seed traders).
 */
export function createReadOnlyExchange() {
  return new SomniaMarkets({
    indexerUrl,
    chain: somniaShannon,
    wsRpcUrl,
    addresses: SOMNIA_TESTNET_ADDRESSES,
  });
}

/**
 * The operator exchange — signs with OPERATOR_PRIVATE_KEY. This key can place/cancel
 * orders on a follower's behalf via DreamDEX's OperatorPermissionsRegistry; it can never
 * deposit, withdraw, or approve. See TECHNICAL_ARCHITECTURE.md "The on-chain flow".
 */
export function createOperatorExchange() {
  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("OPERATOR_PRIVATE_KEY is not set — see .env.example");
  }
  return new SomniaMarkets({
    indexerUrl,
    chain: somniaShannon,
    wsRpcUrl,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    privateKey: privateKey as `0x${string}`,
  });
}

/**
 * The fields of a market row these predicates read. One type for both, so a caller can pass
 * the whole `market.info` to either without the narrower one rejecting the extra keys.
 */
export interface TargetMarketInfo {
  venueId?: string;
  interval?: string | null;
  asset?: string | null;
  /** Indexer lifecycle: "Trading" -> "Locked" -> "Finalized". Read only by the liveness check. */
  status?: string | null;
  /** Unix seconds at which the window closes. Read only by the liveness check. */
  expiry?: string | number | null;
}

/**
 * True if a binary market is one we care about BY IDENTITY — right venue, right cadence,
 * right asset. Says nothing about whether it is still alive: an Event Contracts market that
 * expired an hour ago still matches this. Use it to recognise a market, never to decide
 * whether to trade on one.
 */
export function isTargetMarket(info: TargetMarketInfo) {
  return (
    info.venueId === EC_VENUE_ID &&
    info.interval === EC_TARGET_CADENCE &&
    !!info.asset &&
    (EC_TARGET_ASSETS as readonly string[]).includes(info.asset)
  );
}

/**
 * True if a target market is actually accepting orders right now.
 *
 * BUG FOUND LIVE 2026-09-09: `isTargetMarket` alone was the filter both seed strategies used
 * to choose what to quote on, and it has no liveness test at all. Markets accumulate in the
 * SDK's registry (they are keyed by symbol, and each cadence window mints a new symbol), so
 * once the 22:00 window died the maker kept happily quoting into it — 314 consecutive
 * `OrderAlreadyExpired` reverts across two hours, while the live windows sat untouched at
 * zero trades. The seed fleet looked busy in the logs and was accomplishing nothing.
 *
 * `status` comes off the indexer row and goes `Trading` -> `Locked` -> `Finalized`; expiry is
 * the wall-clock end of the window. Both are checked because they can disagree by a few
 * seconds around the boundary, and a bot should refuse on either signal rather than pick one.
 */
export function isTradeableTargetMarket(
  info: TargetMarketInfo,
  nowSec: number = Math.floor(Date.now() / 1000)
) {
  if (!isTargetMarket(info)) return false;
  if (info.status !== "Trading") return false;
  const expiry = Number(info.expiry);
  return Number.isFinite(expiry) && expiry > nowSec;
}
