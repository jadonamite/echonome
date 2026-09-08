import { createWalletClient, createPublicClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { binaryPoolWriteAbi, ORDER_KIND } from "@somnia-chain/markets-sdk";
import { createReadOnlyExchange } from "../chain/client.js";
import { query, queryOne } from "../db/client.js";
import { createLogger } from "../logger.js";

const log = createLogger("mirror");

/**
 * Places echoes via DreamDEX's raw operator-order path: BinaryPool.placeBinaryOrderFor.
 *
 * CONFIRMED 2026-09-08 against the installed SDK's runtime exports (not a guess):
 * - The grant a follower signs (T021, frontend) is Trader.setOperatorApprovalGlobal /
 *   setOperatorApprovalForPool with selectors [PLACE_ORDER_FOR_SELECTOR,
 *   CANCEL_ORDER_FOR_SELECTOR] — the high-level SDK exposes this one directly.
 * - Placing FOR that owner is NOT exposed at the high-level Trader tier (no
 *   `placeOrderFor` method exists on it) — it's a raw contract call,
 *   `BinaryPool.placeBinaryOrderFor(owner, kind, price, quantity, expireTimestampNs,
 *   orderType, selfMatchingOption, builder, builderFeeBpsTimes1k, userData)`, ABI
 *   confirmed via the SDK's exported `binaryPoolWriteAbi`. This file calls it directly
 *   with viem — the "engine (advanced)" tier the SDK's own README points to for exactly
 *   this case.
 * - `kind`: ORDER_KIND.BUY_YES = 0, BUY_NO = 2 (never SELL_* — same "no naked shorts"
 *   convention the bot kit's ec-oracle-follow strategy documents).
 */

const EXPIRY_CUTOFF_MINUTES = 5; // keep in sync with packages/shared/src/types.ts
const ORDER_TYPE_IOC = 2; // ImmediateOrCancel — execute now against the book or cancel, never rest

// Phase 6 hardening: rate limit + kill switch. Nothing previously stopped a runaway loop
// (a bug, bad price data, a compromised strategy) from placing far more echoes than
// intended — see ROADMAP.md. Both are process-local (single worker instance today); a
// multi-instance deployment needs this moved to a shared store (Redis/Postgres), not
// in-memory counters.
const MAX_ECHOES_PER_MINUTE = 20;
const echoTimestamps: number[] = [];

function rateLimitOk(): boolean {
  const now = Date.now();
  while (echoTimestamps.length > 0 && now - echoTimestamps[0] > 60_000) {
    echoTimestamps.shift();
  }
  if (echoTimestamps.length >= MAX_ECHOES_PER_MINUTE) return false;
  echoTimestamps.push(now);
  return true;
}

function killSwitchEngaged(): boolean {
  return process.env.MIRROR_KILL_SWITCH === "1" || process.env.MIRROR_KILL_SWITCH === "true";
}

interface DecisionRow {
  id: string;
  trader_id: string;
  market_id: string;
  side: "up" | "down";
}

interface CopyLinkRow {
  id: string;
  proxy_grant_id: string;
  size_fraction: string;
}

interface ProxyGrantRow {
  operator_address: string;
  follower_address: string;
  revoked_at: string | null;
}

function operatorAccount() {
  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  if (!privateKey) throw new Error("OPERATOR_PRIVATE_KEY is not set — see .env.example");
  return privateKeyToAccount(privateKey as `0x${string}`);
}

export async function mirrorDecision(decisionId: string): Promise<void> {
  if (killSwitchEngaged()) {
    log.warn("MIRROR_KILL_SWITCH engaged, not echoed", { decisionId });
    return;
  }

  const decision = await queryOne<DecisionRow>(
    `SELECT id, trader_id, market_id, side FROM decision WHERE id = $1`,
    [decisionId]
  );
  if (!decision) return;

  const exchange = createReadOnlyExchange();
  await exchange.loadMarkets();
  const market = Object.values(exchange.markets).find((m: any) => m.info?.marketId === decision.market_id) as any;
  if (!market) {
    log.warn("market not found in live set, skipping", { marketId: decision.market_id });
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresIn = Number(market.info.expiry) - nowSec;
  if (expiresIn < EXPIRY_CUTOFF_MINUTES * 60) {
    log.info("under expiry cutoff, skipped not late", { decisionId: decision.id, expiresIn, cutoffMinutes: EXPIRY_CUTOFF_MINUTES });
    return;
  }

  const copyLinks = await query<CopyLinkRow>(
    `SELECT id, proxy_grant_id, size_fraction FROM copy_link WHERE trader_id = $1 AND active = true`,
    [decision.trader_id]
  );
  if (copyLinks.length === 0) return;

  const account = operatorAccount();
  const walletClient = createWalletClient({ account, chain: somniaShannon, transport: http() });
  const publicClient = createPublicClient({ chain: somniaShannon, transport: http() });

  const poolAddress = market.info.poolAddress as Address;
  const baseDecimals = Number(market.info.baseDecimals ?? 6);
  const quoteDecimals = Number(market.info.quoteDecimals ?? 6);
  const kind = decision.side === "up" ? ORDER_KIND.BUY_YES : ORDER_KIND.BUY_NO;
  const expireTimestampNs = BigInt(market.info.expiry) * 1_000_000_000n;

  for (const link of copyLinks) {
    const grant = await queryOne<ProxyGrantRow>(
      `SELECT operator_address, follower_address, revoked_at FROM proxy_grant WHERE id = $1`,
      [link.proxy_grant_id]
    );
    if (!grant || grant.revoked_at) continue; // SC-005: revoked grants never echo
    if (grant.operator_address.toLowerCase() !== account.address.toLowerCase()) continue;

    if (!rateLimitOk()) {
      log.error("rate limit hit, copyLink skipped not silently dropped", { maxPerMinute: MAX_ECHOES_PER_MINUTE, copyLinkId: link.id });
      await queryOne(
        `INSERT INTO echo (copy_link_id, source_decision_id, market_id, side, size, status, failure_reason)
         VALUES ($1, $2, $3, $4, $5, 'failed', 'rate_limited')
         ON CONFLICT (copy_link_id, source_decision_id) DO NOTHING`,
        [link.id, decision.id, decision.market_id, decision.side, Number(link.size_fraction)]
      );
      continue;
    }

    const followerStake = 1; // TODO: replace with the follower's configured base stake (P1 UI, T022)
    const size = followerStake * Number(link.size_fraction);
    const quantity = BigInt(Math.round(size * 10 ** baseDecimals));
    // Cross at the leader's own fill price — an MVP execution rule, not optimized.
    const price = BigInt(Math.round(Number(market.info.lastPrice ?? "0.5") * 10 ** quoteDecimals));

    try {
      const hash = await walletClient.writeContract({
        address: poolAddress,
        abi: binaryPoolWriteAbi,
        functionName: "placeBinaryOrderFor",
        args: [
          grant.follower_address as Address,
          kind,
          price,
          quantity,
          expireTimestampNs,
          ORDER_TYPE_IOC,
          0, // selfMatchingOption: CANCEL_TAKER (default)
          "0x0000000000000000000000000000000000000000" as Address, // builder: none
          0n, // builderFeeBpsTimes1k
          0n, // userData
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      // Idempotency: (copy_link_id, source_decision_id) is uniquely indexed (schema.sql)
      // — a retry after a crash between the tx confirming and this insert can never
      // record the same echo twice, even though it could still send a second on-chain
      // order in that narrow window. The DB-level guarantee stops double-counting; it
      // doesn't by itself stop double-sending — that's why the watcher only calls this
      // once per decision (its own insert is idempotent), not a belt-and-suspenders here.
      await queryOne(
        `INSERT INTO echo (copy_link_id, source_decision_id, market_id, side, size, status, tx_hash)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         ON CONFLICT (copy_link_id, source_decision_id) DO NOTHING`,
        [link.id, decision.id, decision.market_id, decision.side, size, hash]
      );

      log.info("echoed decision", { decisionId: decision.id, follower: grant.follower_address, copyLinkId: link.id, hash });
    } catch (err) {
      // Real failure state, not just a log line — a follower needs to see this, not
      // just us. errorName (a decoded revert like "ERC20InsufficientBalance") is a useful,
      // short reason; fall back to the raw message rather than swallowing it silently.
      const reason = (err as any)?.errorName ?? (err as Error).message ?? "unknown";
      await queryOne(
        `INSERT INTO echo (copy_link_id, source_decision_id, market_id, side, size, status, failure_reason)
         VALUES ($1, $2, $3, $4, $5, 'failed', $6)
         ON CONFLICT (copy_link_id, source_decision_id) DO NOTHING`,
        [link.id, decision.id, decision.market_id, decision.side, size, String(reason).slice(0, 500)]
      );
      log.error("failed to echo", { copyLinkId: link.id, reason: String(reason) });
    }
  }
}
