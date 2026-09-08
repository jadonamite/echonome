import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { WalletButton } from "@/components/wallet-button";

export const metadata: Metadata = {
  title: "Echonome",
  description: "Copy-trading for DreamDEX Event Contracts, ranked by calibration instead of raw P&L.",
};

const NAV = [
  { href: "/", label: "Leaderboard" },
  { href: "/connect", label: "Connect" },
  { href: "/me", label: "My echoes" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-plane text-ink">
        <Providers>
          <header className="border-b border-rule">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
              <div className="flex items-baseline gap-6">
                <Link href="/" className="text-base font-semibold tracking-tight">
                  Echonome
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

          <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>

          <footer className="mx-auto max-w-5xl px-6 pb-12 pt-4">
            <p className="border-t border-rule pt-4 text-xs text-ink-3">
              Every trade is a sound. Every copy is its echo. · Somnia Shannon testnet ·
              Echonome never holds your funds — it can only place and cancel orders you have
              explicitly authorised, and you can revoke that at any time.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
