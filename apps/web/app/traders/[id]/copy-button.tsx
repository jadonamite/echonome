"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";

/**
 * Creating a CopyLink. Deliberately NOT a one-click action: a follower is authorising
 * a bot to place real orders with their own collateral, so the size is chosen explicitly
 * every time and stated back in plain terms before they commit.
 *
 * No signature is needed here — the only thing a user ever signs is the operator grant
 * on /connect. This is a database row under a grant that already exists, which is exactly
 * why revoking is instant: see TECHNICAL_ARCHITECTURE.md step 4.
 */
export function CopyButton({ traderId, traderLabel }: { traderId: string; traderLabel: string }) {
  const { address, isConnected } = useAccount();
  const [grantId, setGrantId] = useState<string | null>(null);
  const [loadingGrant, setLoadingGrant] = useState(false);
  const [percent, setPercent] = useState(25);
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setGrantId(null);
      return;
    }
    let cancelled = false;
    setLoadingGrant(true);
    fetch(`/api/me?address=${address}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setGrantId(data.grant?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setGrantId(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingGrant(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  async function submit() {
    if (!grantId) return;
    setState("saving");
    setError(null);
    try {
      const response = await fetch("/api/copy-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proxyGrantId: grantId, traderId, sizeFraction: percent / 100 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not start copying");
      setState("done");
    } catch (err) {
      setState("idle");
      setError((err as Error).message);
    }
  }

  if (!isConnected) {
    return (
      <Box>
        <p className="text-sm text-ink-2">
          Connect a wallet to copy {traderLabel}.
        </p>
      </Box>
    );
  }

  if (loadingGrant) {
    return (
      <Box>
        <p className="text-sm text-ink-3">Checking your authorisation…</p>
      </Box>
    );
  }

  if (!grantId) {
    return (
      <Box>
        <p className="text-sm text-ink-2">
          You haven&apos;t authorised Echonome to place orders yet.
        </p>
        <Link
          href="/connect"
          className="mt-3 inline-block border border-edge px-3 py-1.5 text-sm text-ink hover:bg-surface-raised"
        >
          Set up authorisation
        </Link>
      </Box>
    );
  }

  if (state === "done") {
    return (
      <Box>
        <p className="text-sm text-ink">
          <span className="text-good">Copying {traderLabel}.</span> Their next trade on a
          tracked market will be echoed at {percent}% of their size.
        </p>
        <Link
          href="/me"
          className="mt-3 inline-block border border-edge px-3 py-1.5 text-sm text-ink hover:bg-surface-raised"
        >
          Manage your copies
        </Link>
      </Box>
    );
  }

  return (
    <Box>
      <label htmlFor="size-fraction" className="block text-[10px] uppercase tracking-wider text-ink-3">
        Copy at what size
      </label>
      <div className="mt-2 flex items-center gap-3">
        <input
          id="size-fraction"
          type="range"
          min={1}
          max={100}
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
          className="w-40 accent-[var(--accent)]"
        />
        <span className="font-mono text-lg text-ink tnum">{percent}%</span>
      </div>
      <p className="mt-2 max-w-xs text-xs leading-relaxed text-ink-3">
        Each trade {traderLabel} makes is placed for you at {percent}% of their size, from
        your own vault. You can stop this at any time without their permission.
      </p>

      {error && <p className="mt-2 text-xs text-critical">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={state === "saving"}
        className="mt-3 border border-edge px-3 py-1.5 text-sm text-ink hover:bg-surface-raised disabled:opacity-50"
      >
        {state === "saving" ? "Starting…" : `Copy ${traderLabel}`}
      </button>
    </Box>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="border border-rule bg-surface px-5 py-4">{children}</div>;
}
