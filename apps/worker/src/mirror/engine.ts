import { createOperatorExchange } from "../chain/client.js";
import { query, queryOne } from "../db/client.js";

/**
 * On a new Decision for a trader, fan it out to every active CopyLink pointed at
 * that trader — placing an echo via DreamDEX's operator-order path (placeOrderFor)
 * for each follower, sized by their configured fraction.
 *
 * TODO day-1: confirm the exact operator-order call shape against
 * dreamdex-bot-kit/packages/core (the sponsor's own reference implementation of this
 * exact pattern, used by every ec-* seed strategy) before wiring T013's seed traders —
 * both T013 and this file need the same mechanism, so verify once, use twice.
 */

const EXPIRY_CUTOFF_MINUTES = 5; // keep in sync with packages/shared/src/types.ts

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

export async function mirrorDecision(decisionId: string): Promise<void> {
  const decision = await queryOne<DecisionRow>(
    `SELECT id, trader_id, market_id, side FROM decision WHERE id = $1`,
    [decisionId]
  );
  if (!decision) return;

  const exchange = createOperatorExchange();
  await exchange.loadMarkets();
  const market = Object.values(exchange.markets).find((m: any) => m.info?.marketId === decision.market_id) as any;
  if (!market) {
    console.warn(`[mirror] market ${decision.market_id} not found in live set — skipping`);
    return;
  }

  const expiresIn = Number(market.info.expiry) - Math.floor(Date.now() / 1000);
  if (expiresIn < EXPIRY_CUTOFF_MINUTES * 60) {
    console.log(`[mirror] decision ${decision.id}: only ${expiresIn}s left, under the ${EXPIRY_CUTOFF_MINUTES}m cutoff — skipped, not late`);
    return;
  }

  const copyLinks = await query<CopyLinkRow>(
    `SELECT id, proxy_grant_id, size_fraction FROM copy_link WHERE trader_id = $1 AND active = true`,
    [decision.trader_id]
  );

  for (const link of copyLinks) {
    const grant = await queryOne<ProxyGrantRow>(
      `SELECT operator_address, follower_address, revoked_at FROM proxy_grant WHERE id = $1`,
      [link.proxy_grant_id]
    );
    if (!grant || grant.revoked_at) continue; // SC-005: revoked grants never echo

    const outcomeIndex = decision.side === "up" ? 0 : 1; // 0 = YES/Up, 1 = NO/Down
    const followerStake = 1; // TODO: replace with the follower's configured base stake (P1 UI, T022)
    const size = followerStake * Number(link.size_fraction);

    try {
      // Placeholder call shape — see the TODO above. `owner` routes the fill and its
      // settlement to the follower's own vault; the operator key never custodies it.
      const result = await (exchange.trader as any).createOrder(market.symbol, "market", outcomeIndex === 0 ? "buy" : "sell", size, undefined, {
        owner: grant.follower_address,
      });

      await queryOne(
        `INSERT INTO echo (copy_link_id, source_decision_id, market_id, side, size, status, tx_hash)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [link.id, decision.id, decision.market_id, decision.side, size, result?.txHash ?? null]
      );

      console.log(`[mirror] echoed decision ${decision.id} to follower ${grant.follower_address} (copyLink ${link.id})`);
    } catch (err) {
      console.error(`[mirror] failed to echo copyLink ${link.id}`, err);
    }
  }
}
