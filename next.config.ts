import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cycletls ships a Go binary loaded via __dirname — bundling breaks the relative
  // path (Next rewrites it to /ROOT/...). Mark as external so it stays CommonJS.
  // playwright is now a runtime dep (fpf-playwright.ts) — externalize so its native
  // CDP binary path resolution works in serverless lambdas.
  serverExternalPackages: ['cycletls', 'playwright'],
  // Tree-shake heavy libs that re-export everything from index. Without this, importing
  // a single icon/component from these packages drags in everything they re-export.
  // lucide-react has 1000+ icons; radix-ui + @dnd-kit have many subcomponents.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'radix-ui',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
    ],
  },
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
