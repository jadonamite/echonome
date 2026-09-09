"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "echonome.consent.v1";

export type ConsentChoice = "accepted" | "essential-only";

/**
 * Bottom-anchored, never a full-screen interstitial, and refusing is exactly as cheap as
 * accepting: two buttons, same size, same prominence, no pre-ticked anything. A consent
 * dialogue that makes "no" harder than "yes" is not consent, and this is a site whose entire
 * argument is that it does not quietly take things from people.
 *
 * The choice lives in localStorage rather than a cookie, because storing it in a cookie
 * would mean setting a cookie in order to record that someone refused cookies.
 */
export function CookieBanner() {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Wrapped: private browsing and blocked site data both make this throw rather than
    // return null, and a banner that crashes the page is worse than no banner.
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "accepted" || stored === "essential-only") setChoice(stored);
    } catch {
      // Treat an unreadable store as "not yet asked". The banner shows again next visit,
      // which is the correct failure direction.
    }
    setReady(true);
  }, []);

  function decide(next: ConsentChoice) {
    setChoice(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this session even if it cannot be persisted.
    }
  }

  if (!ready || choice !== null) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-edge bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <p className="max-w-prose text-sm leading-relaxed text-ink-2">
          We keep one cookie so the site works, and nothing else unless you say yes. There are
          no advertising or tracking cookies here at all.{" "}
          <Link href="/cookies" className="text-accent underline underline-offset-4">
            Read the cookie policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => decide("essential-only")}
            className="rounded-full border border-edge px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface-raised"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-plane transition-opacity hover:opacity-90"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
