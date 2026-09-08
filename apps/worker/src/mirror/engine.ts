import { createWalletClient, createPublicClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { ORDER_KIND } from "@somnia-chain/markets-sdk";
import { parseAbi } from "viem";
import { createReadOnlyExchange } from "../chain/client.js";
import { query, queryOne } from "../db/client.js";
import { createLogger } from "../logger.js";

const log = createLogger("mirror");

/**
 * Places echoes by triggering each follower's own `EchoAccount`.
 *
 * This replaced a direct `BinaryPool.placeBinaryOrderFor(owner, …)` call, which cannot work:
 * Event Contract pools refuse that entry point to everyone but protocol system contracts, and
 * they refuse it even when the owner calls it for themselves. Proven on chain — see
 * FEEDBACK.md and `npm run verify:operator-gate`.
 *
 * So the direction inverts. The follower owns a contract that holds their collateral and calls
 * the ordinary `placeBinaryOrder` as itself; we hold a key that may pull its trigger and
 * nothing more. Everything that constrains us is written in their contract, not in our
 * intentions: `npm run verify:custody -w @echonome/contracts` proves on live Shannon that this
 * executor cannot withdraw, cannot widen its own limits, and stops dead on any of three kill
 * switches the follower controls unilaterally.
 *
 * What this engine must therefore do that the old one didn't: ASK the account whether it would
 * accept an order before sending one. An account can be paused, expired, revoked, out of
 * budget, or pointed at a pool it hasn't allowlisted, all without telling us — that is the
 * point of it. Discovering that by burning gas on a revert would be both wasteful and useless
 * to the follower, so the failure is read first and recorded with a reason they can act on.
 */

/** The slice of EchoAccount this engine uses. Kept as a literal here rather than imported
 *  from the contracts package's build output, so the worker needs no build step to run. */
const echoAccountAbi = parseAbi([
  "function placeOrder(address pool, uint8 kind, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, uint64 userData) returns (uint128)",
  "function executorStatus() view returns (bool active, bool isPaused, bool expired, uint64 expiry, uint256 budgetLeft)",
  "function allowedPool(address) view returns (bool)",
  "function executor() view returns (address)",
]);

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
  /** Raw base units the leader filled. Null on rows written before it was recorded. */
  quantity: string | null;
}

interface CopyLinkRow {
  id: string;
  proxy_grant_id: string;
  size_fraction: string;
}

