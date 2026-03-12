// src/actions/scraping/helpers.ts
// Pure utility functions for scraping — anti-blocking headers, country normalization, club matching
// Shared across all scraping modules to avoid duplication
// RELEVANT FILES: src/actions/scraping/fpf.ts, src/actions/scraping/zerozero.ts, src/actions/scraping/zz-finder.ts

/* ───────────── Anti-blocking: rotating User-Agents + realistic headers ───────────── */

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
];

/** Pick a random User-Agent for each request to avoid fingerprinting */
function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Build realistic browser headers — randomized per request */
export function browserHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'User-Agent': randomUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...extra,
  };
}

/** Random delay between min and max ms — jitter makes traffic look human */
export function humanDelay(minMs = 1500, maxMs = 3500): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

// Keep the old HEADERS for backward compat with FPF (less aggressive detection)
export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

/* ───────────── Country normalization ───────────── */

/** Fix common country name misspellings from FPF/ZZ sources */
const COUNTRY_FIXES: Record<string, string> = {
  'guine bissau': 'Guiné-Bissau',
  'guine-bissau': 'Guiné-Bissau',
  'guiné bissau': 'Guiné-Bissau',
  'guine equatorial': 'Guiné Equatorial',
  'guine': 'Guiné',
  'guiné': 'Guiné',
  'cabo verde': 'Cabo Verde',
  'sao tome e principe': 'São Tomé e Príncipe',
  'são tome e principe': 'São Tomé e Príncipe',
  'mocambique': 'Moçambique',
  'timor leste': 'Timor-Leste',
};

export function normalizeCountry(name: string | null): string | null {
  if (!name) return null;
  const fixed = COUNTRY_FIXES[name.toLowerCase().trim()];
  return fixed || name;
}

/* ───────────── Club name matching ───────────── */

/** Normalize club name for comparison — removes "FC", "F.C.", "Futebol Clube", punctuation, etc. */
export function normalizeClubName(name: string): string {
  return name
    .toLowerCase()
    .replace(/futebol\s*clube/gi, '')
    .replace(/f\.?\s*c\.?/gi, '')
    .replace(/s\.?\s*c\.?/gi, '')
    .replace(/c\.?\s*f\.?/gi, '')
    .replace(/[.\-,'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Check if two club names are effectively the same */
export function clubsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normalizeClubName(a);
  const nb = normalizeClubName(b);
  if (na === nb) return true;
  // Only allow substring match when the shorter name is at least 60% of the longer
  // Prevents false positives like "foz" matching "paraíso foz"
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;
  return shorter.length >= longer.length * 0.6 && longer.includes(shorter);
}

/* ───────────── FPF Season ID ───────────── */

/** Compute FPF numeric seasonId from a reference date. Pattern: 95 + (startYear - 2015).
 *  Season starts July 1 — e.g. Oct 2025 → 2025/26 → seasonId 105. */
export function getFpfSeasonId(now: Date = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const startYear = month < 6 ? year - 1 : year;
  return 95 + (startYear - 2015);
}

/* ───────────── Age calculation ───────────── */

/** Calculate age from DOB string (yyyy-MM-dd) */
export function calcAgeFromDob(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
