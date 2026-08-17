import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "Карта Тиши",
  description: "Где гулял и что оставил",
  manifest: "/manifest.json",
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
      <body className="notranslate">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
