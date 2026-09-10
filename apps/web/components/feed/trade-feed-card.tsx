"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useAccount, useConnect } from "wagmi";
import {
  Heart,
  TrendUp,
  TrendDown,
  Repeat,
  ShareNetwork,
  DotsThree,
} from "@phosphor-icons/react";
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
import { TradeCommentsThread } from "./trade-comments-thread";
import { useToast } from "@/components/toast";

interface TradeFeedCardProps {
  trade: FeedTrade;
}

/**
 * Computes a smooth Monotone / Cubic Bézier spline path through coordinates.
 * Produces silky, authentic financial curve rendering identical to shadcn / Recharts.
 */
function generateCubicBezierPath(
  points: [number, number][],
  width = 300,
  height = 135
): { line: string; area: string; lastPoint: [number, number] } {
  if (points.length < 2) return { line: "", area: "", lastPoint: [0, 0] };
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const last = points[points.length - 1];
  const area = `${d} L ${width} ${height} L 0 ${height} Z`;
  return { line: d, area, lastPoint: last };
}

/**
 * Generates an ambient shadcn-style area path simulating the market probability walk.
 */
function generatePositionChart(
  impliedProb: number,
  side: "up" | "down",
  wasRight: boolean | null
) {
  const W = 300;
  const H = 135;
  const isUp = side === "up";
  const targetP = isUp ? impliedProb : 1 - impliedProb;
  const baseline = 0.5;

  const rawFactors = [
    baseline,
    baseline + (targetP - baseline) * 0.25 + (isUp ? 0.04 : -0.04),
    baseline + (targetP - baseline) * 0.45 - (isUp ? 0.03 : -0.03),
    baseline + (targetP - baseline) * 0.70 + (isUp ? 0.02 : -0.02),
    targetP - (isUp ? 0.02 : -0.02),
    targetP + (isUp ? 0.03 : -0.03),
    targetP,
    wasRight === null ? targetP : wasRight ? 0.94 : 0.06,
    wasRight === null ? targetP : wasRight ? 0.97 : 0.03,
  ];

  const points: [number, number][] = rawFactors.map((v, i) => {
    const x = (i / (rawFactors.length - 1)) * W;
    const clampedV = Math.max(0.04, Math.min(0.96, v));
    const y = H - 20 - clampedV * (H - 40);
    return [x, y];
  });

  return generateCubicBezierPath(points, W, H);
}

/**
 * Generates an ambient shadcn-style area path from cumulative fleet edge trace.
 */
