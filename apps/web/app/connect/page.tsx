"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import {
  PLACE_ORDER_FOR_SELECTOR,
  CANCEL_ORDER_FOR_SELECTOR,
} from "@somnia-chain/markets-sdk";
import {
  createBrowserExchange,
  OPERATOR_ADDRESS,
  OPERATOR_REGISTRY_ADDRESS,
} from "@/lib/somnia";
import { shortAddress } from "@/lib/format";

/**
 * The only page where a user signs anything. Two on-chain actions, both from their own
 * wallet, neither of them a transfer to us:
 *
 *   1. Collateral — mint testnet USDC into their own wallet (the SDK's own faucet).
 *   2. The grant — `setOperatorApprovalGlobal` naming Echonome's operator address and
 *      exactly two selectors: place-order-for and cancel-order-for. Nothing else.
 *
 * The grant is the whole security story, so it is spelled out on screen rather than
 * buried in a tooltip: what the operator can do, what it provably cannot, and how to
 * take it back. See TECHNICAL_ARCHITECTURE.md "The on-chain flow the frontend drives
 * directly".
 */
export default function ConnectPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();

  const [funding, setFunding] = useState(false);
  const [fundResult, setFundResult] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [grantResult, setGrantResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onRightChain = chainId === somniaShannon.id;
  const canAct = isConnected && onRightChain && !!walletClient;

  async function fundCollateral() {
    if (!walletClient) return;
    setFunding(true);
    setError(null);
    try {
      const exchange = createBrowserExchange(walletClient);
      const result = await exchange.trader.faucet();
      setFundResult(result.hash);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setFunding(false);
    }
  }

  async function grant() {
    if (!walletClient || !address || !OPERATOR_ADDRESS) return;
    setGranting(true);
    setError(null);
    try {
      const exchange = createBrowserExchange(walletClient);

      // The real call. Exactly two selectors — an operator holding this grant can place
      // and cancel orders for this owner and can do nothing else with their funds.
      await exchange.trader.setOperatorApprovalGlobal({
        operator: OPERATOR_ADDRESS,
        selectors: [PLACE_ORDER_FOR_SELECTOR, CANCEL_ORDER_FOR_SELECTOR],
        approved: true,
        ...(OPERATOR_REGISTRY_ADDRESS ? { operatorRegistry: OPERATOR_REGISTRY_ADDRESS } : {}),
      });

      // Only after the chain confirms it do we record the local mirror of it.
      const response = await fetch("/api/proxy-grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          followerAddress: address,
          operatorAddress: OPERATOR_ADDRESS,
          scope: "place_and_cancel",
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "The grant confirmed on chain but could not be recorded");
      }
      setGrantResult("granted");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setGranting(false);
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Authorise Echonome</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-2">
          Copying a trader means Echonome places orders for you. That takes a permission
          you grant on chain, from your own wallet, scoped to two actions. It is not a
          deposit and not a transfer — your collateral never leaves your own account, and
          Echonome cannot move it.
        </p>
      </section>

      <ol className="space-y-px border border-rule bg-rule">
        <Step
          n={1}
          title="Connect your wallet"
          done={isConnected && onRightChain}
          state={
            !isConnected
              ? "Use the button in the header. Somnia Shannon testnet."
              : !onRightChain
                ? "Connected, but on the wrong network — switch to Somnia Shannon."
                : `Connected as ${shortAddress(address!)} on Somnia Shannon.`
          }
        />

        <Step
          n={2}
          title="Get testnet collateral"
          done={!!fundResult}
          state={
            fundResult
              ? "Test USDC minted to your wallet."
              : "Orders escrow tUSDC, not the native token — a wallet with gas but no collateral cannot trade."
          }
        >
          <button
            type="button"
            onClick={fundCollateral}
            disabled={!canAct || funding}
            className="border border-edge px-3 py-1.5 text-sm text-ink hover:bg-surface-raised disabled:opacity-40"
          >
            {funding ? "Minting…" : "Mint test USDC"}
          </button>
        </Step>

        <Step
          n={3}
          title="Grant place & cancel permission"
          done={grantResult === "granted"}
          state={
            grantResult === "granted"
              ? "Echonome can now place and cancel orders for you. Nothing else."
              : "One signature, scoped to two function selectors."
          }
        >
          <div className="space-y-4">
            <div className="border border-rule bg-plane px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-ink-3">
                Exactly what you are granting
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
                <li>
                  <span className="text-good">Can</span> place an order for you —{" "}
                  <code className="font-mono text-ink-3">{PLACE_ORDER_FOR_SELECTOR}</code>
                </li>
                <li>
                  <span className="text-good">Can</span> cancel an order it placed —{" "}
                  <code className="font-mono text-ink-3">{CANCEL_ORDER_FOR_SELECTOR}</code>
                </li>
                <li>
                  <span className="text-critical">Cannot</span> withdraw, transfer, or
                  approve anything — those selectors are not in the grant, so the call
                  reverts at the contract, not at our policy.
                </li>
                <li>
                  <span className="text-ink">Revocable</span> by you at any time, from your
                  own wallet, without asking us.
                </li>
              </ul>
            </div>

            {!OPERATOR_ADDRESS && (
              <Blocked title="No operator address configured">
                <code className="font-mono text-xs">NEXT_PUBLIC_OPERATOR_ADDRESS</code> is
                unset, so there is no address to grant permission to. It must match the
                wallet the worker signs echoes with.
              </Blocked>
            )}

            {OPERATOR_ADDRESS && !OPERATOR_REGISTRY_ADDRESS && (
              <Blocked title="Blocked: the OperatorPermissionsRegistry address is unknown">
                <p>
                  <code className="font-mono text-xs">setOperatorApprovalGlobal</code> writes
                  to DreamDEX&apos;s OperatorPermissionsRegistry, and that contract&apos;s
                  address is not in the SDK&apos;s built-in Shannon address book. Without it
                  the call cannot be sent.
                </p>
                <p className="mt-2">
                  This step is deliberately disabled rather than faked — a grant that
                  didn&apos;t happen on chain must never be recorded as if it did. Set{" "}
                  <code className="font-mono text-xs">
                    NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS
                  </code>{" "}
                  and this button works unchanged.
                </p>
              </Blocked>
            )}

            <button
              type="button"
              onClick={grant}
              disabled={!canAct || granting || !OPERATOR_ADDRESS || !OPERATOR_REGISTRY_ADDRESS}
              className="border border-edge px-3 py-1.5 text-sm text-ink hover:bg-surface-raised disabled:opacity-40"
            >
              {granting ? "Waiting for your signature…" : "Grant permission"}
            </button>
          </div>
        </Step>
      </ol>

      {error && (
        <p className="border-l-2 border-critical bg-surface px-4 py-3 text-sm text-ink-2">
          {error}
        </p>
      )}

      {grantResult === "granted" && (
        <div className="border border-rule bg-surface px-5 py-4">
          <p className="text-sm text-ink">You&apos;re set up.</p>
          <Link
            href="/"
            className="mt-3 inline-block border border-edge px-3 py-1.5 text-sm text-ink hover:bg-surface-raised"
          >
            Pick a trader to copy
          </Link>
        </div>
      )}
    </div>
  );
}

function Step({
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

function Blocked({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-warning bg-plane px-4 py-3">
      <p className="text-xs font-medium text-warning">🚧 {title}</p>
      <div className="mt-1.5 text-xs leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

/** Contract reverts carry a decoded `errorName`; anything else falls back to its message. */
function readableError(err: unknown): string {
  const name = (err as { errorName?: string })?.errorName;
  if (name) return `The transaction reverted: ${name}`;
  return (err as Error)?.message ?? "Something went wrong";
}
