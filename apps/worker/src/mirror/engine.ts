import { createWalletClient, createPublicClient, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { ORDER_KIND } from "@somnia-chain/markets-sdk";
import { echoAccountAbi } from "../chain/echoAccount.js";
import { seriesIdFor } from "../chain/series.js";
import { createReadOnlyExchange } from "../chain/client.js";
import { query, queryOne } from "../db/client.js";
import { createLogger } from "../logger.js";

/** Just enough ERC-20 to ask whether this window's pool can already pull collateral. */
const erc20AllowanceAbi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
]);

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

const EXPIRY_CUTOFF_MINUTES = 5; // keep in sync with packages/shared/src/types.ts
const ORDER_TYPE_IOC = 2; // ImmediateOrCancel — execute now against the book or cancel, never rest

// Phase 6 hardening: rate limit + kill switch. Nothing previously stopped a runaway loop
// (a bug, bad price data, a compromised strategy) from placing far more echoes than
// intended — see ROADMAP.md. Both are process-local (single worker instance today); a
// multi-instance deployment needs this moved to a shared store (Redis/Postgres), not
// in-memory counters.
/**
 * Sliding-window cap on echoes per minute.
 *
 * Configurable because the default is demonstrably too low for a busy leader: one follower
 * copying `ec-maker` hit it 28 times in half an hour, and every one of those was an echo a
 * follower had asked for and did not get. Raising it is a real safety decision though — this
 * cap is what stops a bug, bad price data or a compromised strategy from emptying an account
 * one valid-looking order at a time — so the default stays conservative and raising it is an
 * explicit, recorded choice rather than a quiet edit.
 */
