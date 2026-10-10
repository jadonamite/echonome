/**
 * The nightly call.
 *
 * Question, asked for every ticker on every US trading day D:
 *   will the stock trade above the previous close half an hour into D's regular session?
 * Previous close is the Ondo per-share price at 16:00 New York time on the prior trading day.
 * The settlement price is the Ondo per-share price at 10:00 on D. Calls lock at 09:00 on D,
 * so every agent sees only the overnight bStock tape and what came before it.
 */

import type { PairHistory } from "./history.js";
import { indexByTime } from "./history.js";
import { isTradingDay, nyTime, nyToMs, previousTradingDay } from "./sessions.js";

export interface Night {
  ticker: string;
  /** Settlement date D, New York. */
  day: string;
  prevDay: string;
  lockAt: number;
  settleAt: number;
  refClose: number;
  /** bStock per-share price at lock time. */
  bAtLock: number | null;
  /** bAtLock / refClose - 1. */
  tape: number | null;
  /** Move of the previous regular session, close to close. */
  prevMove: number | null;
  /** bStock notional traded between the previous close and lock time, USD. */
  nightVolume: number;
  refOpen: number | null;
  outcome: "up" | "down" | null;
}

export function buildNights(h: PairHistory, untilDay?: string): Night[] {
  const idx = indexByTime(h);
  const at = (series: (number | null)[], ms: number) => {
    const i = idx.get(ms);
    return i === undefined ? null : series[i];
  };
  const days = [...new Set(h.t.map((t) => nyTime(t).date))]
    .filter(isTradingDay)
    .sort();
  if (untilDay && !days.includes(untilDay) && isTradingDay(untilDay)) days.push(untilDay);

  const nights: Night[] = [];
  for (const day of days) {
    if (untilDay && day > untilDay) continue;
    const prevDay = previousTradingDay(day);
    const closeAt = nyToMs(prevDay, 16);
    const refClose = at(h.ondo, closeAt);
    if (!refClose) continue;
    const prevPrevClose = at(h.ondo, nyToMs(previousTradingDay(prevDay), 16));
    const lockAt = nyToMs(day, 9);
    const settleAt = nyToMs(day, 10);
    const bAtLock = at(h.b, lockAt);
    let nightVolume = 0;
    for (let t = closeAt; t < lockAt; t += 3600e3) nightVolume += at(h.bVol, t) ?? 0;
    const refOpen = at(h.ondo, settleAt);
    nights.push({
      ticker: h.ticker,
      day,
      prevDay,
      lockAt,
      settleAt,
      refClose,
      bAtLock,
      tape: bAtLock ? bAtLock / refClose - 1 : null,
      prevMove: prevPrevClose ? refClose / prevPrevClose - 1 : null,
      nightVolume,
      refOpen,
      outcome: refOpen == null ? null : refOpen > refClose ? "up" : "down",
    });
  }
  return nights;
}

export interface AgentContext {
  /** Every settled night, across all tickers, that settled before this night's lock time. */
  settledBefore: Night[];
}

