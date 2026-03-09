// src/app/api/image-proxy/route.ts
// Proxies external images and returns them as base64 data URLs
// Needed because external image servers (FPF, ZeroZero) don't set CORS headers
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, next.config.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/* ───────────── Allowed Domains ───────────── */

// Only proxy images from known football data sources and our own storage
const ALLOWED_HOSTNAME_SUFFIXES = [
  '.fpf.pt',
  '.zerozero.pt',
  '.supabase.co',
  '.supabase.in',
  '.googleapis.com', // Google Drive thumbnails
];

/** Check if hostname is in the allowlist */
function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTNAME_SUFFIXES.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix)
  );
}

/** Block requests to private/internal IP ranges (SSRF prevention) */
function isPrivateOrReserved(hostname: string): boolean {
  // Block obvious private patterns — DNS resolution happens at fetch time,
  // but this catches the most common SSRF vectors
  const blocked = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^0\./,
    /^169\.254\./, // link-local
    /^\[::1\]$/,   // IPv6 loopback
    /^\[fc/i,      // IPv6 ULA
    /^\[fd/i,
    /^\[fe80/i,    // IPv6 link-local
  ];
  return blocked.some((re) => re.test(hostname));
}

export async function GET(req: NextRequest) {
  // Auth check — only authenticated users can use the proxy
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  // Validate URL format and domain
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Only allow HTTPS
  if (parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only HTTPS allowed' }, { status: 400 });
  }

  // Block private IPs (SSRF prevention)
  if (isPrivateOrReserved(parsed.hostname)) {
    return NextResponse.json({ error: 'Blocked host' }, { status: 403 });
  }

  // Check domain allowlist
  if (!isAllowedHost(parsed.hostname)) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
  }

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
    if (!res.ok) {
      return NextResponse.json({ error: 'Fetch failed' }, { status: 502 });
    }

    // Validate content-type is actually an image
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Not an image' }, { status: 400 });
    }

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return NextResponse.json({ dataUrl: `data:${contentType};base64,${base64}` });
  } catch {
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}
