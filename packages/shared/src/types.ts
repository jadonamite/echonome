// Domain types shared between apps/worker (writes) and apps/web (reads).
// Mirrors apps/worker/src/db/schema.sql field-for-field — keep them in sync by hand;
// there's no codegen step in a 3-day build.

export type Side = "up" | "down";
/** Mirrors echo_status_check in apps/worker/src/db/schema.sql. 'failed' is a real,
 * follower-visible state (a reverted order, a rate-limit skip), not a log line — the
 * schema gained it in the Phase 6 hardening pass and this type had drifted behind it. */
export type EchoStatus = "pending" | "settled" | "missed" | "failed";

export interface Trader {
  id: string;
  address: string;
  label: string;
  isSeed: boolean;
  createdAt: string;
}

export interface Decision {
  id: string;
  traderId: string;
  marketId: string;
  side: Side;
  impliedProbability: number;
  settledOutcome: Side | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ReliabilityBucket {
  /** Confidence bucket lower bound, e.g. 0.6 for the [0.6, 0.7) bucket. */
  bucket: number;
  /** How often the trader's calls in this bucket actually settled true. */
  observedFrequency: number;
  sampleCount: number;
}

export interface CalibrationScore {
  traderId: string;
  brierScore: number;
  reliability: ReliabilityBucket[];
  sampleCount: number;
  /** A trader is shown ranked only once sampleCount >= this. See TECHNICAL_ARCHITECTURE.md. */
  warmingUp: boolean;
  computedAt: string;
}

export interface ProxyGrant {
  id: string;
  followerAddress: string;
  operatorAddress: string;
  scope: string;
  grantedAt: string;
  revokedAt: string | null;
}

export interface CopyLink {
  id: string;
  proxyGrantId: string;
  traderId: string;
  sizeFraction: number;
  active: boolean;
  createdAt: string;
}

export interface Echo {
  id: string;
  copyLinkId: string;
  sourceDecisionId: string;
  marketId: string;
  side: Side;
  size: number;
  status: EchoStatus;
  /** Set only when status is 'failed' — a decoded revert name or short error, never a stack. */
  failureReason: string | null;
  settledOutcome: Side | null;
  txHash: string | null;
  createdAt: string;
}

/** The minimum resolved-window sample count before a trader shows ranked. Set from
 * live testnet data on 2026-09-08 — see specs/echonome/plan.md in the Inertia vault. */
export const MIN_CALIBRATION_SAMPLE = 20;

/** Skip an echo if fewer than this many minutes remain before the source market's expiry. */
export const ECHO_EXPIRY_CUTOFF_MINUTES = 5;

export type ReactionType = "bullish" | "bearish" | "echoed" | "like";

export interface TradeComment {
  id: string;
  decisionId: string;
  authorAddress: string;
  content: string;
  createdAt: string;
}

export interface TradeReaction {
  id: string;
  decisionId: string;
  walletAddress: string;
  reaction: ReactionType;
  createdAt: string;
}

export interface ReactionCounts {
  like: number;
  bullish: number;
  bearish: number;
  echoed: number;
  userLiked?: boolean;
  userReaction?: "bullish" | "bearish" | null;
  userEchoed?: boolean;
}


