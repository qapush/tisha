import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";

// VERCEL_URL points at the unique per-deployment host, which is behind Vercel's
// SSO wall and unreachable by link-preview crawlers (Facebook, Telegram, ...).
// The stable production domain is what those crawlers need to fetch og:image from.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Карта Тиши",
  description: "Где гуляла и что оставила",
  openGraph: {
    title: "Карта Тиши",
    description: "Где гуляла и что оставила",
    images: ["/preview.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Карта Тиши",
    description: "Где гуляла и что оставила",
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
  themeColor: "#8b6f47",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" translate="no">
      <body className="notranslate">{children}</body>
    </html>
  );
}
