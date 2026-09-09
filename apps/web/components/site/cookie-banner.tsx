"use client";

import Link from "next/link";
import { useConsent } from "./consent";

/**
 * The first-visit bar.
 *
 * The reference has no overlay: consent lives in the footer as ordinary furniture. That is the
 * better pattern and it is what `FooterConsent` implements. This bar exists for the visitor who
 * reads the hero and leaves, who would otherwise never be offered the choice at all.
 *
 * It shares one state with the footer through `useConsent`, so answering in either place
 * dismisses this immediately without a reload. It is bottom-anchored, never full-screen, and
 * never blocks the page behind it.
 */
export function CookieBanner() {
  const { choice, ready, decide } = useConsent();

  if (!ready || choice !== null) return null;

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-edge bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-4 sm:px-10 md:flex-row md:items-center md:justify-between">
        <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">
          We keep one entry in your browser so the site works, and nothing else unless you say
          yes. No advertising or tracking cookies at all.{" "}
          <Link href="/cookies" className="text-accent underline underline-offset-4">
            Read the policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2.5">
          <button
            type="button"
            onClick={() => decide("essential-only")}
            className="rounded-full border border-edge px-5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-raised"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-plane transition-opacity hover:opacity-90"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
