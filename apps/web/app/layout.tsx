import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Echonome",
  description: "Every trade is a sound. Every copy is its echo.",
};

// T012 — real layout/theme pass belongs here, per this project's design mandate
// (see TECHNICAL_ARCHITECTURE.md). This is placeholder structure only.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
