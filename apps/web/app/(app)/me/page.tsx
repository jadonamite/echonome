"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import type { EchoView, CopyLinkView } from "@/lib/queries";
import { AccountPanel } from "@/components/account-panel";
import { shortMarket, sideLabel, timeAgo } from "@/lib/format";

/**
 * What a follower actually needs to see: what was placed for them, how it turned out in
 * plain words, and one control per copy to stop it. Raw transaction hashes are available
 * but never the primary display — "You called Up on BTC and it went up" is the fact; the
 * hash is the receipt.
 */
export default function MePage() {
  const { address, isConnected } = useAccount();
  const [echoes, setEchoes] = useState<EchoView[]>([]);
  const [copyLinks, setCopyLinks] = useState<CopyLinkView[]>([]);
  const [grant, setGrant] = useState<{ id: string; grantedAt: string; accountAddress: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const [meResponse, echoResponse] = await Promise.all([
        fetch(`/api/me?address=${address}`),
        fetch(`/api/me/echoes?address=${address}`),
      ]);
      const me = await meResponse.json();
      const echoData = await echoResponse.json();
      if (!meResponse.ok) throw new Error(me.error ?? "Could not read your account");
      if (!echoResponse.ok) throw new Error(echoData.error ?? "Could not read your echoes");
      setGrant(me.grant);
      setCopyLinks(me.copyLinks);
      setEchoes(echoData.echoes);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) load();
    else {
      setEchoes([]);
      setCopyLinks([]);
      setGrant(null);
    }
  }, [address, load]);

  async function setActive(id: string, active: boolean) {
    setBusyId(id);
    try {
      const response = active
        ? await fetch(`/api/copy-links/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ active: true }),
          })
        : await fetch(`/api/copy-links/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not update");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function revokeEverything() {
    if (!address) return;
    setBusyId("grant");
    try {
      const response = await fetch(`/api/proxy-grants?address=${address}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not revoke");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (!isConnected) {
    return (
      <Panel title="Connect your wallet">
        Your echoes are keyed to your wallet address. Connect it using the button in the
        header and this page fills in.
      </Panel>
    );
  }

  return (
    <div className="space-y-10">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">My echoes</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-2">
          Every trade Echonome has placed on your behalf, and every copy you can stop.
        </p>
      </section>

      {error && (
        <p className="border-l-2 border-critical bg-surface px-4 py-3 text-sm text-ink-2">
          {error}
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-ink-3">
          Who you&apos;re copying
        </h2>

        {loading && copyLinks.length === 0 ? (
          <p className="text-sm text-ink-3">Reading your account…</p>
        ) : copyLinks.length === 0 ? (
          <Panel title="You aren't copying anyone yet">
            Pick a trader from the{" "}
            <Link href="/" className="text-ink underline underline-offset-4">
              leaderboard
            </Link>{" "}
            and choose what share of their size to copy.
          </Panel>
        ) : (
          <ul className="divide-y divide-rule border border-rule">
            {copyLinks.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-4 bg-surface px-5 py-4"
              >
                <div>
                  <Link
                    href={`/traders/${link.traderId}`}
                    className="text-sm text-ink underline-offset-4 hover:underline"
                  >
                    {link.traderLabel}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {Math.round(link.sizeFraction * 100)}% of their size ·{" "}
                    {link.echoCount} {link.echoCount === 1 ? "echo" : "echoes"} placed ·{" "}
                    {link.active ? (
                      <span className="text-good">active</span>
                    ) : (
                      <span className="text-ink-3">paused</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActive(link.id, !link.active)}
                  disabled={busyId === link.id}
                  className="border border-edge px-3 py-1.5 text-xs text-ink hover:bg-surface-raised disabled:opacity-40"
                >
                  {busyId === link.id ? "…" : link.active ? "Stop copying" : "Resume"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {grant?.accountAddress ? (
        <AccountPanel accountAddress={grant.accountAddress as Address} />
      ) : (
        <Panel title="You haven't set up an account yet">
          Copying a trader needs an account contract that holds your collateral — you own it,
          and Echonome can only place orders inside limits you set.{" "}
          <Link href="/connect" className="text-ink underline underline-offset-4">
            Set one up
          </Link>
          .
        </Panel>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-ink-3">
          What was placed for you
        </h2>

        {echoes.length === 0 ? (
          <Panel title="No echoes yet">
            Nothing has been placed on your behalf. An echo appears here within seconds of
            a trader you copy making a call — as long as their market has more than five
            minutes left to run.
          </Panel>
        ) : (
          <ul className="divide-y divide-rule border border-rule">
            {echoes.map((echo) => (
              <li key={echo.id} className="bg-surface px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-ink">{plainLanguage(echo)}</p>
                    <p className="font-mono text-xs text-ink-3 tnum">
                      {echo.marketLabel ?? shortMarket(echo.marketId)} · following{" "}
                      {echo.traderLabel} ·{" "}
                      {timeAgo(echo.createdAt)}
                    </p>
                  </div>
                  {echo.txHash && (
                    <span className="font-mono text-[11px] text-ink-3 tnum">
                      {echo.txHash.slice(0, 10)}…
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * The settled outcome as a sentence. A follower should not have to decode a status enum
 * to learn whether they won — and a failed echo says why it failed, because "nothing
 * happened" is the one thing a copy-trading product must never leave unexplained.
 */
function plainLanguage(echo: EchoView): string {
  const call = `${sideLabel(echo.side)} at ${Math.round(echo.size * 100) / 100}`;

  switch (echo.status) {
    case "settled":
      return echo.wasRight
        ? `${call} — it settled ${sideLabel(echo.settledOutcome!)}. You were right.`
        : `${call} — it settled ${sideLabel(echo.settledOutcome!)}. You were wrong.`;
    case "pending":
      return `${call} — placed, waiting on the market to settle.`;
    case "missed":
      return `${call} — not placed in time before the market closed.`;
    case "failed":
      return `${call} — could not be placed${echo.failureReason ? ` (${echo.failureReason})` : ""}.`;
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-rule bg-surface px-5 py-8">
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}
