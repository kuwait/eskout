// src/lib/zerozero/client.ts
// Client-side ZeroZero fetch module — all ZZ HTTP requests go through /api/zz-proxy
// This keeps ZZ requests on the edge (distributed IPs) instead of a single server IP
// RELEVANT FILES: src/lib/zerozero/parser.ts, src/lib/zerozero/helpers.ts, src/app/api/zz-proxy/route.ts

import { parseZzProfileHtml, parseZzAutocompleteHtml, type ZzParsedProfile } from './parser';
import {
  type ZzSearchCandidate,
  clubsMatch,
  countNameOverlap,
  humanDelay,
  firstLastName,
  firstSecondLastName,
  firstAndSecondLastName,
  shortlistCandidates,
} from './helpers';

/* ───────────── Progress Callback ───────────── */

/** Optional callback to report progress steps to the UI */
export type ZzProgressCallback = (step: string) => void;

/** Module-level progress callback — set by the caller before starting a scrape flow */
let _progressCb: ZzProgressCallback | null = null;

/** Set the progress callback for the current scrape flow. Call with null to clear. */
export function setZzProgressCallback(cb: ZzProgressCallback | null): void {
  _progressCb = cb;
}

/** Report a progress step to the UI (no-op if no callback set) */
function reportProgress(step: string): void {
  _progressCb?.(step);
}

/* ───────────── Rate Limiter ───────────── */

/** Timestamp of the last ZZ fetch — used to enforce minimum delay between requests */
let _lastFetchTime = 0;

/** Minimum and maximum delay between consecutive ZZ requests (ms) */
const MIN_DELAY = 300;
const MAX_DELAY = 1200;

/** Wait until enough time has passed since the last ZZ fetch, with random jitter */
async function rateLimitWait(): Promise<void> {
  const elapsed = Date.now() - _lastFetchTime;
  const requiredDelay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
  if (elapsed < requiredDelay) {
    await new Promise((r) => setTimeout(r, requiredDelay - elapsed));
  }
}

/* ───────────── Low-level Fetch via Proxy ───────────── */

/** Fetch a ZeroZero URL through the CORS proxy, returning raw bytes. Rate-limited. */
async function fetchViaProxy(url: string): Promise<{ buf: ArrayBuffer; encoding: string }> {
  // Enforce minimum spacing between ZZ requests
  await rateLimitWait();
  _lastFetchTime = Date.now();

  const res = await fetch(`/api/zz-proxy?url=${encodeURIComponent(url)}`);

  if (!res.ok) {
    // Parse error JSON from proxy
    let errorMsg = 'ZZ_BLOCKED';
    try {
      const err = await res.json();
      errorMsg = err.error || 'ZZ_BLOCKED';
    } catch { /* use default */ }
    throw new Error(errorMsg);
  }

  const buf = await res.arrayBuffer();
  const encoding = res.headers.get('X-ZZ-Encoding') || 'utf-8';
  return { buf, encoding };
}

/* ───────────── Profile Fetch ───────────── */

/**
 * Fetch and parse a ZeroZero player profile page (client-side).
 * Returns parsed data or null on failure. Throws Error('ZZ_BLOCKED') on captcha/block.
 */
export async function fetchZzProfileClient(zzLink: string): Promise<ZzParsedProfile | null> {
  reportProgress('A consultar perfil ZeroZero…');
  const { buf, encoding } = await fetchViaProxy(zzLink);
  if (buf.byteLength === 0) throw new Error('ZZ_BLOCKED');

  const html = new TextDecoder(encoding).decode(buf);

  // Detect captcha content — blocked if page lacks content markers
  const hasMarkers = html.includes('card-data') || html.includes('ld+json') || html.includes('zz-enthdr');
  if (!hasMarkers) {
    const hasCaptcha = html.includes('recaptcha') || html.includes('g-recaptcha');
    if (hasCaptcha) throw new Error('ZZ_BLOCKED');
    // Page returned but no useful content
    return null;
  }

  return parseZzProfileHtml(html);
}

/* ───────────── Autocomplete Search ───────────── */

