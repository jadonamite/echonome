"use client";

import { useState } from "react";
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
import { TradeCommentsThread } from "./trade-comments-thread";
import { useToast } from "@/components/toast";

interface TradeFeedCardProps {
  trade: FeedTrade;
}

export function TradeFeedCard({ trade }: TradeFeedCardProps) {
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

  async function handleReaction(reactionType: ReactionType) {
    if (!isConnected || !address) {
      show({
        tone: "info",
        title: "Wallet required",
        detail: "Connect your wallet to react to trades.",
      });
      if (injected) connect({ connector: injected });
      return;
    }

    if (reacting) return;

    // Optimistic toggle
    const prevReactions = { ...reactions };
    const isTogglingOff = reactions.userReaction === reactionType;
    const newReactions: ReactionCounts = {
      bullish: reactions.bullish + (reactionType === "bullish" ? (isTogglingOff ? -1 : 1) : reactions.userReaction === "bullish" ? -1 : 0),
      bearish: reactions.bearish + (reactionType === "bearish" ? (isTogglingOff ? -1 : 1) : reactions.userReaction === "bearish" ? -1 : 0),
      echoed: reactions.echoed + (reactionType === "echoed" ? (isTogglingOff ? -1 : 1) : reactions.userReaction === "echoed" ? -1 : 0),
      userReaction: isTogglingOff ? null : reactionType,
    };

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
      // Revert on error
      setReactions(prevReactions);
      show({
        tone: "error",
        title: "Reaction failed",
        detail: "Could not record your reaction.",
      });
    } finally {
      setReacting(false);
    }
  }

  return (
    <article className="rounded-lg border border-rule bg-surface overflow-hidden transition hover:border-edge">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-rule/50">
        <div className="flex items-center gap-3">
          <Link href={`/traders/${trade.traderId}`} className="group flex items-center gap-3">
            <TraderAvatar address={trade.traderAddress} name={identity.name} size={36} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink group-hover:text-accent transition">
                  {identity.name}
                </span>
                {trade.traderIsSeed && (
                  <span className="border border-edge bg-surface-raised px-1 py-0.2 text-[9px] uppercase tracking-wider text-ink-3">
                    Seed
                  </span>
                )}
              </div>
              <div className="font-mono text-[11px] text-ink-3">
                {identity.strategy} · {shortAddress(trade.traderAddress)}
              </div>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {trade.traderSampleCount >= 20 && trade.traderEdge !== null ? (
            <span
              className={`font-mono text-xs px-2 py-0.5 rounded border ${
                trade.traderEdge > 0
                  ? "border-good/40 bg-good/10 text-good"
                  : "border-edge bg-surface-raised text-ink-3"
              }`}
            >
              {formatEdge(trade.traderEdge)} edge
            </span>
          ) : (
            <span className="font-mono text-[10px] text-ink-3 border border-rule px-1.5 py-0.5 rounded">
              Warming up ({trade.traderSampleCount}/20)
            </span>
          )}
          <span className="font-mono text-xs text-ink-3">{timeAgo(trade.createdAt)}</span>
        </div>
      </div>

      {/* Main Trade Content */}
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Position Info */}
          <div className="flex items-center gap-2">
            <span className="rounded bg-surface-raised border border-edge px-2.5 py-1 text-xs font-mono font-medium text-ink">
              {trade.marketLabel ?? shortMarket(trade.marketId)}
            </span>
            <span
              className={`rounded border px-2.5 py-1 text-xs font-mono font-semibold flex items-center gap-1 ${
                isUp
                  ? "border-good/40 bg-good/15 text-good"
                  : "border-critical/40 bg-critical/15 text-critical"
              }`}
            >
              {isUp ? "▲ UP" : "▼ DOWN"}
            </span>
            <span className="font-mono text-xs text-ink-2">
              @ {Math.round(pricePaid * 100)}¢ ({formatProbability(trade.impliedProbability)} P(Up))
            </span>
          </div>

          {/* Settlement / Lifecycle Status */}
          <div>
            {isSettled ? (
              <span
                className={`font-mono text-xs px-2 py-1 rounded border flex items-center gap-1 ${
                  isWon
                    ? "border-good/40 bg-good/10 text-good font-medium"
                    : "border-critical/30 bg-critical/5 text-critical/80"
                }`}
              >
                {isWon ? (
                  <>
                    <span>✓ Settled {trade.settledOutcome?.toUpperCase()}</span>
                    <span className="text-[10px] opacity-80">(+{Math.round((1 - pricePaid) * 100)}¢)</span>
                  </>
                ) : (
                  <>
                    <span>✕ Settled {trade.settledOutcome?.toUpperCase()}</span>
                  </>
                )}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 font-mono text-xs text-accent">
                  <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                  Live Market
                </span>
                <Link
                  href={`/traders/${trade.traderId}`}
                  className="rounded border border-edge bg-surface-raised px-2.5 py-1 text-xs text-ink hover:border-accent hover:text-accent transition"
                >
                  Copy Trader →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Quantities and Context if available */}
        {trade.quantity !== null && (
          <div className="text-[11px] font-mono text-ink-3">
            Stake Size: {trade.quantity} units
          </div>
        )}
      </div>

      {/* Social Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-surface-raised/40 border-t border-rule/60 text-xs">
        {/* Left: Echo count indicator */}
        <div className="flex items-center gap-1.5 font-mono text-xs text-ink-3">
          <span title="Followers copying this trade">🔊</span>
          <span>
            {trade.echoCount} {trade.echoCount === 1 ? "echo" : "echoes"}
          </span>
        </div>

        {/* Right: Reactions & Comments toggle */}
        <div className="flex items-center gap-2">
          {/* Reaction: Bullish */}
          <button
            type="button"
            onClick={() => handleReaction("bullish")}
            disabled={reacting}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-xs border transition ${
              reactions.userReaction === "bullish"
                ? "border-good/50 bg-good/20 text-good font-semibold"
                : "border-rule bg-surface/80 text-ink-3 hover:border-edge hover:text-ink-2"
            }`}
            title="React Bullish"
          >
            <span>🐂</span>
            <span>{reactions.bullish}</span>
          </button>

          {/* Reaction: Bearish */}
          <button
            type="button"
            onClick={() => handleReaction("bearish")}
            disabled={reacting}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-xs border transition ${
              reactions.userReaction === "bearish"
                ? "border-critical/50 bg-critical/20 text-critical font-semibold"
                : "border-rule bg-surface/80 text-ink-3 hover:border-edge hover:text-ink-2"
            }`}
            title="React Bearish"
          >
            <span>🐻</span>
            <span>{reactions.bearish}</span>
          </button>

          {/* Reaction: Echoed */}
          <button
            type="button"
            onClick={() => handleReaction("echoed")}
            disabled={reacting}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-xs border transition ${
              reactions.userReaction === "echoed"
                ? "border-accent/50 bg-accent/20 text-accent font-semibold"
                : "border-rule bg-surface/80 text-ink-3 hover:border-edge hover:text-ink-2"
            }`}
            title="Mark as Echoed"
          >
            <span>🎯</span>
            <span>{reactions.echoed}</span>
          </button>

          {/* Comments toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-xs border transition ${
              isExpanded || commentCount > 0
                ? "border-edge bg-surface-raised text-ink font-medium"
                : "border-rule bg-surface/80 text-ink-3 hover:border-edge hover:text-ink-2"
            }`}
          >
            <span>💬</span>
            <span>{commentCount}</span>
            <span className="text-[10px] text-ink-3">{isExpanded ? "▲" : "▼"}</span>
          </button>
        </div>
      </div>

      {/* Expanded Discussion Thread */}
      {isExpanded && (
        <TradeCommentsThread
          decisionId={trade.id}
          traderAddress={trade.traderAddress}
          onCommentAdded={() => setCommentCount((c) => c + 1)}
        />
      )}
    </article>
  );
}
