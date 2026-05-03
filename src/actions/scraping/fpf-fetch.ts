// src/actions/scraping/fpf-fetch.ts
// Server-only FPF HTTP layer: TLS impersonation (cycletls), Cloudflare bypass, rate-limit guard
// Isolated from helpers.ts so cycletls (which uses child_process) never enters the browser bundle
// RELEVANT FILES: src/actions/scraping/fpf.ts, src/actions/scraping/fpf-club-import.ts, src/actions/scraping/fpf-competitions/browse.ts

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
 *  Cloudflare's per-zone rate limit triggers at ~6-10 req/s; we stay well below that.
 *  Applies to BOTH www.fpf.pt and resultados.fpf.pt — single shared lock. */
const FPF_MIN_SPACING_MS = 3000;
let _lastFpfRequestAt = 0;
// Serialize concurrent callers — without this, N parallel workers all see "elapsed > spacing"
// at the same instant and fire together. The chained promise creates a true queue.
let _fpfQueue: Promise<void> = Promise.resolve();
let _queueDepth = 0; // [TEMP DEBUG] track concurrent waiters
async function fpfThrottle() {
  _queueDepth++;
  const myDepth = _queueDepth;
  const slot = _fpfQueue.then(async () => {
    const now = Date.now();
    const elapsed = now - _lastFpfRequestAt;
    if (elapsed < FPF_MIN_SPACING_MS) {
      const wait = FPF_MIN_SPACING_MS - elapsed + Math.random() * 500;
      // [TEMP DEBUG] visibility into the throttle queue
      console.log(`[FPF Throttle] waiting ${Math.round(wait)}ms (queue=${myDepth})`);
      await new Promise((r) => setTimeout(r, wait));
    }
    _lastFpfRequestAt = Date.now();
  });
  _fpfQueue = slot.catch(() => undefined); // never let one rejection break the chain
  try {
    await slot;
  } finally {
    _queueDepth--;
  }
}

/* ───────────── FPF fetch with TLS impersonation (Cloudflare bypass) ───────────── */

// Chrome 131-ish JA3 fingerprint — what cycletls injects to mimic real Chrome at TLS level.
// Without this, even valid cf_clearance cookies are rejected by Cloudflare (TLS handshake
// reveals Node's OpenSSL signature, which is on the bot list).
const CHROME_JA3 =
  '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27,29-23-24,0';

// Lazy singleton — cycletls spawns a Go subprocess; we keep one alive across requests.
type CycleTLSResponseLike = {
  status: number;
  headers: Record<string, unknown>;
  text: () => Promise<string>;
  json: <T = unknown>() => Promise<T>;
};
type CycleTLSCallable = (
  url: string,
  options: {
    body?: string;
    ja3: string;
    userAgent: string;
    headers: Record<string, string>;
  },
  method: string,
) => Promise<CycleTLSResponseLike>;

let _cycleTLS: (CycleTLSCallable & { exit?: () => Promise<void> }) | null = null;
async function getCycleTLS() {
  if (_cycleTLS) return _cycleTLS;
  // Dynamic import so non-FPF code paths don't pay the load cost
  const mod = await import('cycletls');
  const init = (mod.default ?? mod) as () => Promise<CycleTLSCallable & { exit?: () => Promise<void> }>;
  _cycleTLS = await init();
  return _cycleTLS;
}

/* ───────────── Public types ───────────── */

export interface FpfFetchOptions {
  /** HTTP method (default GET) */
  method?: 'GET' | 'POST';
  /** Request body for POST (string — JSON callers must stringify) */
  body?: string;
  /** Extra request headers — merged on top of the Cloudflare-friendly defaults.
   *  Use this for DNN routing headers (ModuleId, TabId), Referer, X-Requested-With, etc. */
  headers?: Record<string, string>;
}

/** Fetch result with a fetch-like API (status + text/json) plus parsed Set-Cookie values.
 *  setCookies is an array of raw `Set-Cookie` header values (one per cookie) so callers
 *  that need session forwarding (e.g. DNN ASP.NET sessions) can pluck `name=value` parts. */
export interface FpfFetchResult {
  status: number;
  ok: boolean;
  text: () => Promise<string>;
  json: <T = unknown>() => Promise<T>;
  setCookies: string[];
}

/* ───────────── Internals ───────────── */

