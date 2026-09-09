"use client";

import { useCallback, useEffect, useState } from "react";

export const CONSENT_KEY = "echonome.consent.v1";
export type ConsentChoice = "accepted" | "essential-only";

/**
 * One consent state, read and written from two places: the footer column, which is where the
 * reference puts the choice, and the first-visit bar, which exists only for people who never
 * scroll far enough to see the footer.
 *
 * Both mount independently, so a choice made in one has to reach the other in the same tick
 * without a page reload. A module-level listener set does that. The `storage` event does not,
 * because browsers only fire it at OTHER tabs.
 *
 * Every read and write is wrapped. Private browsing and blocked site data make localStorage
 * throw rather than return null, and a consent widget that takes the page down with it would
 * be the worst possible component to get this wrong in.
 */
const listeners = new Set<(c: ConsentChoice | null) => void>();

function read(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "essential-only" ? v : null;
  } catch {
    // Unreadable store reads as "not yet asked", which shows the banner again next visit.
    // That is the correct direction to fail in: it asks twice rather than assuming a yes.
    return null;
  }
}

export function useConsent() {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setChoice(read());
    setReady(true);
    const fn = (c: ConsentChoice | null) => setChoice(c);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const decide = useCallback((next: ConsentChoice) => {
    try {
      window.localStorage.setItem(CONSENT_KEY, next);
    } catch {
      // The choice still holds for this session even when it cannot be persisted.
    }
    listeners.forEach((fn) => fn(next));
  }, []);

  return { choice, ready, decide };
}
