import type { Side } from "@echonome/shared";

/** 0x1234…cdef — enough to recognise a wallet, short enough to sit in a table cell. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** The market id is a 32-byte hex word; its tail is the only part a human reads. */
export function shortMarket(marketId: string): string {
  return `#${marketId.replace(/^0x0*/, "").slice(-6)}`;
}

export function formatProbability(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export function formatBrier(score: number | null): string {
  return score === null ? "—" : score.toFixed(4);
}

/**
 * The one-line reading of a Brier score, in words rather than a number. 0.25 is exactly
 * the score of always saying 50/50, which is the honest reference point a follower needs:
 * a trader worse than 0.25 is being beaten by a coin.
 */
export function brierVerdict(score: number | null): string {
  if (score === null) return "No resolved calls yet";
  if (score < 0.15) return "Sharper than the market";
  if (score < 0.2) return "Consistently well judged";
  if (score < 0.24) return "Slightly better than a coin flip";
  if (score <= 0.26) return "No better than a coin flip";
  return "Worse than a coin flip";
}

export function sideLabel(side: Side): string {
  return side === "up" ? "Up" : "Down";
}

/** "4 minutes ago" — relative time is the only form that reads correctly on a live feed. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Edge as cents per dollar staked — the unit a follower actually feels. */
export function formatEdge(edge: number | null): string {
  if (edge === null) return "—";
  const cents = edge * 100;
  return `${cents >= 0 ? "+" : ""}${cents.toFixed(1)}c`;
}

/**
 * What an edge means, in words. The bands are wide because edge is noisy and a confident label
 * on a thin sample is worse than no label — the ranking already uses the conservative end of
 * the interval, and this reads the same way.
 */
export function edgeVerdict(edge: number | null, edgeLower: number | null): string {
  if (edge === null) return "No resolved calls yet";
  if (edgeLower !== null && edgeLower > 0.03) return "Reliably beats the prices they pay";
  if (edgeLower !== null && edgeLower > 0) return "Beats the prices they pay";
  if (edge > 0.02) return "Ahead, but not yet beyond doubt";
  if (edge > -0.02) return "Roughly break-even against the market";
  return "Loses to the prices they pay";
}
