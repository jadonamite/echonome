"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePublicClient, useWalletClient } from "wagmi";
import { formatUnits, type Address } from "viem";
import { COLLATERAL, COLLATERAL_DECIMALS, echoAccountAbi, erc20Abi } from "@/lib/echoAccount";
import { shortAddress } from "@/lib/format";

/**
 * The follower's control surface over their own account contract.
 *
 * Everything here reads from the chain rather than from our database, deliberately. Our
 * database records what we believe; the contract records what is actually true, and on the one
 * screen where someone checks whether they can still stop us, our belief is not good enough.
 * If the two ever disagree, this shows the chain.
 *
 * Pause and revoke are the two buttons, and they are not tucked away. Neither needs our
 * cooperation, our uptime, or our permission — a follower who wants out gets out by signing
 * one transaction against a contract they own.
 */

interface AccountState {
  balance: bigint;
  active: boolean;
  paused: boolean;
  expired: boolean;
  expiry: bigint;
  budgetLeft: bigint;
  perOrderCap: bigint;
  totalCap: bigint;
  committed: bigint;
  executor: Address;
}

export function AccountPanel({ accountAddress }: { accountAddress: Address }) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [state, setState] = useState<AccountState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicClient) return;
    try {
      // Written out rather than driven by a string helper: viem types `functionName` against
      // the ABI, and that check is worth keeping — it is what stops a renamed contract function
      // from becoming a runtime mystery on the screen where someone checks they can still stop us.
      const account = { address: accountAddress, abi: echoAccountAbi } as const;
      const [balance, status, perOrderCap, totalCap, committed, executor] = await Promise.all([
        publicClient.readContract({
          address: COLLATERAL,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [accountAddress],
        }),
        publicClient.readContract({ ...account, functionName: "executorStatus" }),
        publicClient.readContract({ ...account, functionName: "maxOrderCollateral" }),
        publicClient.readContract({ ...account, functionName: "totalCollateralCap" }),
        publicClient.readContract({ ...account, functionName: "collateralCommitted" }),
        publicClient.readContract({ ...account, functionName: "executor" }),
      ]);

      setState({
        balance,
        active: status[0],
        paused: status[1],
        expired: status[2],
        expiry: status[3],
        budgetLeft: status[4],
        perOrderCap,
        totalCap,
        committed,
        executor,
      });
    } catch (err) {
      setError((err as { shortMessage?: string })?.shortMessage ?? "Could not read your account");
    }
  }, [accountAddress, publicClient]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function act(label: string, send: () => Promise<`0x${string}`>) {
    if (!walletClient || !publicClient) return;
    setBusy(label);
    setError(null);
    try {
      const hash = await send();
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } catch (err) {
      const e = err as { errorName?: string; shortMessage?: string };
      setError(e?.errorName ?? e?.shortMessage ?? "Transaction failed");
    } finally {
      setBusy(null);
    }
  }

  const togglePause = () =>
    act("pause", () =>
      walletClient!.writeContract({
        address: accountAddress,
        abi: echoAccountAbi,
        functionName: "setPaused",
        args: [!state?.paused],
      })
    );

  const revoke = () =>
    act("revoke", () =>
      walletClient!.writeContract({
        address: accountAddress,
        abi: echoAccountAbi,
        functionName: "revokeExecutor",
      })
    );

  if (!state) {
    return (
      <section className="border border-rule bg-surface px-5 py-4">
        <p className="text-sm text-ink-3">Reading your account from the chain…</p>
      </section>
    );
  }

  const money = (v: bigint) => `${formatUnits(v, COLLATERAL_DECIMALS)} tUSDC`;

  return (
    <section className="space-y-4 border border-rule bg-surface px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-ink">Your account</h2>
          <p className="mt-1 font-mono text-xs text-ink-3 tnum">{accountAddress}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl text-ink tnum">{money(state.balance)}</p>
          <p className="text-xs text-ink-3">yours to withdraw, always</p>
        </div>
      </div>

      <div className="grid gap-px border border-rule bg-rule sm:grid-cols-3">
        <Cell label="Most one trade may use" value={money(state.perOrderCap)} />
        <Cell
          label="Budget remaining"
          value={money(state.budgetLeft)}
          hint={`${money(state.committed)} of ${money(state.totalCap)} used`}
        />
        <Cell
          label="Authorisation"
          value={statusWord(state)}
          hint={
            state.expired
              ? "lapsed — renew it on the setup page"
              : `expires ${expiresIn(state.expiry)}`
          }
        />
      </div>

      <p className="max-w-2xl text-xs leading-relaxed text-ink-2">
        Echonome can place and cancel orders inside those limits and can do nothing else. It
        cannot withdraw, cannot raise the limits, and cannot extend its own permission — there
        is no function in this contract that would let it. Either button below stops it
        immediately, and neither needs us to agree.
      </p>

      {error && <p className="text-xs text-critical">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={togglePause}
          disabled={busy !== null}
          className="border border-edge px-3 py-1.5 text-sm text-ink hover:bg-surface-raised disabled:opacity-40"
        >
          {busy === "pause" ? "…" : state.paused ? "Resume trading" : "Pause trading"}
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={busy !== null || state.executor === "0x0000000000000000000000000000000000000000"}
          className="border border-critical px-3 py-1.5 text-sm text-critical hover:bg-surface-raised disabled:opacity-40"
        >
          {busy === "revoke" ? "…" : "Revoke permanently"}
        </button>
        <Link
          href="/connect"
          className="border border-edge px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-raised"
        >
          Change limits
        </Link>
      </div>
    </section>
  );
}

function Cell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1 font-mono text-sm text-ink tnum">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function statusWord(s: AccountState): string {
  if (s.paused) return "Paused";
  if (s.expired) return "Lapsed";
  if (s.executor === "0x0000000000000000000000000000000000000000") return "Revoked";
  if (s.budgetLeft === 0n) return "Budget spent";
  return "Active";
}

/** Relative, because "expires in 3 hours" is a decision and a timestamp is homework. */
function expiresIn(expiry: bigint): string {
  const seconds = Number(expiry) - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return "now";
  const hours = Math.floor(seconds / 3600);
  if (hours >= 24) return `in ${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `in ${hours}h`;
  return `in ${Math.max(1, Math.floor(seconds / 60))}m`;
}
