"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { formatUnits, parseUnits, formatEther, type Address } from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import {
  Coins,
  RocketLaunch,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  ArrowSquareOut,
  X,
  CircleNotch,
  Copy,
  Check,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  COLLATERAL,
  COLLATERAL_DECIMALS,
  ECHO_ACCOUNT_FACTORY,
  echoAccountFactoryAbi,
  erc20Abi,
} from "@/lib/echoAccount";
import { shortAddress } from "@/lib/format";
import { describeWalletError } from "@/lib/wallet-errors";

const SOMNIA_FAUCET_URL = "https://testnet.somnia.network/";
const EXPLORER_URL = "https://shannon-explorer.somnia.network";

type Step = 1 | 2 | 3;

export function OnboardingModal() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [accountAddress, setAccountAddress] = useState<Address | null>(null);
  const [isDeployed, setIsDeployed] = useState(false);
  const [sttBalance, setSttBalance] = useState<string>("0");
  const [usdcBalance, setUsdcBalance] = useState<string>("0");
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Action states
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [faucetSuccessMsg, setFaucetSuccessMsg] = useState<string | null>(null);
  const [deployTxHash, setDeployTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check deployment and balances
  const checkStatus = useCallback(async () => {
    if (!address || !publicClient) {
      setCheckingStatus(false);
      return;
    }

    try {
      // 1. Predict EchoAccount address
      const predicted = (await publicClient.readContract({
        address: ECHO_ACCOUNT_FACTORY,
        abi: echoAccountFactoryAbi,
        functionName: "accountFor",
        args: [address],
      })) as Address;
      setAccountAddress(predicted);

      // 2. Check if deployed
      const code = await publicClient.getCode({ address: predicted });
      const deployed = !!code && code !== "0x";
      setIsDeployed(deployed);

      // 3. Read STT & tUSDC balances
      const [sttWei, usdcRaw] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient
          .readContract({
            address: COLLATERAL,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          })
          .catch(() => 0n),
      ]);

      setSttBalance(Number(formatEther(sttWei)).toFixed(4));
      setUsdcBalance(formatUnits(usdcRaw as bigint, COLLATERAL_DECIMALS));

      // If already deployed and currently open on step 2, move to step 3
      if (deployed && step === 2) {
        setStep(3);
      }
    } catch (err) {
      console.warn("Could not check account deployment status:", err);
    } finally {
      setCheckingStatus(false);
    }
  }, [address, publicClient, step]);

  // Open modal automatically when connected and undeployed
  useEffect(() => {
    if (!isConnected || !address) {
      setIsOpen(false);
      return;
    }

    checkStatus().then(() => {
      // Check if user dismissed it in this session
      const dismissed = sessionStorage.getItem(`echonome_onboarding_dismissed_${address}`);
      if (!dismissed && !isDeployed) {
        setIsOpen(true);
      }
    });
  }, [isConnected, address, checkStatus, isDeployed]);

  // Listen for custom trigger to open modal manually
  useEffect(() => {
    function handleOpenModal() {
      setIsOpen(true);
      checkStatus();
    }
    window.addEventListener("open-onboarding-modal", handleOpenModal);
    return () => window.removeEventListener("open-onboarding-modal", handleOpenModal);
  }, [checkStatus]);

  function handleClose() {
    if (address) {
      sessionStorage.setItem(`echonome_onboarding_dismissed_${address}`, "true");
    }
    setIsOpen(false);
  }

  function handleCopyAddress() {
    if (!accountAddress) return;
    navigator.clipboard.writeText(accountAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Step 1: Claim STT from our faucet ──────────────────────────────────────────
  async function claimSttGas() {
    if (!address) return;
    setBusyAction("stt");
    setErrorMsg(null);
    setFaucetSuccessMsg(null);

    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Faucet request failed.");
      }

      setFaucetSuccessMsg(data.message ?? "Dispensed STT gas to your wallet!");
      await checkStatus();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  // ── Step 1: Claim Collateral tUSDC ─────────────────────────────────────────────
  async function claimCollateral() {
    if (!walletClient || !publicClient || !address) return;
    setBusyAction("usdc");
    setErrorMsg(null);
    setFaucetSuccessMsg(null);

    try {
      const hash = await walletClient.writeContract({
        address: COLLATERAL,
        abi: erc20Abi,
        functionName: "faucet",
        args: [parseUnits("10000", COLLATERAL_DECIMALS)],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setFaucetSuccessMsg("Claimed 10,000 tUSDC test collateral successfully!");
      await checkStatus();
    } catch (err) {
      const { title, detail } = describeWalletError(err);
      setErrorMsg(detail ? `${title}: ${detail}` : title);
    } finally {
      setBusyAction(null);
    }
  }

  // ── Step 2: Deploy EchoAccount Contract ────────────────────────────────────────
  async function deployAccount() {
    if (!walletClient || !publicClient || !address) return;
    setBusyAction("deploy");
    setErrorMsg(null);
    setDeployTxHash(null);

    try {
      let gas: bigint;
      try {
        const estimate = await publicClient.estimateContractGas({
          address: ECHO_ACCOUNT_FACTORY,
          abi: echoAccountFactoryAbi,
          functionName: "deploy",
          account: address,
        });
        gas = (estimate * 12n) / 10n;
      } catch {
        gas = 30_000_000n;
      }

      const hash = await walletClient.writeContract({
        address: ECHO_ACCOUNT_FACTORY,
        abi: echoAccountFactoryAbi,
        functionName: "deploy",
        gas,
      });

      setDeployTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      await checkStatus();
      setIsDeployed(true);
      setStep(3);
    } catch (err) {
      const { title, detail } = describeWalletError(err);
      setErrorMsg(detail ? `${title}: ${detail}` : title);
    } finally {
      setBusyAction(null);
    }
  }

  if (!isOpen || !isConnected) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-plane/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-rule bg-surface p-6 shadow-2xl space-y-6 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close modal"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-surface-raised transition"
        >
          <X size={18} weight="bold" />
        </button>

        {/* Stepper header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-rule pb-4">
            <div className="flex items-center gap-2">
              <StepPill num={1} active={step === 1} done={step > 1 || (Number(sttBalance) > 0 && Number(usdcBalance) > 0)} label="Faucet" />
              <div className="h-px w-6 bg-rule" />
              <StepPill num={2} active={step === 2} done={isDeployed} label="Deploy" />
              <div className="h-px w-6 bg-rule" />
              <StepPill num={3} active={step === 3} done={isDeployed && step === 3} label="Ready" />
            </div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-3">
              Step {step} of 3
            </span>
          </div>

          {/* Network reminder if not on Shannon */}
          {chainId !== somniaShannon.id && (
            <div className="flex items-center gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <WarningCircle size={18} weight="bold" className="flex-shrink-0" />
              <span>Please switch your wallet network to Somnia Shannon testnet to proceed.</span>
            </div>
          )}
        </div>

        {/* ── STEP 1: FAUCET ────────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Coins size={22} weight="bold" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-ink">
                  Claim Testnet Funds
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
                  Echonome trades on Somnia Shannon. You need STT for gas and tUSDC collateral to
                  fund your copy trades.
                </p>
              </div>
            </div>

            {/* Balances Card */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-rule bg-plane p-3.5 text-center">
              <div>
                <span className="block text-[10px] font-mono uppercase tracking-wider text-ink-3">
                  STT Gas Balance
                </span>
                <span className="mt-1 font-mono text-base font-medium text-ink tnum">
                  {sttBalance} <span className="text-xs text-ink-3">STT</span>
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-mono uppercase tracking-wider text-ink-3">
                  tUSDC Collateral
                </span>
                <span className="mt-1 font-mono text-base font-medium text-ink tnum">
                  {usdcBalance} <span className="text-xs text-ink-3">tUSDC</span>
                </span>
              </div>
            </div>

            {/* Faucet Actions */}
            <div className="space-y-2.5">
              {/* Option A: STT Gas */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-plane/50 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink">Somnia Gas (STT)</p>
                  <p className="text-[11px] text-ink-3">Dispenses 5.0 STT for testnet contract deployment and gas.</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={claimSttGas}
                    disabled={busyAction !== null}
                    className="rounded-full border border-edge px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-raised disabled:opacity-50 transition flex items-center gap-1.5"
                  >
                    {busyAction === "stt" ? (
                      <>
                        <CircleNotch size={14} weight="bold" className="animate-spin" />
                        Claiming…
                      </>
                    ) : (
                      "Claim 5 STT"
                    )}
                  </button>
                  <a
                    href={SOMNIA_FAUCET_URL}
                    target="_blank"
                    rel="noreferrer"
                    title="External Somnia Faucet"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-edge text-ink-3 hover:text-ink hover:bg-surface-raised transition"
                  >
                    <ArrowSquareOut size={14} weight="bold" />
                  </a>
                </div>
              </div>

              {/* Option B: tUSDC Collateral */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-plane/50 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink">Collateral (tUSDC)</p>
                  <p className="text-[11px] text-ink-3">Mints 10,000 tUSDC directly to your wallet.</p>
                </div>
                <button
                  type="button"
                  onClick={claimCollateral}
                  disabled={busyAction !== null || Number(sttBalance) === 0}
                  className="flex-shrink-0 rounded-full border border-edge px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-raised disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  {busyAction === "usdc" ? (
                    <>
                      <CircleNotch size={14} weight="bold" className="animate-spin" />
                      Minting…
                    </>
                  ) : (
                    "Claim 10,000 tUSDC"
                  )}
                </button>
              </div>
            </div>

            {/* Notifications */}
            {faucetSuccessMsg && (
              <p className="text-xs text-good flex items-center gap-1.5">
                <CheckCircle size={16} weight="fill" className="flex-shrink-0" />
                {faucetSuccessMsg}
              </p>
            )}
            {errorMsg && (
              <p className="text-xs text-critical leading-relaxed">{errorMsg}</p>
            )}

            {/* Next button */}
            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setFaucetSuccessMsg(null);
                  setStep(2);
                }}
                className="w-full sm:w-auto rounded-full bg-ink px-5 py-2 text-xs font-medium text-plane hover:opacity-90 transition flex items-center justify-center gap-1.5"
              >
                <span>Next: Deploy Account</span>
                <ArrowRight size={14} weight="bold" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: DEPLOY ACCOUNT ────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <RocketLaunch size={22} weight="bold" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-ink">
                  Deploy Your EchoAccount
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
                  Echonome deploys a dedicated smart contract for you. You retain 100% custody, and
                  can cut off trading at any time.
                </p>
              </div>
            </div>

            {/* Contract Info Card */}
            <div className="space-y-3 rounded-xl border border-rule bg-plane p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-3">Predicted Address:</span>
                <div className="flex items-center gap-1.5 font-mono text-ink">
                  <span>{accountAddress ? shortAddress(accountAddress) : "Predicting…"}</span>
                  {accountAddress && (
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="text-ink-3 hover:text-ink transition"
                      title="Copy Address"
                    >
                      {copied ? <Check size={14} className="text-good" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-rule/50 pt-2.5">
                <span className="text-ink-3">Status:</span>
                <span className="inline-flex items-center gap-1 font-medium text-warning">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  Not deployed yet
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-rule/50 pt-2.5">
                <span className="text-ink-3">Gas Required:</span>
                <span className="font-mono text-ink">~0.05 STT</span>
              </div>
            </div>

            {/* Error or Tx Tracker */}
            {errorMsg && (
              <p className="text-xs text-critical leading-relaxed">{errorMsg}</p>
            )}

            {deployTxHash && (
              <div className="rounded-lg border border-rule bg-plane/50 p-3 text-xs text-ink-2 flex items-center justify-between">
                <span>Transaction submitted:</span>
                <a
                  href={`${EXPLORER_URL}/tx/${deployTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-ink underline flex items-center gap-1"
                >
                  {shortAddress(deployTxHash as Address)}
                  <ArrowSquareOut size={12} />
                </a>
              </div>
            )}

            {/* Buttons */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setStep(1);
                }}
                disabled={busyAction !== null}
                className="rounded-full border border-edge px-4 py-2 text-xs font-medium text-ink-2 hover:bg-surface-raised transition flex items-center gap-1"
              >
                <ArrowLeft size={14} weight="bold" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={deployAccount}
                disabled={busyAction !== null || !accountAddress}
                className="rounded-full bg-ink px-5 py-2 text-xs font-medium text-plane hover:opacity-90 disabled:opacity-50 transition flex items-center gap-2"
              >
                {busyAction === "deploy" ? (
                  <>
                    <CircleNotch size={14} weight="bold" className="animate-spin" />
                    <span>Deploying on Shannon…</span>
                  </>
                ) : (
                  <>
                    <RocketLaunch size={14} weight="bold" />
                    <span>Deploy Account</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: READY ─────────────────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-good/10 text-good">
              <CheckCircle size={36} weight="fill" />
            </div>

            <div>
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                Account Deployed & Ready!
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-2 max-w-sm mx-auto">
                Your sovereign EchoAccount smart contract is live on Somnia Shannon testnet. You are
                ready to copy calibrated traders.
              </p>
            </div>

            {/* Contract Details */}
            {accountAddress && (
              <div className="rounded-xl border border-rule bg-plane p-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-ink-3">Contract Address:</span>
                  <a
                    href={`${EXPLORER_URL}/address/${accountAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-ink underline flex items-center gap-1 hover:text-accent"
                  >
                    {shortAddress(accountAddress)}
                    <ArrowSquareOut size={12} />
                  </a>
                </div>
                <div className="flex items-center justify-between border-t border-rule/50 pt-2">
                  <span className="text-ink-3">Custody:</span>
                  <span className="text-good font-medium">100% Non-custodial</span>
                </div>
              </div>
            )}

            {/* CTAs */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  router.push("/feed");
                }}
                className="w-full rounded-full bg-ink py-2.5 text-xs font-medium text-plane hover:opacity-90 transition flex items-center justify-center gap-1.5"
              >
                <span>Explore Feed & Mirror Traders</span>
                <ArrowRight size={14} weight="bold" />
              </button>

              <div className="flex items-center justify-center gap-4 text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    router.push("/echo-rank");
                  }}
                  className="text-ink-3 hover:text-ink underline transition"
                >
                  View Calibration Rankings
                </button>
                <span className="text-rule">•</span>
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    router.push("/connect");
                  }}
                  className="text-ink-3 hover:text-ink underline transition"
                >
                  Configure Risk Limits
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepPill({
  num,
  label,
  active,
  done,
}: {
  num: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-mono transition ${
          done
            ? "bg-good text-plane font-bold"
            : active
              ? "bg-ink text-plane font-bold"
              : "border border-rule text-ink-3"
        }`}
      >
        {done ? "✓" : num}
      </div>
      <span
        className={`text-xs ${
          active ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink-3"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
