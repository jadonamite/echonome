/**
 * Governor: sizes a trade to what the market can absorb right now.
 *
 * The control idea is BBR congestion control. BBR paces a sender at the measured bottleneck
 * bandwidth and keeps a windowed minimum of round-trip time, instead of sending until packets
 * drop. Here the "bandwidth" is the notional the token's pools actually traded over the last
 * hours, and the "minimum delay" is the best execution cost seen at a tiny size. A trade is
 * paced to a share of the bandwidth and capped where its cost climbs too far above that floor.
 *
 * Two layers, checked separately. The floor (per-trade and daily limits) holds whatever the
 * model says. The model can only shrink what the floor allows.
 */

export interface Floor {
  maxPerTradeUsd: number;
  maxDailyUsd: number;
}

/** Execution cost for a given size, from on-chain quotes. */
export interface DepthPoint {
  usd: number;
  /** Effective price paid per token at this size. */
  price: number;
  pool: string;
}

export interface Flow {
  /** Traded notional over the last hour, USD. */
  usd1h: number;
  /** Traded notional over the last four hours, USD. */
  usd4h: number;
}

export interface GovernorInput {
  requestUsd: number;
  spent24hUsd: number;
  /** Best quote across pools for each probed size, ascending by size. */
  depth: DepthPoint[];
  flow: Flow;
  now: number;
}

export interface GovernorParams {
  floor: Floor;
  /** Share of observed hourly bandwidth one trade may take. */
  participation: number;
  /** Extra cost over the best small-size price that a trade may pay, basis points. */
  maxImpactBps: number;
  /** Length of one step of the probe cycle. */
  probeStepMs: number;
}

export const DEFAULT_PARAMS: GovernorParams = {
  floor: { maxPerTradeUsd: 5_000, maxDailyUsd: 20_000 },
  participation: 0.1,
  maxImpactBps: 30,
  probeStepMs: 30 * 60e3,
};

/** BBR's probe-bandwidth gain cycle: one step up, one step down, six steps cruising. */
export const PROBE_CYCLE = [1.25, 0.75, 1, 1, 1, 1, 1, 1];

export type Limiter = "request" | "floor:per-trade" | "floor:daily" | "pace" | "impact" | "no-liquidity";

export interface GovernorDecision {
  allowedUsd: number;
  limiter: Limiter;
  gain: number;
  /** Windowed max of hourly traded notional, USD per hour. */
  bandwidthUsdPerHour: number;
  paceCapUsd: number;
  impactCapUsd: number;
  /** Best price at the smallest probed size. */
  floorPrice: number | null;
  /** Cost of the allowed size over the floor price, basis points. */
  impactAtAllowedBps: number | null;
  pool: string | null;
  reasons: string[];
}

export function gainAt(now: number, stepMs = DEFAULT_PARAMS.probeStepMs): number {
  return PROBE_CYCLE[Math.floor(now / stepMs) % PROBE_CYCLE.length];
}

/** Interpolated effective price at a size, from the probed depth curve. */
export function priceAt(depth: DepthPoint[], usd: number): DepthPoint | null {
  if (depth.length === 0) return null;
  if (usd <= depth[0].usd) return depth[0];
  for (let i = 1; i < depth.length; i++) {
    const a = depth[i - 1], b = depth[i];
    if (usd <= b.usd) {
      const w = (usd - a.usd) / (b.usd - a.usd);
      return { usd, price: a.price + (b.price - a.price) * w, pool: b.pool };
    }
  }
  return null; // beyond the largest probe: unknown, so not allowed
}

export function impactBps(depth: DepthPoint[], usd: number): number | null {
  const p = priceAt(depth, usd);
  if (!p || depth.length === 0) return null;
  return (p.price / depth[0].price - 1) * 10_000;
}

/** Largest probed or interpolated size whose cost stays within the impact budget. */
export function impactCap(depth: DepthPoint[], maxBps: number): number {
  if (depth.length === 0) return 0;
  let lo = 0, hi = depth[depth.length - 1].usd;
  if ((impactBps(depth, hi) ?? Infinity) <= maxBps) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if ((impactBps(depth, mid) ?? Infinity) <= maxBps) lo = mid; else hi = mid;
  }
  return lo;
}

export function decide(input: GovernorInput, params: GovernorParams = DEFAULT_PARAMS): GovernorDecision {
  const reasons: string[] = [];
  const gain = gainAt(input.now, params.probeStepMs);
  const bandwidth = Math.max(input.flow.usd1h, input.flow.usd4h / 4);
  const paceCap = bandwidth * params.participation * gain;
  const impCap = impactCap(input.depth, params.maxImpactBps);
  const dailyLeft = Math.max(0, params.floor.maxDailyUsd - input.spent24hUsd);

  const candidates: [Limiter, number][] = [
    ["request", input.requestUsd],
    ["floor:per-trade", params.floor.maxPerTradeUsd],
    ["floor:daily", dailyLeft],
    ["pace", paceCap],
    ["impact", impCap],
  ];
  let [limiter, allowed] = candidates.reduce((m, c) => (c[1] < m[1] ? c : m));
  if (!Number.isFinite(allowed) || allowed < 0) allowed = 0;
  if (input.depth.length === 0) {
    limiter = "no-liquidity";
    allowed = 0;
  }

  reasons.push(`Pools traded about $${Math.round(bandwidth).toLocaleString("en-US")} in the busiest recent hour.`);
  reasons.push(`Pacing allows ${Math.round(params.participation * 100)}% of that at gain ${gain}: $${Math.round(paceCap).toLocaleString("en-US")}.`);
  reasons.push(`Cost stays within ${params.maxImpactBps} bps of the best price up to $${Math.round(impCap).toLocaleString("en-US")}.`);
  reasons.push(`Daily limit left: $${Math.round(dailyLeft).toLocaleString("en-US")} of $${params.floor.maxDailyUsd.toLocaleString("en-US")}.`);

  const at = allowed > 0 ? priceAt(input.depth, allowed) : null;
  return {
    allowedUsd: Math.floor(allowed * 100) / 100,
    limiter,
    gain,
    bandwidthUsdPerHour: bandwidth,
    paceCapUsd: paceCap,
    impactCapUsd: impCap,
    floorPrice: input.depth[0]?.price ?? null,
    impactAtAllowedBps: allowed > 0 ? impactBps(input.depth, allowed) : null,
    pool: at?.pool ?? null,
    reasons,
  };
}
