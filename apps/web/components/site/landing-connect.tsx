"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect } from "wagmi";
import { useToast } from "@/components/toast";
import { describeWalletError } from "@/lib/wallet-errors";

/** Where a connected wallet lands. The Echo Rank is the app's front door. */
const APP_HOME = "/echo-rank";

/**
 * Connects the wallet from the landing page itself, rather than sending someone to /connect to
 * do it there.
 *
 * The button used to be a link. That put a page between wanting to connect and connecting, and
 * the page it led to opens on a step that cannot start until a wallet is attached anyway — so
 * the first thing it did was ask for the same click again.
 */
export function LandingConnectButton({ onDark = false }: { onDark?: boolean }) {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
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
        detail: "Install a wallet extension such as MetaMask or enable Brave Wallet, then reload.",
      });
      return;
    }

    if (availableConnectors.length === 1) {
      connect({ connector: availableConnectors[0] });
      return;
    }

    setMenuOpen((prev) => !prev);
  }

  useEffect(() => {
    if (!error) return;
    const { title, detail } = describeWalletError(error);
    const isCancelled =
      title === "Request cancelled" ||
      (error instanceof Error &&
        (error.message.toLowerCase().includes("rejected") ||
          error.message.toLowerCase().includes("denied")));
    show({ tone: isCancelled ? "info" : "error", title, detail });
  }, [error, show]);

  const label = isConnected ? "Opening…" : isPending ? "Check your wallet" : "Connect";

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        onClick={handleConnectClick}
        disabled={isPending || isConnected}
        className={`whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-85 disabled:opacity-70 sm:px-5 sm:py-2.5 ${
          onDark ? "bg-white text-tile-ink" : "bg-tile-ink text-white"
        }`}
      >
        {label}
        {!isConnected && !isPending && <span className="hidden lg:inline"> wallet</span>}
      </button>

      {menuOpen && availableConnectors.length > 1 && (
        <div className="absolute left-0 top-full mt-2 w-56 rounded-xl border border-rule bg-surface p-1.5 shadow-2xl z-50">
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

/**
 * Sends a connected wallet out of the landing page and into the app.
 *
 * `router.replace` rather than `push`, deliberately: replacing means the landing page does not
 * enter history, so Back from the app goes wherever the visitor came from rather than to a
 * page that would immediately bounce them forward again. A push here builds a trap where Back
 * appears to do nothing.
 *
 * One honest limit, worth stating rather than implying otherwise. This cannot make the landing
 * page unreachable. A wallet that is still connected on a fresh load will be redirected again
 * — including after a hard reload, because wagmi reconnects — so in practice the way back is
 * to disconnect, which is what a person actually means when they want to leave. Nothing here
 * blocks the Back button itself: browsers do not permit it, and a page that fought its own
 * Back button would be worse than the problem it solved.
 */
export function RedirectWhenConnected() {
  const { isConnected } = useAccount();
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    if (!isConnected || sent.current) return;
    // Guarded so a re-render mid-navigation cannot fire a second replace, which would put two
    // entries through the router and make Back behave unpredictably.
    sent.current = true;
    router.replace(APP_HOME);
  }, [isConnected, router]);

  return null;
}
