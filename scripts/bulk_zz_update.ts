// scripts/bulk_zz_update.ts
// Bulk ZeroZero: find links (via autocomplete + DOB verification) + scrape data + update players
// Two modes: MODE=find (find ZZ links for players without one) | MODE=scrape (scrape data for players with ZZ link) | MODE=all (both)
// Run with: CLUB_NAME=Boavista npx tsx scripts/bulk_zz_update.ts
// RELEVANT FILES: src/actions/scraping.ts, scripts/bulk_fpf_update.ts

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

/* ───────────── Config ───────────── */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

let CLUB_ID = process.env.CLUB_ID;
const CLUB_NAME = process.env.CLUB_NAME;
const MODE = (process.env.MODE || 'all') as 'find' | 'scrape' | 'all' | 'ddg';
const DRY_RUN = process.env.DRY_RUN === '1';
const START_OFFSET = parseInt(process.env.START_OFFSET || '0', 10);
const BATCH_SIZE = 50;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* ───────────── Timing — balanced: fast enough to finish, slow enough to not get blocked ───────────── */

// Between individual ZZ page fetches (profile scrape)
const PAGE_DELAY_MIN = 8_000;
const PAGE_DELAY_MAX = 18_000;

// Between DDG searches (blocks at ~1req/s, needs ~3-6s to be safe)
const DDG_DELAY_MIN = 3_000;
const DDG_DELAY_MAX = 6_000;

// Between ZZ autocomplete search requests (fallback)
const SEARCH_DELAY_MIN = 8_000;
const SEARCH_DELAY_MAX = 15_000;

// Between DOB-verification profile fetches during link finding
const VERIFY_DELAY_MIN = 8_000;
const VERIFY_DELAY_MAX = 18_000;

// Between batches of 50 — pause to reset rate limit windows
const BATCH_PAUSE_MIN = 60_000;
const BATCH_PAUSE_MAX = 180_000;

// Backoff on block detection — 10 minutes
const BLOCKED_BACKOFF_MS = 600_000;
const MAX_CONSECUTIVE_BLOCKS = 3;

/* ───────────── Anti-blocking ───────────── */

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function browserHeaders(extra?: Record<string, string>): Record<string, string> {
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
    'Referer': 'https://www.zerozero.pt/',
    ...extra,
  };
}

/** Human-like delay — uses exponential distribution so most delays are near min,
 *  but occasionally much longer (like a human getting distracted) */
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  // 80% chance: normal range. 20% chance: extra long pause (2-3x max)
  const isLongPause = Math.random() < 0.2;
  let ms: number;
  if (isLongPause) {
    ms = maxMs + Math.random() * maxMs; // up to 2x max
  } else {
    ms = minMs + Math.random() * (maxMs - minMs);
  }
  return new Promise((r) => setTimeout(r, ms));
}

function blockedBackoff(): Promise<void> {
  const jitter = Math.random() * 60_000;
  const ms = BLOCKED_BACKOFF_MS + jitter;
  console.log(`  🛑 Backoff: ${(ms / 1000).toFixed(0)}s`);
  return new Promise((r) => setTimeout(r, ms));
}

// Track consecutive blocks globally
let consecutiveBlocks = 0;

async function handleBlock(playerName: string): Promise<void> {
  consecutiveBlocks++;
  console.log(`  🛑 ${playerName} — BLOQUEADO (${consecutiveBlocks}/${MAX_CONSECUTIVE_BLOCKS})`);

  if (consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
    console.log(`\n🚫 ${MAX_CONSECUTIVE_BLOCKS} bloqueios consecutivos — backoff longo...`);
    await blockedBackoff();
    consecutiveBlocks = 0;
  } else {
    await randomDelay(15_000, 30_000);
  }
}

function resetBlocks(): void {
  consecutiveBlocks = 0;
}

/* ───────────── Helpers ───────────── */

function normalizeClubName(name: string): string {
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

/** Normalize a player name for comparison — strip diacritics, prepositions, lowercase */
function normalizePlayerName(name: string): string {
  return removeDiacritics(name)
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !['de', 'da', 'do', 'dos', 'das'].includes(w))
    .join(' ')
    .trim();
}

/** Check if two player names match.
 *  Ignores diacritics, prepositions, and word order.
 *  Accepts if all parts of the shorter name exist in the longer name
 *  (handles cases like "Joao Rocha Moreira" vs "João Franco Rocha Moreira"). */
function playerNamesMatch(a: string, b: string): boolean {
  const partsA = normalizePlayerName(a).split(' ').sort();
  const partsB = normalizePlayerName(b).split(' ').sort();
  // Exact match (ignoring order)
  if (partsA.join(' ') === partsB.join(' ')) return true;
  // Shorter name fully contained in longer name
  const [shorter, longer] = partsA.length <= partsB.length ? [partsA, partsB] : [partsB, partsA];
  return shorter.every((part) => longer.includes(part));
}

/** Check if a DDG candidate is a confirmed match for our player.
 *  Rules (in order of priority):
 *  1. Name match + DOB exact → confirmed
 *  2. Name match + club match (from DDG title/snippet) → confirmed (handles DOB typos)
 *  3. Name fuzzy match (≥80% parts overlap) + DOB exact → confirmed (handles ZZ name typos) */
function isConfirmedMatch(c: DdgCandidate, playerName: string, playerDob: string, playerClub: string | null): boolean {
  const nameOk = c.name ? playerNamesMatch(c.name, playerName) : false;
  const dobOk = c.dob === playerDob;
  const clubOk = c.club && playerClub ? clubsMatch(c.club, playerClub) : false;

  // Rule 1: name + DOB
  if (nameOk && dobOk) return true;

  // Rule 2: name + club (DOB may have typo in DB or ZZ)
  if (nameOk && clubOk) return true;

  // Rule 3: fuzzy name (handles ZZ typos like "Mafrtins" vs "Martins") + DOB exact
  if (!nameOk && dobOk && c.name) {
    const partsA = normalizePlayerName(c.name).split(' ').sort();
    const partsB = normalizePlayerName(playerName).split(' ').sort();
    const overlap = partsA.filter((p) => partsB.includes(p)).length;
    const maxParts = Math.max(partsA.length, partsB.length);
    // At least 80% of name parts match + DOB exact → accept (1-2 typo'd parts tolerated)
    if (maxParts > 0 && overlap / maxParts >= 0.8) return true;
  }

  return false;
}

function clubsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normalizeClubName(a);
  const nb = normalizeClubName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function countNameOverlap(a: string, b: string): number {
  const partsA = removeDiacritics(a).toLowerCase().split(/\s+/);
  const partsB = removeDiacritics(b).toLowerCase().split(/\s+/);
  return partsA.filter((p) => partsB.includes(p)).length;
}

