import type { Metadata } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
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

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://echonome.xyz"),
  title: {
    default: "Echonome",
    template: "%s · Echonome",
  },
  description:
    "Copy-trading for DreamDEX Event Contracts, ranked by calibration instead of profit. Your funds stay in an account only you can withdraw from.",
  openGraph: {
    title: "Echonome",
    description:
      "Copy the traders who are right when they say they are. Ranked by calibration, not profit.",
    images: ["/images/hero-anechoic.jpg"],
  },
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