interface ProxyGrantRow {
  operator_address: string;
  follower_address: string;
  account_address: string | null;
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
    `SELECT id, trader_id, market_id, side, quantity FROM decision WHERE id = $1`,
    [decisionId]
  );
  if (!decision) return;

  // A fresh exchange per call, so this first `loadMarkets` is a real read either way —
  // `reload: true` is explicit so that stays true if this is ever hoisted to a shared
  // instance, which is exactly the change that silently broke the watcher and the seed
  // runner (a bare loadMarkets() early-returns a cache). See FEEDBACK.md.
  const exchange = createReadOnlyExchange();
  await exchange.loadMarkets(true);
  const market = Object.values(exchange.markets).find((m: any) => m.info?.marketId === decision.market_id) as any;
  if (!market) {
    // Expected, not alarming: the watcher deliberately keeps reading fills from a window
    // for a few minutes after it expires, so a late fill can arrive naming a market that
    // has already left the tradeable set. There is nothing to echo into — the expiry cutoff
    // below would refuse it anyway — so this is an info, not a warning about missing data.
    log.info("source market no longer trading, nothing to echo into", { marketId: decision.market_id });
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
  const kind = decision.side === "up" ? ORDER_KIND.BUY_YES : ORDER_KIND.BUY_NO;
  const expireTimestampNs = BigInt(market.info.expiry) * 1_000_000_000n;

  /**
   * The price this echo crosses at, tick-aligned.
   *
   * An MVP execution rule and openly one: cross at the market's last traded price. A follower
   * echoing a leader is inherently late, so their fill is at whatever the book offers now, not
   * at the leader's price — pretending otherwise would misreport their entry.
   *
   * Tick alignment is not optional: the pool REVERTS `InvalidPrice` rather than rounding for
   * you, which cost real time to discover (see FEEDBACK.md), and the seed strategies floor
   * every price for the same reason.
   */
  const PRICE_TICK = 1000n;
  const rawPrice = BigInt(Math.round(Number(market.info.lastPrice ?? 500_000) ));
  const price = (rawPrice / PRICE_TICK) * PRICE_TICK;

  for (const link of copyLinks) {
    const grant = await queryOne<ProxyGrantRow>(
      `SELECT operator_address, follower_address, account_address, revoked_at FROM proxy_grant WHERE id = $1`,
      [link.proxy_grant_id]
    );
    if (!grant || grant.revoked_at) continue; // a revoked authorisation never echoes
    if (grant.operator_address.toLowerCase() !== account.address.toLowerCase()) continue;

    const echoAccount = grant.account_address as Address | null;
    if (!echoAccount) {
      // A grant with no account is a follower who started setup and didn't finish. Recorded
      // rather than skipped silently, because from their side "nothing happened" needs a
      // reason attached to it.
      await recordFailure(link.id, decision, sizeFor(decision, link) ?? 0n, "no_account_deployed");
      log.warn("copy link has no EchoAccount, cannot echo", { copyLinkId: link.id });
      continue;
    }

    const quantity = sizeFor(decision, link);
    if (quantity === null) {
      await recordFailure(link.id, decision, 0, "leader_size_unknown");
      log.warn("source decision has no recorded size, cannot scale the echo", { decisionId: decision.id });
      continue;
    }

    // Ask the account whether it would accept anything at all, BEFORE spending gas finding
    // out. Each of these is a state the follower controls and we are not entitled to
    // override — the whole design is that they can stop us without asking.
    let status: readonly [boolean, boolean, boolean, bigint, bigint];
    try {
      status = (await publicClient.readContract({
        address: echoAccount,
        abi: echoAccountAbi,
        functionName: "executorStatus",
      })) as readonly [boolean, boolean, boolean, bigint, bigint];
    } catch (err) {
      await recordFailure(link.id, decision, Number(quantity), "account_unreachable");
      log.error("could not read account status", { account: echoAccount, err: String(err).slice(0, 200) });
      continue;
    }

    const [active, isPaused, expired, , budgetLeft] = status;
    if (!active) {
      const reason = isPaused
        ? "follower_paused"
        : expired
          ? "authorisation_expired"
          : budgetLeft === 0n
            ? "budget_exhausted"
            : "executor_not_authorised";
      await recordFailure(link.id, decision, Number(quantity), reason);
      log.info("account is not accepting orders, skipped", { account: echoAccount, reason });
      continue;
    }

    const allowed = (await publicClient
      .readContract({ address: echoAccount, abi: echoAccountAbi, functionName: "allowedPool", args: [poolAddress] })
      .catch(() => false)) as boolean;
    if (!allowed) {
      await recordFailure(link.id, decision, Number(quantity), "pool_not_allowlisted");
      log.info("account has not allowlisted this pool, skipped", { account: echoAccount, pool: poolAddress });
      continue;
    }

    if (!rateLimitOk()) {
      log.error("rate limit hit, copyLink skipped not silently dropped", {
        maxPerMinute: MAX_ECHOES_PER_MINUTE,
        copyLinkId: link.id,
      });
      await recordFailure(link.id, decision, Number(quantity), "rate_limited");
      continue;
    }

    try {
      const hash = await walletClient.writeContract({
        address: echoAccount,
        abi: echoAccountAbi,
        functionName: "placeOrder",
        args: [poolAddress, kind, price, quantity, expireTimestampNs, ORDER_TYPE_IOC, 0, 0n],
        gas: 3_000_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      // Idempotency: (copy_link_id, source_decision_id) is uniquely indexed (schema.sql), so a
      // retry after a crash between the tx confirming and this insert can never record the
      // same echo twice — though it could still send a second on-chain order in that narrow
      // window, which is why the watcher only calls this once per decision.
      await queryOne(
        `INSERT INTO echo (copy_link_id, source_decision_id, market_id, side, size, status, tx_hash)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         ON CONFLICT (copy_link_id, source_decision_id) DO NOTHING`,
        [link.id, decision.id, decision.market_id, decision.side, Number(quantity), hash]
      );

      log.info("echoed decision", {
        decisionId: decision.id,
        follower: grant.follower_address,
        account: echoAccount,
        copyLinkId: link.id,
        quantity: String(quantity),
        hash,
      });
    } catch (err) {
      const reason = (err as any)?.errorName ?? (err as Error).message ?? "unknown";
      await recordFailure(link.id, decision, Number(quantity), String(reason).slice(0, 500));
      log.error("failed to echo", { copyLinkId: link.id, reason: String(reason) });
    }
  }
}

/**
 * The follower's echo size: the leader's own fill, scaled by the fraction the follower chose.
 *
 * This is what `followerStake = 1` was standing in for. That placeholder meant every echo was
 * the same size no matter what a follower selected, which would have made the size control in
 * the UI decorative — the worst kind of bug, because the product would have looked like it
 * worked. Returns null when the leader's size wasn't recorded, so the caller reports that
 * rather than inventing a number and trading on it.
 */
export function sizeFor(
  decision: Pick<DecisionRow, "quantity">,
  link: Pick<CopyLinkRow, "size_fraction">
): bigint | null {
  if (decision.quantity === null) return null;
  const leaderQuantity = BigInt(Math.floor(Number(decision.quantity)));
  const fraction = Number(link.size_fraction);
  if (!Number.isFinite(fraction) || fraction <= 0) return null;
  const scaled = BigInt(Math.floor(Number(leaderQuantity) * fraction));
  return scaled > 0n ? scaled : null;
}

/** A follower-visible failure with a reason, never just a log line. */
async function recordFailure(
  copyLinkId: string,
  decision: DecisionRow,
  size: number | bigint,
  reason: string
): Promise<void> {
  await queryOne(
    `INSERT INTO echo (copy_link_id, source_decision_id, market_id, side, size, status, failure_reason)
     VALUES ($1, $2, $3, $4, $5, 'failed', $6)
     ON CONFLICT (copy_link_id, source_decision_id) DO NOTHING`,
    [copyLinkId, decision.id, decision.market_id, decision.side, Number(size), reason]
  );
}
