"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NavBar, type NavItem } from "./nav-bar";
import { LandingConnectButton } from "./landing-connect";

/**
 * How far down the pill's lower edge sits: `top-3` (12px) plus its own height, rounded up.
 * Used as the observer's top inset so the ink swaps when the ground beneath the PILL changes,
 * not when the act leaves the viewport.
 */
const PILL_BAND_PX = 64;

const LINKS: NavItem[] = [
  { href: "/echo-rank", label: "Echo Rank" },
  { href: "/feed", label: "Feed" },
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
  const [overLight, setOverLight] = useState(true);
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

  /**
   * Which act the pill is currently floating over, so it can carry that act's inks.
   *
   * The page is two acts: a pale ground down to the end of the hero, then black for everything
   * after it. A single dark pill was legible on the second and only just legible on the first,
   * where white labels survived on the strength of the blur behind them rather than on
   * contrast. So the pill reads what is underneath it and swaps.
   *
   * `rootMargin` is what makes this about the PILL rather than the viewport: shrinking the top
   * of the root by the pill's own band means the light act stops "intersecting" at the moment
   * its bottom edge passes under the pill, not when it leaves the screen entirely.
   */
  useEffect(() => {
    const light = document.querySelector(".act-light");
    if (!light) return;

    const observer = new IntersectionObserver(([entry]) => setOverLight(entry.isIntersecting), {
      rootMargin: `-${PILL_BAND_PX}px 0px 0px 0px`,
      threshold: 0,
    });

    observer.observe(light);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <header className="relative z-20 w-full">
        <div className="mx-auto w-full max-w-7xl px-6 py-6 sm:px-10">
          <NavBar links={LINKS} action={<LandingConnectButton />} />
        </div>
      </header>

      {/* Marks where the nav ends. Zero height, so it changes no layout. */}
      <div ref={sentinel} aria-hidden className="h-0 w-full" />

      {revealed && (
        <div className="fixed inset-x-0 top-3 z-40 px-4 sm:top-4 sm:px-6">
          {/* Same width as the nav it replaces, rather than hugging its own contents — a bar
              that shrinks to fit reads as a different object each time a label changes. */}
          <div className="mx-auto w-full max-w-7xl">
            <NavBar
              links={LINKS}
              surface={overLight ? "pill-light" : "pill"}
              action={<LandingConnectButton onDark={!overLight} />}
            />
          </div>
        </div>
      )}
    </>
  );
}
