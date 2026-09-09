"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const LINKS = [
  { href: "#calibration", label: "Calibration" },
  { href: "#custody", label: "Custody" },
  { href: "#controls", label: "Controls" },
  { href: "#how", label: "How it works" },
];

/**
 * Floating pill navigation, following the Treepod reference. It sits over the photograph
 * rather than above it, which is why it needs its own backdrop rather than borrowing the
 * page ground.
 *
 * The scroll state exists for one reason: over the hero the pill can be nearly transparent
 * because the image behind it is dark and busy, but once the page scrolls past the image the
 * pill sits on flat ground and needs a real surface behind it or the links lose contrast.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4 sm:pt-6">
      <nav
        className={`pointer-events-auto flex w-full max-w-4xl items-center justify-between gap-4 rounded-full border px-3 py-2 backdrop-blur-xl transition-colors duration-300 sm:px-4 ${
          scrolled
            ? "border-edge bg-surface/90"
            : "border-white/10 bg-black/25"
        }`}
      >
        <Link
          href="/"
          className="pl-2 text-sm font-semibold tracking-tight sm:pl-3 sm:text-base"
        >
          Echonome
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-white/10 hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </div>

        <Link
          href="/leaderboard"
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-plane transition-opacity hover:opacity-90 sm:px-5"
        >
          Leaderboard
        </Link>
      </nav>
    </div>
  );
}
