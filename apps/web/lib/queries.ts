import { query, queryOne, queryOrNull } from "./db";
import { describeMarket, loadMarketLabels } from "./markets";
import { MIN_CALIBRATION_SAMPLE, type Side, type EchoStatus, type ReliabilityBucket } from "@echonome/shared";

// Re-exported so landing components take their types from the same module they take their
// data from, rather than reaching past it into the shared package.
export type { ReliabilityBucket, Side, EchoStatus };

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
  /**
   * Mean profit per unit staked — how much better they did than the prices they paid.
   * +0.05 means five cents per dollar. THIS is what a follower is choosing on.
   */
  edge: number | null;
  /** The conservative end of edge's 95% interval, and what the ranking sorts on. */
  edgeLower: number | null;
  /** Lower is better. Kept as a secondary signal, never as the ranking. */
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
  /** Confidence-vs-outcome breakdown. Empty until the trader has resolved calls. */
  reliability: ReliabilityBucket[];
}

interface LeaderboardRow {
  id: string;
  address: string;
  label: string;
  is_seed: boolean;
  brier_score: string | null;
  edge: string | null;
  edge_lower: string | null;
  sample_count: string;
  reliability: ReliabilityBucket[] | null;
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
    edge: r.edge === null ? null : Number(r.edge),
    edgeLower: r.edge_lower === null ? null : Number(r.edge_lower),
    brierScore: r.brier_score === null ? null : Number(r.brier_score),
    sampleCount,
    warmingUp: sampleCount < MIN_CALIBRATION_SAMPLE,
    decisionCount: Number(r.decision_count),
    resolvedCount,
    hitRate: resolvedCount === 0 ? null : Number(r.hit_count) / resolvedCount,
    activeFollowers: Number(r.active_followers),
    lastDecisionAt: r.last_decision_at?.toISOString() ?? null,
    computedAt: r.computed_at?.toISOString() ?? null,
    // pg returns jsonb already parsed; the guard is for the column's '[]' default and for
    // rows written before the buckets existed.
    reliability: Array.isArray(r.reliability) ? r.reliability : [],
  };
}

