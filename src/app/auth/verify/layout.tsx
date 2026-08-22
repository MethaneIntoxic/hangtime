import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Secure sign in",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