export interface Agent {
  id: string;
  name: string;
  summary: string;
  method: string;
  control?: boolean;
  call(n: Night, ctx: AgentContext): number | null;
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const K_GRID = [25, 50, 75, 100, 150, 200, 300];
const K_DEFAULT = 75;

/** Picks the steepness that would have scored best on nights already settled. Never looks ahead. */
export function fitTapeSteepness(settled: Night[]): number {
  const usable = settled.filter((n) => n.tape != null && n.outcome);
  if (usable.length < 20) return K_DEFAULT;
  let best = K_DEFAULT, bestScore = Infinity;
  for (const k of K_GRID) {
    const s = usable.reduce((a, n) => a + (logistic(k * n.tape!) - (n.outcome === "up" ? 1 : 0)) ** 2, 0);
    if (s < bestScore) [best, bestScore] = [k, s];
  }
  return best;
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const AGENTS: Agent[] = [
  {
    id: "night-tape",
    name: "Night Tape",
    summary: "Reads the overnight bStock price as the market's forecast of the open.",
    method:
      "Takes the bStock price at 09:00 against the previous close and turns the gap into a probability with a logistic curve. The curve's steepness is refitted every night on nights that have already settled, so it never sees the answer.",
    call(n, ctx) {
      if (n.tape == null) return null;
      return logistic(fitTapeSteepness(ctx.settledBefore) * n.tape);
    },
  },
  {
    id: "depth-aware",
    name: "Depth Aware",
    summary: "Night Tape, but trusts a quiet night less.",
    method:
      "Same reading as Night Tape, pulled toward 50% when the night's bStock volume is below that ticker's usual overnight volume. Tests whether thin overnight trading makes the tape less reliable.",
    call(n, ctx) {
      if (n.tape == null) return null;
      const p = logistic(fitTapeSteepness(ctx.settledBefore) * n.tape);
      const usual = median(ctx.settledBefore.filter((x) => x.ticker === n.ticker).map((x) => x.nightVolume));
      if (!usual) return p;
      const weight = clamp(n.nightVolume / usual, 0, 1);
      return 0.5 + (p - 0.5) * weight;
    },
  },
  {
    id: "yesterday-again",
    name: "Yesterday Again",
    summary: "Bets that yesterday's direction carries into today.",
    method: "Leans up after an up day and down after a down day, by up to 20 points, in proportion to the size of yesterday's move. Ignores the overnight tape entirely.",
    call(n) {
      if (n.prevMove == null) return null;
      return 0.5 + clamp(n.prevMove * 8, -0.2, 0.2);
    },
  },
  {
    id: "fade",
    name: "Fade the Night",
    summary: "Bets the overnight move reverses by the open.",
    method: "The mirror image of Night Tape. If overnight traders are mostly noise, this should do about as well. If they carry information, it should do badly.",
    call(n, ctx) {
      if (n.tape == null) return null;
      return 1 - logistic(fitTapeSteepness(ctx.settledBefore) * n.tape);
    },
  },
  {
    id: "coin-flip",
    name: "Coin Flip",
    summary: "Picks a side at random and says 65%.",
    method: "The control. A fixed pseudo-random draw per ticker and day picks up or down, always at 65% confidence. Its true edge is zero. If it ever ranks well, the scoring is broken.",
    control: true,
    call(n) {
      return hash01(`${n.ticker}:${n.day}`) < 0.5 ? 0.65 : 0.35;
    },
  },
  {
    id: "no-view",
    name: "No View",
    summary: "Always says 50%.",
    method: "The baseline. Its Brier score is exactly 0.25 on any set of nights. An agent worth following has to beat it.",
    control: true,
    call() {
      return 0.5;
    },
  },
];

export interface ScoredCall {
  agentId: string;
  ticker: string;
  day: string;
  p: number;
  outcome: "up" | "down" | null;
}

/** Runs every agent over every night in order, giving each only what was settled before its lock time. */
export function runAgents(allNights: Night[], agents: Agent[] = AGENTS): ScoredCall[] {
  const ordered = [...allNights].sort((a, b) => a.lockAt - b.lockAt || a.ticker.localeCompare(b.ticker));
  const settledSorted = ordered.filter((n) => n.outcome).sort((a, b) => a.settleAt - b.settleAt);
  const calls: ScoredCall[] = [];
  let cursor = 0;
  const settled: Night[] = [];
  for (const n of ordered) {
    while (cursor < settledSorted.length && settledSorted[cursor].settleAt <= n.lockAt) settled.push(settledSorted[cursor++]);
    const ctx = { settledBefore: settled };
    for (const a of agents) {
      const p = a.call(n, ctx);
      if (p == null || !Number.isFinite(p)) continue;
      calls.push({ agentId: a.id, ticker: n.ticker, day: n.day, p: clamp(p, 0.01, 0.99), outcome: n.outcome });
    }
  }
  return calls;
}

export interface AgentScore {
  agentId: string;
  n: number;
  brier: number;
  hitRate: number;
  /** Ten confidence buckets: how often "up" happened when the agent said roughly p. */
  reliability: { lo: number; hi: number; n: number; meanP: number; freqUp: number }[];
}

export function scoreAgent(agentId: string, calls: ScoredCall[]): AgentScore {
  const done = calls.filter((c) => c.agentId === agentId && c.outcome);
  const y = (c: ScoredCall) => (c.outcome === "up" ? 1 : 0);
  const brier = done.reduce((a, c) => a + (c.p - y(c)) ** 2, 0) / (done.length || 1);
  const hits = done.filter((c) => c.p !== 0.5 && (c.p > 0.5) === (c.outcome === "up")).length;
  const decided = done.filter((c) => c.p !== 0.5).length;
  const reliability = Array.from({ length: 10 }, (_, i) => {
    const lo = i / 10, hi = (i + 1) / 10;
    const inBin = done.filter((c) => c.p >= lo && (c.p < hi || (i === 9 && c.p <= hi)));
    return {
      lo, hi, n: inBin.length,
      meanP: inBin.reduce((a, c) => a + c.p, 0) / (inBin.length || 1),
      freqUp: inBin.reduce((a, c) => a + y(c), 0) / (inBin.length || 1),
    };
  });
  return { agentId, n: done.length, brier, hitRate: decided ? hits / decided : 0, reliability };
}