const LEADERBOARD_SELECT = `
  SELECT t.id, t.address, t.label, t.is_seed,
         cs.brier_score, cs.edge, cs.edge_lower,
         COALESCE(cs.sample_count, 0) AS sample_count, cs.reliability, cs.computed_at,
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
  // Ranked traders first, highest EDGE within them — specifically `edge_lower`, the
  // conservative end of the interval, so a trader climbs by accumulating evidence rather
  // than by having a good run. Ranking on the raw edge would put twenty lucky calls above
  // nine hundred consistent ones.
  //
  // NOT ranked on the Brier score, deliberately. Brier rewards a price that turned out to be
  // accurate; a trader profits when a price turns out to be wrong in their favour. Sorting on
  // it ranks against the people most worth copying — see `edgeScore` in the worker's
  // calibration engine for the full argument.
  //
  // A trader is never dropped from this list for being new; see the "warming up" rule in
  // TECHNICAL_ARCHITECTURE.md.
  //
  // Reads through queryOrNull so a deploy without a reachable database serves the page's
  // own empty state rather than a 500. An unreadable board and an empty board look the same
  // to this function, which is acceptable here only because the page says "no traders yet"
  // rather than asserting anything about why.
  const rows = await queryOrNull<LeaderboardRow>(
    `${LEADERBOARD_SELECT}
     ORDER BY (COALESCE(cs.sample_count, 0) >= $1) DESC,
              cs.edge_lower DESC NULLS LAST,
              COALESCE(cs.sample_count, 0) DESC`,
    [MIN_CALIBRATION_SAMPLE]
  );
  return (rows ?? []).map(toEntry);
}

export async function getTraderSummary(id: string): Promise<LeaderboardEntry | null> {
  const row = await queryOne<LeaderboardRow>(`${LEADERBOARD_SELECT} WHERE t.id = $1`, [id]);
  return row ? toEntry(row) : null;
}

export interface DecisionView {
  id: string;
  marketId: string;
  /** "BTC 1-hour" when the indexer knows the market, null when it doesn't — callers fall
   * back to `shortMarket(marketId)`. See lib/markets.ts. */
  marketLabel: string | null;
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

  const labels = await loadMarketLabels();

  return rows.map((r) => ({
    id: r.id,
    marketId: r.market_id,
    marketLabel: describeMarket(labels.get(r.market_id)),
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
  /** "BTC 1-hour" when the indexer knows the market, null when it doesn't. See lib/markets.ts. */
  marketLabel: string | null;
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

  const labels = await loadMarketLabels();

  return rows.map((r) => ({
    id: r.id,
    traderId: r.trader_id,
    traderLabel: r.trader_label,
    marketId: r.market_id,
    marketLabel: describeMarket(labels.get(r.market_id)),
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
export async function getActiveGrant(
  followerAddress: string
): Promise<{ id: string; operatorAddress: string; accountAddress: string | null; grantedAt: string } | null> {
  const row = await queryOne<{ id: string; operator_address: string; account_address: string | null; granted_at: Date }>(
    `SELECT id, operator_address, account_address, granted_at FROM proxy_grant
     WHERE lower(follower_address) = lower($1) AND revoked_at IS NULL
     ORDER BY granted_at DESC LIMIT 1`,
    [followerAddress]
  );
  return row
    ? {
        id: row.id,
        operatorAddress: row.operator_address,
        accountAddress: row.account_address,
        grantedAt: row.granted_at.toISOString(),
      }
    : null;
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
  const rows = await queryOrNull<{ trader_id: string; side: Side; settled_outcome: Side | null }>(
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
  for (const r of rows ?? []) {
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

export interface SiteStats {
  traders: number;
  decisions: number;
  markets: number;
  echoesSettled: number;
}

/**
 * The four figures on the landing page's proof strip. Chosen after checking what the database
 * actually holds, which corrected two of them.
 *
 * "Markets settled" was originally one of these and had to go: every decision in the table has
 * a settled outcome, so it rendered the identical number to "decisions recorded" and read as a
 * copy-paste bug. Distinct markets covered is the figure that was actually meant.
 *
 * `echoesSettled` counts settled echoes rather than all echo rows, and that distinction is not
 * cosmetic. There are 296 failed rows against 32 settled ones, most of them refused by an
 * EchoAccount that had not allowlisted the pool. Printing the total as "echoes placed" would
 * have put a number on the front page that is ten times the number of echoes that actually
 * reached a market — on the page whose entire argument is that we do not curate our own
 * record. Failures are reported where they belong, on the follower's own page, with reasons.
 */
export async function getSiteStats(): Promise<SiteStats | null> {
  const rows = await queryOrNull<{
    traders: string;
    decisions: string;
    markets: string;
    echoes_settled: string;
  }>(
    `SELECT
       (SELECT count(*) FROM trader)                              AS traders,
       (SELECT count(*) FROM decision)                            AS decisions,
       (SELECT count(DISTINCT market_id) FROM decision)           AS markets,
       (SELECT count(*) FROM echo WHERE status = 'settled')       AS echoes_settled`
  );
  if (rows === null) return null;
  const row = rows[0];

  return {
    traders: Number(row?.traders ?? 0),
    decisions: Number(row?.decisions ?? 0),
    markets: Number(row?.markets ?? 0),
    echoesSettled: Number(row?.echoes_settled ?? 0),
  };
}

export interface CalibrationHighlight {
  id: string;
  label: string;
  brier: number | null;
  sampleCount: number;
  buckets: ReliabilityBucket[];
  /** The band where stated confidence and reality disagree most. */
  worst: {
    /** Midpoint of the band, e.g. 0.75 for the calls rated 70-80%. */
    claimed: number;
    observed: number;
    sampleCount: number;
    /** observed - claimed. Negative means overconfident, the interesting direction. */
    deviation: number;
  };
}

/** A band holding fewer calls than this is noise, and pointing at it would be a claim the sample cannot support. */
const MIN_BUCKET_SAMPLE = 20;

/**
 * Finds the trader whose single Brier score hides the most, for the landing page section that
 * puts one of our own on the front page.
 *
 * Selection is by the largest gap between what a trader claimed and what happened, across any
 * band holding at least MIN_BUCKET_SAMPLE calls. The first version of this ranked by the
 * spread between a trader's best and worst band instead, which selected exactly backwards: it
 * picked the trader whose lowest band was near zero and highest near one, meaning the band
 * order tracked reality perfectly. That is textbook good calibration, and it was about to be
 * rendered under a heading calling the trader wrong. Distance from the diagonal is the
 * quantity that means "miscalibrated". Spread across bands is not.
 *
 * Returns null when no seed trader has a band with enough calls, and the section then does not
 * render at all, rather than making a claim about a sample too thin to carry it.
 */
export async function getCalibrationHighlight(): Promise<CalibrationHighlight | null> {
  const rows = await queryOrNull<{
    id: string;
    label: string;
    brier: string | null;
    sample_count: number | null;
    reliability: ReliabilityBucket[] | null;
  }>(
    `SELECT t.id, t.label, c.brier_score AS brier, c.sample_count, c.reliability
     FROM trader t
     JOIN calibration_score c ON c.trader_id = t.id
     WHERE t.is_seed = true AND c.reliability IS NOT NULL`
  );
  if (rows === null) return null;

  let best: CalibrationHighlight | null = null;

  for (const row of rows) {
    const buckets = (row.reliability ?? []).filter((b) => b.sampleCount > 0);
    if (buckets.length === 0) continue;

    // A bucket labelled 0.7 holds the calls rated from 70% up to 80%, so its midpoint is 0.75.
    // Comparing against the lower bound instead would report a systematic 5-point error that
    // is an artefact of the labelling rather than anything the trader did.
    let worst: CalibrationHighlight["worst"] | null = null;
    for (const bucket of buckets) {
      if (bucket.sampleCount < MIN_BUCKET_SAMPLE) continue;
      const claimed = bucket.bucket + 0.05;
      const deviation = bucket.observedFrequency - claimed;
      if (worst === null || Math.abs(deviation) > Math.abs(worst.deviation)) {
        worst = {
          claimed,
          observed: bucket.observedFrequency,
          sampleCount: bucket.sampleCount,
          deviation,
        };
      }
    }
    if (worst === null) continue;

    if (best === null || Math.abs(worst.deviation) > Math.abs(best.worst.deviation)) {
      best = {
        id: row.id,
        label: row.label,
        brier: row.brier === null ? null : Number(row.brier),
        sampleCount: Number(row.sample_count ?? 0),
        buckets,
        worst,
      };
    }
  }

  return best;
}
