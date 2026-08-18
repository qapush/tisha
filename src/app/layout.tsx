import type { Metadata, Viewport } from "next";
import { Rubik, Unbounded } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";

// Body text — rounded neo-grotesque with full Cyrillic coverage.
const rubik = Rubik({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});

// Chunky display face for headings — the neobrutalist "shout".
const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

// VERCEL_URL points at the unique per-deployment host, which is behind Vercel's
// SSO wall and unreachable by link-preview crawlers (Facebook, Telegram, ...).
// The stable production domain is what those crawlers need to fetch og:image from.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Tisha's Map",
  description: "Where she walked and what she left behind",
  openGraph: {
    title: "Tisha's Map",
    description: "Where she walked and what she left behind",
    images: ["/preview.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tisha's Map",
    description: "Where she walked and what she left behind",
    images: ["/preview.jpg"],
  },
  // Google Translate rewrites text nodes/attributes in-place before React
  // hydrates, which corrupts the tree and throws a hydration mismatch —
  // opt out everywhere it's willing to listen.
  other: { google: "notranslate" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#3d5bfd",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" translate="no" className={`${rubik.variable} ${unbounded.variable}`}>
      <body className="notranslate">{children}</body>
    </html>
  );
}
