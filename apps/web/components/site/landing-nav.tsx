"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoIcon } from "./logo";

const LINKS = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/#how", label: "How it works" },
  { href: "/#custody", label: "Custody" },
  { href: "/#risk", label: "Risk" },
];

/**
 * The nav from `design/references/web3-wgmi.jpeg`, read literally.
 *
 * It sits flat on the light ground with no container of its own: no pill, no border, no
 * backdrop blur, and no scroll state. An earlier version was a floating glass pill that
 * changed background on scroll, which is a pattern from a different reference entirely and was
 * the clearest sign that the brief had been treated as a mood board.
 *
 * Three parts, left to right, exactly as the reference orders them: circular mark, inline
 * links with the current one in indigo, and a black fully-rounded button hard right.
 */
export function LandingNav() {
  const pathname = usePathname();

  /**
   * Revealed once the hero has scrolled past — a deliberate amendment to the "no scroll state"
   * rule above, not a lapse from it.
   *
   * What that rule was guarding against was a floating glass pill that restyled itself as you
   * scrolled. This keeps the nav flat and identical in appearance; it only stops the page from
   * having no navigation at all below the fold. At the top of the page, where the reference
   * governs, nothing has changed: the nav sits in the flow exactly as before.
   *
   * Keyed off the hero element rather than a scroll offset, because the hero's height moves
   * with viewport and content and a hardcoded threshold would drift out of step in silence.
   * If the marker ever disappears the observer simply never fires and the nav behaves the way
   * it did before this existed, which is the right way for it to fail.
   */
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const hero = document.querySelector("[data-hero]");
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only when the hero has left upward. Without the boundingClientRect check a hero
        // still below the fold — which is every hero on first paint of a deep link — counts
        // as "not intersecting" and the nav appears pinned before the user has scrolled.
        setRevealed(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 }
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      className={
        revealed
          ? "fixed inset-x-0 top-0 z-40 w-full bg-plane"
          : "relative z-20 w-full"
      }
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-6 py-6 sm:px-10">
        <Link href="/" aria-label="Echonome home" className="shrink-0">
          <LogoIcon variant="black" height={32} priority />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "text-[13px] font-medium text-accent"
                    : "text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/connect"
          className="ml-auto rounded-full bg-tile-ink px-5 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
        >
          Connect wallet
        </Link>
      </div>
    </header>
  );
}
