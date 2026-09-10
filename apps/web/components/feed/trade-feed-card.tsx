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
import {
  HeartIcon,
  CommentIcon,
  ShareIcon,
  EchoIcon,
  BookmarkIcon,
  DotsIcon,
} from "./icons";
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
  const totalLikes = reactions.bullish + reactions.bearish + reactions.echoed;

  const injected = connectors[0];

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
        detail: "Connect your wallet to endorse or react to trades.",
      });
      if (injected) connect({ connector: injected });
      return;
    }

    if (reacting) return;

    const prevReactions = { ...reactions };
    const isTogglingOff = reactions.userReaction === reactionType;
    const newReactions: ReactionCounts = {
      bullish:
        reactions.bullish +
        (reactionType === "bullish"
          ? isTogglingOff
            ? -1
            : 1
          : reactions.userReaction === "bullish"
          ? -1
          : 0),
      bearish:
        reactions.bearish +
        (reactionType === "bearish"
          ? isTogglingOff
            ? -1
            : 1
          : reactions.userReaction === "bearish"
          ? -1
          : 0),
      echoed:
        reactions.echoed +
        (reactionType === "echoed"
          ? isTogglingOff
            ? -1
            : 1
          : reactions.userReaction === "echoed"
          ? -1
          : 0),
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
      setReactions(prevReactions);
      show({
        tone: "error",
        title: "Reaction failed",
        detail: "Could not record your action.",
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
            {/* Live status dot */}
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

      {/* 2. Post Commentary / Thesis Text */}
      <p className="text-sm leading-relaxed text-ink-2">
        {narrative}
      </p>

      {/* 3. Visual Data Grid (2-Column panels matching the screenshot's media layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl overflow-hidden">
        {/* Left Box: Contract & Call */}
        <div className="rounded-xl border border-rule bg-plane p-4 flex flex-col justify-between min-h-[150px]">
          <div className="flex items-center justify-between text-[11px] font-mono text-ink-3 tracking-wider uppercase">
            <span>{trade.marketLabel ?? shortMarket(trade.marketId)}</span>
            <span className={isUp ? "text-good font-semibold" : "text-critical font-semibold"}>
              {trade.side.toUpperCase()}
            </span>
          </div>

          <div className="py-2">
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

          <div className="text-[11px] font-mono">
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

        {/* Right Box: Calibration & Edge */}
        <div className="rounded-xl border border-rule bg-plane p-4 flex flex-col justify-between min-h-[150px]">
          <div className="flex items-center justify-between text-[11px] font-mono text-ink-3 tracking-wider uppercase">
            <span>Rank & Edge</span>
            {trade.traderIsSeed && <span>Seed Fleet</span>}
          </div>

          <div className="py-2">
            <div className="text-3xl font-bold font-mono tracking-tight text-ink">
              {trade.traderEdge !== null ? formatEdge(trade.traderEdge) : "—"}
            </div>
            <div className="text-xs font-mono text-ink-3 mt-1">
              {trade.traderSampleCount >= 20
                ? "Edge per unit staked (95% CI)"
                : `Warming up (${trade.traderSampleCount}/20 calls)`}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-ink-3">
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

      {/* 4. Minimalist Vector Engagement Bar (Heart, Comment, Share | Echo, Bookmark) */}
      <div className="pt-2 flex items-center justify-between border-t border-rule/50">
        <div className="flex items-center gap-5">
          {/* Like */}
          <button
            type="button"
            onClick={() => handleReaction("bullish")}
            disabled={reacting}
            className={`transition hover:text-ink ${
              reactions.userReaction === "bullish" ? "text-critical" : "text-ink-3"
            }`}
            title="Like trade"
          >
            <HeartIcon
              filled={reactions.userReaction === "bullish"}
              className="w-5 h-5"
            />
          </button>

          {/* Comment */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-ink-3 hover:text-ink transition"
            title="Takes & Comments"
          >
            <CommentIcon className="w-5 h-5" />
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={handleShare}
            className="text-ink-3 hover:text-ink transition"
            title="Share"
          >
            <ShareIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Echo / Repost */}
          <button
            type="button"
            onClick={() => handleReaction("echoed")}
            disabled={reacting}
            className={`transition hover:text-ink ${
              reactions.userReaction === "echoed" ? "text-accent" : "text-ink-3"
            }`}
            title="Mark as Echoed"
          >
            <EchoIcon className="w-5 h-5" />
          </button>

          {/* Bookmark */}
          <button
            type="button"
            onClick={() => handleReaction("bearish")}
            disabled={reacting}
            className={`transition hover:text-ink ${
              reactions.userReaction === "bearish" ? "text-warning" : "text-ink-3"
            }`}
            title="Save / Bookmark"
          >
            <BookmarkIcon
              filled={reactions.userReaction === "bearish"}
              className="w-5 h-5"
            />
          </button>
        </div>
      </div>

      {/* 5. Likes and Counter Line (Matching screenshot) */}
      <div className="flex items-center justify-between text-xs pt-0.5">
        <span className="font-semibold text-ink">
          {totalLikes} {totalLikes === 1 ? "like" : "likes"}
        </span>
        <span className="text-ink-3 font-mono text-[11px]">
          {commentCount} {commentCount === 1 ? "comment" : "comments"} ·{" "}
          {trade.echoCount} {trade.echoCount === 1 ? "repost" : "reposts"}
        </span>
      </div>

      {/* 6. Quick Comment Input / Toggle Pill */}
      {!isExpanded ? (
        <div
          onClick={() => setIsExpanded(true)}
          className="rounded-lg border border-rule/80 bg-surface-raised/40 px-3.5 py-2 text-xs text-ink-3 cursor-pointer hover:border-edge transition flex items-center justify-between"
        >
          <span>Add a comment…</span>
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
