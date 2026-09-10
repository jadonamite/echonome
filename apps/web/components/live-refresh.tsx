"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-runs the server render on an interval, so a page showing live chain data keeps up without
 * anyone pressing reload.
 *
 * `router.refresh()` rather than client-side fetching: these pages are already server components
 * reading Postgres directly with `force-dynamic`, so refreshing re-runs exactly the query that
 * produced the page. There is no second data path to keep in step with the first, no API route
 * to add, and React reconciles the new markup in place — scroll position, focus and any open
 * menu all survive, which a full reload would throw away.
 *
 * Paused when the tab is hidden. A background tab that keeps polling is a database query every
 * interval for a page nobody is looking at, and with several tabs open that multiplies.
 *
 * Deliberately silent: no spinner, no "updating" flicker. The numbers change when they change.
 * A refresh indicator on a page that refreshes every minute is motion that carries no
 * information, and it would draw the eye away from the figures it sits next to.
 */
export function LiveRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);

    // Catch up immediately on return, rather than making someone who has just come back to the
    // tab wait out the remainder of an interval that ran while they were away.
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);

  return null;
}
