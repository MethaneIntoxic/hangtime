import type { NextConfig } from "next";

const baselineSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const productionSecurityHeaders =
  process.env.NODE_ENV === "production"
    ? [
        {
          key: "Content-Security-Policy",
          value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://tiles.openfreemap.org; frame-src https://www.openstreetmap.org; worker-src 'self' blob:; child-src blob:; manifest-src 'self'",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : [];

const privateDocumentHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "*": ["./data/**/*", "./**/*.db", "./**/*.db-wal", "./**/*.db-shm"],
  },
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...baselineSecurityHeaders, ...productionSecurityHeaders],
      },
      // Authenticated HTML is explicitly browser- and service-worker-ineligible.
      { source: "/", headers: privateDocumentHeaders },
      { source: "/profile", headers: privateDocumentHeaders },
      { source: "/companions", headers: privateDocumentHeaders },
      { source: "/plans/:path*", headers: privateDocumentHeaders },
      {
        source: "/join/:path*",
        headers: [
          ...privateDocumentHeaders,
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/auth/:path*",
        headers: [
          ...privateDocumentHeaders,
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      // Sensitive API responses must never be cached by browsers or workers.
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          { key: "Content-Type", value: "application/manifest+json" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/offline.html",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
  poweredByHeader: false,
};

export default nextConfig;
