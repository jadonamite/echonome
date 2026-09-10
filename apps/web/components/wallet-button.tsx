"use client";

import { useEffect } from "react";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { shortAddress } from "@/lib/format";
import { useToast } from "@/components/toast";
import { describeWalletError } from "@/lib/wallet-errors";

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
  const { switchChain, error: switchError } = useSwitchChain();
  const { show } = useToast();

  const injected = connectors[0];

  /**
   * Wallet failures go to the toast, not into the bar.
   *
   * Rendering the message inline put red text inside the nav and changed the bar's height
   * while it was there, so a rejected signature reflowed the page it was reporting on. A
   * rejection is also a moment rather than a state — it describes something the user just
   * did, and it should leave on its own rather than sitting there until the next render.
   */
  useEffect(() => {
    const err = error ?? switchError;
    if (!err) return;
    const { title, detail } = describeWalletError(err);
    show({ tone: "error", title, detail });
  }, [error, switchError, show]);

  if (!isConnected) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => injected && connect({ connector: injected })}
          disabled={!injected || isPending}
          // Fully rounded, matching the Connect wallet button on the landing page. These are the
          // same action in two places and were drawn as two different shapes: square-cornered
          // here, pill-shaped there.
          className="whitespace-nowrap rounded-full border border-edge px-4 py-1.5 text-sm text-ink hover:bg-surface-raised disabled:opacity-50"
        >
          {/* Shortened below md for the same reason as the landing page's button: the mark is
              centred against the bar and only reads as centred while the two sides balance. */}
          {isPending ? (
            <>Checking<span className="hidden md:inline"> your wallet</span>…</>
          ) : (
            <>Connect<span className="hidden md:inline"> wallet</span></>
          )}
        </button>
      </div>
    );
  }

  if (chainId !== somniaShannon.id) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: somniaShannon.id })}
        className="whitespace-nowrap rounded-full border border-warning px-4 py-1.5 text-sm text-warning hover:bg-surface-raised"
      >
        {/* The full network name is 24 characters and swamped the bar on a phone. The short
            form still says what the button does; the long one returns with the links at md. */}
        Switch<span className="hidden md:inline"> to Somnia Shannon</span>
        <span className="md:hidden"> network</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="whitespace-nowrap font-mono text-sm text-ink-2 tnum">
        {shortAddress(address!)}
      </span>
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
