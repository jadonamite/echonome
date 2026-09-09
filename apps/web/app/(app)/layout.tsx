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
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-baseline gap-6">
            <Link href="/" aria-label="Echonome home">
              <LogoLockup variant="white" height={24} />
            </Link>
            <nav className="flex gap-5">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-ink-3 transition-colors hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <WalletButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>

      <SiteFooter />
    </div>
  );
}
