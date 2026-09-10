"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import type { FeedTrade, FeedFilter } from "@/lib/queries";
import { TradeFeedCard } from "./trade-feed-card";

interface FeedViewProps {
  initialTrades: FeedTrade[];
  initialFilter?: FeedFilter;
}

const TABS: { id: FeedFilter; label: string; description: string }[] = [
  { id: "all", label: "Live Stream", description: "Every trade across all tracked strategies" },
  { id: "top", label: "High Edge", description: "Only trades from proven, calibrated traders" },
  { id: "following", label: "My Following", description: "Trades from strategies you are currently echoing" },
  { id: "discussions", label: "Discussions", description: "Trades with active community takes and analysis" },
];

export function FeedView({ initialTrades, initialFilter = "all" }: FeedViewProps) {
  const { address, isConnected } = useAccount();
  const [filter, setFilter] = useState<FeedFilter>(initialFilter);
  const [trades, setTrades] = useState<FeedTrade[]>(initialTrades);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchFeed = useCallback(
    async (targetFilter: FeedFilter, showSpinner = true) => {
      if (showSpinner) setLoading(true);
      try {
        const viewerParam = address ? `&viewer=${encodeURIComponent(address)}` : "";
        const res = await fetch(`/api/feed?filter=${targetFilter}${viewerParam}`);
        if (!res.ok) throw new Error("Failed to fetch feed");
        const data = await res.json();
        if (data.trades) {
          startTransition(() => {
            setTrades(data.trades);
            setLastRefreshed(new Date());
          });
        }
      } catch (err) {
        console.error("Feed fetch error:", err);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [address]
  );

  // Re-fetch when tab or connected wallet changes
  useEffect(() => {
    fetchFeed(filter, true);
  }, [filter, address, fetchFeed]);

  // Periodic polling every 12 seconds to keep live feed fresh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchFeed(filter, false);
    }, 12_000);
    return () => clearInterval(interval);
  }, [filter, fetchFeed]);

  const activeTabInfo = TABS.find((t) => t.id === filter)!;

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Trade Feed</h1>
            <p className="text-sm text-ink-3">
              The acoustic record: real-time positions, echoes, and community takes.
            </p>
          </div>

          {/* Live pulse indicator */}
          <div className="flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1 text-xs font-mono text-ink-3">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <span>Streaming</span>
            <span className="text-[10px] text-ink-3">· {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex flex-wrap gap-2 border-b border-rule pb-2">
          {TABS.map((t) => {
            const isActive = filter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(t.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-mono transition ${
                  isActive
                    ? "border border-ink bg-ink text-plane font-semibold"
                    : "border border-rule bg-surface text-ink-3 hover:border-edge hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-ink-3 italic">{activeTabInfo.description}</p>
      </div>

      {/* Feed Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-36 rounded-lg border border-rule bg-surface/50 animate-pulse"
            />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule bg-surface/30 p-12 text-center space-y-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-rule bg-surface-raised font-mono text-xs text-accent">
            —
          </div>
          <h3 className="text-sm font-semibold text-ink">No trades found in this view</h3>
          <p className="text-xs text-ink-3 max-w-sm mx-auto">
            {filter === "following"
              ? !isConnected
                ? "Connect your wallet to view live trades from the strategies you follow."
                : "You aren't copying any strategies yet. Find high-edge traders on Echo Rank to start echoing."
              : filter === "discussions"
              ? "No trades have active discussions yet. Open any trade in the Live Stream and share the first take."
              : "No trade decisions have been recorded matching this filter."}
          </p>
          {filter === "following" && !isConnected && (
            <div className="pt-2">
              <span className="text-xs text-accent">Use the Connect button in the top bar to sign in.</span>
            </div>
          )}
          {filter === "following" && isConnected && (
            <div className="pt-2">
              <Link
                href="/echo-rank"
                className="rounded-full border border-edge bg-surface px-4 py-1.5 text-xs text-ink hover:border-accent hover:text-accent transition"
              >
                Browse Echo Rank →
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {trades.map((trade) => (
            <TradeFeedCard key={trade.id} trade={trade} />
          ))}
        </div>
      )}
    </div>
  );
}
