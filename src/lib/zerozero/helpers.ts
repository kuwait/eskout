// src/lib/zerozero/helpers.ts
// Shared helper functions for ZeroZero scraping — used by both parser and client modules
// Extracted from src/actions/scraping.ts to enable client-side ZZ fetching
// RELEVANT FILES: src/lib/zerozero/parser.ts, src/lib/zerozero/client.ts, src/actions/scraping.ts

/* ───────────── Types ───────────── */

export interface ZzSearchCandidate {
  url: string;
  name: string;
  age: number | null;
  club: string | null;
  position: string | null;
}

/* ───────────── Country Normalization ───────────── */

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

/* ───────────── Club Name Matching ───────────── */

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

/* ───────────── Name Utilities ───────────── */

/** Remove diacritics from a string for fuzzy comparison */
export function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Count how many name parts overlap between two names (case/diacritic insensitive) */
export function countNameOverlap(a: string, b: string): number {
  const partsA = removeDiacritics(a).toLowerCase().split(/\s+/);
  const partsB = removeDiacritics(b).toLowerCase().split(/\s+/);
  return partsA.filter((p) => partsB.includes(p)).length;
}

/** Extract first + last name from a full name string */
export function firstLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Extract first + second name + last name (e.g. "Afonso Maciel Monteiro" from "Afonso Maciel Valentin Monteiro") */
export function firstSecondLastName(fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 4) return null;
  return `${parts[0]} ${parts[1]} ${parts[parts.length - 1]}`;
}

/** Extract first name + second-to-last name (e.g. "Afonso Valentin" from "Afonso Maciel Valentin Monteiro") */
export function firstAndSecondLastName(fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 3) return null;
  return `${parts[0]} ${parts[parts.length - 2]}`;
}

/** Calculate age from DOB string (yyyy-MM-dd) */
export function calcAgeFromDob(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/* ───────────── Candidate Ranking ───────────── */

/**
 * Pre-filter and rank autocomplete candidates before DOB verification.
 * Returns candidates sorted by likelihood (age match + name overlap + club match).
 * Only candidates with plausible age (exact or ±1) pass.
 */
export function shortlistCandidates(
  candidates: ZzSearchCandidate[],
  expectedAge: number,
  expectedClub: string | null,
  fullName: string,
): ZzSearchCandidate[] {
  if (candidates.length === 0) return [];

  const normFull = removeDiacritics(fullName).toLowerCase();
  const fullParts = normFull.split(/\s+/);

  const scored = candidates
    .filter((c) => {
      // Must have age within ±1 year (birthday boundary tolerance)
      if (c.age === null) return false;
      return Math.abs(c.age - expectedAge) <= 1;
    })
    .map((c) => {
      let score = 0;

      // Exact age match is preferred over off-by-1
      if (c.age === expectedAge) score += 3;

      // Club match — strong signal
      if (c.club && expectedClub && clubsMatch(c.club, expectedClub)) score += 5;

      // Name similarity — count overlapping name parts
      const normCandidate = removeDiacritics(c.name).toLowerCase();
      const candidateParts = normCandidate.split(/\s+/);
      const commonParts = candidateParts.filter((p) => fullParts.includes(p));
      score += commonParts.length * 2;

      return { candidate: c, score };
    });

  // Sort by score descending — best candidates verified first
  scored.sort((a, b) => b.score - a.score);

  // Return top candidates (limit to 3 to avoid excessive scraping)
  return scored.slice(0, 3).map((s) => s.candidate);
}

/* ───────────── Anti-blocking: User-Agents + Headers ───────────── */

/** Browser profiles — each UA paired with matching Accept/Accept-Language for consistency.
 * A real Chrome user doesn't send Firefox-style Accept headers. */
interface BrowserProfile {
  ua: string;
  accept: string;
  acceptLang: string;
}

const BROWSER_PROFILES: BrowserProfile[] = [
  // Chrome Mac
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    acceptLang: 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7' },
  // Chrome Win
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    acceptLang: 'pt-PT,pt;q=0.9,en;q=0.8' },
  // Chrome Linux
  { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    acceptLang: 'pt,en-US;q=0.9,en;q=0.8' },
  // Safari Mac
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    acceptLang: 'pt-PT,pt;q=0.9' },
  // Firefox Win
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    acceptLang: 'pt-PT,pt;q=0.8,en-US;q=0.5,en;q=0.3' },
  // Firefox Mac
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    acceptLang: 'pt-PT,pt;q=0.8,en;q=0.5' },
  // Edge Win
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    acceptLang: 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7' },
  // Chrome mobile Android
  { ua: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    acceptLang: 'pt-PT,pt;q=0.9,en;q=0.8' },
  // Safari iOS
  { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    acceptLang: 'pt-PT,pt;q=0.9' },
];

/** Referrer pages — simulate navigation from different ZZ pages or Google */
const REFERERS = [
  'https://www.zerozero.pt/',
  'https://www.zerozero.pt/pesquisa.php',
  'https://www.zerozero.pt/competicao.php?id_comp=22',
  'https://www.google.pt/',
  'https://www.google.com/search?q=zerozero+jogador',
  '', // direct navigation (no referer)
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Pick a random User-Agent for each request to avoid fingerprinting */
export function randomUA(): string {
  return pick(BROWSER_PROFILES).ua;
}

/** Build realistic browser headers — randomized browser profile + referer per request.
 * Each UA is paired with matching Accept headers (Chrome ≠ Firefox ≠ Safari). */
export function browserHeaders(extra?: Record<string, string>): Record<string, string> {
  const profile = pick(BROWSER_PROFILES);
  const isFirefox = profile.ua.includes('Firefox');
  const referer = pick(REFERERS);

  return {
    'User-Agent': profile.ua,
    'Accept': profile.accept,
    'Accept-Language': profile.acceptLang,
    'Accept-Encoding': 'gzip, deflate, br',
    // Firefox doesn't send Cache-Control/Pragma on normal navigations
    ...(isFirefox ? {} : { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }),
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    // cross-site from Google, same-origin from ZZ, none if direct
    'Sec-Fetch-Site': referer.includes('google') ? 'cross-site' : referer.includes('zerozero') ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...(referer ? { 'Referer': referer } : {}),
    ...extra,
  };
}

/** Random delay between min and max ms — jitter makes traffic look human */
export function humanDelay(minMs = 1500, maxMs = 3500): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}
