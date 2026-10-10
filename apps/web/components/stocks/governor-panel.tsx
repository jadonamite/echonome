"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract, useChainId } from "wagmi";
import { parseAbi, parseUnits, formatUnits, type Address } from "viem";
import { bsc } from "viem/chains";
import type { GovernorDecision, GovernorParams } from "@echonome/stocks";
import { usd } from "./ui";

const USDT: Address = "0x55d398326f99059fF775485246999027B3197955";
const V3_ROUTER: Address = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const V3_QUOTER: Address = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997";
const SLIPPAGE_BPS = 50n;

const erc20 = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);
const quoter = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)",
]);
const router = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);

const LIMITER_TEXT: Record<string, string> = {
  request: "Your request fits. Nothing was cut.",
  "floor:per-trade": "Cut to the per-trade limit.",
  "floor:daily": "Cut to what is left of today's limit.",
  pace: "Cut to a share of what the pools traded recently. The market is quiet.",
  impact: "Cut where the price starts climbing. The pools are thin at this size.",
  "no-liquidity": "No pool could quote this token. Nothing is allowed.",
};

const PRESETS = [100, 500, 1_000, 5_000, 20_000];

export function GovernorPanel({
  ticker,
  token,
  initial,
  params,
}: {
  ticker: string;
  token: Address;
  initial: { requestUsd: number; decision: GovernorDecision };
  params: GovernorParams;
}) {
  const [requestUsd, setRequestUsd] = useState(initial.requestUsd);
  const [decision, setDecision] = useState(initial.decision);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(size: number) {
    setRequestUsd(size);
    if (!(size > 0)) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/governor?ticker=${ticker}&usd=${size}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setDecision({ ...decision, ...j, allowedUsd: j.allowedUsd, limiter: j.limiter, reasons: j.reasons, pool: j.pool, impactAtAllowedBps: j.impactAtAllowedBps });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="gov" className="rounded-2xl border border-rule bg-surface p-6">
      <h2 id="gov" className="text-xl font-semibold">Governor</h2>
      <p className="mt-1 text-ink-2">How much of a buy would it let through right now?</p>

      <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Request size">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => run(p)}
            aria-pressed={requestUsd === p}
            className={`min-h-[44px] rounded-full border px-4 font-mono text-sm transition-colors ${requestUsd === p ? "border-accent text-accent" : "border-rule text-ink-2 hover:border-edge hover:text-ink"}`}
          >
            {usd(p)}
          </button>
        ))}
        <label className="ml-1 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-rule px-4 text-sm text-ink-2">
          <span className="sr-only">Custom amount in US dollars</span>$
          <input
            type="number"
            min={1}
            inputMode="decimal"
            defaultValue={initial.requestUsd}
            onKeyDown={(e) => e.key === "Enter" && run(Number((e.target as HTMLInputElement).value))}
            onBlur={(e) => Number(e.target.value) !== requestUsd && run(Number(e.target.value))}
            className="w-24 bg-transparent font-mono text-ink outline-none"
          />
        </label>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1.4fr]" aria-live="polite" aria-busy={loading}>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">Allowed now</p>
          <p className={`mt-1 font-mono text-4xl ${loading ? "text-ink-3" : "text-accent"}`}>{usd(decision.allowedUsd, 2)}</p>
          <p className="mt-1 text-sm text-ink-3">of {usd(requestUsd)} requested{decision.pool ? ` · via ${decision.pool}` : ""}</p>
          <p className="mt-4 text-ink">{LIMITER_TEXT[decision.limiter] ?? decision.limiter}</p>
          {error ? <p className="mt-2 text-sm text-critical">Could not refresh: {error}</p> : null}
        </div>
        <ul className="space-y-2 text-sm text-ink-2">
          {decision.reasons.map((r) => (
            <li key={r} className="rounded-lg border border-rule px-4 py-2.5">{r}</li>
          ))}
        </ul>
      </div>

      <TradeBox token={token} ticker={ticker} allowedUsd={decision.allowedUsd} pool={decision.pool} />
      <p className="mt-4 text-xs text-ink-3">
        Limits: {usd(params.floor.maxPerTradeUsd)} per trade, {usd(params.floor.maxDailyUsd)} per day, {params.maxImpactBps} bps over the best price,{" "}
        {Math.round(params.participation * 100)}% of recent hourly volume.
      </p>
    </section>
  );
}

