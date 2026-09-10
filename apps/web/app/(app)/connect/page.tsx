"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import {
  COLLATERAL,
  COLLATERAL_DECIMALS,
  DEFAULT_GRANT_HOURS,
  ECHO_ACCOUNT_FACTORY,
  echoAccountAbi,
  echoAccountFactoryAbi,
  erc20Abi,
} from "@/lib/echoAccount";
import { OPERATOR_ADDRESS } from "@/lib/somnia";
import { shortAddress } from "@/lib/format";

/**
 * Setup, in three real steps: deploy an account you own, put money in it, decide what
 * Echonome is allowed to do with that money.
 *
 * This replaced a single "grant operator permission" signature that could not work — Event
 * Contract pools do not honour DreamDEX's operator registry, proven on chain (FEEDBACK.md).
 * The replacement is more work for the follower and a better deal: instead of an approval
 * whose limits live in someone else's contract, they get their own contract whose limits are
 * theirs, readable, and revocable without our cooperation.
 *
 * The limits screen is the most important screen in this product, so it is written like it
 * matters rather than tucked behind an "advanced" toggle.
 */

const FACTORY_EXPLORER = `https://shannon-explorer.somnia.network/address/${ECHO_ACCOUNT_FACTORY}`;

type Step = "connect" | "deploy" | "fund" | "configure" | "done";

