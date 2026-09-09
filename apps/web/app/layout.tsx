import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { CookieBanner } from "@/components/site/cookie-banner";

/**
 * Two families, no more. Archivo is a grotesque that holds its shape at 7rem with tight
 * tracking, which is what the display sizes in tailwind.config.ts assume, and stays
 * readable at 17px so it can carry body copy too. JetBrains Mono is here for one job:
 * figures read off the chain, where a tabular column that does not align is a bug.
 */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
  weight: ["400", "500", "600", "700"],
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
    <html lang="en" className={`${archivo.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-plane text-ink antialiased">
        <Providers>
          {children}
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
