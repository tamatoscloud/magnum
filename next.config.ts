import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline' https://cdn.fonts.net",
      "font-src 'self' data: https://cdn.fonts.net",
      `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
      "connect-src 'self'",
    ].join("; "),
  },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  // Dev-only. Lets the public demo tunnel load the client bundle so the verify form runs.
  allowedDevOrigins: ["127.0.0.1", "*.lhr.life", "*.loca.lt", "*.trycloudflare.com", "*.ts.net", "**.ts.net", "desktop-bilukmu.taildb8c63.ts.net"],
  poweredByHeader: false,
  serverExternalPackages: ["bullmq", "ioredis", "yauzl", "bcryptjs", "pdf-lib", "@prisma/client"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
