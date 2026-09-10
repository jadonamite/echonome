import Link from "next/link";
import { WalletButton } from "@/components/wallet-button";
import { SiteFooter } from "@/components/site/footer";
import { LogoLockup } from "@/components/site/logo";

/**
 * The chrome every signed-in surface shares. It lives in a route group rather than the
 * root layout so that `/` can be full-bleed: a landing page inside a max-width container
 * with a border-bottom header is a landing page that cannot use a photograph.
 */
const NAV = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/connect", label: "Connect" },
  { href: "/me", label: "My echoes" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/*
        Sticky, because these are working screens: on /me you check your account while reading
        your echoes, and a nav you can only reach by scrolling back to the top is a nav you
        stop using. The landing page reveals its nav after the hero instead — that page is
        read once, top to bottom, and its nav is designed to sit flat in the flow.

        `bg-plane` is required, not decorative: a transparent sticky header lets rows scroll
        through the text.
      */}
      <header className="sticky top-0 z-40 border-b border-rule bg-plane">
        {/*
          Wraps rather than overflows. At 375px the single row needed ~492px — brand and nav
          at 339, the wallet button at 81, plus gap and padding — against 327 available, so
          every /leaderboard, /connect and /me page scrolled sideways by 93px. The nav takes
          its own line below sm; above it, nothing about the layout changes.
        */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <Link href="/" aria-label="Echonome home" className="shrink-0">
            <LogoLockup variant="white" height={24} />
          </Link>

          <nav className="order-last flex w-full gap-5 sm:order-none sm:w-auto">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-1 text-sm text-ink-3 transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto shrink-0">
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>

      <SiteFooter />
    </div>
  );
}