/** Fetch ZeroZero autocomplete results (client-side via proxy) */
export async function searchZzAutocompleteClient(query: string): Promise<ZzSearchCandidate[]> {
  reportProgress(`A pesquisar "${query}" no ZeroZero…`);
  const url = `https://www.zerozero.pt/jqc_search_search.php?queryString=${encodeURIComponent(query)}`;
  const { buf } = await fetchViaProxy(url);
  if (buf.byteLength === 0) throw new Error('ZZ_BLOCKED');

  // ZZ autocomplete responds in UTF-8
  const html = new TextDecoder('utf-8').decode(buf);

  // Detect blocked: no results + captcha present
  const hasResults = html.includes('/jogador/') || html.includes('searchresults');
  if (!hasResults && (html.includes('recaptcha') || html.includes('g-recaptcha'))) {
    throw new Error('ZZ_BLOCKED');
  }

  return parseZzAutocompleteHtml(html);
}

/* ───────────── Multi-Strategy Search (client-side) ───────────── */

/**
 * Multi-strategy ZeroZero search using autocomplete with progressively shorter name variants.
 * Client-side version — all HTTP requests go through the proxy.
 * Collects all candidates from all variants, then picks the best match by score + DOB verification.
 */
export async function searchZzMultiStrategyClient(
  fullName: string,
  club: string | null,
  expectedAge: number,
  dob: string,
): Promise<ZzSearchCandidate | null> {
  // Build list of unique name variants to try (most specific → least specific)
  const nameVariants: string[] = [];
  const seen = new Set<string>();
  const addVariant = (v: string | null) => { if (v && !seen.has(v)) { seen.add(v); nameVariants.push(v); } };

  const parts = fullName.trim().split(/\s+/);
  // 3-word names: try as-is first (ideal for autocomplete)
  if (parts.length <= 3) addVariant(fullName);
  // First + second name + last
  addVariant(firstSecondLastName(fullName));
  // First + last
  const shortName = firstLastName(fullName);
  addVariant(shortName);
  // First + second-to-last
  addVariant(firstAndSecondLastName(fullName));
  // Last name alone — catches players known by surname
  if (parts.length >= 3) addVariant(parts[parts.length - 1]);

  const variants = nameVariants;

  // Collect ALL candidates from ALL variants, then pick the best overall
  const allCandidates: ZzSearchCandidate[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < variants.length; i++) {
    if (i > 0) await humanDelay(2000, 4000);

    const candidates = await searchZzAutocompleteClient(variants[i]);
    for (const c of candidates) {
      if (!seenUrls.has(c.url)) {
        seenUrls.add(c.url);
        allCandidates.push(c);
      }
    }

    // Early exit: skip remaining variants if we have a high-confidence candidate
    const earlyMatch = shortlistCandidates(allCandidates, expectedAge, club, fullName);
    if (earlyMatch.length > 0) {
      const best = earlyMatch[0];
      const hasClubMatch = best.club && club && clubsMatch(best.club, club);
      const hasStrongName = countNameOverlap(best.name, fullName) >= 2 && best.age === expectedAge;
      if (hasClubMatch || hasStrongName) break;
    }
  }

  // Pre-filter: keep only candidates with matching age
  const shortlisted = shortlistCandidates(allCandidates, expectedAge, club, fullName);
  if (shortlisted.length === 0) return null;

  // Verify the best candidate by scraping their ZZ profile page to check exact DOB
  let bestUnverified: ZzSearchCandidate | null = null;
  for (const candidate of shortlisted) {
    await humanDelay(1500, 3000);
    reportProgress(`A verificar candidato: ${candidate.name}…`);
    const zzData = await fetchZzProfileClient(candidate.url).catch(() => null);

    if (zzData?.dob) {
      // DOB must match exactly — this is the definitive check
      if (zzData.dob === dob) return candidate;
      // DOB exists but doesn't match — skip (wrong person)
      continue;
    }

    // Profile page blocked/empty — track best unverified candidate for fallback
    if (!bestUnverified && candidate.age === expectedAge && candidate.club && club && clubsMatch(candidate.club, club)) {
      bestUnverified = candidate;
    }
  }

  // Fallback: if all profile pages were blocked but we have a high-confidence candidate
  return bestUnverified;
}
