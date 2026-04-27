import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cycletls ships a Go binary loaded via __dirname — bundling breaks the relative
  // path (Next rewrites it to /ROOT/...). Mark as external so it stays CommonJS.
  serverExternalPackages: ['cycletls'],
  images: {
    // Only allow images from known sources — no wildcard **
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.zerozero.pt',
      },
      {
        protocol: 'https',
        hostname: '**.fpf.pt',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.in',
      },
      {
        protocol: 'https',
        hostname: '**.googleapis.com',
      },
    ],
  },
  // Security headers — applied to all routes
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
