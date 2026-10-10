/** Hourly history for one bStock and its Ondo twin, stored per share (price divided by the token multiplier). */

export interface TokenRef {
  symbol: string;
  address: string;
  multiplier: number;
}

export interface PairHistory {
  ticker: string;
  bstock: TokenRef;
  ondoToken: TokenRef;
  /** Candle open times, epoch ms, ascending. */
  t: number[];
  /** Ondo per-share price at the candle open; null when Ondo has no candle for that hour. */
  ondo: (number | null)[];
  /** bStock per-share price at the candle open. */
  b: (number | null)[];
  /** bStock traded notional during the hour, USD. */
  bVol: (number | null)[];
}

export interface Snapshot {
  generatedAt: number;
  source: string;
  pairs: PairHistory[];
}

export function indexByTime(h: PairHistory): Map<number, number> {
  return new Map(h.t.map((t, i) => [t, i]));
}
