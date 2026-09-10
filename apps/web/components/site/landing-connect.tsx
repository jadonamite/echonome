"use client";

import { useEffect, useRef } from "react";
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

  const injected = connectors[0];

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
    <button
      type="button"
      onClick={() => {
        if (!injected) {
          show({
            tone: "error",
            title: "No browser wallet found",
            detail: "Install a wallet extension such as MetaMask, then reload this page.",
          });
          return;
        }
        connect({ connector: injected });
      }}
      disabled={isPending || isConnected}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-85 disabled:opacity-70 sm:px-5 sm:py-2.5 ${
        onDark ? "bg-white text-tile-ink" : "bg-tile-ink text-white"
      }`}
    >
      {label}
      {/* The word returns with the links, at lg. Below that the hamburger holds the left
          of the bar and the mark is centred against it, so the button has to stay light. */}
      {!isConnected && !isPending && <span className="hidden lg:inline"> wallet</span>}
    </button>
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
