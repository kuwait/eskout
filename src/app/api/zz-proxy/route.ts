// src/app/api/zz-proxy/route.ts
// CORS proxy for ZeroZero — forwards requests so the browser can read ZZ HTML responses
// ZZ doesn't set CORS headers, so direct browser fetch is blocked. This proxy bridges the gap.
// RELEVANT FILES: src/lib/zerozero/client.ts, src/lib/zerozero/parser.ts, src/app/api/image-proxy/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { browserHeaders } from '@/lib/zerozero/helpers';

// Use Edge Runtime for distributed IPs across Vercel's edge network
// This makes it much harder for ZZ to block us vs a single server IP
export const runtime = 'edge';

/* ───────────── Security ───────────── */

/** Only allow proxying to zerozero.pt domains */
function isAllowedHost(hostname: string): boolean {
  return hostname === 'www.zerozero.pt' || hostname === 'zerozero.pt';
}

export async function GET(req: NextRequest) {
  // Auth check — only logged-in users can use the proxy
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only HTTPS allowed' }, { status: 400 });
  }

  if (!isAllowedHost(parsed.hostname)) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
  }

  try {
    // Determine if this is an autocomplete request (different headers)
    const isAutocomplete = parsed.pathname.includes('jqc_search');

    const headers = isAutocomplete
      ? browserHeaders({
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://www.zerozero.pt/',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        })
      : browserHeaders({ 'Referer': 'https://www.zerozero.pt/' });

    const res = await fetch(url, { headers });

    // Detect redirect to captcha
    if (!res.ok || res.url.includes('recaptcha') || res.url.includes('captcha')) {
      return NextResponse.json(
        { error: 'ZZ_BLOCKED', message: 'ZeroZero bloqueou o acesso (captcha)' },
        { status: 403 },
      );
    }

    // Forward raw bytes — client handles encoding (ISO-8859-1 for profiles, UTF-8 for autocomplete)
    const body = await res.arrayBuffer();

    if (body.byteLength === 0) {
      return NextResponse.json(
        { error: 'ZZ_BLOCKED', message: 'Resposta vazia do ZeroZero' },
        { status: 502 },
      );
    }

    // Return raw bytes with encoding hint in header
    const encoding = isAutocomplete ? 'utf-8' : 'iso-8859-1';
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-ZZ-Encoding': encoding,
        // Cache autocomplete for 5 min, profiles for 1 hour
        'Cache-Control': isAutocomplete ? 'private, max-age=300' : 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}