function TradeBox({ token, ticker, allowedUsd, pool }: { token: Address; ticker: string; allowedUsd: number; pool: string | null }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient({ chainId: bsc.id });
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fee = pool?.startsWith("PancakeSwap v3") ? Math.round(Number(pool.split(" ").pop()!.replace("%", "")) * 10_000) : null;

  async function buy() {
    if (!address || !client || !fee) return;
    setErr(null);
    setHash(null);
    try {
      const amountIn = parseUnits(allowedUsd.toFixed(2), 18);
      setStep("Checking your USDT balance");
      const bal = await client.readContract({ address: USDT, abi: erc20, functionName: "balanceOf", args: [address] });
      if (bal < amountIn) throw new Error(`You hold ${Number(formatUnits(bal, 18)).toFixed(2)} USDT. This trade needs ${allowedUsd.toFixed(2)}.`);
      const allowance = await client.readContract({ address: USDT, abi: erc20, functionName: "allowance", args: [address, V3_ROUTER] });
      if (allowance < amountIn) {
        setStep("Approve exactly this amount of USDT in your wallet");
        const h = await writeContractAsync({ address: USDT, abi: erc20, functionName: "approve", args: [V3_ROUTER, amountIn], chainId: bsc.id });
        await client.waitForTransactionReceipt({ hash: h });
      }
      setStep("Quoting the pool");
      const { result } = await client.simulateContract({ address: V3_QUOTER, abi: quoter, functionName: "quoteExactInputSingle", args: [{ tokenIn: USDT, tokenOut: token, amountIn, fee, sqrtPriceLimitX96: 0n }] });
      const minOut = (result[0] * (10_000n - SLIPPAGE_BPS)) / 10_000n;
      const args = [{ tokenIn: USDT, tokenOut: token, fee, recipient: address, deadline: BigInt(Math.floor(Date.now() / 1000) + 600), amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] as const;
      setStep("Simulating the swap before you sign");
      await client.simulateContract({ address: V3_ROUTER, abi: router, functionName: "exactInputSingle", args, account: address });
      setStep("Confirm the swap in your wallet");
      const h = await writeContractAsync({ address: V3_ROUTER, abi: router, functionName: "exactInputSingle", args, chainId: bsc.id });
      setHash(h);
      setStep("Waiting for BNB Chain");
      await client.waitForTransactionReceipt({ hash: h });
      setStep("Done");
    } catch (e) {
      setStep(null);
      setErr(e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e));
    }
  }

  return (
    <div className="mt-6 border-t border-rule pt-6">
      {!isConnected ? (
        <p className="text-ink-2">Connect a wallet on BNB Chain, such as Binance Web3 Wallet, to buy {ticker} at the allowed size. Trades go from your wallet to PancakeSwap.</p>
      ) : chainId !== bsc.id ? (
        <p className="text-ink-2">Switch your wallet to BNB Chain to trade.</p>
      ) : !fee || allowedUsd < 1 ? (
        <p className="text-ink-2">Nothing to buy at this size right now.</p>
      ) : (
        <button type="button" onClick={buy} disabled={!!step && step !== "Done"} className="min-h-[44px] rounded-full bg-accent px-6 font-medium text-plane transition-opacity disabled:opacity-50">
          Buy {usd(allowedUsd, 2)} of {ticker}
        </button>
      )}
      {step ? <p className="mt-3 text-sm text-ink-2" aria-live="polite">{step}</p> : null}
      {hash ? (
        <p className="mt-1 text-sm">
          <a className="break-all text-accent underline underline-offset-4" href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a>
        </p>
      ) : null}
      {err ? <p className="mt-2 text-sm text-critical">{err}</p> : null}
    </div>
  );
}