function generateEdgeChart(trace: number[], edge: number | null) {
  const W = 300;
  const H = 135;

  let series = trace && trace.length >= 2 ? [...trace] : null;
  if (!series) {
    const e = edge ?? 0.15;
    series = [0, e * 0.18, e * 0.42, e * 0.35, e * 0.72, e * 0.65, e * 0.92, e * 1.05];
  }

  const lo = Math.min(0, ...series);
  const hi = Math.max(0.1, ...series);
  const span = Math.max(hi - lo, 0.15);

  const points: [number, number][] = series.map((v, i) => {
    const x = (i / (series.length - 1)) * W;
    const normalized = (v - lo) / span;
    const y = H - 22 - normalized * (H - 44);
    return [x, y];
  });

  return generateCubicBezierPath(points, W, H);
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

  const posStrokeColor = isUp ? "#0ca30c" : "#d03b3b";
  const edgeStrokeColor = "#6fe3e0";

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
    <article className="rounded-2xl border border-rule bg-surface p-4 sm:p-6 space-y-4 shadow-sm transition hover:border-edge">
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
          className="text-ink-3 hover:text-ink transition p-1.5 rounded-lg hover:bg-surface-raised"
          title="View profile & decision history"
        >
          <DotsThree size={20} weight="bold" />
        </Link>
      </div>

      {/* 2. Post Narrative */}
      <p className="text-sm leading-relaxed text-ink-2">{narrative}</p>

      {/* 3. Dual Visual Cards: Side-by-Side Flex on Mobile (No Vertical Stacking) with Shadcn Chart Aesthetic */}
      <div className="flex flex-row gap-2 sm:gap-3">
        {/* Left Card: Market & Position with Smooth Shadcn-Style Area Chart */}
        <div className="flex-1 min-w-0 relative overflow-hidden rounded-xl border border-rule bg-plane p-3 sm:p-4 flex flex-col justify-between min-h-[135px] sm:min-h-[160px]">
          {/* Ambient Shadcn-Style SVG Area Chart */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30 sm:opacity-35">
            <svg viewBox="0 0 300 135" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id={`pos-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={posStrokeColor} stopOpacity="0.32" />
                  <stop offset="95%" stopColor={posStrokeColor} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Faint shadcn horizontal reference lines */}
              <line x1="0" y1="35" x2="300" y2="35" stroke="currentColor" strokeDasharray="3 3" className="text-rule" strokeOpacity="0.4" strokeWidth="1" />
              <line x1="0" y1="75" x2="300" y2="75" stroke="currentColor" strokeDasharray="3 3" className="text-rule" strokeOpacity="0.4" strokeWidth="1" />
              <line x1="0" y1="110" x2="300" y2="110" stroke="currentColor" strokeDasharray="3 3" className="text-rule" strokeOpacity="0.4" strokeWidth="1" />

              {/* Shaded Area */}
              <path d={posChart.area} fill={`url(#pos-grad-${chartId})`} />

              {/* Crisp hairline stroke curve */}
              <path
                d={posChart.line}
                fill="none"
                stroke={posStrokeColor}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Terminal data point dot with halo */}
              <circle cx={posChart.lastPoint[0]} cy={posChart.lastPoint[1]} r="4.5" fill={posStrokeColor} opacity="0.3" />
              <circle cx={posChart.lastPoint[0]} cy={posChart.lastPoint[1]} r="2" fill={posStrokeColor} />
            </svg>
          </div>

          {/* Foreground Content */}
          <div className="relative z-10 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-ink-3 tracking-wider uppercase">
            <span className="truncate">{trade.marketLabel ?? shortMarket(trade.marketId)}</span>
            <span className={isUp ? "text-good font-semibold ml-1 flex-shrink-0" : "text-critical font-semibold ml-1 flex-shrink-0"}>
              {trade.side.toUpperCase()}
            </span>
          </div>

          <div className="relative z-10 py-1 sm:py-2">
            <div
              className={`text-xl sm:text-2xl md:text-3xl font-bold tracking-tight ${
                isUp ? "text-good" : "text-critical"
              }`}
            >
              {isUp ? "UP" : "DOWN"}
            </div>
            <div className="text-[10px] sm:text-xs font-mono text-ink-2 mt-0.5 truncate">
              {Math.round(pricePaid * 100)}¢ entry · {formatProbability(trade.impliedProbability)} P
            </div>
          </div>

          <div className="relative z-10 text-[10px] sm:text-[11px] font-mono truncate">
            {isSettled ? (
              <span className="text-ink-3">
                Settled:{" "}
                <span className={isWon ? "text-good font-medium" : "text-critical font-medium"}>
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

        {/* Right Card: Calibration & Edge with Smooth Shadcn-Style Area Chart */}
        <div className="flex-1 min-w-0 relative overflow-hidden rounded-xl border border-rule bg-plane p-3 sm:p-4 flex flex-col justify-between min-h-[135px] sm:min-h-[160px]">
          {/* Ambient Shadcn-Style SVG Area Chart */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30 sm:opacity-35">
            <svg viewBox="0 0 300 135" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id={`edge-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={edgeStrokeColor} stopOpacity="0.32" />
                  <stop offset="95%" stopColor={edgeStrokeColor} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Faint shadcn horizontal reference lines */}
              <line x1="0" y1="35" x2="300" y2="35" stroke="currentColor" strokeDasharray="3 3" className="text-rule" strokeOpacity="0.4" strokeWidth="1" />
              <line x1="0" y1="75" x2="300" y2="75" stroke="currentColor" strokeDasharray="3 3" className="text-rule" strokeOpacity="0.4" strokeWidth="1" />
              <line x1="0" y1="110" x2="300" y2="110" stroke="currentColor" strokeDasharray="3 3" className="text-rule" strokeOpacity="0.4" strokeWidth="1" />

              {/* Shaded Area */}
              <path d={edgeChart.area} fill={`url(#edge-grad-${chartId})`} />

              {/* Crisp hairline stroke curve */}
              <path
                d={edgeChart.line}
                fill="none"
                stroke={edgeStrokeColor}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Terminal data point dot with halo */}
              <circle cx={edgeChart.lastPoint[0]} cy={edgeChart.lastPoint[1]} r="4.5" fill={edgeStrokeColor} opacity="0.3" />
              <circle cx={edgeChart.lastPoint[0]} cy={edgeChart.lastPoint[1]} r="2" fill={edgeStrokeColor} />
            </svg>
          </div>

          {/* Foreground Content */}
          <div className="relative z-10 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-ink-3 tracking-wider uppercase">
            <span className="truncate">Fleet Edge</span>
            {trade.traderIsSeed && <span className="text-accent ml-1 flex-shrink-0">Seed</span>}
          </div>

          <div className="relative z-10 py-1 sm:py-2">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold font-mono tracking-tight text-ink">
              {trade.traderEdge !== null ? formatEdge(trade.traderEdge) : "—"}
            </div>
            <div className="text-[10px] sm:text-xs font-mono text-ink-3 mt-0.5 truncate">
              {trade.traderSampleCount >= 20
                ? "Edge / unit (95% CI)"
                : `Warming (${trade.traderSampleCount}/20)`}
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-ink-3">
            <span className="truncate">
              {trade.echoCount} {trade.echoCount === 1 ? "echo" : "echoes"}
            </span>
            <Link
              href={`/traders/${trade.traderId}`}
              className="text-accent hover:underline ml-1 flex-shrink-0"
            >
              Trace →
            </Link>
          </div>
        </div>
      </div>

      {/* 4. Action Bar: Heart (Stimulate Feed) + Bullish / Bearish Proper Icon Buttons Alone + Repost + Share */}
      <div className="pt-2 flex items-center justify-between border-t border-rule/50 gap-2">
        {/* Left: Heart button (stimulate/like) */}
        <button
          type="button"
          onClick={() => handleReaction("like")}
          disabled={reacting}
          className={`flex items-center gap-1.5 h-8 px-2 rounded-lg transition ${
            reactions.userLiked
              ? "text-critical bg-critical/10"
              : "text-ink-3 hover:text-critical hover:bg-surface-raised"
          }`}
          title="Like & stimulate feed"
          aria-label="Like and stimulate feed"
        >
          <Heart size={18} weight={reactions.userLiked ? "fill" : "regular"} className={reactions.userLiked ? "text-critical" : ""} />
          <span className="text-xs font-mono font-medium">{reactions.like}</span>
        </button>

        {/* Center: Bullish and Bearish as Proper Icon Buttons Alone */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Bullish Icon Button Alone */}
          <button
            type="button"
            onClick={() => handleReaction("bullish")}
            disabled={reacting}
            aria-label="Bullish sentiment"
            title={`Bullish sentiment (${reactions.bullish})`}
            className={`flex items-center justify-center h-8 min-w-[32px] px-2 rounded-lg border transition ${
              reactions.userReaction === "bullish"
                ? "border-good/60 bg-good/15 text-good font-semibold shadow-xs"
                : "border-rule/80 bg-surface-raised/40 text-ink-3 hover:border-good/40 hover:text-good hover:bg-good/10"
            }`}
          >
            <TrendUp size={18} weight={reactions.userReaction === "bullish" ? "bold" : "bold"} className={reactions.userReaction === "bullish" ? "text-good" : ""} />
            {reactions.bullish > 0 && (
              <span className="text-xs font-mono font-semibold ml-1">{reactions.bullish}</span>
            )}
          </button>

          {/* Bearish Icon Button Alone */}
          <button
            type="button"
            onClick={() => handleReaction("bearish")}
            disabled={reacting}
            aria-label="Bearish sentiment"
            title={`Bearish sentiment (${reactions.bearish})`}
            className={`flex items-center justify-center h-8 min-w-[32px] px-2 rounded-lg border transition ${
              reactions.userReaction === "bearish"
                ? "border-critical/60 bg-critical/15 text-critical font-semibold shadow-xs"
                : "border-rule/80 bg-surface-raised/40 text-ink-3 hover:border-critical/40 hover:text-critical hover:bg-critical/10"
            }`}
          >
            <TrendDown size={18} weight={reactions.userReaction === "bearish" ? "bold" : "bold"} className={reactions.userReaction === "bearish" ? "text-critical" : ""} />
            {reactions.bearish > 0 && (
              <span className="text-xs font-mono font-semibold ml-1">{reactions.bearish}</span>
            )}
          </button>
        </div>

        {/* Right: Echo / Repost & Share */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Echo / Repost */}
          <button
            type="button"
            onClick={() => handleReaction("echoed")}
            disabled={reacting}
            aria-label="Echo / Repost trade"
            title={`Echo this trade (${reactions.echoed})`}
            className={`flex items-center gap-1.5 h-8 px-2 rounded-lg transition ${
              reactions.userEchoed
                ? "text-accent bg-accent/10 font-semibold"
                : "text-ink-3 hover:text-accent hover:bg-surface-raised"
            }`}
          >
            <Repeat size={18} weight={reactions.userEchoed ? "bold" : "regular"} className={reactions.userEchoed ? "text-accent" : ""} />
            {reactions.echoed > 0 && (
              <span className="text-xs font-mono">{reactions.echoed}</span>
            )}
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share trade link"
            title="Share trade link"
            className="flex items-center justify-center h-8 w-8 rounded-lg text-ink-3 hover:text-ink hover:bg-surface-raised transition"
          >
            <ShareNetwork size={18} />
          </button>
        </div>
      </div>

      {/* 5. Clean Tally Line */}
      <div className="flex items-center justify-between text-[11px] text-ink-3 font-mono pt-0.5 px-0.5">
        <span className="font-medium text-ink-2 truncate">
          {reactions.like} {reactions.like === 1 ? "like" : "likes"} · {reactions.bullish} bullish · {reactions.bearish} bearish
        </span>
        <span className="truncate ml-2 flex-shrink-0">
          {trade.echoCount} {trade.echoCount === 1 ? "echo" : "echoes"} · {commentCount} {commentCount === 1 ? "take" : "takes"}
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

