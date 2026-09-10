"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoIcon } from "./logo";

const LINKS = [
  { href: "/echo-rank", label: "Echo Rank" },
  { href: "/#how", label: "How it works" },
  { href: "/#custody", label: "Custody" },
  { href: "/#risk", label: "Risk" },
];

/**
 * The landing page's navigation, in two forms.
 *
 * At the top of the page it sits flat on the light ground, as `design/references/web3-wgmi.jpeg`
 * draws it. Once you scroll past it a floating pill takes over, dark and translucent. An earlier
 * note here recorded a glass pill as a borrowed mistake; that judgement was reversed on purpose,
 * because losing navigation for the whole page below the fold cost more than the borrowed
 * pattern did.
 *
 * Both forms share one layout, in three columns: links or the menu toggle on the left, the mark
 * centred, the wallet button right. Three grid columns rather than a flex row, so the mark is
 * centred against the container instead of against whatever the links happen to measure —
 * otherwise it shifts every time a label changes length.
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
   * threshold. Two elements cost a little duplication and remove that whole class of bug.
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
          <NavBar variant="flat" />
        </div>
      </header>

      {/* Marks where the nav ends. Zero height, so it changes no layout. */}
      <div ref={sentinel} aria-hidden className="h-0 w-full" />

      {revealed && (
        <div className="fixed inset-x-0 top-3 z-40 px-4 sm:top-4 sm:px-6">
          {/* Same width as the nav it replaces, rather than hugging its own contents — a pill
              that shrinks to fit reads as a different object each time a label changes. */}
          <div className="mx-auto w-full max-w-7xl">
            <NavBar variant="pill" />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * One bar, two skins.
 *
 * `pill` has to be dark: it carries a white mark, white link hovers and a white button with
 * black text, none of which survive a light ground. Dark also means one treatment works over
 * both acts of the page, where a light pill would vanish the moment it crossed onto the black
 * half.
 *
 * `supports-[backdrop-filter]` keeps the fallback honest — without the blur the ground goes
 * nearly opaque, because a 65%-transparent bar over scrolling text and no blur is unreadable
 * rather than merely less pretty.
 */
function NavBar({ variant }: { variant: "flat" | "pill" }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const onDark = variant === "pill";

  // Escape and outside-click, both expected of anything that opens over the page.
  useEffect(() => {
    if (!menuOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setMenuOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  return (
    <div ref={root} className="relative">
      <div
        className={
          onDark
            ? "grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-full border border-white/15 bg-tile-ink/95 px-4 py-2 shadow-[0_10px_36px_-12px_rgba(0,0,0,0.45)] supports-[backdrop-filter]:bg-tile-ink/65 supports-[backdrop-filter]:backdrop-blur-xl sm:gap-7 sm:px-6"
            : "grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-7"
        }
      >
        {/* Left: links from md up, the menu toggle below it. */}
        <div className="justify-self-start">
          <nav aria-label="Sections" className="hidden items-center gap-7 md:flex">
            {LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                pathname={pathname}
                onDark={onDark}
              />
            ))}
          </nav>
          <MenuToggle
            open={menuOpen}
            onDark={onDark}
            onToggle={() => setMenuOpen((v) => !v)}
            className="md:hidden"
          />
        </div>

        <Link href="/" aria-label="Echonome home" className="justify-self-center">
          <LogoIcon
            variant={onDark ? "white" : "black"}
            height={onDark ? 26 : 32}
            priority={!onDark}
          />
        </Link>

        {/* `whitespace-nowrap` because at 375px this label wrapped onto two lines and doubled
            the bar's height. */}
        <Link
          href="/connect"
          className={`justify-self-end whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-85 sm:px-5 sm:py-2.5 ${
            onDark ? "bg-white text-tile-ink" : "bg-tile-ink text-white"
          }`}
        >
          Connect wallet
        </Link>
      </div>

      <MobileMenu
        open={menuOpen}
        onDark={onDark}
        pathname={pathname}
        onNavigate={() => setMenuOpen(false)}
      />
    </div>
  );
}

/**
 * Three bars that become an X.
 *
 * The bars are positioned absolutely from the centre so the two that survive rotate about the
 * same point — animating `top` on statically-stacked bars makes them scissor past each other
 * instead of crossing cleanly. The middle bar fades and scales to nothing rather than simply
 * hiding, so there is no frame where it is still visible under the X.
 */
function MenuToggle({
  open,
  onDark,
  onToggle,
  className = "",
}: {
  open: boolean;
  onDark: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const bar = `absolute left-1/2 h-[1.5px] w-[18px] -translate-x-1/2 rounded-full motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out ${
    onDark ? "bg-white" : "bg-ink"
  }`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? "Close menu" : "Open menu"}
      className={`relative -ml-2 h-10 w-10 shrink-0 rounded-full ${className}`}
    >
      <span
        className={`${bar} ${open ? "top-1/2 -translate-y-1/2 rotate-45" : "top-[calc(50%-5px)] -translate-y-1/2"}`}
      />
      <span
        className={`${bar} top-1/2 -translate-y-1/2 motion-safe:transition-opacity ${open ? "scale-x-0 opacity-0" : "opacity-100"}`}
      />
      <span
        className={`${bar} ${open ? "top-1/2 -translate-y-1/2 -rotate-45" : "top-[calc(50%+5px)] -translate-y-1/2"}`}
      />
    </button>
  );
}

/**
 * The links, popping out of the toggle and retracting back into it.
 *
 * `origin-top-left` is what sells it: the panel scales out of the corner the button sits in
 * rather than appearing in place. Each row carries its own delay, ascending on open and
 * descending on close, so the items emerge one after another and go back in reverse order.
 *
 * Kept mounted and hidden rather than unmounted, so the closing direction animates at all — an
 * unmounted element has nothing left to transition. `invisible` (not `hidden`) because
 * visibility is transitionable and display is not, and `pointer-events-none` via `invisible` so
 * a closed panel cannot swallow taps meant for the page.
 *
 * The resting states are correct WITHOUT the animation: closed is genuinely hidden, open
 * genuinely visible. If no transition ever runs it snaps rather than disappearing.
 */
function MobileMenu({
  open,
  onDark,
  pathname,
  onNavigate,
}: {
  open: boolean;
  onDark: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div
      className={`absolute left-0 top-[calc(100%+10px)] w-56 origin-top-left rounded-3xl border p-2 shadow-[0_16px_44px_-14px_rgba(0,0,0,0.45)] md:hidden motion-safe:transition-[opacity,transform,visibility] motion-safe:duration-200 motion-safe:ease-out ${
        onDark
          ? "border-white/15 bg-tile-ink/95 supports-[backdrop-filter]:bg-tile-ink/80 supports-[backdrop-filter]:backdrop-blur-xl"
          : "border-black/10 bg-plane/95 supports-[backdrop-filter]:bg-plane/85 supports-[backdrop-filter]:backdrop-blur-xl"
      } ${open ? "visible scale-100 opacity-100" : "invisible scale-75 opacity-0"}`}
      aria-hidden={!open}
    >
      <nav aria-label="Sections" className="flex flex-col">
        {LINKS.map((link, i) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              tabIndex={open ? undefined : -1}
              style={{
                transitionDelay: open ? `${60 + i * 45}ms` : `${(LINKS.length - 1 - i) * 35}ms`,
              }}
              className={`flex min-h-[44px] items-center rounded-2xl px-4 text-sm font-medium motion-safe:transition-[opacity,transform] motion-safe:duration-200 ${
                open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
              } ${
                active
                  ? "text-accent"
                  : onDark
                    ? "text-white/70 hover:bg-white/10 hover:text-white"
                    : "text-ink-2 hover:bg-black/5 hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * `onDark` switches the resting and hover inks.
 *
 * On the light ground a link darkens toward `--ink` on hover; on the dark pill that would move
 * it toward the background and read as the link fading out. There it lifts to white instead —
 * the same gesture of "this one is live", pointed the other way.
 */
function NavLink({
  href,
  label,
  pathname,
  onDark = false,
}: {
  href: string;
  label: string;
  pathname: string;
  onDark?: boolean;
}) {
  const active = pathname === href;
  const base = "text-[13px] font-medium transition-colors";

  if (active) return <Link href={href} className={`${base} text-accent`}>{label}</Link>;

  return (
    <Link
      href={href}
      className={`${base} ${onDark ? "text-white/70 hover:text-white" : "text-ink-2 hover:text-ink"}`}
    >
      {label}
    </Link>
  );
}