/** Normalize Set-Cookie header from any backend (string | string[] | undefined) into string[] */
function extractSetCookies(headers: Record<string, unknown> | Headers | undefined): string[] {
  if (!headers) return [];
  // Web Headers (plain fetch path) — Node 20+ exposes getSetCookie()
  if (typeof (headers as Headers).getSetCookie === 'function') {
    return (headers as Headers).getSetCookie();
  }
  // Plain object (cycletls path) — keys may be lowercase or original-case, value may be string or string[]
  const obj = headers as Record<string, unknown>;
  const raw = obj['set-cookie'] ?? obj['Set-Cookie'];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  return [String(raw)];
}

/* ───────────── Public API ───────────── */

/** Fetch FPF URL with Cloudflare bypass.
 *  Routing:
 *   - resultados.fpf.pt → Playwright (real Chromium, solves JS challenges automatically)
 *   - www.fpf.pt → cycletls when FPF_CF_COOKIE is set, else plain fetch
 *  Both paths share the global throttle.
 *  Throws FpfRateLimitError on 429 so callers abort instead of retrying. */
export async function fpfFetch(
  url: string,
  options: FpfFetchOptions = {},
): Promise<FpfFetchResult | null> {
  const method = options.method ?? 'GET';
  const cookie = process.env.FPF_CF_COOKIE;
  const ua = process.env.FPF_USER_AGENT;
  const t0 = Date.now(); // [TEMP DEBUG]
  const shortUrl = url.length > 90 ? url.slice(0, 87) + '…' : url; // [TEMP DEBUG]

  await fpfThrottle();

  // ALL FPF subdomains now go through Playwright/CDP (user's authenticated Brave).
  // resultados.fpf.pt has Cloudflare JS challenges; www.fpf.pt returns 200 with empty
  // bodies (or challenge pages) when fetched server-side via cycletls — same problem,
  // different symptom. The user's Brave loads both fine.
  if (/\.fpf\.pt/i.test(url)) {
    const { fpfFetchViaPlaywright } = await import('./fpf-playwright');
    const res = await fpfFetchViaPlaywright(url, options);
    if (res && res.status === 429) throw new FpfRateLimitError(url);
    return res;
  }

  if (cookie && ua) {
    try {
      const cycleTLS = await getCycleTLS();
      // Cloudflare-friendly defaults; caller's headers override (e.g. Accept: application/json)
      const baseHeaders: Record<string, string> = {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
        Cookie: cookie,
      };
      // If caller provides a Cookie, append cf_clearance to it instead of replacing
      const merged: Record<string, string> = { ...baseHeaders, ...(options.headers ?? {}) };
      if (options.headers?.Cookie || options.headers?.cookie) {
        const callerCookie = options.headers.Cookie ?? options.headers.cookie ?? '';
        merged.Cookie = `${cookie}; ${callerCookie}`;
        delete merged.cookie;
      }

      const res = await cycleTLS(
        url,
        {
          body: options.body ?? '',
          ja3: CHROME_JA3,
          userAgent: ua,
          headers: merged,
        },
        method.toLowerCase(),
      );
      // [TEMP DEBUG] log every cycletls request outcome
      console.log(`[FPF cycletls] ${method} ${res.status} ${Date.now() - t0}ms ${shortUrl}`);
      if (res.status === 429) throw new FpfRateLimitError(url);
      return {
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        text: () => res.text(),
        json: <T = unknown>() => res.json() as Promise<T>,
        setCookies: extractSetCookies(res.headers),
      };
    } catch (e) {
      if (e instanceof FpfRateLimitError) throw e;
      console.warn('[FPF cycletls] error:', e);
      return null;
    }
  }

  // Plain fetch fallback (no cf_clearance cookie configured)
  try {
    const res = await fetch(url, {
      method,
      headers: fpfBrowserHeaders(options.headers),
      body: options.body,
      next: { revalidate: 0 },
    });
    // [TEMP DEBUG] log every plain fetch outcome
    console.log(`[FPF fetch] ${method} ${res.status} ${Date.now() - t0}ms ${shortUrl}`);
    if (res.status === 429) throw new FpfRateLimitError(url);
    return {
      status: res.status,
      ok: res.ok,
      text: () => res.text(),
      json: <T = unknown>() => res.json() as Promise<T>,
      setCookies: extractSetCookies(res.headers),
    };
  } catch (e) {
    if (e instanceof FpfRateLimitError) throw e;
    console.warn('[FPF fetch] error:', e);
    return null;
  }
}
