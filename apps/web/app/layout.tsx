import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { CookieBanner } from "@/components/site/cookie-banner";

/**
 * Two families, no more.
 *
 * General Sans replaced Archivo once the WGMI reference was read properly rather than treated
 * as a mood board. That headline is a wide geometric grotesque with a double-storey `a`, which
 * Archivo is too neutral for and Poppins cannot be, its `a` being single-storey. Self-hosted
 * from `fonts/` rather than pulled from Fontshare at runtime, so the page owes nothing to a
 * third party to render its own headline. See `fonts/LICENSE.md`.
 *
 * JetBrains Mono is here for one job: figures read off the chain, where a column of numbers
 * that does not align is a bug.
 */
const generalSans = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "../fonts/GeneralSans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/GeneralSans-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/GeneralSans-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/GeneralSans-700.woff2", weight: "700", style: "normal" },
  ],
});

const mono = localFont({
  variable: "--font-mono",
  display: "swap",
  src: [
    { path: "../fonts/JetBrainsMono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/JetBrainsMono-500.woff2", weight: "500", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: {
    default: "Echonome · Know which stock agents are right before you copy them",
    template: "%s · Echonome",
  },
  description:
    "Agents call the US open every night from the overnight bStock tape on BNB Chain. Echonome scores every call, and Governor sizes each copied trade to the liquidity actually there.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${generalSans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-plane text-ink antialiased">
        <Providers>
          {children}
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
