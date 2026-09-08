import { query, queryOne } from "./db";
import { MIN_CALIBRATION_SAMPLE, type Side, type EchoStatus } from "@echonome/shared";

/**
 * Every read this app performs, in one place. Both the API routes under `app/api/*`
 * (the contract in TECHNICAL_ARCHITECTURE.md) and the server components that render
 * pages call these — the pages don't HTTP-fetch our own API, they call the same
 * function the route handler does. One source of truth, one round trip.
 *
 * Postgres returns `numeric` and `count(*)` as strings over the wire. Every one of them
 * is coerced here, at the boundary, so nothing downstream ever does arithmetic on a
 * string that happens to look like a number.
 */

export interface LeaderboardEntry {
  id: string;
  address: string;
  label: string;
  isSeed: boolean;
  /** Lower is better. Null until this trader has at least one resolved decision. */
  brierScore: number | null;
  sampleCount: number;
  /** True while sampleCount is below the threshold — shown, not hidden. */
  warmingUp: boolean;
  decisionCount: number;
  resolvedCount: number;
  /** Share of resolved calls where the direction taken matched the outcome. */
  hitRate: number | null;
  activeFollowers: number;
  lastDecisionAt: string | null;
  computedAt: string | null;
}

interface LeaderboardRow {
  id: string;
  address: string;
  label: string;
  is_seed: boolean;
  brier_score: string | null;
  sample_count: string;
  computed_at: Date | null;
  decision_count: string;
  resolved_count: string;
  hit_count: string;
  last_decision_at: Date | null;
  active_followers: string;
}

function toEntry(r: LeaderboardRow): LeaderboardEntry {
  const resolvedCount = Number(r.resolved_count);
  const sampleCount = Number(r.sample_count);
  return {
    id: r.id,
    address: r.address,
    label: r.label,
    isSeed: r.is_seed,
    brierScore: r.brier_score === null ? null : Number(r.brier_score),
    sampleCount,
    warmingUp: sampleCount < MIN_CALIBRATION_SAMPLE,
    decisionCount: Number(r.decision_count),
    resolvedCount,
    hitRate: resolvedCount === 0 ? null : Number(r.hit_count) / resolvedCount,
    activeFollowers: Number(r.active_followers),
    lastDecisionAt: r.last_decision_at?.toISOString() ?? null,
    computedAt: r.computed_at?.toISOString() ?? null,
  };
}

const LEADERBOARD_SELECT = `
  SELECT t.id, t.address, t.label, t.is_seed,
         cs.brier_score, COALESCE(cs.sample_count, 0) AS sample_count, cs.computed_at,
         s.decision_count, s.resolved_count, s.hit_count, s.last_decision_at,
         COALESCE(f.active_followers, 0) AS active_followers
  FROM trader t
  LEFT JOIN calibration_score cs ON cs.trader_id = t.id
  LEFT JOIN LATERAL (
    SELECT count(*) AS decision_count,
           count(*) FILTER (WHERE d.settled_outcome IS NOT NULL) AS resolved_count,
           count(*) FILTER (WHERE d.settled_outcome IS NOT NULL AND d.side = d.settled_outcome) AS hit_count,
           max(d.created_at) AS last_decision_at
    FROM decision d WHERE d.trader_id = t.id
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS active_followers
    FROM copy_link cl WHERE cl.trader_id = t.id AND cl.active
  ) f ON true`;

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  // Ranked traders first, best (lowest) Brier score first within them; warming-up
  // traders keep their place below, ordered by how close they are to qualifying.
  // A trader is never dropped from this list for being new — see the "warming up"
  // rule in TECHNICAL_ARCHITECTURE.md.
  const rows = await query<LeaderboardRow>(
    `${LEADERBOARD_SELECT}
     ORDER BY (COALESCE(cs.sample_count, 0) >= $1) DESC,
              cs.brier_score ASC NULLS LAST,
              COALESCE(cs.sample_count, 0) DESC`,
    [MIN_CALIBRATION_SAMPLE]
  );
  return rows.map(toEntry);
}

export async function getTraderSummary(id: string): Promise<LeaderboardEntry | null> {
  const row = await queryOne<LeaderboardRow>(`${LEADERBOARD_SELECT} WHERE t.id = $1`, [id]);
  return row ? toEntry(row) : null;
}

export interface DecisionView {
  id: string;
  marketId: string;
  side: Side;
  /** P(up) the market was pricing when this trade filled — always YES-terms. */
  impliedProbability: number;
  settledOutcome: Side | null;
  /** Null while the market is still open. */
  wasRight: boolean | null;
  createdAt: string;
  resolvedAt: string | null;
}

