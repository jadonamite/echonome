import "server-only";
import { unstable_cache } from "next/cache";
import snapshotJson from "@/data/history.json";
import {
  AGENTS,
  buildNights,
  klines,
  marketStatus,
  nextTradingDay,
  nyTime,
  nyToMs,
  isTradingDay,
  previousTradingDay,
  runAgents,
  scoreAgent,
  rwaDynamic,
  tokenDynamic,
  probeDepth,
  bestCurve,
  decide,
  DEFAULT_PARAMS,
  type Night,
  type PairHistory,
  type Snapshot,
  type ScoredCall,
  type AgentScore,
  type PoolQuote,
  type GovernorDecision,
} from "@echonome/stocks";

const snapshot = snapshotJson as unknown as Snapshot;

export const TICKERS = snapshot.pairs.map((p) => p.ticker).sort();

export function pairFor(ticker: string): PairHistory | undefined {
  return snapshot.pairs.find((p) => p.ticker === ticker.toUpperCase());
}

/** Appends the latest 300 hourly candles from the API to the stored history. */
async function withLiveTail(p: PairHistory): Promise<PairHistory> {
  try {
    const [b, o] = await Promise.all([
      klines(p.bstock.address, {}, { next: { revalidate: 600 } }),
      klines(p.ondoToken.address, {}, { next: { revalidate: 600 } }),
    ]);
    const rows = new Map<number, { ondo: number | null; b: number | null; v: number | null }>();
    p.t.forEach((t, i) => rows.set(t, { ondo: p.ondo[i], b: p.b[i], v: p.bVol[i] }));
    for (const c of o) rows.set(c[0], { ...(rows.get(c[0]) ?? { b: null, v: null }), ondo: c[1] / p.ondoToken.multiplier });
    for (const c of b) rows.set(c[0], { ...(rows.get(c[0]) ?? { ondo: null }), b: c[1] / p.bstock.multiplier, v: c[5] });
    const t = [...rows.keys()].sort((x, y) => x - y);
    return { ...p, t, ondo: t.map((x) => rows.get(x)!.ondo), b: t.map((x) => rows.get(x)!.b), bVol: t.map((x) => rows.get(x)!.v) };
  } catch {
    return p;
  }
}

export interface Board {
  updatedAt: number;
  firstDay: string;
  lastDay: string;
  tickers: number;
  scores: (AgentScore & { name: string; summary: string; control: boolean })[];
  calls: ScoredCall[];
  nights: Night[];
}

export const getBoard = unstable_cache(
  async (): Promise<Board> => {
    const pairs = await Promise.all(snapshot.pairs.map(withLiveTail));
    const nights = pairs.flatMap((p) => buildNights(p)).filter((n) => n.outcome);
    const calls = runAgents(nights);
    const scores = AGENTS.map((a) => ({ ...scoreAgent(a.id, calls), name: a.name, summary: a.summary, control: !!a.control }))
      .sort((x, y) => x.brier - y.brier);
    const days = nights.map((n) => n.day).sort();
    return { updatedAt: Date.now(), firstDay: days[0], lastDay: days[days.length - 1], tickers: pairs.length, scores, calls, nights };
  },
  ["board-v1"],
  { revalidate: 900 },
);

/** The trading day whose open the next calls are about, and whether they are already locked. */
export function nextCallDay(now = Date.now()): { day: string; lockAt: number; settleAt: number; locked: boolean } {
  const today = nyTime(now).date;
  let day = isTradingDay(today) && now < nyToMs(today, 10) ? today : nextTradingDay(today);
  return { day, lockAt: nyToMs(day, 9), settleAt: nyToMs(day, 10), locked: now >= nyToMs(day, 9) };
}

export interface TonightRow {
  ticker: string;
  symbol: string;
  refClose: number | null;
  live: number | null;
  tape: number | null;
  calls: { agentId: string; name: string; p: number | null }[];
}

