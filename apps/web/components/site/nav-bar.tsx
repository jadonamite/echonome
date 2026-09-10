"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoIcon } from "./logo";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * One navigation bar, shared by the landing page and the app pages.
 *
 * Three columns at every width: links or the menu toggle on the left, the mark centred, an
 * action on the right. The landing page and the app screens used to carry two different
 * arrangements written twice, which is how they drifted apart.
 *
 * The mark is positioned ABSOLUTELY rather than placed in a grid column. Equal `1fr` columns
 * centre the middle cell only while both sides fit inside their share — a wallet button wider
 * than its third pushes the centre column across, and the logo ends up visibly off-centre on
 * a phone, which is exactly what happened. Absolute centring is independent of both sides.
 *
 * `surface="pill"` is the floating form: dark, translucent, blurred. It has to be dark — it
 * carries a white mark and a white button, neither of which survives a light ground — and dark
 * also means one treatment works over both acts of the landing page.
 */
export function NavBar({
  links,
  surface = "light",
  action,
  logoHeight,
}: {
  links: NavItem[];
  /**
   * The ground this bar sits on, which decides its inks.
   *
   * `light` is the landing page's top nav; `dark` is the app screens, whose --plane is
   * near-black; `pill` is the floating glass form. Naming the SURFACE rather than a style
   * variant is what stops a black mark being rendered onto a black header — which is exactly
   * what happened when the app layout first adopted this component.
   *
   * `pill-light` is the same floating form with dark inks, for while it still floats over the
   * landing page's light act. A white mark and white labels on a pale ground are legible only
   * by the blur behind them, which is not legibility — so the pill carries the ground's inks
   * and swaps them when the ground changes.
   */
  surface?: "light" | "dark" | "pill" | "pill-light";
  /** The right-hand slot: a wallet connector on app pages, a link on the landing page. */
  action: React.ReactNode;
  logoHeight?: number;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const onDark = surface === "dark" || surface === "pill";
  const isPill = surface === "pill" || surface === "pill-light";

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
          !isPill
            ? "relative flex items-center justify-between gap-3"
            : onDark
              ? "relative flex items-center justify-between gap-3 rounded-full border border-white/15 bg-tile-ink/95 px-4 py-2 shadow-[0_10px_36px_-12px_rgba(0,0,0,0.45)] supports-[backdrop-filter]:bg-tile-ink/65 supports-[backdrop-filter]:backdrop-blur-xl sm:px-6 motion-safe:transition-colors motion-safe:duration-300"
              : "relative flex items-center justify-between gap-3 rounded-full border border-black/10 bg-plane/95 px-4 py-2 shadow-[0_10px_36px_-12px_rgba(0,0,0,0.22)] supports-[backdrop-filter]:bg-plane/70 supports-[backdrop-filter]:backdrop-blur-xl sm:px-6 motion-safe:transition-colors motion-safe:duration-300"
        }
      >
        {/* Left: links from md up, the toggle below it. */}
        <div className="flex items-center">
          <nav aria-label="Sections" className="hidden items-center gap-7 md:flex">
            {links.map((link) => (
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

        {/*
          Absolutely centred, and `pointer-events-none` on the wrapper so the full-width strip
          it spans cannot intercept taps meant for the toggle or the button behind it — the
          link itself takes its events back.
        */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Link
            href="/"
            aria-label="Echonome home"
            className="pointer-events-auto inline-flex items-center"
          >
            <LogoIcon
              variant={onDark ? "white" : "black"}
              height={logoHeight ?? (isPill ? 26 : 32)}
              priority={surface === "light"}
            />
          </Link>
        </div>

        <div className="flex shrink-0 items-center">{action}</div>
      </div>

      <MobileMenu
        open={menuOpen}
        onDark={onDark}
        links={links}
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
 * descending on close, so items emerge one after another and go back in reverse order.
 *
 * Kept mounted and hidden rather than unmounted, so the closing direction animates at all.
 * `invisible` (not `hidden`) because visibility is transitionable and display is not.
 *
 * The resting states are correct WITHOUT the animation: closed is genuinely hidden, open
 * genuinely visible. If no transition ever runs it snaps rather than disappearing.
 */
function MobileMenu({
  open,
  onDark,
  links,
  pathname,
  onNavigate,
}: {
  open: boolean;
  onDark: boolean;
  links: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div
      className={`absolute left-0 top-[calc(100%+10px)] z-50 w-56 origin-top-left rounded-3xl border p-2 shadow-[0_16px_44px_-14px_rgba(0,0,0,0.45)] md:hidden motion-safe:transition-[opacity,transform,visibility] motion-safe:duration-200 motion-safe:ease-out ${
        onDark
          ? "border-white/15 bg-tile-ink/95 supports-[backdrop-filter]:bg-tile-ink/85 supports-[backdrop-filter]:backdrop-blur-xl"
          : "border-rule bg-surface"
      } ${open ? "visible scale-100 opacity-100" : "invisible scale-75 opacity-0"}`}
      aria-hidden={!open}
    >
      <nav aria-label="Sections" className="flex flex-col">
        {links.map((link, i) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              tabIndex={open ? undefined : -1}
              style={{
                transitionDelay: open ? `${60 + i * 45}ms` : `${(links.length - 1 - i) * 35}ms`,
              }}
              className={`flex min-h-[44px] items-center rounded-2xl px-4 text-sm font-medium motion-safe:transition-[opacity,transform] motion-safe:duration-200 ${
                open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
              } ${
                active
                  ? "text-accent"
                  : onDark
                    ? "text-white/70 hover:bg-white/10 hover:text-white"
                    : "text-ink-2 hover:bg-surface-raised hover:text-ink"
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
 * On a light ground a link darkens toward `--ink` on hover; on the dark pill that would move it
 * toward the background and read as the link fading out. There it lifts to white instead — the
 * same gesture of "this one is live", pointed the other way.
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
  const base = "whitespace-nowrap text-[13px] font-medium transition-colors";

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