function calcAgeFromDob(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const POSITION_MAP: Record<string, string> = {
  'guarda-redes': 'GR', 'goalkeeper': 'GR',
  'defesa direito': 'DD', 'lateral direito': 'DD', 'right back': 'DD',
  'defesa esquerdo': 'DE', 'lateral esquerdo': 'DE', 'left back': 'DE',
  'defesa central': 'DC', 'central defender': 'DC', 'centre back': 'DC',
  'médio defensivo': 'MDC', 'trinco': 'MDC', 'defensive midfielder': 'MDC', 'pivô': 'MDC',
  'médio centro': 'MC', 'médio': 'MC', 'central midfielder': 'MC', 'midfielder': 'MC',
  'médio ofensivo': 'MOC', 'meia ofensivo': 'MOC', 'attacking midfielder': 'MOC',
  'extremo direito': 'ED', 'ala direito': 'ED', 'right winger': 'ED',
  'extremo esquerdo': 'EE', 'ala esquerdo': 'EE', 'left winger': 'EE',
  'ponta de lança': 'PL', 'avançado': 'PL', 'avançado centro': 'PL', 'striker': 'PL', 'forward': 'PL',
  'médio direito': 'MD', 'right midfielder': 'MD',
  'médio esquerdo': 'ME', 'left midfielder': 'ME',
  'ala direita': 'AD', 'right wing-back': 'AD',
  'ala esquerda': 'AE', 'left wing-back': 'AE',
  'segundo avançado': 'SA', 'second striker': 'SA',
};

function normalizePosition(raw: string | null): string | null {
  if (!raw) return null;
  return POSITION_MAP[raw.toLowerCase().trim()] || null;
}

function normalizeCountry(name: string | null): string | null {
  if (!name) return null;
  const FIXES: Record<string, string> = {
    'guine bissau': 'Guiné-Bissau', 'guine-bissau': 'Guiné-Bissau', 'guiné bissau': 'Guiné-Bissau',
    'guine equatorial': 'Guiné Equatorial', 'guine': 'Guiné', 'guiné': 'Guiné',
    'cabo verde': 'Cabo Verde', 'sao tome e principe': 'São Tomé e Príncipe',
    'são tome e principe': 'São Tomé e Príncipe', 'mocambique': 'Moçambique', 'timor leste': 'Timor-Leste',
  };
  return FIXES[name.toLowerCase().trim()] || name;
}

/* ───────────── ZeroZero Profile Scraper ───────────── */

interface ZzData {
  fullName: string | null;
  dob: string | null;
  currentClub: string | null;
  currentTeam: string | null;
  photoUrl: string | null;
  clubLogoUrl: string | null;
  height: number | null;
  weight: number | null;
  nationality: string | null;
  birthCountry: string | null;
  position: string | null;
  foot: string | null;
  shirtNumber: number | null;
  gamesSeason: number | null;
  goalsSeason: number | null;
  teamHistory: { club: string; team?: string; season: string; games: number; goals: number }[];
}

async function fetchZeroZeroData(zzLink: string): Promise<ZzData | 'BLOCKED' | null> {
  try {
    const res = await fetch(zzLink, { headers: browserHeaders(), redirect: 'follow' });

    if (!res.ok || res.url.includes('recaptcha') || res.url.includes('captcha')) return 'BLOCKED';

    const buf = await res.arrayBuffer();
    const html = new TextDecoder('iso-8859-1').decode(buf);

    const hasMarkers = html.includes('card-data') || html.includes('ld+json') || html.includes('zz-enthdr');
    if (buf.byteLength === 0 || !hasMarkers) {
      if (html.includes('recaptcha') || html.includes('g-recaptcha')) return 'BLOCKED';
      return null;
    }

    const result: ZzData = {
      fullName: null, dob: null, currentClub: null, currentTeam: null,
      photoUrl: null, clubLogoUrl: null, height: null, weight: null,
      nationality: null, birthCountry: null, position: null, foot: null,
      shirtNumber: null, gamesSeason: null, goalsSeason: null, teamHistory: [],
    };

    /* ── JSON-LD ── */
    const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        if (typeof ld.image === 'string' && ld.image) result.photoUrl = ld.image;
        if (typeof ld.name === 'string' && ld.name) result.fullName = ld.name;
        if (ld.birthDate && typeof ld.birthDate === 'string') {
          const raw = ld.birthDate.trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(raw)) result.dob = raw.slice(0, 10);
          else { const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) result.dob = `${m[3]}-${m[2]}-${m[1]}`; }
        }
        if (ld.nationality) {
          if (typeof ld.nationality === 'string') result.nationality = ld.nationality;
          else if (typeof ld.nationality === 'object' && ld.nationality.name) result.nationality = ld.nationality.name;
        }
        if (ld.height) { const m = String(ld.height).match(/(\d+)/); if (m) result.height = parseInt(m[1], 10); }
        if (ld.weight) { const m = String(ld.weight).match(/(\d+)/); if (m) result.weight = parseInt(m[1], 10); }
        if (ld.worksFor) {
          if (typeof ld.worksFor === 'string' && ld.worksFor) {
            if (ld.worksFor.startsWith('[') || ld.worksFor.startsWith('{')) {
              try { const p = JSON.parse(ld.worksFor); result.currentClub = (Array.isArray(p) ? p[0] : p)?.name || null; }
              catch { const m = ld.worksFor.match(/name[":]+\s*([^,"}\]]+)/i); result.currentClub = m ? m[1].trim() : null; }
            } else result.currentClub = ld.worksFor;
          } else if (typeof ld.worksFor === 'object') {
            const org = Array.isArray(ld.worksFor) ? ld.worksFor[0] : ld.worksFor;
            result.currentClub = org?.name || null;
          }
        }
        if (ld.description && typeof ld.description === 'string') {
          const dc = ld.description.match(/Joga como\s+.+?\s+em\s+([^,\.]+)/);
          if (dc && !result.currentClub) result.currentClub = dc[1].trim();
          const dp = ld.description.match(/Joga(?:va)? como\s+([^,\.]+?)(?:\s+em\s+|\s*[,\.])/);
          if (dp) result.position = dp[1].trim();
        }
      } catch { /* JSON-LD parse failed */ }
    }

    /* ── HTML card-data helpers ── */
    function cardRowHtml(label: string): string | null {
      const re = new RegExp(`card-data__label">${label}</span>([\\s\\S]*?)(?=card-data__label|card-data__footer|card-data__header|$)`, 'i');
      const m = html.match(re); return m ? m[1] : null;
    }
    function cardValue(label: string): string | null {
      const b = cardRowHtml(label); if (!b) return null;
      const m = b.match(/card-data__value[^>]*>([^<]+)/); return m ? m[1].trim() : null;
    }
    function cardValues(label: string): string[] {
      const b = cardRowHtml(label); if (!b) return [];
      const vals: string[] = []; const re = /card-data__value[^>]*>([^<]+)/g; let m;
      while ((m = re.exec(b)) !== null) { const v = m[1].trim(); if (v) vals.push(v); } return vals;
    }
    function cardValueWithFlag(label: string): string | null {
      const b = cardRowHtml(label); if (!b) return null;
      const t = b.match(/class="text">([^<]+)/); if (t) return t[1].trim();
      const ti = b.match(/title="([^"]+)"/); if (ti) return ti[1].trim();
      const v = b.match(/card-data__value[^>]*>([^<]+)/); return v ? v[1].trim() : null;
    }
    function findNearby(keyword: string, pattern: RegExp): string | null {
      const i = html.indexOf(keyword); if (i < 0) return null;
      const m = html.slice(i, i + 500).match(pattern); return m ? m[1].trim() : null;
    }

    /* ── Extract fields ── */
    if (!result.fullName) result.fullName = cardValue('Nome');
    if (!result.fullName) { const m = html.match(/<h1[^>]*>(?:<[^>]+>)*\s*(?:\d+\.\s*)?([A-ZÀ-ÿ][^<]+)/i); if (m) result.fullName = m[1].trim(); }

    if (!result.dob) {
      const v = cardValue('Data de Nascimento') || cardValue('Nascimento');
      if (v) { const m = v.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/); if (m) result.dob = `${m[3]}-${m[2]}-${m[1]}`; else { const iso = v.match(/(\d{4})-(\d{2})-(\d{2})/); if (iso) result.dob = `${iso[1]}-${iso[2]}-${iso[3]}`; } }
    }
    if (!result.dob) { const n = findNearby('Nascimento', /(\d{4}-\d{2}-\d{2})/); if (n) result.dob = n; }

    const sidePos = cardValues('Posi[çc][ãa]o');
    if (sidePos.length > 0 && sidePos[0].length < 40) result.position = sidePos[0];

    if (!result.foot) {
      const f = cardValue('P[ée]\\s*[Pp]referencial') || cardValue('P[ée]');
      if (f) { const r = f.toLowerCase(); if (r.includes('direito')) result.foot = 'Dir'; else if (r.includes('esquerdo')) result.foot = 'Esq'; else if (r.includes('ambidextro') || r.includes('amb')) result.foot = 'Amb'; }
    }
    if (!result.foot) { const n = findNearby('referencial', />(Direito|Esquerdo|Ambidextro)</i); if (n) { const r = n.toLowerCase(); if (r.includes('direito')) result.foot = 'Dir'; else if (r.includes('esquerdo')) result.foot = 'Esq'; else if (r.includes('ambidextro')) result.foot = 'Amb'; } }

    if (!result.currentClub) result.currentClub = cardValueWithFlag('Clube atual') || cardValueWithFlag('Clube');
    if (!result.currentClub) { const m = html.match(/class="zz-enthdr-club"[^>]*>([^<]+)/); if (m && m[1].trim() !== 'Sem Equipa') result.currentClub = m[1].trim(); }

    if (!result.nationality) result.nationality = cardValueWithFlag('Nacionalidade');
    if (!result.nationality) { const n = findNearby('Nacionalidade', /class="text">([^<]+)/); if (n) result.nationality = n; }
    if (!result.birthCountry) result.birthCountry = cardValueWithFlag('Pa[ií]s de Nascimento') || cardValueWithFlag('Pa[ií]s');
    if (!result.birthCountry) { const n = findNearby('Nascimento', /class="text">([^<]+)/); if (n && !/\d/.test(n)) result.birthCountry = n; }
    if (!result.birthCountry && result.nationality) result.birthCountry = result.nationality;

    if (!result.height) { const v = cardValue('Altura'); if (v) { const m = v.match(/(\d{2,3})/); if (m) result.height = parseInt(m[1], 10); } }
    if (!result.height) { const n = findNearby('Altura', /(\d{2,3})\s*(?:cm)?/); if (n) result.height = parseInt(n, 10); }
    if (!result.weight) { const v = cardValue('Peso'); if (v) { const m = v.match(/(\d{2,3})/); if (m) result.weight = parseInt(m[1], 10); } }
    if (!result.weight) { const n = findNearby('Peso', /(\d{2,3})\s*(?:kg)?/); if (n) result.weight = parseInt(n, 10); }

    const logoM = html.match(/zz-enthdr-club[\s\S]*?<img[^>]*src="(\/img\/logos\/equipas\/[^"]+)"/);
    if (logoM) result.clubLogoUrl = `https://www.zerozero.pt${logoM[1]}`;
    if (!result.clubLogoUrl) { const sb = cardRowHtml('Clube atual') || cardRowHtml('Clube'); if (sb) { const m = sb.match(/<img[^>]*src="(\/img\/logos\/equipas\/[^"]+)"/); if (m) result.clubLogoUrl = `https://www.zerozero.pt${m[1]}`; } }

    if (!result.photoUrl) { const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/); if (m && /jogadores/i.test(m[1])) result.photoUrl = m[1]; }
    if (!result.photoUrl) { const m = html.match(/src="([^"]*(?:cdn-img\.zerozero\.pt|zerozero\.pt)\/img\/jogadores\/[^"]+)"/); if (m) result.photoUrl = m[1]; }
    if (result.photoUrl && result.photoUrl.startsWith('//')) result.photoUrl = 'https:' + result.photoUrl;

    if (result.height === 0) result.height = null;
    if (result.weight === 0) result.weight = null;

    /* ── Career history ── */
    const trIdx = html.search(/Transfer[eê]ncias/i);
    const cHtml = trIdx > 0 ? html.slice(0, trIdx) : html;
    const rows = cHtml.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    let latestG: number | null = null, latestGo: number | null = null, isFirst = true, curSeason: string | null = null;

    for (const row of rows) {
      const rh = row[0];
      if (!rh.includes('micrologo_and_text')) continue;
      const tds = [...rh.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
      if (tds.length < 4) continue;
      const sm = tds[1].match(/(20\d{2}\/\d{2})/); if (sm) curSeason = sm[1]; if (!curSeason) continue;
      const cm = tds[2].match(/<a[^>]*>([^<]+)<\/a>/); const club = cm ? cm[1].trim() : ''; if (!club) continue;
      const tm = tds[2].match(/\[([^\]]+)\]/); const team = tm ? tm[1].trim() : undefined;
      const gText = tds[3].replace(/<[^>]+>/g, '').trim(); const gN = gText.match(/^(\d+)$/); const games = gN ? parseInt(gN[1], 10) : 0;
      const goText = tds.length > 4 ? tds[4].replace(/<[^>]+>/g, '').trim() : ''; const goN = goText.match(/^(\d+)$/); const goals = goN ? parseInt(goN[1], 10) : 0;
      if (isFirst) { result.currentTeam = club; latestG = games; latestGo = goals; isFirst = false; }
      result.teamHistory.push({ club, ...(team ? { team } : {}), season: curSeason, games, goals });
    }
    result.gamesSeason = latestG; result.goalsSeason = latestGo;

    return result;
  } catch (e) {
    if (e instanceof Error && e.message === 'ZZ_BLOCKED') return 'BLOCKED';
    return null;
  }
}