export async function getTraderDecisions(id: string, limit = 100): Promise<DecisionView[]> {
  const rows = await query<{
    id: string;
    market_id: string;
    side: Side;
    implied_probability: string;
    settled_outcome: Side | null;
    created_at: Date;
    resolved_at: Date | null;
  }>(
    `SELECT id, market_id, side, implied_probability, settled_outcome, created_at, resolved_at
     FROM decision WHERE trader_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [id, limit]
  );

  return rows.map((r) => ({
    id: r.id,
    marketId: r.market_id,
    side: r.side,
    impliedProbability: Number(r.implied_probability),
    settledOutcome: r.settled_outcome,
    wasRight: r.settled_outcome === null ? null : r.side === r.settled_outcome,
    createdAt: r.created_at.toISOString(),
    resolvedAt: r.resolved_at?.toISOString() ?? null,
  }));
}

export interface EchoView {
  id: string;
  traderId: string;
  traderLabel: string;
  marketId: string;
  side: Side;
  size: number;
  status: EchoStatus;
  failureReason: string | null;
  settledOutcome: Side | null;
  /** Null unless the echo has settled. */
  wasRight: boolean | null;
  txHash: string | null;
  createdAt: string;
}

/** Every echo placed for one follower wallet, newest first, across all of their copy links. */
export async function getEchoesForFollower(followerAddress: string): Promise<EchoView[]> {
  const rows = await query<{
    id: string;
    trader_id: string;
    trader_label: string;
    market_id: string;
    side: Side;
    size: string;
    status: EchoStatus;
    failure_reason: string | null;
    settled_outcome: Side | null;
    tx_hash: string | null;
    created_at: Date;
  }>(
    `SELECT e.id, t.id AS trader_id, t.label AS trader_label, e.market_id, e.side, e.size,
            e.status, e.failure_reason, e.settled_outcome, e.tx_hash, e.created_at
     FROM echo e
     JOIN copy_link cl ON cl.id = e.copy_link_id
     JOIN proxy_grant pg ON pg.id = cl.proxy_grant_id
     JOIN trader t ON t.id = cl.trader_id
     WHERE lower(pg.follower_address) = lower($1)
     ORDER BY e.created_at DESC
     LIMIT 200`,
    [followerAddress]
  );

  return rows.map((r) => ({
    id: r.id,
    traderId: r.trader_id,
    traderLabel: r.trader_label,
    marketId: r.market_id,
    side: r.side,
    size: Number(r.size),
    status: r.status,
    failureReason: r.failure_reason,
    settledOutcome: r.settled_outcome,
    wasRight: r.settled_outcome === null ? null : r.side === r.settled_outcome,
    txHash: r.tx_hash,
    createdAt: r.created_at.toISOString(),
  }));
}

export interface CopyLinkView {
  id: string;
  traderId: string;
  traderLabel: string;
  sizeFraction: number;
  active: boolean;
  echoCount: number;
  createdAt: string;
}

export async function getCopyLinksForFollower(followerAddress: string): Promise<CopyLinkView[]> {
  const rows = await query<{
    id: string;
    trader_id: string;
    trader_label: string;
    size_fraction: string;
    active: boolean;
    echo_count: string;
    created_at: Date;
  }>(
    `SELECT cl.id, t.id AS trader_id, t.label AS trader_label, cl.size_fraction, cl.active,
            cl.created_at,
            (SELECT count(*) FROM echo e WHERE e.copy_link_id = cl.id) AS echo_count
     FROM copy_link cl
     JOIN proxy_grant pg ON pg.id = cl.proxy_grant_id
     JOIN trader t ON t.id = cl.trader_id
     WHERE lower(pg.follower_address) = lower($1)
     ORDER BY cl.active DESC, cl.created_at DESC`,
    [followerAddress]
  );

  return rows.map((r) => ({
    id: r.id,
    traderId: r.trader_id,
    traderLabel: r.trader_label,
    sizeFraction: Number(r.size_fraction),
    active: r.active,
    echoCount: Number(r.echo_count),
    createdAt: r.created_at.toISOString(),
  }));
}

/** The follower's live grant, if they have one that hasn't been revoked. */
export async function getActiveGrant(followerAddress: string): Promise<{ id: string; operatorAddress: string; grantedAt: string } | null> {
  const row = await queryOne<{ id: string; operator_address: string; granted_at: Date }>(
    `SELECT id, operator_address, granted_at FROM proxy_grant
     WHERE lower(follower_address) = lower($1) AND revoked_at IS NULL
     ORDER BY granted_at DESC LIMIT 1`,
    [followerAddress]
  );
  return row ? { id: row.id, operatorAddress: row.operator_address, grantedAt: row.granted_at.toISOString() } : null;
}

export interface TraceTick {
  side: Side;
  settledOutcome: Side | null;
  wasRight: boolean | null;
}

/**
 * The last N decisions for every trader at once, for the leaderboard's traces.
 * A window function rather than one query per row — the leaderboard has two seed traders
 * today and an unbounded number once organic discovery lands (ROADMAP.md Phase 5), and an
 * N+1 that only shows up at scale is the kind that ships.
 */
export async function getRecentTraces(perTrader = 40): Promise<Map<string, TraceTick[]>> {
  const rows = await query<{ trader_id: string; side: Side; settled_outcome: Side | null }>(
    `SELECT trader_id, side, settled_outcome FROM (
       SELECT d.trader_id, d.side, d.settled_outcome, d.created_at,
              row_number() OVER (PARTITION BY d.trader_id ORDER BY d.created_at DESC) AS rn
       FROM decision d
     ) ranked
     WHERE rn <= $1
     ORDER BY trader_id, created_at ASC`,
    [perTrader]
  );

  const traces = new Map<string, TraceTick[]>();
  for (const r of rows) {
    const ticks = traces.get(r.trader_id) ?? [];
    ticks.push({
      side: r.side,
      settledOutcome: r.settled_outcome,
      wasRight: r.settled_outcome === null ? null : r.side === r.settled_outcome,
    });
    traces.set(r.trader_id, ticks);
  }
  return traces;
}
