"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

  return (
    <header className="relative z-20 w-full">
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