/* ───────────── ZeroZero Link Finder (autocomplete + DOB verification) ───────────── */

interface ZzCandidate {
  url: string;
  name: string;
  age: number | null;
  club: string | null;
}

function parseAutocompleteResults(html: string): ZzCandidate[] {
  const candidates: ZzCandidate[] = [];
  const linkRegex = /href="(\/jogador\/[^"?]+)[^"]*"[\s\S]*?<span>([^<]*)<\/span>/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const info = match[2];
    const parts = info.split('|').map((p) => p.trim());
    if (!parts[0]?.includes('Jogador')) continue;
    const ageMatch = info.match(/(\d+)\s*anos/);
    const age = ageMatch ? parseInt(ageMatch[1], 10) : null;
    const clubPart = parts.length >= 4 ? parts[3] : null;
    const club = clubPart ? clubPart.replace(/\s*\[.*\]/, '').trim() : null;
    const nameMatch = match[0].match(/class="text">([^<]+)/);
    const name = nameMatch ? nameMatch[1].trim() : '';
    candidates.push({ url: `https://www.zerozero.pt${url}`, name, age, club });
  }
  return candidates;
}

async function searchAutocomplete(query: string): Promise<ZzCandidate[] | 'BLOCKED'> {
  try {
    const res = await fetch(
      `https://www.zerozero.pt/jqc_search_search.php?queryString=${encodeURIComponent(query)}`,
      {
        headers: browserHeaders({
          'X-Requested-With': 'XMLHttpRequest',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        }),
      },
    );
    if (!res.ok || res.url.includes('recaptcha') || res.url.includes('captcha')) return 'BLOCKED';
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return 'BLOCKED';
    const html = new TextDecoder('utf-8').decode(buf);
    const hasResults = html.includes('/jogador/') || html.includes('searchresults');
    if (!hasResults && (html.includes('recaptcha') || html.includes('g-recaptcha'))) return 'BLOCKED';
    return parseAutocompleteResults(html);
  } catch {
    return 'BLOCKED';
  }
}