const MAX_ECHOES_PER_MINUTE = Number(process.env.MIRROR_MAX_ECHOES_PER_MINUTE ?? 20);
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
  const marketId = decision.market_id as `0x${string}`;
  const collateralToken = market.info.collateral as Address;
  const oneShareRaw = 10n ** BigInt(Number(market.info.baseDecimals ?? 6));

  /**
   * Which rolling series this market belongs to — "BTC, hourly" as a number the account can
   * check. A follower approves the series once and every future window in it is authorised
   * automatically, which is what replaced re-approving a pool address every hour.
   *
   * A market outside every registered series is not echoed at all. That is a refusal to guess:
   * the account would reject the order anyway, and sending it would burn gas to be told so.
   */
  const seriesId = await seriesIdFor(String(market.info.asset), String(market.info.interval));
  if (seriesId === null) {
    log.warn("market belongs to no registered venue series, not echoed", {
      marketId,
      asset: market.info.asset,
      interval: market.info.interval,
    });
    for (const link of copyLinks) {
      await recordFailure(link.id, decision, 0, "market_outside_venue_series");
    }
    return;
  }

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

  /**
   * Price the echo to actually CROSS the book, not to look reasonable.
   *
   * The first version crossed at the market's last traded price, and every IOC order it sent
   * reverted `ImmediateOrCancelNoFill` — last price was 0.945 while the best ask sat at 0.947,
   * so the order was priced just under the liquidity it was trying to take. An
   * immediate-or-cancel order that does not reach the touch is not a conservative order, it is
   * a guaranteed failure that still costs gas.
   *
   * So: a YES buy takes the best ask; a NO buy takes the complement of the best bid, which is
   * the same convention the seed strategies use. If the side we need is empty there is nothing
   * to cross and no price would help — the caller records that rather than sending.
   */
  const book = await exchange.fetchOrderBook(market.symbol);
  const bestAsk = (book.asks as [number, number][])[0]?.[0];
  const bestBid = (book.bids as [number, number][])[0]?.[0];
  const crossHuman = kind === ORDER_KIND.BUY_YES ? bestAsk : bestBid === undefined ? undefined : 1 - bestBid;

  if (crossHuman === undefined) {
    log.info("no liquidity on the side this echo needs, nothing to cross", {
      decisionId: decision.id,
      side: decision.side,
    });
    for (const link of copyLinks) {
      await recordFailure(link.id, decision, 0, "no_liquidity_to_cross");
    }
    return;
  }

  const price = (BigInt(Math.round(crossHuman * 1e6)) / PRICE_TICK) * PRICE_TICK;

  // The pool's quantity grid, read from the market rather than assumed. `precision.amount` is
  // decimal places (3 here), so one lot is 10^(baseDecimals - precision) raw units, and
  // `limits.amount.min` is the smallest order the pool will accept at all.
  const baseDecimals = Number(market.info.baseDecimals ?? 6);
  const amountPrecision = Number(market.precision?.amount ?? 3);
  const lotRaw = 10n ** BigInt(Math.max(0, baseDecimals - amountPrecision));
  const minRaw = BigInt(Math.round(Number(market.limits?.amount?.min ?? 0) * 10 ** baseDecimals));

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

    const scaled = sizeFor(decision, link);
    if (scaled === null) {
      await recordFailure(link.id, decision, 0, "leader_size_unknown");
      log.warn("source decision has no recorded size, cannot scale the echo", { decisionId: decision.id });
      continue;
    }

    const quantity = toLotQuantity(scaled, lotRaw, minRaw);
    if (quantity === null) {
      // Honest and useful: their chosen fraction of this particular trade is smaller than the
      // market will accept. That is a fact about their settings meeting this trade, not an
      // error, and it is the kind of thing they can fix by copying at a larger fraction.
      await recordFailure(link.id, decision, Number(scaled), "below_market_minimum");
      log.info("echo below the market's minimum order size, skipped", {
        copyLinkId: link.id,
        scaled: String(scaled),
        minimum: String(minRaw),
      });
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

    // Ask the account itself whether it would authorise this market, and take its named revert
    // as the reason. This replaces reading `allowedPool` directly, which was both wrong and
    // uninformative: wrong because a follower now approves a SERIES rather than the hour's
    // pool address, and uninformative because a bare false could not distinguish "you approved
    // a different asset" from "this window has closed".
    try {
      await publicClient.readContract({
        address: echoAccount,
        abi: echoAccountAbi,
        functionName: "previewAuthorisation",
        args: [marketId, seriesId, poolAddress],
      });
    } catch (err) {
      const reason = decodeReason(err);
      await recordFailure(link.id, decision, Number(quantity), reason);
      log.info("account would not authorise this market, skipped", {
        account: echoAccount,
        marketId,
        seriesId,
        pool: poolAddress,
        reason,
      });
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

    // A pool PULLS collateral at fill time, so it needs an allowance from the account — and a
    // pool address is per-window, so a freshly rolled market always starts with none. The
    // follower granted the executor permission to set exactly this allowance, on exactly this
    // kind of market, precisely so that a rollover does not require them to sign again.
    //
    // Skipped silently when the allowance already covers the order, which it does for every
    // echo after the first one in a window.
    try {
      const allowance = (await publicClient.readContract({
        address: collateralToken,
        abi: erc20AllowanceAbi,
        functionName: "allowance",
        args: [echoAccount, poolAddress],
      })) as bigint;

      if (allowance < (price * quantity) / oneShareRaw) {
        // Simulate first, for the same reason the order below does: a mined-and-reverted
        // transaction's receipt carries no reason, so sending blind turns a precise refusal
        // into "approval reverted (0x…)". Observed exactly that at the 12:00 rollover, where
        // the honest answer was that the venue had not yet pointed the series at the new
        // window — a two-second condition that resolves itself, and unreadable without this.
        await publicClient.simulateContract({
          account,
          address: echoAccount,
          abi: echoAccountAbi,
          functionName: "approveMarketCollateral",
          args: [marketId, seriesId],
        });

        // Estimate rather than guess. A hand-picked 500,000 simulated fine and then reverted on
        // chain 21 times, using 485,680 of it — not the clean gasUsed == limit that says
        // "out of gas", but the 63/64 signature of an INNER call running out while the outer
        // frame keeps its reserve. This account's approval reads a 14-field market record and a
        // series row from two other contracts before it touches the token, and that costs more
        // on this chain than it looks like it should. Doubling the estimate leaves room for the
        // venue's own storage being cold.
        const approvalGas = await publicClient.estimateContractGas({
          account,
          address: echoAccount,
          abi: echoAccountAbi,
          functionName: "approveMarketCollateral",
          args: [marketId, seriesId],
        });

        const receipt = await sendSerially(async () => {
          const hash = await walletClient.writeContract({
            address: echoAccount,
            abi: echoAccountAbi,
            functionName: "approveMarketCollateral",
            args: [marketId, seriesId],
            gas: approvalGas * 2n,
          });
          return publicClient.waitForTransactionReceipt({ hash });
        });
        if (receipt.status !== "success") throw new Error(`approval reverted (${receipt.transactionHash})`);
        log.info("granted this window's pool its collateral allowance", {
          account: echoAccount,
          pool: poolAddress,
          marketId,
          seriesId,
        });
      }
    } catch (err) {
      const reason = decodeReason(err);
      await recordFailure(link.id, decision, Number(quantity), reason);
      log.warn("could not grant the pool its collateral allowance", { account: echoAccount, pool: poolAddress, reason });
      continue;
    }

    const orderArgs = [marketId, seriesId, poolAddress, kind, price, quantity, expireTimestampNs, ORDER_TYPE_IOC, 0, 0n] as const;

    // Simulate first. A reverting order costs the same gas whether we discover it before or
    // after sending, and simulating gives the DECODED reason — the difference between telling a
    // follower "reverted_on_chain" and telling them the book moved out from under their order.
    // It also stopped a real waste: thirteen consecutive echoes were spending gas to be told
    // ImmediateOrCancelNoFill.
    try {
      await publicClient.simulateContract({
        account,
        address: echoAccount,
        abi: echoAccountAbi,
        functionName: "placeOrder",
        args: orderArgs,
      });
    } catch (err) {
      const reason = decodeReason(err);
      await recordFailure(link.id, decision, Number(quantity), reason);
      log.info("echo would revert, not sent", { copyLinkId: link.id, reason });
      continue;
    }

    try {
      const receipt = await sendSerially(async () => {
        const hash = await walletClient.writeContract({
          address: echoAccount,
          abi: echoAccountAbi,
          functionName: "placeOrder",
          args: orderArgs,
          gas: 3_000_000n,
        });
        return publicClient.waitForTransactionReceipt({ hash });
      });
      const hash = receipt.transactionHash;
      if (receipt.status !== "success") {
        // BUG FOUND ON THE FIRST REAL ECHO: this branch did not exist. The engine waited for
        // the receipt and never looked at its status, so a transaction that mined and REVERTED
        // was recorded as 'pending' with a transaction hash — telling a follower their trade
        // was placed and awaiting settlement when it had already failed. That is precisely the
        // silent-wrong-state failure this codebase keeps producing, and it is worse here than
        // anywhere else because it is a lie about someone's money.
        await recordFailure(link.id, decision, Number(quantity), "reverted_on_chain");
        log.error("echo transaction reverted on chain", { copyLinkId: link.id, hash, gasUsed: String(receipt.gasUsed) });
        continue;
      }

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
      const reason = decodeReason(err);
      await recordFailure(link.id, decision, Number(quantity), reason);
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

/**
 * One operator key signs every echo, so two echoes in flight at once race for the same nonce —
 * which is exactly what happened: five echoes failed with "Nonce provided for the transaction is
 * too low" the first time this engine ran against a busy leader. viem reads the pending nonce
 * per call, and two calls that read it before either lands read the same number.
 *
 * A promise chain is the whole fix at this scale: sends queue behind each other on one key.
 * A multi-instance deployment needs real nonce management or a key per worker, which is the same
 * caveat the rate limiter already carries.
 */
let sendQueue: Promise<unknown> = Promise.resolve();

function sendSerially<T>(fn: () => Promise<T>): Promise<T> {
  const next = sendQueue.then(fn, fn);
  // Swallow on the chain itself so one failure doesn't poison every queued send after it; the
  // caller still sees its own rejection through `next`.
  sendQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/** A revert's decoded name where one exists — far more useful to a follower than a stack. */
function decodeReason(err: unknown): string {
  const e = err as { errorName?: string; cause?: any; shortMessage?: string; message?: string };
  const name =
    e?.errorName ?? e?.cause?.data?.errorName ?? e?.cause?.cause?.data?.errorName ?? undefined;
  if (name) return String(name);
  return String(e?.shortMessage ?? e?.message ?? "unknown").slice(0, 200);
}

/**
 * Snap a quantity onto the pool's lot grid, or refuse.
 *
 * BUG FOUND ON THE FIRST REAL ECHO (2026-09-09): this is the quantity twin of the tick-price
 * problem already in FEEDBACK.md, and it bit in exactly the same way. The pool enforces a lot
 * grid AND a minimum order size, and it REVERTS `InvalidQuantity` rather than rounding for
 * you. A 25% copy of a 55,000-unit fill is 13,750, which is not a multiple of the 1,000-unit
 * lot, so the very first two echoes this engine ever placed both reverted on chain.
 *
 * Floors rather than rounds, for the same reason `sizeFor` does: never trade a follower larger
 * than they asked. Returns null when the result falls under the market's minimum, so the caller
 * records a reason the follower can understand instead of paying gas to be told no.
 */
export function toLotQuantity(raw: bigint, lotRaw: bigint, minRaw: bigint): bigint | null {
  if (lotRaw <= 0n) return raw >= minRaw ? raw : null;
  const floored = (raw / lotRaw) * lotRaw;
  if (floored <= 0n || floored < minRaw) return null;
  return floored;
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
