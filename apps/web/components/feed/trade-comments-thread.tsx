"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import type { TradeComment } from "@echonome/shared";
import { shortAddress, timeAgo } from "@/lib/format";
import { useToast } from "@/components/toast";

interface TradeCommentsThreadProps {
  decisionId: string;
  traderAddress: string;
  onCommentAdded?: () => void;
}

export function TradeCommentsThread({
  decisionId,
  traderAddress,
  onCommentAdded,
}: TradeCommentsThreadProps) {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { show } = useToast();

  const [comments, setComments] = useState<TradeComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState("");

  const injected = connectors[0];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/feed/${decisionId}/comments`);
        if (!res.ok) throw new Error("Failed to load comments");
        const data = await res.json();
        if (!cancelled && data.comments) {
          setComments(data.comments);
        }
      } catch (err) {
        console.error("Could not load comments", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [decisionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || !address) return;

    try {
      setSubmitting(true);
      const res = await fetch(`/api/feed/${decisionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorAddress: address,
          content: trimmed,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error ?? "Failed to post comment");
      }

      const { comment } = await res.json();
      setComments((prev) => [...prev, comment]);
      setContent("");
      onCommentAdded?.();
      show({
        tone: "success",
        title: "Take posted",
        detail: "Your commentary has been added to this trade.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error posting comment";
      show({ tone: "error", title: "Could not post take", detail: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-t border-rule/80 bg-surface/50 p-4 space-y-4">
      <div className="flex items-center justify-between text-xs font-mono text-ink-3">
        <span>Discussion & Takes ({comments.length})</span>
      </div>

      {loading ? (
        <div className="py-3 text-xs text-ink-3 font-mono animate-pulse">
          Loading discussion…
        </div>
      ) : comments.length === 0 ? (
        <div className="rounded border border-dashed border-rule/70 py-4 text-center text-xs text-ink-3">
          No takes yet. Share your rationale or reaction to this position.
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => {
            const isTrader =
              c.authorAddress.toLowerCase() === traderAddress.toLowerCase();
            const isMe =
              address && c.authorAddress.toLowerCase() === address.toLowerCase();

            return (
              <div
                key={c.id}
                className="rounded border border-rule/60 bg-surface-raised/60 p-3 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-ink-2 font-medium">
                      {shortAddress(c.authorAddress)}
                    </span>
                    {isTrader && (
                      <span className="rounded bg-accent/20 border border-accent/40 px-1 py-0.2 text-[9px] font-mono text-accent uppercase tracking-wider">
                        Trader Thesis
                      </span>
                    )}
                    {isMe && !isTrader && (
                      <span className="rounded bg-surface-raised border border-edge px-1 py-0.2 text-[9px] font-mono text-ink-3 uppercase">
                        You
                      </span>
                    )}
                  </div>
                  <span className="text-ink-3 text-[10px] font-mono">
                    {timeAgo(c.createdAt)}
                  </span>
                </div>
                <p className="text-ink-1 leading-relaxed whitespace-pre-wrap break-words">
                  {c.content}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Input or Connect Prompt */}
      {isConnected ? (
        <form onSubmit={handleSubmit} className="space-y-2 pt-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add your take on this position (momentum, macro, technical analysis, or echo rationale)..."
            rows={2}
            maxLength={1000}
            className="w-full rounded border border-rule bg-surface p-2.5 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-ink-3">
              {content.length}/1000
            </span>
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="rounded bg-ink px-3 py-1 text-xs font-medium text-plane hover:bg-ink-2 disabled:opacity-40 disabled:hover:bg-ink transition"
            >
              {submitting ? "Posting…" : "Post Take"}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between rounded border border-rule/50 bg-surface/80 px-3 py-2 text-xs">
          <span className="text-ink-3">Connect wallet to join this trade discussion.</span>
          <button
            type="button"
            onClick={() => injected && connect({ connector: injected })}
            className="rounded border border-edge px-2.5 py-1 text-xs text-ink hover:bg-surface-raised"
          >
            Connect
          </button>
        </div>
      )}
    </div>
  );
}
