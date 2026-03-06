// src/app/api/image-proxy/route.ts
// Proxies external images and returns them as base64 data URLs
// Needed because external image servers (FPF, ZeroZero) don't set CORS headers
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, next.config.ts

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
    if (!res.ok) {
      return NextResponse.json({ error: 'Fetch failed' }, { status: 502 });
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/png';
    const base64 = Buffer.from(buffer).toString('base64');

    return NextResponse.json({ dataUrl: `data:${contentType};base64,${base64}` });
  } catch {
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}
