"use client";

import Link from "next/link";
import { useConsent } from "./consent";

/**
 * The cookie column, following the reference: two small pills side by side, `Accept` and
 * `Find out more`.
 *
 * Refusing is the same size, the same weight and the same one click as accepting. A consent
 * control that makes "no" harder than "yes" is not consent, and this is a site whose whole
 * argument is that it does not quietly take things from people.
 *
 * Once a choice exists the pills are replaced by what was chosen and a way to change it, so
 * the footer always states the current position rather than asking again forever.
 */
export function FooterConsent() {
  const { choice, ready, decide } = useConsent();

  const pill =
    "rounded-full border border-edge px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-2 transition-colors hover:border-ink-3 hover:text-ink";

  // No hydration gate here, unlike the fixed banner. The server renders the unchosen pills and
  // so does the client's first pass, which match; the stored choice arrives after mount and
  // swaps them. That ordering matters for a reason beyond tidiness: rendering nothing until the
  // store had been read left this column empty with JavaScript disabled, which took the link to
  // the cookie policy with it. A returning visitor sees the pills for one frame before they
  // resolve, and the footer is far enough down the page that hydration has long since finished.
  if (ready && choice !== null) {
    return (
      <div className="mt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-2">
          {choice === "accepted" ? "All cookies accepted" : "Essential cookies only"}
        </p>
        <button
          type="button"
          onClick={() => decide(choice === "accepted" ? "essential-only" : "accepted")}
          className={`${pill} mt-3`}
        >
          {choice === "accepted" ? "Switch to essential only" : "Accept all"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2.5">
      <button type="button" onClick={() => decide("accepted")} className={pill}>
        Accept
      </button>
      <Link href="/cookies" className={pill}>
        Find out more
      </Link>
      <button type="button" onClick={() => decide("essential-only")} className={pill}>
        Essential only
      </button>
    </div>
  );
}