export default function ConnectPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [accountAddress, setAccountAddress] = useState<Address | null>(null);
  const [isDeployed, setIsDeployed] = useState(false);
  const [walletBalance, setWalletBalance] = useState<bigint>(0n);
  const [accountBalance, setAccountBalance] = useState<bigint>(0n);
  const [executorActive, setExecutorActive] = useState(false);

  const [depositAmount, setDepositAmount] = useState("100");
  const [perOrderCap, setPerOrderCap] = useState("10");
  const [totalCap, setTotalCap] = useState("100");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onRightChain = chainId === somniaShannon.id;
  const ready = isConnected && onRightChain && !!walletClient && !!publicClient;

  const refresh = useCallback(async () => {
    if (!address || !publicClient) return;
    try {
      const predicted = (await publicClient.readContract({
        address: ECHO_ACCOUNT_FACTORY,
        abi: echoAccountFactoryAbi,
        functionName: "accountFor",
        args: [address],
      })) as Address;
      setAccountAddress(predicted);

      const code = await publicClient.getCode({ address: predicted });
      const exists = !!code && code !== "0x";
      setIsDeployed(exists);

      const [wallet, acct] = await Promise.all([
        publicClient.readContract({ address: COLLATERAL, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        exists
          ? publicClient.readContract({ address: COLLATERAL, abi: erc20Abi, functionName: "balanceOf", args: [predicted] })
          : Promise.resolve(0n),
      ]);
      setWalletBalance(wallet as bigint);
      setAccountBalance(acct as bigint);

      if (exists) {
        const status = (await publicClient.readContract({
          address: predicted,
          abi: echoAccountAbi,
          functionName: "executorStatus",
        })) as readonly [boolean, boolean, boolean, bigint, bigint];
        setExecutorActive(status[0]);
      }
    } catch (err) {
      setError(readable(err));
    }
  }, [address, publicClient]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(label: string, fn: () => Promise<`0x${string}`>) {
    setBusy(label);
    setError(null);
    try {
      const hash = await fn();
      await publicClient!.waitForTransactionReceipt({ hash });
      await refresh();
    } catch (err) {
      setError(readable(err));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Deploying the account. Gas is ESTIMATED, not asserted.
   *
   * This carried a hardcoded `gas: 30_000_000n`. The deploy really does need roughly 22.6M
   * (HANDOVER.md), so the number was not plucked from nowhere — but a fixed limit that high
   * is above some wallets' and some chains' ceiling, and a wallet that considers the limit
   * invalid can decline without ever showing a prompt. From the outside that is a button that
   * does nothing at all.
   *
   * Estimate, add a fifth for headroom, and fall back to the old constant only if estimation
   * itself fails — which at least fails loudly, through the same error path as everything else.
   */
  const deploy = () =>
    run("deploy", async () => {
      let gas: bigint;
      try {
        const estimate = await publicClient!.estimateContractGas({
          address: ECHO_ACCOUNT_FACTORY,
          abi: echoAccountFactoryAbi,
          functionName: "deploy",
          account: address!,
        });
        gas = (estimate * 12n) / 10n;
      } catch {
        gas = 30_000_000n;
      }

      return walletClient!.writeContract({
        address: ECHO_ACCOUNT_FACTORY,
        abi: echoAccountFactoryAbi,
        functionName: "deploy",
        gas,
      });
    });

  const deposit = () =>
    run("deposit", () =>
      walletClient!.writeContract({
        address: COLLATERAL,
        abi: erc20Abi,
        functionName: "transfer",
        args: [accountAddress!, parseUnits(depositAmount || "0", COLLATERAL_DECIMALS)],
      })
    );

  async function configure() {
    // Captured into locals after the guard: TypeScript cannot narrow a module-level
    // possibly-undefined value across the closures below, and the alternative is scattering
    // non-null assertions through code that decides what an operator is allowed to do.
    const account = accountAddress;
    const executor = OPERATOR_ADDRESS;
    if (!account || !executor) return;
    const expiry = BigInt(Math.floor(Date.now() / 1000) + DEFAULT_GRANT_HOURS * 3600);
    await run("caps", () =>
      walletClient!.writeContract({
        address: account,
        abi: echoAccountAbi,
        functionName: "setCaps",
        args: [
          parseUnits(perOrderCap || "0", COLLATERAL_DECIMALS),
          parseUnits(totalCap || "0", COLLATERAL_DECIMALS),
        ],
      })
    );
    await run("authorise", () =>
      walletClient!.writeContract({
        address: account,
        abi: echoAccountAbi,
        functionName: "setExecutor",
        args: [executor, expiry],
      })
    );
    await fetch("/api/proxy-grants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        followerAddress: address,
        operatorAddress: executor,
        accountAddress: account,
        scope: "echo_account",
      }),
    });
    await refresh();
  }

  const blockedReason = !isConnected
    ? "Connect your wallet first — the button is in the header."
    : !onRightChain
      ? "Your wallet is on the wrong network. Switch it to Somnia Shannon and this becomes available."
      : !walletClient || !publicClient
        ? "Waiting for your wallet to respond. If this persists, unlock it and reload."
        : null;

  const step: Step = !isConnected || !onRightChain
    ? "connect"
    : !isDeployed
      ? "deploy"
      : accountBalance === 0n
        ? "fund"
        : !executorActive
          ? "configure"
          : "done";

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Set up your account</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-2">
          Copying a trader means Echonome places orders using your money. So you get your own
          account contract to hold it: you own it, you fund it, you set what we may do with it,
          and you can cut us off at any moment without asking. We can place and cancel orders
          inside your limits. We cannot withdraw a cent — not by policy, but because no
          function exists that would let us.
        </p>
        <p className="text-xs text-ink-3">
          The contract is deployed from{" "}
          <a href={FACTORY_EXPLORER} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink-2">
            {shortAddress(ECHO_ACCOUNT_FACTORY)}
          </a>{" "}
          — read it before you trust it.
        </p>
      </section>

      <ol className="space-y-px border border-rule bg-rule">
        <StepRow
          n={1}
          title="Connect your wallet"
          done={isConnected && onRightChain}
          state={
            !isConnected
              ? "Use the button in the header. Somnia Shannon testnet."
              : !onRightChain
                ? "Connected, but on the wrong network — switch to Somnia Shannon."
                : `Connected as ${shortAddress(address!)}.`
          }
        />

        <StepRow
          n={2}
          title="Deploy your account"
          done={isDeployed}
          state={
            isDeployed
              ? `Deployed at ${shortAddress(accountAddress!)} — owned by you.`
              : accountAddress
                ? `It will be deployed at ${shortAddress(accountAddress)}. That address is fixed in advance, so it cannot change after you fund it.`
                : "Connect to see your account address."
          }
        >
          {!isDeployed && (
            <div className="space-y-2">
              <button type="button" onClick={deploy} disabled={!ready || busy !== null} className={buttonClass}>
                {busy === "deploy" ? "Deploying…" : "Deploy my account"}
              </button>
              {/* A disabled button that does not say why is indistinguishable from a broken
                  one. This is the step people actually get stuck on. */}
              <Blocked reason={blockedReason} />
              {/* And the error belongs next to the thing that caused it. The page-level notice
                  sits below three more steps, far off screen on a phone. */}
              {busy === null && error && (
                <p className="text-xs leading-relaxed text-critical">{error}</p>
              )}
            </div>
          )}
        </StepRow>

        <StepRow
          n={3}
          title="Fund it"
          done={accountBalance > 0n}
          state={
            accountBalance > 0n
              ? `Holding ${formatUnits(accountBalance, COLLATERAL_DECIMALS)} tUSDC. Withdrawable by you, only.`
              : `Move collateral in. Your wallet has ${formatUnits(walletBalance, COLLATERAL_DECIMALS)} tUSDC.`
          }
        >
          {isDeployed && (
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="deposit" className="sr-only">
                Amount to deposit, in tUSDC
              </label>
              <input
                id="deposit"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                inputMode="decimal"
                className="w-28 border border-edge bg-plane px-2 py-1.5 font-mono text-sm text-ink tnum"
              />
              <span className="text-xs text-ink-3">tUSDC</span>
              <button type="button" onClick={deposit} disabled={!ready || busy !== null} className={buttonClass}>
                {busy === "deposit" ? "Depositing…" : "Deposit"}
              </button>
            </div>
          )}
        </StepRow>

        <StepRow
          n={4}
          title="Set your limits, then authorise"
          done={executorActive}
          state={
            executorActive
              ? "Echonome can place and cancel orders inside these limits, and nothing else."
              : "This is the part that matters. Nothing can be traded until you set it."
          }
        >
          {isDeployed && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="per-order"
                  label="Most one trade may use"
                  value={perOrderCap}
                  onChange={setPerOrderCap}
                  hint="Bounds any single mistake."
                />
                <Field
                  id="total-cap"
                  label="Most we may spend in total"
                  value={totalCap}
                  onChange={setTotalCap}
                  hint="A budget, not an allowance — it does not refill on its own."
                />
              </div>

              <div className="border border-rule bg-plane px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-ink-3">What you are authorising</p>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-2">
                  <li>
                    <span className="text-good">Can</span> place and cancel orders on Event
                    Contract markets, within the two limits above.
                  </li>
                  <li>
                    <span className="text-critical">Cannot</span> withdraw, transfer, or approve
                    anything. Cannot raise these limits. Cannot extend its own permission.
                  </li>
                  <li>
                    <span className="text-ink">Expires</span> on its own after{" "}
                    {DEFAULT_GRANT_HOURS} hours. A permission you have forgotten about is one
                    you did not agree to.
                  </li>
                  <li>
                    <span className="text-ink">Stoppable</span> by you instantly, from{" "}
                    <Link href="/me" className="underline underline-offset-4">
                      My echoes
                    </Link>
                    , without our involvement.
                  </li>
                </ul>
              </div>

              {!OPERATOR_ADDRESS && (
                <p className="border-l-2 border-warning bg-plane px-4 py-3 text-xs text-ink-2">
                  🚧 <code className="font-mono">NEXT_PUBLIC_OPERATOR_ADDRESS</code> is unset, so
                  there is no executor to authorise.
                </p>
              )}

              <button
                type="button"
                onClick={configure}
                disabled={!ready || busy !== null || !OPERATOR_ADDRESS}
                className={buttonClass}
              >
                {busy ? "Confirm in your wallet…" : executorActive ? "Update limits" : "Set limits and authorise"}
              </button>
              <p className="text-xs text-ink-3">Two signatures: the limits, then the authorisation.</p>
            </div>
          )}
        </StepRow>
      </ol>

      {error && (
        <p className="border-l-2 border-critical bg-surface px-4 py-3 text-sm text-ink-2">{error}</p>
      )}

      {step === "done" && (
        <div className="border border-rule bg-surface px-5 py-4">
          <p className="text-sm text-ink">
            You&apos;re set up. Your account holds{" "}
            {formatUnits(accountBalance, COLLATERAL_DECIMALS)} tUSDC and Echonome may trade
            inside your limits.
          </p>
          <Link href="/" className="mt-3 inline-block border border-edge px-3 py-1.5 text-sm text-ink hover:bg-surface-raised">
            Pick a trader to copy
          </Link>
        </div>
      )}
    </div>
  );
}