function shortlistCandidates(candidates: ZzCandidate[], expectedAge: number, expectedClub: string | null, fullName: string): ZzCandidate[] {
  const fullParts = removeDiacritics(fullName).toLowerCase().split(/\s+/);

  const scored = candidates
    .filter((c) => c.age !== null && Math.abs(c.age - expectedAge) <= 1)
    .map((c) => {
      let score = 0;
      if (c.age === expectedAge) score += 3;
      if (c.club && expectedClub && clubsMatch(c.club, expectedClub)) score += 5;
      const candidateParts = removeDiacritics(c.name).toLowerCase().split(/\s+/);
      score += candidateParts.filter((p) => fullParts.includes(p)).length * 2;
      return { candidate: c, score };
    });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.candidate);
}

/** Build name search variants — most specific to least specific */
function nameVariants(fullName: string): string[] {
  const parts = fullName.trim().split(/\s+/);
  const variants: string[] = [];
  const seen = new Set<string>();
  const add = (v: string | null) => { if (v && !seen.has(v)) { seen.add(v); variants.push(v); } };

  if (parts.length <= 3) add(fullName);
  // First + second + last
  if (parts.length >= 4) add(`${parts[0]} ${parts[1]} ${parts[parts.length - 1]}`);
  // First + last
  if (parts.length >= 2) add(`${parts[0]} ${parts[parts.length - 1]}`);
  // First + second-to-last
  if (parts.length > 3) add(`${parts[0]} ${parts[parts.length - 2]}`);
  // Last name only
  if (parts.length >= 3) add(parts[parts.length - 1]);

  return variants;
}

/* ───────────── DuckDuckGo Search (primary strategy for link finding) ───────────── */

/** Search DuckDuckGo Lite for a ZZ profile link using full name + club.
 *  DDG Lite doesn't support quotes or site: operator well — use plain keywords + zerozero.pt */
