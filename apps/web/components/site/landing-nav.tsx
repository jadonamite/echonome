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
 * The nav from `design/references/web3-wgmi.jpeg`, read literally — at the top of the page.
 *
 * It sits flat on the light ground with no container of its own: no pill, no border, no
 * backdrop blur. Circular mark, inline links with the current one in indigo, and a black
 * fully-rounded button hard right. None of that changes.
 *
 * What DID change, deliberately and at the product owner's direction: once you scroll past
 * this nav, a floating translucent pill takes over. An earlier note here recorded a glass pill
 * as a mistake — a pattern borrowed from a different reference. That judgement has been
 * reversed on purpose, and the reason is worth keeping: losing navigation for the whole page
 * below the fold cost more than the borrowed pattern did. The reference still governs the top
 * of the page, which is the part it was drawn for.
 */
export function LandingNav() {
  const pathname = usePathname();

  /**
   * The pill appears the moment the in-flow nav leaves the top of the viewport.
   *
   * A zero-height sentinel directly beneath the nav is what's observed, rather than a scroll
   * offset — the nav's height moves with viewport and content, and a hardcoded threshold would
   * drift out of step in silence.
   *
   * The in-flow header deliberately STAYS in the flow and the pill is a separate fixed
   * element. Switching the header itself to `fixed` would pull it out of the flow, shift the
   * page up by its own height, drag the sentinel back into view, and flap the pill on and off
   * at the threshold. Two elements cost a little duplication and remove that whole class of bug.
   */
  const [revealed, setRevealed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => setRevealed(!entry.isIntersecting), {
      threshold: 0,
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Scrolling away closes the menu with it — a panel left hanging open over content the user
  // has moved past is orphaned UI.
  useEffect(() => {
    if (!revealed) setMenuOpen(false);
  }, [revealed]);

  // Escape and outside-click, both expected of anything that opens over the page.
  useEffect(() => {
    if (!menuOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (pill.current && !pill.current.contains(e.target as Node)) setMenuOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  return (
    <>
      {/*
        Three columns rather than a flex row, so the logo is centred against the VIEWPORT and
        not against whatever the links happen to measure. With `justify-between` the mark drifts
        left or right every time a link label changes length; equal thirds hold it still.
      */}
      <header className="relative z-20 w-full">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 py-6 sm:px-10">
          <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
            {LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} pathname={pathname} />
            ))}
          </nav>
          {/* Holds the centre column when the links are hidden below md. */}
          <span className="md:hidden" />

          <Link href="/" aria-label="Echonome home" className="justify-self-center">
            <LogoIcon variant="black" height={32} priority />
          </Link>

          <Link
            href="/connect"
            className="justify-self-end rounded-full bg-tile-ink px-5 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
          >
            Connect wallet
          </Link>
        </div>
      </header>

      {/* Marks where the nav ends. Zero height, so it changes no layout. */}
      <div ref={sentinel} aria-hidden className="h-0 w-full" />

      {revealed && (
        <div className="fixed inset-x-0 top-3 z-40 flex justify-center px-4 sm:top-4">
          <div ref={pill} className="relative">
            {/*
              Dark glass, and it has to be dark: the pill carries a white mark, white link
              hovers and a white button, none of which survive a light ground. Being dark also
              means one treatment works over both acts of the page — a light pill would vanish
              the moment it crossed onto the black half.

              `supports-[backdrop-filter]` keeps the fallback honest: without the blur the
              ground goes nearly opaque, because a 65%-transparent bar over scrolling text and
              no blur is unreadable rather than merely less pretty.
            */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-full border border-white/15 bg-tile-ink/95 px-4 py-2 shadow-[0_10px_36px_-12px_rgba(0,0,0,0.45)] supports-[backdrop-filter]:bg-tile-ink/65 supports-[backdrop-filter]:backdrop-blur-xl sm:gap-7 sm:px-5">
              <nav aria-label="Sections" className="hidden items-center gap-7 md:flex">
                {LINKS.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    pathname={pathname}
                    onDark
                  />
                ))}
              </nav>
              <span className="md:hidden" />

              <Link href="/" aria-label="Echonome home" className="justify-self-center">
                <LogoIcon variant="white" height={26} />
              </Link>

              <div className="flex items-center justify-self-end gap-1">
                <Link
                  href="/connect"
                  className="shrink-0 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-tile-ink transition-opacity hover:opacity-85"
                >
                  Connect wallet
                </Link>

                <MenuToggle open={menuOpen} onToggle={() => setMenuOpen((v) => !v)} />
              </div>
            </div>

            <MobileMenu open={menuOpen} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}
    </>
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
function MenuToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const bar =
    "absolute left-1/2 h-[1.5px] w-[18px] -translate-x-1/2 rounded-full bg-white motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="pill-menu"
      aria-label={open ? "Close menu" : "Open menu"}
      className="relative -mr-1 h-10 w-10 shrink-0 rounded-full md:hidden"
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
 * `origin-top-right` is what sells it: the panel scales out of the corner the button sits in
 * rather than appearing in place. Each row carries its own delay, ascending on open and
 * descending on close, so the items emerge one after another and go back in the reverse order.
 *
 * Kept mounted and hidden rather than unmounted, so the closing direction animates at all —
 * an unmounted element has nothing left to transition. `invisible` (not `hidden`) because
 * visibility is transitionable and display is not, and `pointer-events-none` so a closed panel
 * cannot swallow taps meant for the page.
 *
 * Note the resting states are correct WITHOUT the animation: closed is genuinely hidden, open
 * is genuinely visible. If transitions never run — reduced motion, a throttled tab — the panel
 * still opens and closes, it just snaps. Nothing here depends on an animation finishing.
 */
function MobileMenu({
  open,
  pathname,
  onNavigate,
}: {
  open: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div
      id="pill-menu"
      className={`absolute right-0 top-[calc(100%+10px)] w-56 origin-top-right rounded-3xl border border-white/15 bg-tile-ink/95 p-2 shadow-[0_16px_44px_-14px_rgba(0,0,0,0.45)] supports-[backdrop-filter]:bg-tile-ink/80 supports-[backdrop-filter]:backdrop-blur-xl md:hidden motion-safe:transition-[opacity,transform,visibility] motion-safe:duration-200 motion-safe:ease-out ${
        open ? "visible scale-100 opacity-100" : "invisible scale-75 opacity-0"
      }`}
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
              } ${active ? "text-accent" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
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
 * `onDark` switches the resting and hover inks for the pill.
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
