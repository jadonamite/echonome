"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { shortAddress } from "@/lib/format";

/**
 * Connect / disconnect, plus the one piece of chain state that actually matters here:
 * being on the wrong network is a real, recoverable state with its own affordance, not
 * an error to discover later when a transaction reverts.
 */
export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const injected = connectors[0];

  if (!isConnected) {
    return (
      <div className="flex items-center gap-3">
        {error ? <span className="text-xs text-critical">{error.message}</span> : null}
        <button
          type="button"
          onClick={() => injected && connect({ connector: injected })}
          disabled={!injected || isPending}
          className="border border-edge px-3 py-1.5 text-sm text-ink hover:bg-surface-raised disabled:opacity-50"
        >
          {isPending ? "Check your wallet…" : "Connect wallet"}
        </button>
      </div>
    );
  }

  if (chainId !== somniaShannon.id) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: somniaShannon.id })}
        className="border border-warning px-3 py-1.5 text-sm text-warning hover:bg-surface-raised"
      >
        Switch to Somnia Shannon
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-sm text-ink-2 tnum">{shortAddress(address!)}</span>
      <button
        type="button"
        onClick={() => disconnect()}
        className="text-xs text-ink-3 underline underline-offset-4 hover:text-ink-2"
      >
        Disconnect
      </button>
    </div>
  );
}