async function searchDuckDuckGo(fullName: string, club: string | null): Promise<string[]> {
  try {
    const clubPart = club ? ` ${club}` : '';
    const query = `${fullName}${clubPart} zerozero.pt`;
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': randomUA() },
    });
    if (!res.ok) return [];
    const html = await res.text();

    // DDG Lite encodes URLs: zerozero.pt%2Fjogador%2Fslug%2FID
    // Extract from both raw and URL-encoded formats
    const seen = new Set<string>();
    const urls: string[] = [];

    // Pattern 1: URL-encoded in href (uddg redirect param)
    for (const m of html.matchAll(/zerozero\.pt%2Fjogador%2F([^&"'\s]+)/g)) {
      const decoded = decodeURIComponent(m[1]).split('?')[0];
      const base = decoded.match(/^([a-z0-9-]+\/\d+)/);
      if (base && !seen.has(base[1])) {
        seen.add(base[1]);
        urls.push(`https://www.zerozero.pt/jogador/${base[1]}`);
      }
    }

    // Pattern 2: plain text URLs in result snippets
    for (const m of html.matchAll(/zerozero\.pt\/jogador\/([^"&\s<]+)/g)) {
      const rawPath = m[1].split('?')[0];
      const base = rawPath.match(/^([a-z0-9-]+\/\d+)/);
      if (base && !seen.has(base[1])) {
        seen.add(base[1]);
        urls.push(`https://www.zerozero.pt/jogador/${base[1]}`);
      }
    }

    return urls.slice(0, 3); // Max 3 candidates
  } catch {
    return [];
  }
}

/** Search DDG with progressive fallbacks:
 *  1. full name + club + zerozero.pt — most specific
 *  2. full name + zerozero.pt — no club (handles transfers)
 *  3. first+last name + club + zerozero.pt — shorter name, more results */
async function searchDdgWithFallback(fullName: string, club: string | null): Promise<string[]> {
  // 1. Full name + club
  const results = await searchDuckDuckGo(fullName, club);
  if (results.length > 0) return results;

  // 2. Full name without club
  if (club) {
    await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
    const results2 = await searchDuckDuckGo(fullName, null);
    if (results2.length > 0) return results2;
  }

  // 3. First + last name + club
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 2) {
    await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
    const shortName = `${parts[0]} ${parts[parts.length - 1]}`;
    return searchDuckDuckGo(shortName, club);
  }

  return [];
}

/** Find the ZZ link for a player — DDG first, then ZZ autocomplete fallback.
 *  Returns the ZZ URL if found with DOB-confirmed match, null otherwise. */
async function findZzLink(
  fullName: string,
  club: string | null,
  dob: string,
): Promise<{ url: string; zzData: ZzData } | 'BLOCKED' | null> {
  const expectedAge = calcAgeFromDob(dob);

  // Strategy 1: DuckDuckGo — "nome completo" clube site:zerozero.pt
  const ddgUrls = await searchDdgWithFallback(fullName, club);

  if (ddgUrls.length > 0) {
    // Verify each DDG candidate by scraping profile to check DOB
    for (const candidateUrl of ddgUrls) {
      await randomDelay(VERIFY_DELAY_MIN, VERIFY_DELAY_MAX);
      const zzData = await fetchZeroZeroData(candidateUrl);
      if (zzData === 'BLOCKED') return 'BLOCKED';
      if (!zzData) continue;
      if (zzData.dob === dob) return { url: candidateUrl, zzData };
      // DOB doesn't match → try next DDG result
    }
  }

  // Strategy 2: ZZ autocomplete — fallback if DDG found nothing or DOB didn't match
  await randomDelay(SEARCH_DELAY_MIN, SEARCH_DELAY_MAX);

  const variants = nameVariants(fullName);
  const allCandidates: ZzCandidate[] = [];
  const seenUrls = new Set<string>(ddgUrls); // Skip URLs already verified via DDG

  for (let i = 0; i < variants.length; i++) {
    if (i > 0) await randomDelay(SEARCH_DELAY_MIN, SEARCH_DELAY_MAX);

    const results = await searchAutocomplete(variants[i]);
    if (results === 'BLOCKED') return 'BLOCKED';

    for (const c of results) {
      if (!seenUrls.has(c.url)) { seenUrls.add(c.url); allCandidates.push(c); }
    }

    // Early exit if we have a high-confidence candidate
    const shortlisted = shortlistCandidates(allCandidates, expectedAge, club, fullName);
    if (shortlisted.length > 0) {
      const best = shortlisted[0];
      const hasClubMatch = best.club && club && clubsMatch(best.club, club);
      const hasStrongName = countNameOverlap(best.name, fullName) >= 2 && best.age === expectedAge;
      if (hasClubMatch || hasStrongName) break;
    }
  }

  const shortlisted = shortlistCandidates(allCandidates, expectedAge, club, fullName);
  if (shortlisted.length === 0) return null;

  // Verify best candidates by scraping their profile to check exact DOB
  for (const candidate of shortlisted) {
    await randomDelay(VERIFY_DELAY_MIN, VERIFY_DELAY_MAX);

    const zzData = await fetchZeroZeroData(candidate.url);
    if (zzData === 'BLOCKED') return 'BLOCKED';
    if (!zzData) continue;

    if (zzData.dob === dob) {
      return { url: candidate.url, zzData };
    }
  }

  return null;
}

/* ───────────── Phase 1: Find ZZ Links ───────────── */

async function runFindLinks() {
  console.log(`\n🔍 FASE 1: Encontrar links ZeroZero\n`);

  const { count } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', CLUB_ID!)
    .is('zerozero_link', null)
    .not('dob', 'is', null)
    .not('name', 'is', null);

  // Also count empty-string links
  const { count: count2 } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', CLUB_ID!)
    .eq('zerozero_link', '')
    .not('dob', 'is', null)
    .not('name', 'is', null);

  const total = (count ?? 0) + (count2 ?? 0);
  console.log(`📊 Jogadores sem ZZ link (com nome + DOB): ${total}`);
  if (START_OFFSET > 0) console.log(`⏩ A começar no offset ${START_OFFSET}`);
  console.log();

  let offset = START_OFFSET;
  let found = 0;
  let notFound = 0;
  let blocked = 0;
  let errors = 0;
  const startTime = Date.now();

  while (true) {
    // Fetch players without ZZ link (null OR empty string)
    const { data: playersNull } = await supabase
      .from('players')
      .select('id, name, dob, club, photo_url, nationality, birth_country, height, weight, foot, position_normalized, club_logo_url')
      .eq('club_id', CLUB_ID!)
      .is('zerozero_link', null)
      .not('dob', 'is', null)
      .not('name', 'is', null)
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1);

    const { data: playersEmpty } = await supabase
      .from('players')
      .select('id, name, dob, club, photo_url, nationality, birth_country, height, weight, foot, position_normalized, club_logo_url')
      .eq('club_id', CLUB_ID!)
      .eq('zerozero_link', '')
      .not('dob', 'is', null)
      .not('name', 'is', null)
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1);

    // Merge and deduplicate
    const seenIds = new Set<number>();
    const players: typeof playersNull = [];
    for (const p of [...(playersNull || []), ...(playersEmpty || [])]) {
      if (!seenIds.has(p.id)) { seenIds.add(p.id); players.push(p); }
    }
    // Limit to batch size
    const batch = players.slice(0, BATCH_SIZE);
    if (batch.length === 0) break;

    for (const player of batch) {
      try {
        const result = await findZzLink(player.name!, player.club, player.dob!);

        if (result === 'BLOCKED') {
          blocked++;
          await handleBlock(player.name!);
          continue;
        }

        resetBlocks();

        if (!result) {
          notFound++;
          console.log(`  ⬜ ${player.name} — não encontrado`);
          await randomDelay(PAGE_DELAY_MIN, PAGE_DELAY_MAX);
          continue;
        }

        // Found + DOB-verified! Save link + scrape data
        const { url, zzData } = result;
        const idMatch = url.match(/\/jogador\/[^/]+\/(\d+)/);
        const zzPlayerId = idMatch ? idMatch[1] : '';

        // Build full update — link + all ZZ data + auto-apply empty fields
        const updates: Record<string, unknown> = {
          zerozero_link: url,
          zerozero_player_id: zzPlayerId,
          zz_current_club: zzData.currentClub,
          zz_current_team: zzData.currentTeam,
          zz_games_season: zzData.gamesSeason,
          zz_goals_season: zzData.goalsSeason,
          zz_height: zzData.height,
          zz_weight: zzData.weight,
          zz_team_history: zzData.teamHistory.length > 0 ? zzData.teamHistory : null,
          zz_last_checked: new Date().toISOString(),
        };
        if (zzData.photoUrl) updates.zz_photo_url = zzData.photoUrl;

        const changes: string[] = [];

        // Auto-apply to main fields only if player is missing the data
        if (zzData.photoUrl && !player.photo_url) { updates.photo_url = zzData.photoUrl; changes.push('foto'); }
        if (zzData.clubLogoUrl && !player.club_logo_url) { updates.club_logo_url = zzData.clubLogoUrl; changes.push('logo'); }
        if (zzData.height && !player.height) { updates.height = zzData.height; changes.push(`alt→${zzData.height}cm`); }
        if (zzData.weight && !player.weight) { updates.weight = zzData.weight; changes.push(`peso→${zzData.weight}kg`); }
        if (zzData.nationality && !player.nationality) { updates.nationality = normalizeCountry(zzData.nationality); changes.push(`nac→${updates.nationality}`); }
        if (zzData.birthCountry && !player.birth_country) { updates.birth_country = normalizeCountry(zzData.birthCountry); changes.push(`país→${updates.birth_country}`); }
        if (zzData.foot && !player.foot) { updates.foot = zzData.foot; changes.push(`pé→${zzData.foot}`); }
        if (zzData.position && !player.position_normalized) {
          const norm = normalizePosition(zzData.position);
          if (norm) { updates.position_normalized = norm; changes.push(`pos→${norm}`); }
        }

        if (!DRY_RUN) {
          await supabase.from('players').update(updates).eq('id', player.id).eq('club_id', CLUB_ID!);
        }

        found++;
        const extra = changes.length > 0 ? ` + ${changes.join(', ')}` : '';
        const history = zzData.teamHistory.length > 0 ? `, ${zzData.teamHistory.length} épocas` : '';
        console.log(`  ✅ ${player.name} → ${zzData.fullName || '?'} (${zzData.currentClub || '?'})${history}${extra}`);

        await randomDelay(PAGE_DELAY_MIN, PAGE_DELAY_MAX);
      } catch (err) {
        errors++;
        console.log(`  ❌ ${player.name} — ${err instanceof Error ? err.message : 'unknown'}`);
        await randomDelay(PAGE_DELAY_MIN, PAGE_DELAY_MAX);
      }
    }

    offset += batch.length;

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const rate = offset > 0 ? (offset / ((Date.now() - startTime) / 1000 / 60)).toFixed(1) : '0';
    const eta = parseFloat(rate) > 0 ? ((total - offset) / parseFloat(rate)).toFixed(0) : '?';

    console.log(`\n📦 Find — ${offset}/${total} | ✅ ${found} encontrados | ⬜ ${notFound} não encontrados | ❌ ${errors} erros | 🛑 ${blocked} bloqueios`);
    console.log(`   ⏱️  ${elapsed}min | ~${rate}/min | ETA ~${eta}min\n`);

    if (offset >= total) break;
    await randomDelay(BATCH_PAUSE_MIN, BATCH_PAUSE_MAX);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n🔍 Fase 1 concluída em ${totalTime}min — ${found} links encontrados, ${notFound} não encontrados, ${errors} erros, ${blocked} bloqueios\n`);
  return found;
}

/* ───────────── Phase 2: Scrape Data for Existing ZZ Links ───────────── */

async function runScrapeData() {
  console.log(`\n📊 FASE 2: Scrape dados ZeroZero\n`);

  const { count } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', CLUB_ID!)
    .not('zerozero_link', 'is', null)
    .neq('zerozero_link', '');

  const total = count ?? 0;
  console.log(`📊 Jogadores com ZZ link: ${total}`);
  if (START_OFFSET > 0 && MODE === 'scrape') console.log(`⏩ A começar no offset ${START_OFFSET}`);
  console.log();

  let offset = MODE === 'scrape' ? START_OFFSET : 0;
  let updated = 0;
  let skipped = 0;
  let blocked = 0;
  let errors = 0;
  const startTime = Date.now();

  while (true) {
    const { data: players } = await supabase
      .from('players')
      .select('id, name, zerozero_link, club, photo_url, zz_photo_url, nationality, birth_country, height, weight, foot, position_normalized, club_logo_url')
      .eq('club_id', CLUB_ID!)
      .not('zerozero_link', 'is', null)
      .neq('zerozero_link', '')
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1);

    if (!players || players.length === 0) break;

    for (const player of players) {
      try {
        const data = await fetchZeroZeroData(player.zerozero_link!);

        if (data === 'BLOCKED') {
          blocked++;
          await handleBlock(player.name!);
          continue;
        }
        resetBlocks();

        if (!data) { errors++; console.log(`  ❌ ${player.name} — sem dados`); await randomDelay(PAGE_DELAY_MIN, PAGE_DELAY_MAX); continue; }

        const updates: Record<string, unknown> = {
          zz_current_club: data.currentClub, zz_current_team: data.currentTeam,
          zz_games_season: data.gamesSeason, zz_goals_season: data.goalsSeason,
          zz_height: data.height, zz_weight: data.weight,
          zz_team_history: data.teamHistory.length > 0 ? data.teamHistory : null,
          zz_last_checked: new Date().toISOString(),
        };
        if (data.photoUrl) updates.zz_photo_url = data.photoUrl;

        const changes: string[] = [];
        if (data.photoUrl && !player.photo_url) { updates.photo_url = data.photoUrl; changes.push('foto'); }
        if (data.clubLogoUrl && !player.club_logo_url) { updates.club_logo_url = data.clubLogoUrl; changes.push('logo'); }
        if (data.height && !player.height) { updates.height = data.height; changes.push(`alt→${data.height}cm`); }
        if (data.weight && !player.weight) { updates.weight = data.weight; changes.push(`peso→${data.weight}kg`); }
        if (data.nationality && !player.nationality) { updates.nationality = normalizeCountry(data.nationality); changes.push(`nac→${updates.nationality}`); }
        if (data.birthCountry && !player.birth_country) { updates.birth_country = normalizeCountry(data.birthCountry); changes.push(`país→${updates.birth_country}`); }
        if (data.foot && !player.foot) { updates.foot = data.foot; changes.push(`pé→${data.foot}`); }
        if (data.position && !player.position_normalized) { const n = normalizePosition(data.position); if (n) { updates.position_normalized = n; changes.push(`pos→${n}`); } }

        if (!DRY_RUN) await supabase.from('players').update(updates).eq('id', player.id).eq('club_id', CLUB_ID!);

        updated++;
        const allChanges = [...changes];
        if (data.currentClub) allChanges.unshift(`clube_zz→${data.currentClub}`);
        if (data.teamHistory.length > 0) allChanges.push(`${data.teamHistory.length} épocas`);

        if (allChanges.length > 0) console.log(`  ✅ ${player.name} — ${allChanges.join(', ')}`);
        else skipped++;

        await randomDelay(PAGE_DELAY_MIN, PAGE_DELAY_MAX);
      } catch (err) {
        errors++;
        console.log(`  ❌ ${player.name} — ${err instanceof Error ? err.message : 'unknown'}`);
        await randomDelay(PAGE_DELAY_MIN, PAGE_DELAY_MAX);
      }
    }

    offset += players.length;
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const rate = offset > 0 ? (offset / ((Date.now() - startTime) / 1000 / 60)).toFixed(1) : '0';
    const eta = parseFloat(rate) > 0 ? ((total - offset) / parseFloat(rate)).toFixed(0) : '?';

    console.log(`\n📦 Scrape — ${offset}/${total} | ✅ ${updated} | ⏭️ ${skipped} | ❌ ${errors} | 🛑 ${blocked}`);
    console.log(`   ⏱️  ${elapsed}min | ~${rate}/min | ETA ~${eta}min\n`);

    if (offset >= total) break;
    await randomDelay(BATCH_PAUSE_MIN, BATCH_PAUSE_MAX);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n📊 Fase 2 concluída em ${totalTime}min — ${updated} atualizados, ${skipped} sem alteração, ${errors} erros, ${blocked} bloqueios\n`);
}

/* ───────────── Phase DDG: Find ZZ links via DuckDuckGo only (zero ZZ requests) ───────────── */

/** Extract ZZ profile URLs from DDG Lite HTML */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for future DDG-based ZZ link discovery
function extractZzUrlsFromDdg(html: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  // URL-encoded links in DDG redirect params
  for (const m of html.matchAll(/zerozero\.pt%2Fjogador%2F([^&"'\s]+)/g)) {
    const decoded = decodeURIComponent(m[1]).split('?')[0];
    const base = decoded.match(/^([a-z0-9-]+\/\d+)/);
    if (base && !seen.has(base[1])) { seen.add(base[1]); urls.push(`https://www.zerozero.pt/jogador/${base[1]}`); }
  }
  // Plain text URLs in snippets
  for (const m of html.matchAll(/zerozero\.pt\/jogador\/([^"&\s<]+)/g)) {
    const raw = m[1].split('?')[0];
    const base = raw.match(/^([a-z0-9-]+\/\d+)/);
    if (base && !seen.has(base[1])) { seen.add(base[1]); urls.push(`https://www.zerozero.pt/jogador/${base[1]}`); }
  }
  return urls.slice(0, 3);
}

/** Candidate from DDG: a ZZ player URL paired with its snippet name + DOB */
interface DdgCandidate {
  url: string;
  name: string | null;
  dob: string | null;
  club: string | null;
}

/** Extract ALL ZZ player candidates from DDG Lite HTML, each paired with its snippet data.
 *  Returns multiple candidates when DDG shows multiple ZZ results (e.g. homonyms). */
function extractDdgCandidates(html: string): DdgCandidate[] {
  const candidates: DdgCandidate[] = [];
  const seenUrls = new Set<string>();

  // Split into result blocks (each starts with a numbered result)
  const blocks = html.split(/(?=<td\s+valign="top">\s*\d+)/);

  for (const block of blocks) {
    // Must contain a ZZ jogador link
    const urlMatch = block.match(/zerozero\.pt%2Fjogador%2F([^&"'\s]+)/) ||
                     block.match(/zerozero\.pt\/jogador\/([^"&\s<]+)/);
    if (!urlMatch) continue;

    const rawPath = decodeURIComponent(urlMatch[1]).split('?')[0];
    const base = rawPath.match(/^([a-z0-9-]+\/\d+)/);
    if (!base || seenUrls.has(base[1])) continue;
    seenUrls.add(base[1]);

    const url = `https://www.zerozero.pt/jogador/${base[1]}`;

    // Extract name from snippet in this block: "Name é um jogador"
    const snippetMatch = block.match(/class='result-snippet'>\s*([\s\S]*?)\s*é\s+um/i);
    const name = snippetMatch
      ? snippetMatch[1].replace(/<\/?b>/g, '').replace(/\s+/g, ' ').replace(/\s*::.*$/, '').trim()
      : null;

    // Extract DOB from this block's snippet
    const dobMatch = block.match(/nascido\s+em\s+(\d{4}-\d{2}-\d{2})/i);
    const dob = dobMatch ? dobMatch[1] : null;

    // Extract club from title: "Name :: 2025/2026 - ClubName - Ficha e ..."
    // Or from snippet: "Joga como ... em ClubName, Portugal"
    let club: string | null = null;
    const titleMatch = block.match(/result-link'>([^<]+)/);
    if (titleMatch) {
      // Title format: "Name :: 2025/2026 - Club - Ficha..."  or  "Name - Club - Ficha..."
      const titleParts = titleMatch[1].split(' - ');
      if (titleParts.length >= 3) {
        club = titleParts[titleParts.length - 2].trim();
        // Clean up "Ficha e Estatísticas..." if it leaked
        if (club.includes('Ficha') || club.includes('zerozero')) club = null;
      }
    }
    if (!club) {
      const clubSnippet = block.match(/Joga\s+como\s+\w+\s+em\s+([^,<]+)/i);
      if (clubSnippet) club = clubSnippet[1].replace(/<\/?b>/g, '').trim();
    }

    candidates.push({ url, name, dob, club });
  }

  return candidates;
}

async function runDdgLinkFind() {
  console.log(`\n🔎 DDG: Encontrar links ZeroZero via DuckDuckGo (zero pedidos ao ZZ)\n`);

  // Count players without ZZ link
  const { count: countNull } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', CLUB_ID!)
    .is('zerozero_link', null)
    .not('dob', 'is', null)
    .not('name', 'is', null);

  const { count: countEmpty } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', CLUB_ID!)
    .eq('zerozero_link', '')
    .not('dob', 'is', null)
    .not('name', 'is', null);

  const total = (countNull ?? 0) + (countEmpty ?? 0);
  console.log(`📊 Jogadores sem ZZ link (com nome + DOB): ${total}`);
  if (START_OFFSET > 0) console.log(`⏩ A começar no offset ${START_OFFSET}`);
  console.log();

  let offset = START_OFFSET;
  let found = 0;
  let notFound = 0;
  let noMatch = 0;
  let errors = 0;
  const startTime = Date.now();

  while (true) {
    // Fetch batch: null OR empty zerozero_link
    const { data: playersNull } = await supabase
      .from('players')
      .select('id, name, dob, club')
      .eq('club_id', CLUB_ID!)
      .is('zerozero_link', null)
      .not('dob', 'is', null)
      .not('name', 'is', null)
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1);

    const { data: playersEmpty } = await supabase
      .from('players')
      .select('id, name, dob, club')
      .eq('club_id', CLUB_ID!)
      .eq('zerozero_link', '')
      .not('dob', 'is', null)
      .not('name', 'is', null)
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1);

    // Merge + deduplicate
    const seenIds = new Set<number>();
    const players: typeof playersNull = [];
    for (const p of [...(playersNull || []), ...(playersEmpty || [])]) {
      if (!seenIds.has(p.id)) { seenIds.add(p.id); players.push(p); }
    }
    const batch = players.slice(0, BATCH_SIZE);
    if (batch.length === 0) break;

    for (const player of batch) {
      try {
        // DDG search: name + club + zerozero.pt
        const clubPart = player.club ? ` ${player.club}` : '';
        const query = `${player.name}${clubPart} zerozero.pt`;
        const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        let res = await fetch(ddgUrl, { headers: { 'User-Agent': randomUA() } });

        // DDG returns 202 when rate limited — wait and retry once
        if (res.status === 202) {
          console.log(`  ⏳ ${player.name} — DDG rate limit, pausa 30s...`);
          await new Promise((r) => setTimeout(r, 30_000));
          res = await fetch(ddgUrl, { headers: { 'User-Agent': randomUA() } });
        }

        if (!res.ok && res.status !== 200) {
          errors++;
          console.log(`  ❌ ${player.name} — DDG erro ${res.status}`);
          await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
          continue;
        }

        const html = await res.text();
        const candidates = extractDdgCandidates(html);

        // Try all candidates — find one with matching name + DOB
        let matched = false;
        if (candidates.length > 0) {
          for (const c of candidates) {
            if (isConfirmedMatch(c, player.name!, player.dob!, player.club)) {
              const idMatch = c.url.match(/\/jogador\/[^/]+\/(\d+)/);
              const zzPlayerId = idMatch ? idMatch[1] : '';
              if (!DRY_RUN) {
                await supabase.from('players').update({
                  zerozero_link: c.url,
                  zerozero_player_id: zzPlayerId,
                }).eq('id', player.id).eq('club_id', CLUB_ID!);
              }
              found++;
              console.log(`  ✅ ${player.name} → ${c.url}`);
              matched = true;
              break;
            }
          }
          if (!matched) {
            // Fallback: try without club
            await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
            const query2 = `${player.name} zerozero.pt`;
            let res2 = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query2)}`, { headers: { 'User-Agent': randomUA() } });
            if (res2.status === 202) {
              await new Promise((r) => setTimeout(r, 30_000));
              res2 = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query2)}`, { headers: { 'User-Agent': randomUA() } });
            }
            if (res2.ok) {
              const html2 = await res2.text();
              const candidates2 = extractDdgCandidates(html2);
              for (const c of candidates2) {
                const nameOk = c.name ? playerNamesMatch(c.name, player.name!) : false;
                const dobOk = c.dob === player.dob;
                if (nameOk && dobOk) {
                  const idMatch = c.url.match(/\/jogador\/[^/]+\/(\d+)/);
                  const zzPlayerId = idMatch ? idMatch[1] : '';
                  if (!DRY_RUN) {
                    await supabase.from('players').update({ zerozero_link: c.url, zerozero_player_id: zzPlayerId }).eq('id', player.id).eq('club_id', CLUB_ID!);
                  }
                  found++;
                  console.log(`  ✅ ${player.name} → ${c.url} (fallback sem clube)`);
                  matched = true;
                  break;
                }
              }
            }
            if (!matched) {
              noMatch++;
              const first = candidates[0];
              if (first.name && !playerNamesMatch(first.name, player.name!)) console.log(`  ⬜ ${player.name} — nome não bate (ZZ: ${first.name})`);
              else if (first.dob && first.dob !== player.dob) console.log(`  ⬜ ${player.name} — DOB não bate (DB: ${player.dob}, ZZ: ${first.dob})`);
              else console.log(`  ⬜ ${player.name} — ${candidates.length} candidatos, nenhum bate`);
            }
          }
        } else {
          // No ZZ URLs at all — try fallback without club
          await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
          const query2 = `${player.name} zerozero.pt`;
          let res2 = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query2)}`, { headers: { 'User-Agent': randomUA() } });
          if (res2.status === 202) {
            await new Promise((r) => setTimeout(r, 30_000));
            res2 = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query2)}`, { headers: { 'User-Agent': randomUA() } });
          }
          if (res2.ok) {
            const html2 = await res2.text();
            const candidates2 = extractDdgCandidates(html2);
            for (const c of candidates2) {
              const nameOk = c.name ? playerNamesMatch(c.name, player.name!) : false;
              const dobOk = c.dob === player.dob;
              if (nameOk && dobOk) {
                const idMatch = c.url.match(/\/jogador\/[^/]+\/(\d+)/);
                const zzPlayerId = idMatch ? idMatch[1] : '';
                if (!DRY_RUN) {
                  await supabase.from('players').update({ zerozero_link: c.url, zerozero_player_id: zzPlayerId }).eq('id', player.id).eq('club_id', CLUB_ID!);
                }
                found++;
                console.log(`  ✅ ${player.name} → ${c.url} (fallback sem clube)`);
                matched = true;
                break;
              }
            }
          }
          if (!matched) {
            notFound++;
            console.log(`  ⬜ ${player.name} — sem resultados DDG`);
          }
        }

        await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
      } catch (err) {
        errors++;
        console.log(`  ❌ ${player.name} — ${err instanceof Error ? err.message : 'unknown'}`);
        await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
      }
    }

    offset += batch.length;

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const processed = found + notFound + noMatch + errors;
    const rate = processed > 0 ? (processed / ((Date.now() - startTime) / 1000 / 60)).toFixed(1) : '0';
    const eta = parseFloat(rate) > 0 ? ((total - offset) / parseFloat(rate)).toFixed(0) : '?';

    console.log(`\n📦 DDG — ${offset}/${total} | ✅ ${found} links | ⬜ ${notFound} sem DDG | 🔀 ${noMatch} não bate | ❌ ${errors} erros`);
    console.log(`   ⏱️  ${elapsed}min | ~${rate}/min | ETA ~${eta}min\n`);

    if (offset >= total) break;
    // Short batch pause — DDG is tolerant
    await randomDelay(5_000, 15_000);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n🔎 DDG concluído em ${totalTime}min — ${found} links encontrados, ${notFound} sem resultados, ${noMatch} não confirmados, ${errors} erros\n`);
}

/* ───────────── Main ───────────── */

async function main() {
  if (!CLUB_ID && CLUB_NAME) {
    const { data } = await supabase.from('clubs').select('id').ilike('name', `%${CLUB_NAME}%`).single();
    if (!data) { console.error(`Club "${CLUB_NAME}" not found`); process.exit(1); }
    CLUB_ID = data.id;
    console.log(`Club: ${CLUB_NAME} → ${CLUB_ID}`);
  }
  if (!CLUB_ID) { console.error('Usage: CLUB_NAME=Boavista MODE=all npx tsx scripts/bulk_zz_update.ts'); process.exit(1); }

  console.log(`\n🔄 Bulk ZeroZero — MODE=${MODE}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`⏱️  Page delays: ${PAGE_DELAY_MIN / 1000}-${PAGE_DELAY_MAX / 1000}s | Search delays: ${SEARCH_DELAY_MIN / 1000}-${SEARCH_DELAY_MAX / 1000}s | Batch pauses: ${BATCH_PAUSE_MIN / 1000}-${BATCH_PAUSE_MAX / 1000}s`);

  if (MODE === 'ddg') {
    await runDdgLinkFind();
  }

  if (MODE === 'find' || MODE === 'all') {
    await runFindLinks();
  }

  if (MODE === 'scrape' || MODE === 'all') {
    await runScrapeData();
  }

  console.log('🏁 Tudo concluído!\n');
}

main().catch(console.error);
