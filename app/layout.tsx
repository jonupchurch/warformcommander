import type { Metadata, Viewport } from "next";
import { Archivo, Space_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Archivo is a variable font with a `wdth` axis (62–125). We load that axis so the display face
// (headings, wordmark) can render *expanded* via `font-stretch` — the mockups' "Archivo Expanded"
// look — without a second family (Archivo Expanded isn't in next/font/google). Body uses the same
// font at default width. Mono — Space Mono (all UI chrome: labels, tags, readouts).
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  axes: ["wdth"],
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-space-mono",
  weight: ["400", "700"],
  display: "swap",
});

// The canonical production origin — so relative OpenGraph/sitemap/feed image URLs resolve to
// absolute (Feature 11 SC-006). Override via NEXT_PUBLIC_SITE_URL for preview deploys.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://warformcommander.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Warform Commander",
    template: "%s · Warform Commander",
  },
  description:
    "A non-pay-to-win, planning-over-twitch sci-fi tactics auto-battler — configure your warforms, set their doctrine, and let deterministic battles decide the ladder.",
  // Advertise the news RSS feed so readers/aggregators can subscribe (FR-018).
  alternates: {
    types: { "application/rss+xml": "/feed.xml" },
  },
};

// Cover the notch/safe areas so the shell can pad with env(safe-area-inset-*) (FR-010).
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${spaceMono.variable} antialiased`}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
