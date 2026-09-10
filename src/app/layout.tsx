import type { Metadata, Viewport } from "next";
import { PwaClient } from "@/components/pwa/pwa-client";
import { ToastProvider } from "@/components/ui/toast";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

// Route pages are personalized or security-sensitive. Prevent Next from
// emitting shared-cacheable HTML; static assets retain their explicit policy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Hangtime",
    template: "%s · Hangtime",
  },
  description:
    "Find the time and place that works for everyone. Hangtime plans fair, affordable meetups for small groups in Singapore.",
  applicationName: "Hangtime",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Hangtime",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#e4572e",
  width: "device-width",
  initialScale: 1,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <ToastProvider>
          <PwaClient />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
