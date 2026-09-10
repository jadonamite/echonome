"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import type { Address } from "viem";
import { AccountPanel } from "@/components/account-panel";
import { echoAccountFactoryAbi, ECHO_ACCOUNT_FACTORY } from "@/lib/echoAccount";
import { CONSENT_KEY } from "@/components/site/consent";
import { useToast } from "@/components/toast";

/**
 * Settings.
 *
 * Two halves, and they are deliberately labelled as different kinds of thing.
 *
 * The account controls are the real ones: caps, expiry, pause and revoke all live in the
 * follower's own EchoAccount and are read from the chain, not from our database. That is the
 * half that matters — it is where someone checks they can still stop us — so it comes first and
 * reuses the same panel `/me` shows rather than a second implementation that could disagree
 * with it.
 *
 * The copy defaults are only preferences, and the page says so. `copy_link` stores a size
 * fraction per link and nothing else: there is no column for a default, no column for a base
 * stake, and no per-follower exposure cap. Inventing a server-side setting with nowhere to
 * persist would be a control that silently forgets, so these live in this browser and only
 * pre-fill the copy dialog. When the schema grows somewhere to keep them, they move.
 */
export default function SettingsPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const onRightChain = chainId === somniaShannon.id;

  const [accountAddress, setAccountAddress] = useState<Address | null>(null);

  useEffect(() => {
    if (!address || !publicClient || !onRightChain) {
      setAccountAddress(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const predicted = (await publicClient.readContract({
          address: ECHO_ACCOUNT_FACTORY,
          abi: echoAccountFactoryAbi,
          functionName: "accountFor",
          args: [address],
        })) as Address;

        // `accountFor` is CREATE2 arithmetic: it returns an address whether or not anything
        // has been deployed to it. Without this check the panel would read caps and expiry
        // from an address holding no code and render zeros as though they were settings.
        const code = await publicClient.getCode({ address: predicted });
        const deployed = !!code && code !== "0x";
        if (!cancelled) setAccountAddress(deployed ? predicted : null);
      } catch {
        // A failed read here means no panel, not a broken page. The account controls are
        // chain state; if the chain cannot be reached there is nothing honest to show.
        if (!cancelled) setAccountAddress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, publicClient, onRightChain]);

  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-2">
          Your account&apos;s limits live on chain and only you can change them. The copy
          defaults below are conveniences kept in this browser.
        </p>
      </header>

      <section className="space-y-4">
        <SectionHeading>Your account</SectionHeading>
        {!isConnected ? (
          <Notice>Connect a wallet to see the limits on your account.</Notice>
        ) : !onRightChain ? (
          <Notice>
            Your wallet is on the wrong network. Switch it to Somnia Shannon to read your
            account.
          </Notice>
        ) : accountAddress ? (
          <AccountPanel accountAddress={accountAddress} />
        ) : (
          <Notice>
            No account found for this wallet yet. Deploy one from the Connect page and its
            limits will appear here.
          </Notice>
        )}
      </section>

      <CopyDefaults />

      <PrivacySection />
    </div>
  );
}

const DEFAULTS_KEY = "echonome.copy-defaults.v1";

interface CopyDefaultsShape {
  sizeFraction: number;
}

/**
 * Pre-fills for the copy dialog, kept in this browser.
 *
 * Written through a try/catch on both sides: a private window, cleared site data or a browser
 * set to block storage all throw on access rather than returning null, and a settings page that
 * crashes because it could not remember a number is worse than one that forgets it.
 */
function CopyDefaults() {
  const { show } = useToast();
  const [fraction, setFraction] = useState("0.25");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DEFAULTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CopyDefaultsShape;
        if (typeof parsed.sizeFraction === "number") setFraction(String(parsed.sizeFraction));
      }
    } catch {
      // Storage unavailable. The field keeps its default and nothing is lost.
    }
    setLoaded(true);
  }, []);

  const save = useCallback(() => {
    const value = Number(fraction);
    if (!Number.isFinite(value) || value <= 0 || value > 1) {
      show({
        tone: "error",
        title: "That size won't work",
        detail: "Enter a fraction above 0 and no greater than 1 — 0.25 copies at a quarter size.",
      });
      return;
    }
    try {
      window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ sizeFraction: value }));
      show({ tone: "success", title: "Default size saved", detail: "New copies will start at this size." });
    } catch {
      show({
        tone: "error",
        title: "This browser won't store settings",
        detail: "Private browsing or blocked site data. The default will reset when you leave.",
      });
    }
  }, [fraction, show]);

  return (
    <section className="space-y-4">
      <SectionHeading>Copy defaults</SectionHeading>
      <div className="space-y-5 border border-rule bg-surface p-5">
        <p className="max-w-xl text-[13px] leading-relaxed text-ink-3">
          Kept in this browser, not on your account. It pre-fills the size box when you copy
          someone; it does not change any copy already running.
        </p>

        <label className="block max-w-xs space-y-2">
          <span className="text-sm text-ink">Default size fraction</span>
          <input
            type="number"
            step="0.05"
            min="0.05"
            max="1"
            value={fraction}
            onChange={(e) => setFraction(e.target.value)}
            disabled={!loaded}
            className="w-full rounded-lg border border-edge bg-plane px-3 py-2 font-mono text-sm text-ink tnum"
          />
          <span className="block text-[12px] text-ink-3">
            {describeFraction(fraction)}
          </span>
        </label>

        <button
          type="button"
          onClick={save}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-plane transition-opacity hover:opacity-85"
        >
          Save default
        </button>
      </div>
    </section>
  );
}

/** Says what the number means in words, because "0.25" alone is ambiguous. */
function describeFraction(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    return "Enter a fraction between 0 and 1.";
  }
  return `Copies at ${(value * 100).toFixed(0)}% of the trader's own size.`;
}

function PrivacySection() {
  const { show } = useToast();

  const reset = () => {
    try {
      window.localStorage.removeItem(CONSENT_KEY);
      show({
        tone: "success",
        title: "Cookie choice cleared",
        detail: "The banner will ask again next time you load the site.",
      });
    } catch {
      show({ tone: "error", title: "This browser won't let us clear that" });
    }
  };

  return (
    <section className="space-y-4">
      <SectionHeading>Privacy</SectionHeading>
      <div className="space-y-4 border border-rule bg-surface p-5">
        <p className="max-w-xl text-[13px] leading-relaxed text-ink-3">
          Echonome keeps one entry in your browser to remember this choice, and nothing else
          unless you say yes. There is no advertising or tracking.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-edge px-5 py-2.5 text-sm text-ink transition-colors hover:bg-surface-raised"
        >
          Ask me about cookies again
        </button>
      </div>
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-medium uppercase tracking-wider text-ink-3">{children}</h2>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-rule bg-surface px-5 py-6 text-sm text-ink-2">{children}</p>
  );
}
