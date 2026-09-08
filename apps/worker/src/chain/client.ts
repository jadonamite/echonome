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

/** True if a binary market is on the confirmed Event Contracts venue, at our target cadence and asset list. */
export function isTargetMarket(info: { venueId?: string; interval?: string | null; asset?: string | null }) {
  return (
    info.venueId === EC_VENUE_ID &&
    info.interval === EC_TARGET_CADENCE &&
    !!info.asset &&
    (EC_TARGET_ASSETS as readonly string[]).includes(info.asset)
  );
}
