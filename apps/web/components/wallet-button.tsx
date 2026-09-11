"use client";

import { useEffect, useRef, useState } from "react";
import { SignOut } from "@phosphor-icons/react";
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  /**
   * Sort and deduplicate connectors:
   * EIP-6963 announced wallets (Brave Wallet, MetaMask, Phantom) appear first with their branding,
   * generic Injected connector appears last.
   */
  const availableConnectors = connectors
    .filter(
      (c, i, arr) =>
        arr.findIndex(
          (x) => x.id === c.id || (x.name === c.name && x.name !== "Injected")
        ) === i
    )
    .sort((a, b) => {
      if (a.id === "injected") return 1;
      if (b.id === "injected") return -1;
      return 0;
    });

  function handleConnectClick() {
    if (availableConnectors.length === 0) {
      show({
        tone: "error",
        title: "No browser wallet found",
        detail:
          "Install a wallet extension such as MetaMask or enable Brave Wallet, then reload.",
      });
      return;
    }

    if (availableConnectors.length === 1) {
      connect({ connector: availableConnectors[0] });
      return;
    }

    // Multiple wallets detected (e.g. Brave Wallet + MetaMask)
    setMenuOpen((prev) => !prev);
  }

  /**
   * Wallet failures go to the toast, not into the bar.
   */
  useEffect(() => {
    const err = error ?? switchError;
    if (!err) return;
    const { title, detail } = describeWalletError(err);
    const isCancelled =
      title === "Request cancelled" ||
      (err instanceof Error &&
        (err.message.toLowerCase().includes("rejected") ||
          err.message.toLowerCase().includes("denied")));
    show({ tone: isCancelled ? "info" : "error", title, detail });
  }, [error, switchError, show]);

  if (!isConnected) {
    return (
      <div className="relative flex items-center gap-3" ref={menuRef}>
        <button
          type="button"
          onClick={handleConnectClick}
          disabled={isPending}
          className="whitespace-nowrap rounded-full border border-edge px-4 py-1.5 text-sm text-ink hover:bg-surface-raised disabled:opacity-50 flex items-center gap-1.5 transition"
        >
          {isPending ? (
            <>Checking<span className="hidden lg:inline"> your wallet</span>…</>
          ) : (
            <>Connect<span className="hidden lg:inline"> wallet</span></>
          )}
        </button>

        {/* Multi-wallet picker dropdown when multiple providers exist */}
        {menuOpen && availableConnectors.length > 1 && (
          <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-rule bg-surface p-1.5 shadow-2xl z-50">
            <div className="px-2.5 py-1.5 text-[10px] font-mono text-ink-3 uppercase tracking-wider">
              Select Wallet
            </div>
            <div className="space-y-1">
              {availableConnectors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    connect({ connector: c });
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-ink rounded-lg hover:bg-surface-raised transition text-left"
                >
                  {c.icon ? (
                    <img
                      src={c.icon}
                      alt=""
                      className="w-5 h-5 rounded-sm object-contain flex-shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-surface-raised border border-edge flex items-center justify-center text-[10px] font-mono text-ink-3 flex-shrink-0">
                      W
                    </div>
                  )}
                  <span className="font-medium truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (chainId !== somniaShannon.id) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: somniaShannon.id })}
        className="whitespace-nowrap rounded-full border border-warning px-4 py-1.5 text-sm text-warning hover:bg-surface-raised transition"
      >
        Switch<span className="hidden lg:inline"> to Somnia Shannon</span>
        <span className="lg:hidden"> network</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap font-mono text-sm text-ink-2 tnum">
        {shortAddress(address!)}
      </span>
      <button
        type="button"
        onClick={() => disconnect()}
        title="Disconnect wallet"
        aria-label="Disconnect wallet"
        className="flex items-center justify-center h-7 w-7 rounded-full text-ink-3 hover:text-critical hover:bg-critical/10 border border-transparent hover:border-critical/20 transition"
      >
        <SignOut size={16} weight="bold" />
      </button>
    </div>
  );
}