const buttonClass =
  "rounded-full border border-edge px-4 py-1.5 text-sm text-ink hover:bg-surface-raised disabled:opacity-40";

function Blocked({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <p className="text-xs leading-relaxed text-ink-3">{reason}</p>;
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] uppercase tracking-wider text-ink-3">
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className="w-28 border border-edge bg-plane px-2 py-1.5 font-mono text-sm text-ink tnum"
        />
        <span className="text-xs text-ink-3">tUSDC</span>
      </div>
      <p className="mt-1 text-xs text-ink-3">{hint}</p>
    </div>
  );
}

function StepRow({
  n,
  title,
  state,
  done,
  children,
}: {
  n: number;
  title: string;
  state: string;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="bg-surface px-5 py-5">
      <div className="flex items-start gap-4">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border font-mono text-xs tnum ${
            done ? "border-good text-good" : "border-edge text-ink-3"
          }`}
        >
          {done ? "✓" : n}
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="text-sm font-medium text-ink">{title}</h2>
            <p className="mt-1 text-sm text-ink-2">{state}</p>
          </div>
          {children}
        </div>
      </div>
    </li>
  );
}

function readable(err: unknown): string {
  const e = err as { errorName?: string; shortMessage?: string; message?: string };
  if (e?.errorName) return `The transaction reverted: ${e.errorName}`;
  return e?.shortMessage ?? e?.message ?? "Something went wrong";
}
