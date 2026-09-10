"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useAccount, useConnect } from "wagmi";
import type { FeedTrade, ReactionType, ReactionCounts } from "@/lib/queries";
import { TraderAvatar } from "@/components/site/trader-avatar";
import { traderIdentity } from "@/lib/trader-names";
import {
  formatEdge,
  formatProbability,
  shortAddress,
  shortMarket,
  timeAgo,
} from "@/lib/format";
import {
  HeartIcon,
  ShareIcon,
  EchoIcon,
  DotsIcon,
  TrendUpIcon,
  TrendDownIcon,
} from "./icons";
import { TradeCommentsThread } from "./trade-comments-thread";
import { useToast } from "@/components/toast";

interface TradeFeedCardProps {
  trade: FeedTrade;
}

/**
 * Computes an ambient SVG area path simulating the market probability path of the position.
 */
function generatePositionChart(
  impliedProb: number,
  side: "up" | "down",
  wasRight: boolean | null
) {
  const isUp = side === "up";
  const p = isUp ? impliedProb : 1 - impliedProb;
  const W = 300;
  const H = 140;

  const points: [number, number][] = [
    [0, H * 0.5],
    [40, H * Math.min(0.85, Math.max(0.15, 0.5 + (0.5 - p) * 0.3))],
    [90, H * Math.min(0.85, Math.max(0.15, 0.5 - (p - 0.5) * 0.4))],
    [150, H * (1 - p * 0.85)],
    [210, H * (1 - p)],
    [260, wasRight === null ? H * (1 - p * 1.02) : wasRight ? H * 0.12 : H * 0.88],
    [300, wasRight === null ? H * (1 - p) : wasRight ? H * 0.05 : H * 0.95],
  ];

  const line = points
    .map((pt, i) => `${i === 0 ? "M" : "L"}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return { line, area };
}

/**
 * Computes an ambient SVG area path from the trader's actual cumulative edge trace.
 */
function generateEdgeChart(trace: number[], edge: number | null) {
  const W = 300;
  const H = 140;

  let series = trace.length >= 2 ? trace : null;
  if (!series) {
    const e = edge ?? 0;
    series = [0, e * 0.2, e * 0.5, e * 0.8, e * 1.1, e * 1.4, e * 1.8];
  }

  const lo = Math.min(0, ...series);
  const hi = Math.max(0, ...series);
  const span = Math.max(hi - lo, 0.4);

  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - 15 - ((v - lo) / span) * (H - 30);

  const line = series
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return { line, area };
}

export function TradeFeedCard({ trade }: TradeFeedCardProps) {
  const chartId = useId().replace(/:/g, "");
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { show } = useToast();

  const [isExpanded, setIsExpanded] = useState(trade.commentCount > 0);
  const [commentCount, setCommentCount] = useState(trade.commentCount);
  const [reactions, setReactions] = useState<ReactionCounts>(trade.reactions);
  const [reacting, setReacting] = useState(false);

  const identity = traderIdentity(trade.traderLabel);
  const isUp = trade.side === "up";
  const pricePaid = isUp ? trade.impliedProbability : 1 - trade.impliedProbability;
  const isSettled = trade.settledOutcome !== null;
  const isWon = trade.wasRight === true;

  const injected = connectors[0];

  const posChart = generatePositionChart(trade.impliedProbability, trade.side, trade.wasRight);
  const edgeChart = generateEdgeChart(trade.edgeTrace, trade.traderEdge);

  const narrative = isSettled
    ? isWon
      ? `Position on ${trade.marketLabel ?? shortMarket(trade.marketId)} settled in favor of ${trade.side.toUpperCase()}. Realized a +${Math.round((1 - pricePaid) * 100)}¢ edge per unit staked on the hourly window.`
      : `Position on ${trade.marketLabel ?? shortMarket(trade.marketId)} settled ${trade.settledOutcome?.toUpperCase()} against the ${trade.side.toUpperCase()} call.`
    : `Opened a ${trade.side.toUpperCase()} position on ${trade.marketLabel ?? shortMarket(trade.marketId)} at ${Math.round(pricePaid * 100)}¢ (${formatProbability(trade.impliedProbability)} implied probability). Target settlement at the close of the current hourly window.`;

  async function handleReaction(reactionType: ReactionType) {
    if (!isConnected || !address) {
      show({
        tone: "info",
        title: "Wallet required",
        detail: "Connect your wallet to endorse or vote on trades.",
      });
      if (injected) connect({ connector: injected });
      return;
    }

    if (reacting) return;

    const prevReactions = { ...reactions };
    let newReactions = { ...reactions };

    if (reactionType === "like") {
      newReactions.userLiked = !reactions.userLiked;
      newReactions.like = reactions.like + (newReactions.userLiked ? 1 : -1);
    } else if (reactionType === "echoed") {
      newReactions.userEchoed = !reactions.userEchoed;
      newReactions.echoed = reactions.echoed + (newReactions.userEchoed ? 1 : -1);
    } else if (reactionType === "bullish") {
      if (reactions.userReaction === "bullish") {
        newReactions.userReaction = null;
        newReactions.bullish = Math.max(0, reactions.bullish - 1);
      } else {
        if (reactions.userReaction === "bearish") {
          newReactions.bearish = Math.max(0, reactions.bearish - 1);
        }
        newReactions.userReaction = "bullish";
        newReactions.bullish = reactions.bullish + 1;
      }
    } else if (reactionType === "bearish") {
      if (reactions.userReaction === "bearish") {
        newReactions.userReaction = null;
        newReactions.bearish = Math.max(0, reactions.bearish - 1);
      } else {
        if (reactions.userReaction === "bullish") {
          newReactions.bullish = Math.max(0, reactions.bullish - 1);
        }
        newReactions.userReaction = "bearish";
        newReactions.bearish = reactions.bearish + 1;
      }
    }

    setReactions(newReactions);
    setReacting(true);

    try {
      const res = await fetch(`/api/feed/${trade.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          reaction: reactionType,
        }),
      });

      if (!res.ok) throw new Error("Failed to update reaction");
      const data = await res.json();
      if (data.reactions) {
        setReactions(data.reactions);
      }
    } catch {
      setReactions(prevReactions);
      show({
        tone: "error",
        title: "Action failed",
        detail: "Could not record your reaction.",
      });
    } finally {
      setReacting(false);
    }
  }

  function handleShare() {
    if (typeof window !== "undefined") {
      navigator.clipboard?.writeText(`${window.location.origin}/feed`);
      show({
        tone: "success",
        title: "Link copied",
        detail: "Trade link copied to clipboard.",
      });
    }
  }

  return (
    <article className="rounded-2xl border border-rule bg-surface p-5 sm:p-6 space-y-4 shadow-sm transition hover:border-edge">
      {/* 1. Profile Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <TraderAvatar address={trade.traderAddress} name={identity.name} size={42} />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-good" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/traders/${trade.traderId}`}
                className="font-semibold text-sm text-ink hover:underline truncate"
              >
                {identity.name}
              </Link>
              <span className="text-xs font-mono text-ink-3 flex-shrink-0">
                · {timeAgo(trade.createdAt)}
              </span>
            </div>
            <p className="text-xs text-ink-3 font-mono truncate">
              {identity.role ?? identity.strategy} · {shortAddress(trade.traderAddress)}
            </p>
          </div>
        </div>

        <Link
          href={`/traders/${trade.traderId}`}
          className="text-ink-3 hover:text-ink transition p-1.5 rounded hover:bg-surface-raised"
          title="View profile & decision history"
        >
          <DotsIcon className="w-5 h-5" />
        </Link>
      </div>

      {/* 2. Post Narrative */}
      <p className="text-sm leading-relaxed text-ink-2">{narrative}</p>

      {/* 3. Dual Visual Cards with Full-Bleed Ambient Background Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl overflow-hidden">
        {/* Left Card: Contract & Position with Live Position Trajectory Chart */}
        <div className="relative overflow-hidden rounded-xl border border-rule bg-plane p-4 flex flex-col justify-between min-h-[150px]">
          {/* Ambient Background Chart */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-25">
            <svg viewBox="0 0 300 140" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id={`pos-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isUp ? "#0ca30c" : "#d03b3b"} stopOpacity="0.6" />
                  <stop offset="100%" stopColor={isUp ? "#0ca30c" : "#d03b3b"} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={posChart.area} fill={`url(#pos-grad-${chartId})`} />
              <path
                d={posChart.line}
                fill="none"
                stroke={isUp ? "#0ca30c" : "#d03b3b"}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Foreground Content */}
          <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-ink-3 tracking-wider uppercase">
            <span>{trade.marketLabel ?? shortMarket(trade.marketId)}</span>
            <span className={isUp ? "text-good font-semibold" : "text-critical font-semibold"}>
              {trade.side.toUpperCase()}
            </span>
          </div>

          <div className="relative z-10 py-2">
            <div
              className={`text-3xl font-bold tracking-tight ${
                isUp ? "text-good" : "text-critical"
              }`}
            >
              {isUp ? "UP" : "DOWN"}
            </div>
            <div className="text-xs font-mono text-ink-2 mt-1">
              {Math.round(pricePaid * 100)}¢ entry · {formatProbability(trade.impliedProbability)} implied P
            </div>
          </div>

          <div className="relative z-10 text-[11px] font-mono">
            {isSettled ? (
              <span className="text-ink-3">
                Settled:{" "}
                <span
                  className={
                    isWon ? "text-good font-medium" : "text-critical font-medium"
                  }
                >
                  {trade.settledOutcome?.toUpperCase()}{" "}
                  {isWon && `(+${Math.round((1 - pricePaid) * 100)}¢)`}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-accent">
                <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                Live on Shannon
              </span>
            )}
          </div>
        </div>

        {/* Right Card: Calibration & Edge with Real-Time Cumulative Edge Trace Chart */}
        <div className="relative overflow-hidden rounded-xl border border-rule bg-plane p-4 flex flex-col justify-between min-h-[150px]">
          {/* Ambient Background Chart */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-25">
            <svg viewBox="0 0 300 140" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id={`edge-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6fe3e0" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#6fe3e0" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={edgeChart.area} fill={`url(#edge-grad-${chartId})`} />
              <path
                d={edgeChart.line}
                fill="none"
                stroke="#6fe3e0"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Foreground Content */}
          <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-ink-3 tracking-wider uppercase">
            <span>Rank & Fleet Edge</span>
            {trade.traderIsSeed && <span>Seed Fleet</span>}
          </div>

          <div className="relative z-10 py-2">
            <div className="text-3xl font-bold font-mono tracking-tight text-ink">
              {trade.traderEdge !== null ? formatEdge(trade.traderEdge) : "—"}
            </div>
            <div className="text-xs font-mono text-ink-3 mt-1">
              {trade.traderSampleCount >= 20
                ? "Edge per unit staked (95% CI)"
                : `Warming up (${trade.traderSampleCount}/20 calls)`}
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-ink-3">
            <span>
              {trade.echoCount} {trade.echoCount === 1 ? "follower echo" : "follower echoes"}
            </span>
            <Link
              href={`/traders/${trade.traderId}`}
              className="text-accent hover:underline"
            >
              Trace →
            </Link>
          </div>
        </div>
      </div>

      {/* 4. Interaction Bar: Heart (Stimulate) + Bullish / Bearish Sentiment + Echo + Share */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-rule/50">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Heart Button (Feed Stimulate / Like) */}
          <button
            type="button"
            onClick={() => handleReaction("like")}
            disabled={reacting}
            className={`flex items-center gap-1.5 transition p-1.5 rounded hover:bg-surface-raised ${
              reactions.userLiked ? "text-critical" : "text-ink-3 hover:text-ink"
            }`}
            title="Like & stimulate feed"
          >
            <HeartIcon filled={reactions.userLiked} className="w-5 h-5" />
            <span className="text-xs font-mono font-medium">{reactions.like}</span>
          </button>

          {/* Bullish Sentiment Toggle */}
          <button
            type="button"
            onClick={() => handleReaction("bullish")}
            disabled={reacting}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono transition ${
              reactions.userReaction === "bullish"
                ? "border-good/60 bg-good/15 text-good font-semibold shadow-sm"
                : "border-rule bg-surface-raised/60 text-ink-3 hover:border-edge hover:text-ink"
            }`}
            title="Vote Bullish on this position"
          >
            <TrendUpIcon className="w-3.5 h-3.5 text-good" />
            <span>Bullish</span>
            <span className="text-[11px] opacity-80">({reactions.bullish})</span>
          </button>

          {/* Bearish Sentiment Toggle */}
          <button
            type="button"
            onClick={() => handleReaction("bearish")}
            disabled={reacting}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono transition ${
              reactions.userReaction === "bearish"
                ? "border-critical/60 bg-critical/15 text-critical font-semibold shadow-sm"
                : "border-rule bg-surface-raised/60 text-ink-3 hover:border-edge hover:text-ink"
            }`}
            title="Vote Bearish on this position"
          >
            <TrendDownIcon className="w-3.5 h-3.5 text-critical" />
            <span>Bearish</span>
            <span className="text-[11px] opacity-80">({reactions.bearish})</span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Echo / Repost */}
          <button
            type="button"
            onClick={() => handleReaction("echoed")}
            disabled={reacting}
            className={`flex items-center gap-1.5 transition p-1.5 rounded hover:bg-surface-raised ${
              reactions.userEchoed ? "text-accent font-semibold" : "text-ink-3 hover:text-ink"
            }`}
            title="Mark as Echoed"
          >
            <EchoIcon className="w-4 h-4" />
            <span className="text-xs font-mono">{reactions.echoed}</span>
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={handleShare}
            className="text-ink-3 hover:text-ink transition p-1.5 rounded hover:bg-surface-raised"
            title="Share trade"
          >
            <ShareIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 5. Clean Tally Line */}
      <div className="flex flex-wrap items-center justify-between text-xs text-ink-3 font-mono pt-0.5">
        <span className="font-semibold text-ink">
          {reactions.like} {reactions.like === 1 ? "like" : "likes"} · {reactions.bullish + reactions.bearish} sentiment votes
        </span>
        <span className="text-[11px]">
          {commentCount} {commentCount === 1 ? "take" : "takes"} · {trade.echoCount} {trade.echoCount === 1 ? "echo" : "echoes"}
        </span>
      </div>

      {/* 6. Comment Pill (Expands thread or Add a comment) */}
      {!isExpanded ? (
        <div
          onClick={() => setIsExpanded(true)}
          className="rounded-lg border border-rule/80 bg-surface-raised/40 px-3.5 py-2.5 text-xs text-ink-3 cursor-pointer hover:border-edge transition flex items-center justify-between"
        >
          <span>Add a take on this position…</span>
          <span className="text-[10px] font-mono text-ink-3">↵</span>
        </div>
      ) : (
        <TradeCommentsThread
          decisionId={trade.id}
          traderAddress={trade.traderAddress}
          onCommentAdded={() => setCommentCount((c) => c + 1)}
        />
      )}
    </article>
  );
}
