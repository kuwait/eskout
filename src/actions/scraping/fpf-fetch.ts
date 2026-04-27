// src/actions/scraping/fpf-fetch.ts
// Server-only FPF HTTP layer: TLS impersonation (cycletls), Cloudflare bypass, rate-limit guard
// Isolated from helpers.ts so cycletls (which uses child_process) never enters the browser bundle
// RELEVANT FILES: src/actions/scraping/fpf-competitions/browse.ts, scrape-match.ts, browse-by-date.ts

import 'server-only';

import { browserHeaders } from './helpers';

/* ───────────── FPF browser headers (Cookie + fixed UA when set) ───────────── */

/** Build headers for FPF requests behind Cloudflare.
 *  When FPF_CF_COOKIE is set, sends it + a fixed UA (FPF_USER_AGENT) so the cf_clearance
 *  cookie validates against the same browser fingerprint that produced it.
 *  Falls back to randomized browserHeaders() when env vars are not set. */
export function fpfBrowserHeaders(extra?: Record<string, string>): Record<string, string> {
  const cookie = process.env.FPF_CF_COOKIE;
  const ua = process.env.FPF_USER_AGENT;

  if (cookie && ua) {
    return {
      'User-Agent': ua,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      Cookie: cookie,
      ...extra,
    };
  }
  return browserHeaders(extra);
}

/* ───────────── FPF rate-limit protection ───────────── */

/** Thrown when FPF/Cloudflare returns 429. Callers should NOT retry — retrying
 *  a 429 only extends the rate-limit window and risks a longer ban (Cloudflare 1015). */
export class FpfRateLimitError extends Error {
  constructor(public url: string) {
    super(`FPF rate limited: ${url}`);
    this.name = 'FpfRateLimitError';
  }
}

/** Global throttle — guarantees min spacing between FPF requests across the whole process.
 *  Cloudflare's per-zone rate limit triggers at ~6-10 req/s; we stay well below that. */
const FPF_MIN_SPACING_MS = 3000;
let _lastFpfRequestAt = 0;
async function fpfThrottle() {
  const now = Date.now();
  const elapsed = now - _lastFpfRequestAt;
  if (elapsed < FPF_MIN_SPACING_MS) {
    const wait = FPF_MIN_SPACING_MS - elapsed + Math.random() * 500;
    await new Promise((r) => setTimeout(r, wait));
  }
  _lastFpfRequestAt = Date.now();
}

/* ───────────── FPF fetch with TLS impersonation (Cloudflare bypass) ───────────── */

// Chrome 131-ish JA3 fingerprint — what cycletls injects to mimic real Chrome at TLS level.
// Without this, even valid cf_clearance cookies are rejected by Cloudflare (TLS handshake
// reveals Node's OpenSSL signature, which is on the bot list).
const CHROME_JA3 =
  '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27,29-23-24,0';

// Lazy singleton — cycletls spawns a Go subprocess; we keep one alive across requests.
type CycleTLSCallable = (
  url: string,
  options: {
    body: string;
    ja3: string;
    userAgent: string;
    headers: Record<string, string>;
  },
  method: string,
) => Promise<{ status: number; headers: Record<string, string>; text: () => Promise<string> }>;

let _cycleTLS: (CycleTLSCallable & { exit?: () => Promise<void> }) | null = null;
async function getCycleTLS() {
  if (_cycleTLS) return _cycleTLS;
  // Dynamic import so non-FPF code paths don't pay the load cost
  const mod = await import('cycletls');
  const init = (mod.default ?? mod) as () => Promise<CycleTLSCallable & { exit?: () => Promise<void> }>;
  _cycleTLS = await init();
  return _cycleTLS;
}

/** Fetch result with a fetch-like API (status + text()). */
export interface FpfFetchResult {
  status: number;
  ok: boolean;
  text: () => Promise<string>;
}

/** Fetch FPF URL with Cloudflare bypass when cookie + UA env vars are set.
 *  Uses cycletls (TLS impersonation of Chrome) — required when FPF is behind
 *  Cloudflare bot management. Falls back to plain fetch otherwise.
 *  Throws FpfRateLimitError on 429 so callers abort instead of retrying (which
 *  only worsens the ban — Cloudflare escalates 429 → 1015 zone-level). */
export async function fpfFetch(url: string): Promise<FpfFetchResult | null> {
  const cookie = process.env.FPF_CF_COOKIE;
  const ua = process.env.FPF_USER_AGENT;

  await fpfThrottle();

  if (cookie && ua) {
    try {
      const cycleTLS = await getCycleTLS();
      const res = await cycleTLS(
        url,
        {
          body: '',
          ja3: CHROME_JA3,
          userAgent: ua,
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
            Cookie: cookie,
          },
        },
        'get',
      );
      if (res.status === 429) throw new FpfRateLimitError(url);
      return {
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        text: () => res.text(),
      };
    } catch (e) {
      if (e instanceof FpfRateLimitError) throw e;
      console.warn('[FPF cycletls] error:', e);
      return null;
    }
  }

  // Plain fetch fallback
  try {
    const res = await fetch(url, {
      headers: fpfBrowserHeaders(),
      next: { revalidate: 0 },
    });
    if (res.status === 429) throw new FpfRateLimitError(url);
    return {
      status: res.status,
      ok: res.ok,
      text: () => res.text(),
    };
  } catch (e) {
    if (e instanceof FpfRateLimitError) throw e;
    console.warn('[FPF fetch] error:', e);
    return null;
  }
}
