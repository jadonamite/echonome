"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NavBar, type NavItem } from "./nav-bar";

const LINKS: NavItem[] = [
  { href: "/echo-rank", label: "Echo Rank" },
  { href: "/#how", label: "How it works" },
  { href: "/#custody", label: "Custody" },
  { href: "/#risk", label: "Risk" },
];

/**
 * The landing page's navigation, in two forms.
 *
 * At the top of the page it sits flat on the light ground, as `design/references/web3-wgmi.jpeg`
 * draws it. Once you scroll past it a floating pill takes over. An earlier note here recorded a
 * glass pill as a borrowed mistake; that judgement was reversed on purpose, because losing
 * navigation for the whole page below the fold cost more than the borrowed pattern did.
 *
 * Both forms are the same NavBar with different skins, and the app pages use it too — one bar
 * for the whole product rather than two that drift apart.
 */
export function LandingNav() {
  const [revealed, setRevealed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  /**
   * The pill appears the moment the in-flow nav leaves the top of the viewport.
   *
   * A zero-height sentinel directly beneath the nav is what's observed, rather than a scroll
   * offset — the nav's height moves with viewport and content, and a hardcoded threshold would
   * drift out of step in silence.
   *
   * The in-flow header deliberately STAYS in the flow and the pill is a separate fixed element.
   * Switching the header itself to `fixed` would pull it out of the flow, shift the page up by
   * its own height, drag the sentinel back into view, and flap the pill on and off at the
   * threshold.
   */
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => setRevealed(!entry.isIntersecting), {
      threshold: 0,
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <header className="relative z-20 w-full">
        <div className="mx-auto w-full max-w-7xl px-6 py-6 sm:px-10">
          <NavBar links={LINKS} action={<ConnectLink />} />
        </div>
      </header>

      {/* Marks where the nav ends. Zero height, so it changes no layout. */}
      <div ref={sentinel} aria-hidden className="h-0 w-full" />

      {revealed && (
        <div className="fixed inset-x-0 top-3 z-40 px-4 sm:top-4 sm:px-6">
          {/* Same width as the nav it replaces, rather than hugging its own contents — a bar
              that shrinks to fit reads as a different object each time a label changes. */}
          <div className="mx-auto w-full max-w-7xl">
            <NavBar links={LINKS} surface="pill" action={<ConnectLink onDark />} />
          </div>
        </div>
      )}
    </>
  );
}

/** `whitespace-nowrap` because at 375px this label wrapped and doubled the bar's height. */
function ConnectLink({ onDark = false }: { onDark?: boolean }) {
  return (
    <Link
      href="/connect"
      className={`whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-85 sm:px-5 sm:py-2.5 ${
        onDark ? "bg-white text-tile-ink" : "bg-tile-ink text-white"
      }`}
    >
      Connect wallet
    </Link>
  );
}
