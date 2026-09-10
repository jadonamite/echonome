"use client";

import { useState } from "react";

/**
 * The email pill from the reference: a rounded input with a small arrow button sitting inside
 * its right edge.
 *
 * There is no list to subscribe to yet, and no endpoint behind this. It says so on submit
 * rather than showing a success message for something that did not happen, because a fake
 * confirmation on the page that argues for honest reporting would be a strange place to start
 * lying. When the endpoint exists, only `onSubmit` changes.
 */
export function MailingList() {
  const [state, setState] = useState<"idle" | "noted">("idle");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setState("noted");
      }}
      className="mt-4"
    >
      <div className="flex items-center rounded-full border border-edge bg-plane py-1 pl-4 pr-1">
        <label htmlFor="mailing-list-email" className="sr-only">
          Email address
        </label>
        <input
          id="mailing-list-email"
          type="email"
          required
          placeholder="Email address"
          className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-[11px] text-ink outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          aria-label="Join the mailing list"
          // The circle stays 28px because it sits inside the input pill and a 44px one would
          // burst it. The pseudo-element extends only the TOUCH target to 44px, invisibly and
          // without taking layout space, so the design is unchanged and the control is still
          // reachable with a thumb.
          className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-plane transition-opacity before:absolute before:-inset-2 before:content-[''] hover:opacity-85"
        >
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
            <path
              d="M1 4.5h8M6 1.5l3 3-3 3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {state === "noted" && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          Not wired up yet. Nothing was sent or stored.
        </p>
      )}
    </form>
  );
}