export const getTonight = unstable_cache(
  async () => {
    const board = await getBoard();
    const target = nextCallDay();
    const prevDay = previousTradingDay(target.day);
    const status = await marketStatus({ next: { revalidate: 300 } }).catch(() => null);
    const rows: TonightRow[] = await Promise.all(
      snapshot.pairs.map(async (p) => {
        const live = await withLiveTail(p);
        const idx = new Map(live.t.map((t, i) => [t, i]));
        const ci = idx.get(nyToMs(prevDay, 16));
        const refClose = ci === undefined ? null : live.ondo[ci];
        const dyn = await rwaDynamic(p.bstock.address, { next: { revalidate: 300 } }).catch(() => null);
        const price = dyn ? Number(dyn.tokenInfo.price) / Number(dyn.tokenInfo.sharesMultiplier || 1) : null;
        const tape = price && refClose ? price / refClose - 1 : null;
        const prevClose2 = (() => {
          const j = idx.get(nyToMs(previousTradingDay(prevDay), 16));
          return j === undefined ? null : live.ondo[j];
        })();
        const night: Night = {
          ticker: p.ticker, day: target.day, prevDay, lockAt: target.lockAt, settleAt: target.settleAt,
          refClose: refClose ?? 0, bAtLock: price, tape,
          prevMove: refClose && prevClose2 ? refClose / prevClose2 - 1 : null,
          nightVolume: live.t.reduce((a, t, i) => (t >= nyToMs(prevDay, 16) && t < Math.min(Date.now(), target.lockAt) ? a + (live.bVol[i] ?? 0) : a), 0),
          refOpen: null, outcome: null,
        };
        const ctx = { settledBefore: board.nights };
        return {
          ticker: p.ticker,
          symbol: p.bstock.symbol,
          refClose,
          live: price,
          tape,
          calls: AGENTS.map((a) => ({ agentId: a.id, name: a.name, p: refClose ? a.call(night, ctx) : null })),
        };
      }),
    );
    return { target, prevDay, status, rows: rows.sort((a, b) => a.ticker.localeCompare(b.ticker)), at: Date.now() };
  },
  ["tonight-v1"],
  { revalidate: 300 },
);

export interface Desk {
  ticker: string;
  symbol: string;
  address: string;
  refPrice: number | null;
  tokenPrice: number | null;
  multiplier: number;
  marketOpen: boolean | null;
  marketReason: string | null;
  tokenTradable: boolean | null;
  flow: { usd1h: number; usd4h: number; usd24h: number };
  quotes: PoolQuote[];
  decision: GovernorDecision;
  params: typeof DEFAULT_PARAMS;
  at: number;
}

export async function getDesk(ticker: string, requestUsd: number, spent24hUsd = 0): Promise<Desk | null> {
  const p = pairFor(ticker);
  if (!p) return null;
  const [dyn, rwa, quotes, us] = await Promise.all([
    tokenDynamic(p.bstock.address, { next: { revalidate: 60 } }).catch(() => null),
    rwaDynamic(p.bstock.address, { next: { revalidate: 60 } }).catch(() => null),
    probeDepth(p.bstock.address as `0x${string}`).catch(() => [] as PoolQuote[]),
    marketStatus({ next: { revalidate: 60 } }).catch(() => null),
  ]);
  const n = (x?: string) => (x ? Number(x) : 0);
  const flow = {
    usd1h: n(dyn?.volume1hBuy) + n(dyn?.volume1hSell),
    usd4h: n(dyn?.volume4hBuy) + n(dyn?.volume4hSell),
    usd24h: n(dyn?.volume24hBuy) + n(dyn?.volume24hSell),
  };
  const decision = decide({ requestUsd, spent24hUsd, depth: bestCurve(quotes), flow, now: Date.now() });
  const mult = rwa ? Number(rwa.tokenInfo.sharesMultiplier) || 1 : p.bstock.multiplier;
  return {
    ticker: p.ticker,
    symbol: p.bstock.symbol,
    address: p.bstock.address,
    refPrice: rwa?.stockInfo.price ? Number(rwa.stockInfo.price) : null,
    tokenPrice: rwa ? Number(rwa.tokenInfo.price) : null,
    multiplier: mult,
    marketOpen: us ? us.openState : null,
    marketReason: us?.reasonMsg ?? us?.reasonCode ?? null,
    tokenTradable: rwa ? rwa.statusInfo.openState : null,
    flow,
    quotes,
    decision,
    params: DEFAULT_PARAMS,
    at: Date.now(),
  };
}

export function agentById(id: string) {
  return AGENTS.find((a) => a.id === id);
}
