// src/actions/scraping.ts
// Server Actions for scraping external data (FPF + ZeroZero) and updating player profiles
// Runs server-side on Vercel — triggered from browser on player save or bulk update
// RELEVANT FILES: src/actions/players.ts, src/lib/supabase/server.ts, src/lib/supabase/club-context.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { normalizePosition } from '@/lib/utils/positions';

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
    ...extra,
  };
}

/** Random delay between min and max ms — jitter makes traffic look human */
function humanDelay(minMs = 1500, maxMs = 3500): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

// Keep the old HEADERS for backward compat with FPF (less aggressive detection)
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

/* ───────────── Helpers ───────────── */

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

function normalizeCountry(name: string | null): string | null {
  if (!name) return null;
  const fixed = COUNTRY_FIXES[name.toLowerCase().trim()];
  return fixed || name;
}

/** Normalize club name for comparison — removes "FC", "F.C.", "Futebol Clube", punctuation, etc. */
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

/** Check if two club names are effectively the same */
function clubsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normalizeClubName(a);
  const nb = normalizeClubName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/* ───────────── FPF Scraper ───────────── */

export interface FpfScrapeResult {
  success: boolean;
  club: string | null;
  photoUrl: string | null;
  birthCountry: string | null;
  nationality: string | null;
  clubChanged: boolean;
}

/** Parse FPF player page — extracts data from embedded `var model = {...}` JSON */
async function fetchFpfData(fpfLink: string) {
  try {
    const res = await fetch(fpfLink, { headers: HEADERS, next: { revalidate: 0 } });
    if (!res.ok) return null;

    const html = await res.text();

    // FPF embeds player data as `var model = { ... };` in a <script> tag
    const modelMatch = html.match(/var\s+model\s*=\s*(\{[\s\S]*?\});/);
    if (!modelMatch) return null;

    const model = JSON.parse(modelMatch[1]);

    // BirthDate: FPF model uses various formats — "dd/MM/yyyy", ISO, or "27 de março de 2012"
    let dob: string | null = null;
    const rawDob = (model.BirthDate || model.DateOfBirth || model.DataNascimento) as string | null;
    if (rawDob) {
      const ddMM = rawDob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (ddMM) {
        dob = `${ddMM[3]}-${ddMM[2]}-${ddMM[1]}`; // → yyyy-MM-dd
      } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDob)) {
        dob = rawDob.slice(0, 10);
      } else {
        // Portuguese format: "27 de março de 2012"
        const PT_MONTHS: Record<string, string> = {
          janeiro: '01', fevereiro: '02', 'março': '03', marco: '03', abril: '04',
          maio: '05', junho: '06', julho: '07', agosto: '08',
          setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
        };
        const ptMatch = rawDob.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
        if (ptMatch) {
          const mm = PT_MONTHS[ptMatch[2].toLowerCase()];
          if (mm) dob = `${ptMatch[3]}-${mm}-${ptMatch[1].padStart(2, '0')}`;
        }
      }
    }

    // Club logo from model.CurrentClubImage (most reliable) or first Clubs entry
    const clubLogoUrl = (model.CurrentClubImage as string)
      || (Array.isArray(model.Clubs) && model.Clubs.length > 0 ? (model.Clubs[0].Image as string) : null)
      || null;

    // Reject FPF placeholder images (relative path, not a real player photo)
    const rawPhoto = (model.Image as string) || null;
    const photoUrl = rawPhoto && rawPhoto.startsWith('http') && !rawPhoto.includes('placeholder') ? rawPhoto : null;

    const nationality = (model.Nationality || model.Nacionalidade) as string | null;
    // Fallback: if no birth country data, assume same as nationality
    const birthCountry = (model.BirthCountry || model.CountryOfBirth || model.PlaceOfBirth || model.PaisNascimento || model.BirthPlace || nationality) as string | null;

    return {
      currentClub: (model.CurrentClub as string) || null,
      photoUrl,
      fullName: (model.FullName as string) || null,
      dob,
      birthCountry,
      nationality,
      clubLogoUrl,
    };
  } catch {
    return null;
  }
}

/** Scrape FPF for a single player — returns scraped data for the client to decide what to update */
export async function scrapePlayerFpf(playerId: number): Promise<FpfScrapeResult> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('fpf_link, club, photo_url, zz_photo_url')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  if (!player?.fpf_link) return { success: false, club: null, photoUrl: null, birthCountry: null, nationality: null, clubChanged: false };

  const data = await fetchFpfData(player.fpf_link);
  if (!data) return { success: false, club: null, photoUrl: null, birthCountry: null, nationality: null, clubChanged: false };

  // Always update fpf_current_club, club_logo_url, and fpf_last_checked
  await supabase.from('players').update({
    fpf_current_club: data.currentClub,
    fpf_last_checked: new Date().toISOString(),
    ...(data.clubLogoUrl ? { club_logo_url: data.clubLogoUrl } : {}),
  }).eq('id', playerId).eq('club_id', clubId);

  const clubChanged = data.currentClub ? !clubsMatch(data.currentClub, player.club ?? '') : false;

  revalidatePath(`/jogadores/${playerId}`);
  return { success: true, club: data.currentClub, photoUrl: data.photoUrl, birthCountry: data.birthCountry, nationality: data.nationality, clubChanged };
}

/* ───────────── ZeroZero Scraper ───────────── */

export interface ZzScrapeResult {
  success: boolean;
  currentClub: string | null;
  photoUrl: string | null;
  height: number | null;
  weight: number | null;
  nationality: string | null;
  birthCountry: string | null;
  /** Raw position text from ZeroZero (e.g. "Médio Defensivo") */
  position: string | null;
  /** Preferred foot (e.g. "Dir", "Esq", "Amb") */
  foot: string | null;
  gamesSeason: number | null;
  goalsSeason: number | null;
  teamHistory: { club: string; season: string; games: number; goals: number }[];
  clubChanged: boolean;
}

/** Parse ZeroZero player page — extracts from JSON-LD + HTML */
async function fetchZeroZeroData(zzLink: string) {
  try {
    const res = await fetch(zzLink, {
      headers: browserHeaders({ 'Referer': 'https://www.zerozero.pt/' }),
      next: { revalidate: 0 },
    });
    // Detect redirect to captcha (302 → recaptcha.php followed automatically by fetch)
    if (!res.ok || res.url.includes('recaptcha') || res.url.includes('captcha')) {
      console.warn(`[ZZ] Bloqueado (status=${res.status}, url=${res.url}): ${zzLink}`);
      throw new Error('ZZ_BLOCKED');
    }

    // ZeroZero serves pages in ISO-8859-1 (Latin-1), not UTF-8
    // Using res.text() would corrupt ç, ã, é etc. — decode manually
    const buf = await res.arrayBuffer();
    const html = new TextDecoder('iso-8859-1').decode(buf);

    // Detect captcha page content or empty/invalid responses
    // ZZ pages may include a recaptcha script on valid pages — only treat as blocked if
    // the page lacks real content markers (card-data, ld+json, zz-enthdr)
    const hasMarkers = html.includes('card-data') || html.includes('ld+json') || html.includes('zz-enthdr');
    if (buf.byteLength === 0 || !hasMarkers) {
      const hasCaptcha = html.includes('recaptcha') || html.includes('g-recaptcha');
      console.warn(`[ZZ] Resposta inválida (possível bloqueio, captcha=${hasCaptcha}): ${zzLink}`);
      throw new Error('ZZ_BLOCKED');
    }
    const result = {
      fullName: null as string | null,
      dob: null as string | null,
      currentClub: null as string | null,
      currentTeam: null as string | null,
      photoUrl: null as string | null,
      clubLogoUrl: null as string | null,
      height: null as number | null,
      weight: null as number | null,
      nationality: null as string | null,
      birthCountry: null as string | null,
      position: null as string | null,
      secondaryPosition: null as string | null,
      tertiaryPosition: null as string | null,
      foot: null as string | null,
      shirtNumber: null as number | null,
      gamesSeason: null as number | null,
      goalsSeason: null as number | null,
      teamHistory: [] as { club: string; season: string; games: number; goals: number }[],
    };

    /* ── 1. JSON-LD (basic fields only — many are empty/useless on ZeroZero) ── */
    const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        if (typeof ld.image === 'string' && ld.image) result.photoUrl = ld.image;

        // Name from JSON-LD Person schema
        if (typeof ld.name === 'string' && ld.name) result.fullName = ld.name;

        // birthDate: JSON-LD uses ISO format "yyyy-MM-dd" or "dd/MM/yyyy"
        if (ld.birthDate && typeof ld.birthDate === 'string') {
          const raw = ld.birthDate.trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
            result.dob = raw.slice(0, 10);
          } else {
            const ddMM = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (ddMM) result.dob = `${ddMM[3]}-${ddMM[2]}-${ddMM[1]}`;
          }
        }

        // Nationality (usually works)
        if (ld.nationality) {
          if (typeof ld.nationality === 'string' && ld.nationality) result.nationality = ld.nationality;
          else if (typeof ld.nationality === 'object' && ld.nationality.name) result.nationality = ld.nationality.name;
        }

        // Height: "185 cm" → 185
        if (ld.height) {
          const hMatch = String(ld.height).match(/(\d+)/);
          if (hMatch) result.height = parseInt(hMatch[1], 10);
        }

        // Weight: "70 kg" → 70
        if (ld.weight) {
          const wMatch = String(ld.weight).match(/(\d+)/);
          if (wMatch) result.weight = parseInt(wMatch[1], 10);
        }

        // Club from worksFor (often empty string on ZeroZero)
        // worksFor can be: string, object, array, or a string containing a JSON array
        if (ld.worksFor) {
          if (typeof ld.worksFor === 'string' && ld.worksFor) {
            // Sometimes ZeroZero puts a raw JSON array as a string: "[{@type:SportsTeam,name:Padroense}]"
            if (ld.worksFor.startsWith('[') || ld.worksFor.startsWith('{')) {
              try {
                const parsed = JSON.parse(ld.worksFor);
                const org = Array.isArray(parsed) ? parsed[0] : parsed;
                result.currentClub = org?.name || null;
              } catch {
                // Not valid JSON — extract name with regex as fallback
                const nameMatch = ld.worksFor.match(/name[":]+\s*([^,"}\]]+)/i);
                result.currentClub = nameMatch ? nameMatch[1].trim() : null;
              }
            } else {
              result.currentClub = ld.worksFor;
            }
          } else if (typeof ld.worksFor === 'object') {
            const org = Array.isArray(ld.worksFor) ? ld.worksFor[0] : ld.worksFor;
            result.currentClub = org?.name || null;
          }
        }

        // Description fallback — "Joga como Avançado em Leixões"
        if (ld.description && typeof ld.description === 'string') {
          const descClub = ld.description.match(/Joga como\s+.+?\s+em\s+([^,\.]+)/);
          if (descClub && !result.currentClub) result.currentClub = descClub[1].trim();

          const descPos = ld.description.match(/Joga(?:va)? como\s+([^,\.]+?)(?:\s+em\s+|\s*[,\.])/);
          if (descPos) result.position = descPos[1].trim();
        }
      } catch { /* JSON-LD parse failed, continue with HTML parsing */ }
    }

    /* ── 2. HTML card-data sidebar — multiple extraction strategies per field ── */
    // ZeroZero HTML varies between players/pages. Each field has multiple fallbacks.

    // Helper: extract the full HTML block for a card-data row by label regex
    function cardRowHtml(label: string): string | null {
      const re = new RegExp(`card-data__label">${label}</span>([\\s\\S]*?)(?=card-data__label|card-data__footer|card-data__header|$)`, 'i');
      const m = html.match(re);
      return m ? m[1] : null;
    }

    // Helper: extract plain-text value from a card-data row
    function cardValue(label: string): string | null {
      const block = cardRowHtml(label);
      if (!block) return null;
      const valMatch = block.match(/card-data__value[^>]*>([^<]+)/);
      return valMatch ? valMatch[1].trim() : null;
    }

    // Helper: extract ALL plain-text values from a card-data row (multi-value fields)
    function cardValues(label: string): string[] {
      const block = cardRowHtml(label);
      if (!block) return [];
      const values: string[] = [];
      const re = /card-data__value[^>]*>([^<]+)/g;
      let m;
      while ((m = re.exec(block)) !== null) {
        const v = m[1].trim();
        if (v) values.push(v);
      }
      return values;
    }

    // Helper: extract text from micrologo_and_text structure (nationality, country, club)
    function cardValueWithFlag(label: string): string | null {
      const block = cardRowHtml(label);
      if (!block) return null;
      // Try class="text"> first (standard micrologo_and_text)
      const textMatch = block.match(/class="text">([^<]+)/);
      if (textMatch) return textMatch[1].trim();
      // Fallback: title attribute in flag/link
      const titleMatch = block.match(/title="([^"]+)"/);
      if (titleMatch) return titleMatch[1].trim();
      // Fallback: plain value
      const valMatch = block.match(/card-data__value[^>]*>([^<]+)/);
      return valMatch ? valMatch[1].trim() : null;
    }

    // Generic fallback: search the full page for a pattern near a keyword
    function findNearby(keyword: string, valuePattern: RegExp): string | null {
      const idx = html.indexOf(keyword);
      if (idx < 0) return null;
      const slice = html.slice(idx, idx + 500);
      const m = slice.match(valuePattern);
      return m ? m[1].trim() : null;
    }

    /* ── Name — sidebar > header h1 > JSON-LD > og:title ── */
    if (!result.fullName) result.fullName = cardValue('Nome');
    if (!result.fullName) {
      // Header: <h1><span class="name">7.André Ferreira</span></h1> — strip leading number
      const h1 = html.match(/<h1[^>]*>(?:<[^>]+>)*\s*(?:\d+\.\s*)?([A-ZÀ-ÿ][^<]+)/i);
      if (h1) result.fullName = h1[1].trim();
    }
    if (!result.fullName) {
      const og = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
      if (og) result.fullName = og[1].replace(/\s*[-|].*/, '').trim();
    }

    /* ── DOB — sidebar > JSON-LD > any ISO date near "nascimento" ── */
    if (!result.dob) {
      const dobVal = cardValue('Data de Nascimento') || cardValue('Nascimento');
      if (dobVal) {
        const ddMM = dobVal.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
        if (ddMM) result.dob = `${ddMM[3]}-${ddMM[2]}-${ddMM[1]}`;
        else {
          const iso = dobVal.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (iso) result.dob = `${iso[1]}-${iso[2]}-${iso[3]}`;
        }
      }
    }
    // Fallback: any yyyy-MM-dd near "Nascimento" in the page
    if (!result.dob) {
      const nearby = findNearby('Nascimento', /(\d{4}-\d{2}-\d{2})/);
      if (nearby) result.dob = nearby;
    }

    /* ── Position — sidebar (multi-value) > JSON-LD description > meta tags ── */
    const sidebarPositions = cardValues('Posi[çc][ãa]o');
    if (sidebarPositions.length > 0 && sidebarPositions[0].length < 40) {
      result.position = sidebarPositions[0];
      if (sidebarPositions[1] && sidebarPositions[1].length < 40) result.secondaryPosition = sidebarPositions[1];
      if (sidebarPositions[2] && sidebarPositions[2].length < 40) result.tertiaryPosition = sidebarPositions[2];
    }
    if (!result.position) {
      // og:description often has "Joga como Médio Ofensivo"
      const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
      if (ogDesc) {
        const posMatch = ogDesc[1].match(/Joga(?:va)? como\s+([^,\.]+?)(?:\s+em\s+|\s*[,\.])/);
        if (posMatch) result.position = posMatch[1].trim();
      }
    }

    /* ── Foot — sidebar > any "Direito"/"Esquerdo" near "Pé" ── */
    if (!result.foot) {
      const foot = cardValue('P[ée]\\s*[Pp]referencial') || cardValue('P[ée]');
      if (foot) {
        const raw = foot.toLowerCase();
        if (raw.includes('direito') || raw === 'right') result.foot = 'Dir';
        else if (raw.includes('esquerdo') || raw === 'left') result.foot = 'Esq';
        else if (raw.includes('ambidextro') || raw.includes('amb')) result.foot = 'Amb';
      }
    }
    // Fallback: search near keyword
    if (!result.foot) {
      const nearby = findNearby('referencial', />(Direito|Esquerdo|Ambidextro)</i);
      if (nearby) {
        const raw = nearby.toLowerCase();
        if (raw.includes('direito')) result.foot = 'Dir';
        else if (raw.includes('esquerdo')) result.foot = 'Esq';
        else if (raw.includes('ambidextro')) result.foot = 'Amb';
      }
    }

    /* ── Club — sidebar (with flag) > header > JSON-LD description ── */
    if (!result.currentClub) {
      result.currentClub = cardValueWithFlag('Clube atual') || cardValueWithFlag('Clube');
    }
    if (!result.currentClub) {
      // Header club link
      const clubMatch = html.match(/class="zz-enthdr-club"[^>]*>([^<]+)/);
      if (clubMatch) {
        const club = clubMatch[1].trim();
        if (club && club !== 'Sem Equipa') result.currentClub = club;
      }
    }

    /* ── Nationality — sidebar (with flag) > JSON-LD (already set above) ── */
    if (!result.nationality) {
      result.nationality = cardValueWithFlag('Nacionalidade');
    }
    // Fallback: nearby keyword search
    if (!result.nationality) {
      const nearby = findNearby('Nacionalidade', /class="text">([^<]+)/);
      if (nearby) result.nationality = nearby;
    }

    /* ── Birth country — sidebar (with flag) > nearby keyword ── */
    if (!result.birthCountry) {
      result.birthCountry = cardValueWithFlag('Pa[ií]s de Nascimento') || cardValueWithFlag('Pa[ií]s');
    }
    if (!result.birthCountry) {
      const nearby = findNearby('Nascimento', /class="text">([^<]+)/);
      // Only use if it looks like a country, not a date
      if (nearby && !/\d/.test(nearby)) result.birthCountry = nearby;
    }
    // Fallback: if no birth country but nationality exists, assume same
    if (!result.birthCountry && result.nationality) {
      result.birthCountry = result.nationality;
    }

    /* ── Height — sidebar > JSON-LD (already set above) > nearby keyword ── */
    if (!result.height) {
      const hVal = cardValue('Altura');
      if (hVal) {
        const hMatch = hVal.match(/(\d{2,3})/);
        if (hMatch) result.height = parseInt(hMatch[1], 10);
      }
    }
    if (!result.height) {
      const nearby = findNearby('Altura', /(\d{2,3})\s*(?:cm)?/);
      if (nearby) result.height = parseInt(nearby, 10);
    }

    /* ── Weight — sidebar > JSON-LD (already set above) > nearby keyword ── */
    if (!result.weight) {
      const wVal = cardValue('Peso');
      if (wVal) {
        const wMatch = wVal.match(/(\d{2,3})/);
        if (wMatch) result.weight = parseInt(wMatch[1], 10);
      }
    }
    if (!result.weight) {
      const nearby = findNearby('Peso', /(\d{2,3})\s*(?:kg)?/);
      if (nearby) result.weight = parseInt(nearby, 10);
    }

    /* ── Shirt number — sidebar > header ── */
    if (!result.shirtNumber) {
      const shirtVal = cardValue('N[úu]mero') || cardValue('Camisola');
      if (shirtVal) {
        const num = shirtVal.match(/(\d{1,3})/);
        if (num) result.shirtNumber = parseInt(num[1], 10);
      }
    }
    if (!result.shirtNumber) {
      // Header: <span class="number" ...>7.</span> before player name
      const hdrNum = html.match(/class="number"[^>]*>\s*(\d{1,3})/);
      if (hdrNum) result.shirtNumber = parseInt(hdrNum[1], 10);
    }

    /* ── Club logo — header img > sidebar img ── */
    const clubLogoMatch = html.match(/zz-enthdr-club[\s\S]*?<img[^>]*src="(\/img\/logos\/equipas\/[^"]+)"/);
    if (clubLogoMatch) {
      result.clubLogoUrl = `https://www.zerozero.pt${clubLogoMatch[1]}`;
    }
    // Fallback: sidebar club row logo
    if (!result.clubLogoUrl) {
      const sidebarLogo = cardRowHtml('Clube atual') || cardRowHtml('Clube');
      if (sidebarLogo) {
        const logoMatch = sidebarLogo.match(/<img[^>]*src="(\/img\/logos\/equipas\/[^"]+)"/);
        if (logoMatch) result.clubLogoUrl = `https://www.zerozero.pt${logoMatch[1]}`;
      }
    }

    /* ── Photo — JSON-LD (already set) > og:image > page img tag ── */
    if (!result.photoUrl) {
      const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
      if (ogImage && /jogadores/i.test(ogImage[1])) result.photoUrl = ogImage[1];
    }
    if (!result.photoUrl) {
      const imgMatch = html.match(/src="([^"]*(?:cdn-img\.zerozero\.pt|zerozero\.pt)\/img\/jogadores\/[^"]+)"/);
      if (imgMatch) result.photoUrl = imgMatch[1];
    }
    // Fix protocol-relative URLs
    if (result.photoUrl && result.photoUrl.startsWith('//')) {
      result.photoUrl = 'https:' + result.photoUrl;
    }

    // Discard 0-value height/weight (parsing artifacts)
    if (result.height === 0) result.height = null;
    if (result.weight === 0) result.weight = null;

    // Career history table — extract seasons, clubs, games, goals
    const careerRows = html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    let latestGames: number | null = null;
    let latestGoals: number | null = null;
    let isFirst = true;

    for (const row of careerRows) {
      const rowHtml = row[0];
      const seasonMatch = rowHtml.match(/(20\d{2}\/\d{2})/);
      if (!seasonMatch) continue;

      const season = seasonMatch[1];

      // Club name — in an <a> tag within the row
      const clubCellMatch = rowHtml.match(/<a[^>]*>([^<]+)<\/a>/);
      const club = clubCellMatch ? clubCellMatch[1].trim() : '';
      if (!club) continue;

      // Games and goals — look for numbers in table cells
      const numberCells = [...rowHtml.matchAll(/<td[^>]*>\s*(\d+)\s*<\/td>/g)];
      const games = numberCells.length > 0 ? parseInt(numberCells[0][1], 10) : 0;
      const goals = numberCells.length > 1 ? parseInt(numberCells[1][1], 10) : 0;

      if (isFirst) {
        result.currentTeam = club;
        latestGames = games;
        latestGoals = goals;
        isFirst = false;
      }

      result.teamHistory.push({ club, season, games, goals });
    }

    result.gamesSeason = latestGames;
    result.goalsSeason = latestGoals;

    return result;
  } catch (e) {
    // Re-throw ZZ_BLOCKED so callers can show a specific warning
    if (e instanceof Error && e.message === 'ZZ_BLOCKED') throw e;
    return null;
  }
}

/** Scrape ZeroZero for a single player — returns scraped data for the client to decide */
export async function scrapePlayerZeroZero(playerId: number): Promise<ZzScrapeResult> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('zerozero_link, club')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  if (!player?.zerozero_link) {
    return { success: false, currentClub: null, photoUrl: null, height: null, weight: null, nationality: null, birthCountry: null, position: null, foot: null, gamesSeason: null, goalsSeason: null, teamHistory: [], clubChanged: false };
  }

  const data = await fetchZeroZeroData(player.zerozero_link);
  if (!data) {
    return { success: false, currentClub: null, photoUrl: null, height: null, weight: null, nationality: null, birthCountry: null, position: null, foot: null, gamesSeason: null, goalsSeason: null, teamHistory: [], clubChanged: false };
  }

  // Always update zz_* fields
  await supabase.from('players').update({
    zz_current_club: data.currentClub,
    zz_current_team: data.currentTeam,
    zz_games_season: data.gamesSeason,
    zz_goals_season: data.goalsSeason,
    zz_height: data.height,
    zz_weight: data.weight,
    zz_photo_url: data.photoUrl,
    zz_team_history: data.teamHistory.length > 0 ? data.teamHistory : null,
    zz_last_checked: new Date().toISOString(),
    ...(data.clubLogoUrl ? { club_logo_url: data.clubLogoUrl } : {}),
  }).eq('id', playerId).eq('club_id', clubId);

  const clubChanged = data.currentClub ? !clubsMatch(data.currentClub, player.club ?? '') : false;

  revalidatePath(`/jogadores/${playerId}`);

  return {
    success: true,
    currentClub: data.currentClub,
    photoUrl: data.photoUrl,
    height: data.height,
    weight: data.weight,
    nationality: data.nationality,
    birthCountry: data.birthCountry,
    position: data.position,
    foot: data.foot,
    gamesSeason: data.gamesSeason,
    goalsSeason: data.goalsSeason,
    teamHistory: data.teamHistory,
    clubChanged,
  };
}

/* ───────────── Unified Scrape (FPF + ZeroZero merged) ───────────── */

/** What changed — each field shows the new value if different from current player data */
export interface ScrapedChanges {
  success: boolean;
  /** Errors from individual scrapers */
  errors: string[];

  /* ── FPF-sourced fields (always shown) ── */
  club: string | null;
  clubChanged: boolean;
  /** New club logo URL (needs user confirmation — may be wrong) */
  clubLogoUrl: string | null;
  clubLogoChanged: boolean;
  /** Photo from FPF (fallback when ZZ not confirmed) */
  fpfPhotoUrl: string | null;
  birthCountry: string | null;
  birthCountryChanged: boolean;
  nationality: string | null;
  nationalityChanged: boolean;

  /* ── ZZ-sourced fields (disabled until ZZ link confirmed) ── */
  /** Photo from ZeroZero (may be more recent) */
  zzPhotoUrl: string | null;
  height: number | null;
  heightChanged: boolean;
  weight: number | null;
  weightChanged: boolean;
  /** Normalized position code (e.g. "MDC") from ZeroZero raw position text */
  position: string | null;
  /** Raw position text from ZeroZero (e.g. "Médio Defensivo") for display */
  positionRaw: string | null;
  positionChanged: boolean;
  /** Secondary position from ZZ (normalized code, '' if unknown) */
  secondaryPosition: string | null;
  /** Raw secondary position text from ZZ */
  secondaryPositionRaw: string | null;
  /** Tertiary position from ZZ (normalized code, '' if unknown) */
  tertiaryPosition: string | null;
  /** Raw tertiary position text from ZZ */
  tertiaryPositionRaw: string | null;
  /** Preferred foot from ZeroZero (normalized to "Dir"/"Esq"/"Amb") */
  foot: string | null;
  footChanged: boolean;
  gamesSeason: number | null;
  goalsSeason: number | null;

  /* ── Merged photo (best of both — for confirmed ZZ) ── */
  /** True if there's a new photo available (FPF or ZZ) */
  hasNewPhoto: boolean;

  /* ── ZZ link finder ── */
  /** ZeroZero link auto-found during refresh (NOT saved — needs user confirmation) */
  zzLinkFound: string | null;
  /** Name of the ZZ candidate for user verification */
  zzCandidateName: string | null;
  /** Club of the ZZ candidate for user verification */
  zzCandidateClub: string | null;
  /** Age of the ZZ candidate for user verification */
  zzCandidateAge: number | null;
  /** True if ZZ link was already in DB (not auto-found) — ZZ data always trusted */
  zzConfirmed: boolean;
  /** True if any field has meaningful changes to show */
  hasChanges: boolean;
}

/** Scrape BOTH FPF and ZeroZero for a player, merge results, return what changed */
export async function scrapePlayerAll(playerId: number): Promise<ScrapedChanges> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('name, dob, fpf_link, zerozero_link, club, club_logo_url, photo_url, zz_photo_url, height, weight, birth_country, nationality, position_normalized, secondary_position, tertiary_position, foot')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const EMPTY_RESULT: ScrapedChanges = {
    success: false, errors: [],
    club: null, clubChanged: false, clubLogoUrl: null, clubLogoChanged: false,
    fpfPhotoUrl: null, zzPhotoUrl: null, hasNewPhoto: false,
    height: null, heightChanged: false, weight: null, weightChanged: false,
    birthCountry: null, birthCountryChanged: false, nationality: null, nationalityChanged: false,
    position: null, positionRaw: null, positionChanged: false,
    secondaryPosition: null, secondaryPositionRaw: null, tertiaryPosition: null, tertiaryPositionRaw: null,
    foot: null, footChanged: false, gamesSeason: null, goalsSeason: null,
    zzLinkFound: null, zzCandidateName: null, zzCandidateClub: null, zzCandidateAge: null,
    zzConfirmed: false, hasChanges: false,
  };

  if (!player) {
    return { ...EMPTY_RESULT, errors: ['Jogador não encontrado'] };
  }

  // Auto-find ZeroZero link if player has name + DOB but no ZZ link
  // NOTE: Does NOT save to DB — only returns as a proposal for user confirmation
  let zzLinkFound: string | null = null;
  let zzCandidate: ZzSearchCandidate | null = null;
  let zzBlocked = false;
  let zzSearchAttempted = false;
  if (!player.zerozero_link && player.name && player.dob) {
    zzSearchAttempted = true;
    try {
      const expectedAge = calcAgeFromDob(player.dob);
      zzCandidate = await searchZzMultiStrategy(player.name, player.club, expectedAge, player.dob);
      if (zzCandidate) {
        zzLinkFound = zzCandidate.url;
        // Set in memory so fetchZeroZeroData runs below — but NOT saved to DB yet
        player.zerozero_link = zzCandidate.url;
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'ZZ_BLOCKED') zzBlocked = true;
    }
  }

  const errors: string[] = [];

  // Scrape both in parallel
  type FpfData = Awaited<ReturnType<typeof fetchFpfData>>;
  type ZzData = Awaited<ReturnType<typeof fetchZeroZeroData>>;

  const [fpfResult, zzResult] = await Promise.all([
    player.fpf_link
      ? fetchFpfData(player.fpf_link).catch(() => null as FpfData)
      : Promise.resolve(null as FpfData),
    player.zerozero_link
      ? fetchZeroZeroData(player.zerozero_link).catch((e: unknown) => {
          if (e instanceof Error && e.message === 'ZZ_BLOCKED') zzBlocked = true;
          return null as ZzData;
        })
      : Promise.resolve(null as ZzData),
  ]);

  if (!fpfResult && player.fpf_link) errors.push('FPF indisponível');
  // Detect empty ZZ result (page returned but no useful data — e.g. VPN/geo issues)
  const zzEmpty = !!zzResult && !zzResult.fullName && !zzResult.currentClub && !zzResult.height && !zzResult.photoUrl;
  if (zzBlocked) errors.push('ZeroZero bloqueou o acesso (captcha). Tenta mais tarde.');
  else if (zzEmpty && player.zerozero_link) errors.push('ZeroZero: página acedida mas sem dados (possível problema de rede/VPN)');
  else if (!zzResult && player.zerozero_link) errors.push('ZeroZero indisponível');
  // Nullify empty ZZ result so downstream logic doesn't use it as valid data
  const zzData = zzEmpty ? null : zzResult;
  // Inform user when ZZ auto-search ran but found no matching player
  if (zzSearchAttempted && !zzCandidate && !zzBlocked) errors.push('ZeroZero: jogador não encontrado na pesquisa automática');

  if (!fpfResult && !zzData) {
    const noLinks = !player.fpf_link && !player.zerozero_link && !zzSearchAttempted;
    return { ...EMPTY_RESULT, success: !noLinks, errors: noLinks ? ['Sem links externos'] : errors };
  }

  // Update cache fields — FPF always, ZZ only if link was already confirmed (not auto-found)
  const cacheUpdates: Record<string, unknown> = {};
  if (fpfResult) {
    cacheUpdates.fpf_current_club = fpfResult.currentClub;
    cacheUpdates.fpf_last_checked = new Date().toISOString();
  }
  // Only cache ZZ fields if the link was already in the DB (not just auto-found)
  if (zzData && !zzLinkFound) {
    cacheUpdates.zz_current_club = zzData.currentClub;
    cacheUpdates.zz_current_team = zzData.currentTeam;
    cacheUpdates.zz_games_season = zzData.gamesSeason;
    cacheUpdates.zz_goals_season = zzData.goalsSeason;
    cacheUpdates.zz_height = zzData.height;
    cacheUpdates.zz_weight = zzData.weight;
    cacheUpdates.zz_photo_url = zzData.photoUrl;
    cacheUpdates.zz_team_history = zzData.teamHistory?.length ? zzData.teamHistory : null;
    cacheUpdates.zz_last_checked = new Date().toISOString();
  }
  // Club logo: only auto-save if the scraped club matches the player's current club
  // (don't overwrite Canidelo's logo with Boavista's just because ZZ says the player moved)
  const fpfClubMatch = fpfResult?.currentClub && clubsMatch(fpfResult.currentClub, player.club ?? '');
  const zzClubMatch = zzData?.currentClub && clubsMatch(zzData.currentClub, player.club ?? '');
  if (fpfResult?.clubLogoUrl && fpfClubMatch) cacheUpdates.club_logo_url = fpfResult.clubLogoUrl;
  if (zzData?.clubLogoUrl && !zzLinkFound && zzClubMatch) cacheUpdates.club_logo_url = zzData.clubLogoUrl;
  if (Object.keys(cacheUpdates).length > 0) {
    await supabase.from('players').update(cacheUpdates).eq('id', playerId).eq('club_id', clubId);
  }

  // Whether ZZ data is from a confirmed (pre-existing) link vs auto-found
  const zzConfirmed = !!zzData && !zzLinkFound;

  // FPF-sourced: club (FPF priority), nationality, birth country
  const mergedClub = fpfResult?.currentClub || (zzConfirmed ? zzData?.currentClub : null) || null;
  const clubChanged = mergedClub ? !clubsMatch(mergedClub, player.club ?? '') : false;

  // FPF-sourced: nationality, birth country (FPF priority, ZZ fallback if confirmed)
  // normalizeCountry fixes FPF accent issues (e.g. "Guine Bissau" → "Guiné-Bissau")
  const mergedNationality = normalizeCountry(fpfResult?.nationality || (zzConfirmed ? zzData?.nationality : null) || null);
  const nationalityChanged = !!mergedNationality && mergedNationality !== player.nationality;
  const mergedBirthCountry = normalizeCountry(fpfResult?.birthCountry || (zzConfirmed ? zzData?.birthCountry : null) || null);
  const birthCountryChanged = !!mergedBirthCountry && mergedBirthCountry !== player.birth_country;

  // Club logo: auto-saved in cacheUpdates above, only show as change if genuinely different
  const mergedLogo = (zzConfirmed ? zzData?.clubLogoUrl : null) || fpfResult?.clubLogoUrl || null;
  const clubLogoChanged = !!mergedLogo && mergedLogo !== (player.club_logo_url ?? '');

  // Photos: keep separate so UI can show the right one based on ZZ confirmation
  const fpfPhotoUrl = fpfResult?.photoUrl ?? null;
  const zzPhotoUrl = zzData?.photoUrl ?? null;
  // Only show photo option if URL is genuinely new (not seen before in any stored field)
  const currentPhoto = player.photo_url ?? '';
  const currentZzPhoto = player.zz_photo_url ?? '';
  // FPF photo: only "new" if player has no photo yet OR if the FPF URL actually changed
  // (if user already has a photo from any source, they already decided — don't nag)
  const fpfPhotoNew = !!fpfPhotoUrl && !currentPhoto;
  // ZZ photo: "new" only if URL genuinely changed from what we cached
  const zzPhotoNew = !!zzPhotoUrl && zzPhotoUrl !== currentPhoto && zzPhotoUrl !== currentZzPhoto;
  const hasNewPhoto = fpfPhotoNew || zzPhotoNew;

  // ZZ-sourced: height, weight, position, foot, games, goals
  const mergedHeight = zzData?.height ?? null;
  const heightChanged = mergedHeight !== null && mergedHeight !== player.height;
  const mergedWeight = zzData?.weight ?? null;
  const weightChanged = mergedWeight !== null && mergedWeight !== player.weight;
  const positionRaw = zzData?.position ?? null;
  const positionNormalized = positionRaw ? normalizePosition(positionRaw) : '';
  const secondaryRaw = zzData?.secondaryPosition ?? null;
  const secondaryNormalized = secondaryRaw ? normalizePosition(secondaryRaw) : null;
  const tertiaryRaw = zzData?.tertiaryPosition ?? null;
  const tertiaryNormalized = tertiaryRaw ? normalizePosition(tertiaryRaw) : null;
  // Position changed: true if normalized code differs, OR if raw text exists but normalization failed (user picks via dropdown)
  const primaryChanged = !!positionRaw && (positionNormalized || '') !== (player.position_normalized ?? '');
  const secondaryChanged = !!secondaryRaw && (secondaryNormalized || '') !== (player.secondary_position ?? '');
  const tertiaryChanged = !!tertiaryRaw && (tertiaryNormalized || '') !== (player.tertiary_position ?? '');
  const positionChanged = primaryChanged || secondaryChanged || tertiaryChanged;
  const mergedFoot = zzData?.foot ?? null;
  const footChanged = !!mergedFoot && mergedFoot !== (player.foot ?? '');

  const hasChanges = clubChanged || clubLogoChanged || hasNewPhoto || heightChanged || weightChanged || nationalityChanged || birthCountryChanged || positionChanged || footChanged || !!zzLinkFound;

  revalidatePath(`/jogadores/${playerId}`);

  return {
    success: true,
    errors,
    club: mergedClub,
    clubChanged,
    clubLogoUrl: mergedLogo,
    clubLogoChanged,
    fpfPhotoUrl,
    zzPhotoUrl,
    hasNewPhoto,
    height: mergedHeight,
    heightChanged,
    weight: mergedWeight,
    weightChanged,
    birthCountry: mergedBirthCountry,
    birthCountryChanged,
    nationality: mergedNationality,
    nationalityChanged,
    position: positionNormalized || null,
    positionRaw,
    positionChanged,
    secondaryPosition: secondaryNormalized || null,
    secondaryPositionRaw: secondaryRaw,
    tertiaryPosition: tertiaryNormalized || null,
    tertiaryPositionRaw: tertiaryRaw,
    foot: mergedFoot,
    footChanged,
    gamesSeason: zzResult?.gamesSeason ?? null,
    goalsSeason: zzResult?.goalsSeason ?? null,
    zzLinkFound,
    zzCandidateName: zzCandidate?.name ?? null,
    zzCandidateClub: zzCandidate?.club ?? null,
    zzCandidateAge: zzCandidate?.age ?? null,
    zzConfirmed,
    hasChanges,
  };
}

/** Apply merged scraped data to the player's main fields */
export async function applyScrapedData(
  playerId: number,
  updates: {
    club?: string;
    clubLogoUrl?: string;
    photoUrl?: string;
    height?: number;
    weight?: number;
    birthCountry?: string;
    nationality?: string;
    position?: string;
    secondaryPosition?: string;
    tertiaryPosition?: string;
    foot?: string;
    /** Auto-found ZZ link — save to DB + scrape ZZ cache fields */
    zzLinkFound?: string;
  }
): Promise<{ success: boolean }> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();
  const dbUpdates: Record<string, unknown> = {};

  if (updates.club) dbUpdates.club = updates.club;
  if (updates.clubLogoUrl) dbUpdates.club_logo_url = updates.clubLogoUrl;
  if (updates.photoUrl) dbUpdates.photo_url = updates.photoUrl;
  if (updates.height) dbUpdates.height = updates.height;
  if (updates.weight) dbUpdates.weight = updates.weight;
  if (updates.birthCountry) dbUpdates.birth_country = updates.birthCountry;
  if (updates.nationality) dbUpdates.nationality = updates.nationality;
  if (updates.position) dbUpdates.position_normalized = updates.position;
  if (updates.secondaryPosition) dbUpdates.secondary_position = updates.secondaryPosition;
  if (updates.tertiaryPosition) dbUpdates.tertiary_position = updates.tertiaryPosition;
  if (updates.foot) dbUpdates.foot = updates.foot;

  // Save auto-found ZZ link + scrape full ZZ data
  if (updates.zzLinkFound) {
    const idMatch = updates.zzLinkFound.match(/\/jogador\/[^/]+\/(\d+)/);
    dbUpdates.zerozero_link = updates.zzLinkFound;
    dbUpdates.zerozero_player_id = idMatch ? idMatch[1] : '';
  }

  if (Object.keys(dbUpdates).length === 0) return { success: true };

  const { error } = await supabase.from('players').update(dbUpdates).eq('id', playerId).eq('club_id', clubId);
  if (error) return { success: false };

  // Now scrape ZZ cache fields since the link is saved
  // Also fill in main profile fields (nationality, position, foot, height, weight) if still empty
  if (updates.zzLinkFound) {
    const zzData = await fetchZeroZeroData(updates.zzLinkFound);
    if (zzData) {
      // Get current player data to check which fields are empty
      const { data: current } = await supabase.from('players')
        .select('nationality, birth_country, position_normalized, secondary_position, tertiary_position, foot, height, weight, photo_url')
        .eq('id', playerId).eq('club_id', clubId).single();

      const zzCacheFields: Record<string, unknown> = {
        zz_current_club: zzData.currentClub,
        zz_current_team: zzData.currentTeam,
        zz_games_season: zzData.gamesSeason,
        zz_goals_season: zzData.goalsSeason,
        zz_height: zzData.height,
        zz_weight: zzData.weight,
        zz_photo_url: zzData.photoUrl,
        zz_team_history: zzData.teamHistory?.length ? zzData.teamHistory : null,
        zz_last_checked: new Date().toISOString(),
        ...(zzData.clubLogoUrl ? { club_logo_url: zzData.clubLogoUrl } : {}),
      };

      // Fill empty main fields from ZZ data (don't overwrite existing values)
      if (current) {
        if (!current.nationality && zzData.nationality) zzCacheFields.nationality = zzData.nationality;
        if (!current.birth_country && zzData.birthCountry) zzCacheFields.birth_country = zzData.birthCountry;
        if (!current.position_normalized && zzData.position) zzCacheFields.position_normalized = normalizePosition(zzData.position);
        if (!current.secondary_position && zzData.secondaryPosition) zzCacheFields.secondary_position = normalizePosition(zzData.secondaryPosition);
        if (!current.tertiary_position && zzData.tertiaryPosition) zzCacheFields.tertiary_position = normalizePosition(zzData.tertiaryPosition);
        if (!current.foot && zzData.foot) zzCacheFields.foot = zzData.foot;
        if (!current.height && zzData.height) zzCacheFields.height = zzData.height;
        if (!current.weight && zzData.weight) zzCacheFields.weight = zzData.weight;
        if (!current.photo_url && zzData.photoUrl) zzCacheFields.photo_url = zzData.photoUrl;
      }

      await supabase.from('players').update(zzCacheFields).eq('id', playerId).eq('club_id', clubId);
    }
  }

  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}

/* ───────────── Scrape from Links (no player ID — for "Add Player" flow) ───────────── */

/** Data returned from scraping links for a new player */
export interface ScrapedNewPlayerData {
  success: boolean;
  errors: string[];
  name: string | null;
  dob: string | null;
  club: string | null;
  position: string | null;
  positionRaw: string | null;
  secondaryPosition: string | null;
  tertiaryPosition: string | null;
  foot: string | null;
  shirtNumber: number | null;
  photoUrl: string | null;
  height: number | null;
  weight: number | null;
  nationality: string | null;
  birthCountry: string | null;
}

/** Scrape FPF and/or ZeroZero from raw URLs — no player needed, used for creating new players */
export async function scrapeFromLinks(fpfLink?: string, zzLink?: string): Promise<ScrapedNewPlayerData> {
  const EMPTY: ScrapedNewPlayerData = {
    success: false, errors: [], name: null, dob: null, club: null,
    position: null, positionRaw: null, secondaryPosition: null, tertiaryPosition: null,
    foot: null, shirtNumber: null, photoUrl: null,
    height: null, weight: null, nationality: null, birthCountry: null,
  };

  if (!fpfLink && !zzLink) return { ...EMPTY, errors: ['Nenhum link fornecido'] };

  const errors: string[] = [];

  type FpfData = Awaited<ReturnType<typeof fetchFpfData>>;
  type ZzData = Awaited<ReturnType<typeof fetchZeroZeroData>>;

  const [fpfResult, zzResult] = await Promise.all([
    fpfLink ? fetchFpfData(fpfLink).catch(() => null as FpfData) : Promise.resolve(null as FpfData),
    zzLink ? fetchZeroZeroData(zzLink).catch(() => null as ZzData) : Promise.resolve(null as ZzData),
  ]);

  if (!fpfResult && fpfLink) errors.push('Não foi possível aceder ao FPF');
  if (!zzResult && zzLink) errors.push('Não foi possível aceder ao ZeroZero');

  if (!fpfResult && !zzResult) return { ...EMPTY, errors };

  // Merge: FPF for name/DOB/nationality, ZZ for position/foot/height/weight/photo
  const name = fpfResult?.fullName || zzResult?.fullName || null;
  const dob = fpfResult?.dob || zzResult?.dob || null;
  const club = fpfResult?.currentClub || zzResult?.currentClub || null;
  const positionRaw = zzResult?.position ?? null;
  const position = positionRaw ? normalizePosition(positionRaw) : null;
  const secondaryRaw = zzResult?.secondaryPosition ?? null;
  const secondaryPosition = secondaryRaw ? normalizePosition(secondaryRaw) : null;
  const tertiaryRaw = zzResult?.tertiaryPosition ?? null;
  const tertiaryPosition = tertiaryRaw ? normalizePosition(tertiaryRaw) : null;
  const foot = zzResult?.foot ?? null;
  const shirtNumber = zzResult?.shirtNumber ?? null;
  const photoUrl = zzResult?.photoUrl || fpfResult?.photoUrl || null;
  const height = zzResult?.height ?? null;
  const weight = zzResult?.weight ?? null;
  const nationality = normalizeCountry(fpfResult?.nationality || zzResult?.nationality || null);
  const birthCountry = normalizeCountry(fpfResult?.birthCountry || zzResult?.birthCountry || null);

  return {
    success: true, errors,
    name, dob, club, position, positionRaw, secondaryPosition, tertiaryPosition,
    foot, shirtNumber, photoUrl, height, weight, nationality, birthCountry,
  };
}

/* ───────────── Scout Report: FPF + auto-find ZZ ───────────── */

export interface ScoutReportScrapeResult extends ScrapedNewPlayerData {
  zzLinkFound: string | null;
  zzCandidateName: string | null;
  zzCandidateAge: number | null;
  zzCandidateClub: string | null;
  zzPhotoUrl: string | null;
}

/** Used by /submeter — scrapes FPF, tries to auto-find ZZ link, then scrapes ZZ too */
export async function scrapeForScoutReport(
  fpfLink: string,
  zzLink?: string,
): Promise<ScoutReportScrapeResult> {
  const EMPTY_ZZ = { zzLinkFound: null, zzCandidateName: null, zzCandidateAge: null, zzCandidateClub: null, zzPhotoUrl: null };

  // Step 1: scrape FPF first to get name + DOB
  const fpfData = await fetchFpfData(fpfLink).catch(() => null);
  if (!fpfData || !fpfData.fullName) {
    return {
      success: false, errors: ['Não foi possível obter dados do FPF'],
      name: null, dob: null, club: null, position: null, positionRaw: null,
      secondaryPosition: null, tertiaryPosition: null, foot: null,
      shirtNumber: null, photoUrl: null, height: null, weight: null,
      nationality: null, birthCountry: null, ...EMPTY_ZZ,
    };
  }

  // Step 2: if no ZZ link provided, try to find one automatically
  let resolvedZzLink = zzLink?.trim() || null;
  let candidate: ZzSearchCandidate | null = null;
  if (!resolvedZzLink && fpfData.fullName && fpfData.dob) {
    const birthDate = new Date(fpfData.dob);
    const age = Math.floor((Date.now() - birthDate.getTime()) / 31557600000);
    candidate = await searchZzMultiStrategy(
      fpfData.fullName,
      fpfData.currentClub || null,
      age,
      fpfData.dob,
    ).catch(() => null);
    if (candidate?.url) {
      resolvedZzLink = candidate.url.startsWith('http')
        ? candidate.url
        : `https://www.zerozero.pt${candidate.url}`;
    }
  }

  // Step 3: scrape both with the resolved ZZ link
  const result = await scrapeFromLinks(fpfLink, resolvedZzLink || undefined);

  return {
    ...result,
    zzLinkFound: resolvedZzLink,
    zzCandidateName: candidate?.name || result.name || null,
    zzCandidateAge: candidate?.age || null,
    zzCandidateClub: candidate?.club || result.club || null,
    zzPhotoUrl: result.photoUrl || null,
  };
}

/* ───────────── Auto-scrape on Link Change ───────────── */

/** Called after saving a player profile — scrapes any links that changed */
export async function autoScrapePlayer(
  playerId: number,
  fpfLinkChanged: boolean,
  zzLinkChanged: boolean
): Promise<{ errors: string[] }> {
  const errors: string[] = [];

  const fpfPromise = fpfLinkChanged ? scrapePlayerFpf(playerId) : Promise.resolve(null);
  const zzPromise = zzLinkChanged ? scrapePlayerZeroZero(playerId) : Promise.resolve(null);
  const [fpfResult, zzResult] = await Promise.all([fpfPromise, zzPromise]);

  if (fpfResult && !fpfResult.success) errors.push('FPF: falha ao aceder aos dados');
  if (zzResult && !zzResult.success) errors.push('ZeroZero: bloqueado ou indisponível');

  // After FPF scrape, try to auto-find ZeroZero link if player doesn't have one
  if (fpfLinkChanged && !zzLinkChanged) {
    const { clubId } = await getActiveClub();
    const supabase = await createClient();
    const { data } = await supabase
      .from('players')
      .select('zerozero_link, dob, name')
      .eq('id', playerId)
      .eq('club_id', clubId)
      .single();
    // Only attempt if player has name + DOB but no ZZ link
    if (data && data.dob && data.name && !data.zerozero_link) {
      const result = await findZeroZeroLinkForPlayer(playerId);
      if (result.success && result.url) {
        // If ZZ link found, also scrape the ZZ profile for full data
        const zzScrape = await scrapePlayerZeroZero(playerId);
        if (!zzScrape.success) errors.push('ZeroZero: bloqueado ou indisponível');
      } else if (result.error) {
        errors.push(`ZeroZero: ${result.error}`);
      }
    }
  }

  return { errors };
}

/* ───────────── Bulk Update ───────────── */

export interface BulkUpdateProgress {
  total: number;
  processed: number;
  fpfUpdated: number;
  zzUpdated: number;
  errors: number;
}

/** Bulk update a batch of players — auto-applies photo, club, height, weight, nationality changes */
export async function bulkScrapeExternalData(
  offset: number,
  limit: number,
  sources: ('fpf' | 'zerozero')[]
): Promise<BulkUpdateProgress & { hasMore: boolean }> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  let query = supabase.from('players').select('id, name, dob, fpf_link, zerozero_link, club, photo_url, zz_photo_url, height, weight, birth_country, nationality', { count: 'exact' }).eq('club_id', clubId);

  if (sources.length === 1 && sources[0] === 'fpf') {
    query = query.not('fpf_link', 'is', null).neq('fpf_link', '');
  } else if (sources.length === 1 && sources[0] === 'zerozero') {
    query = query.not('zerozero_link', 'is', null).neq('zerozero_link', '');
  } else {
    query = query.or('fpf_link.neq.,zerozero_link.neq.');
  }

  const { data: players, count } = await query.order('id').range(offset, offset + limit - 1);

  if (!players || players.length === 0) {
    return { total: count ?? 0, processed: offset, fpfUpdated: 0, zzUpdated: 0, errors: 0, hasMore: false };
  }

  let fpfUpdated = 0;
  let zzUpdated = 0;
  let errors = 0;

  for (const player of players) {
    if (fpfUpdated + zzUpdated + errors > 0) {
      // Random delay 2-4s between requests to avoid rate limiting (ZeroZero blocks rapid access)
      const delay = 2000 + Math.random() * 2000;
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const autoUpdates: Record<string, unknown> = {};

      if (sources.includes('fpf') && player.fpf_link) {
        const data = await fetchFpfData(player.fpf_link);
        if (data) {
          fpfUpdated++;
          // Cache FPF fields
          await supabase.from('players').update({
            fpf_current_club: data.currentClub,
            fpf_last_checked: new Date().toISOString(),
            ...(data.clubLogoUrl ? { club_logo_url: data.clubLogoUrl } : {}),
          }).eq('id', player.id).eq('club_id', clubId);

          // Auto-apply: photo if player has none
          if (data.photoUrl && !player.photo_url && !player.zz_photo_url) {
            autoUpdates.photo_url = data.photoUrl;
          }
          // Club logo from FPF
          if (data.clubLogoUrl) {
            autoUpdates.club_logo_url = data.clubLogoUrl;
          }
          // Club if changed
          if (data.currentClub && !clubsMatch(data.currentClub, player.club ?? '')) {
            autoUpdates.club = data.currentClub;
          }
          // Nationality / birth country if empty
          if (data.nationality && !player.nationality) {
            autoUpdates.nationality = normalizeCountry(data.nationality);
          }
          if (data.birthCountry && !player.birth_country) {
            autoUpdates.birth_country = normalizeCountry(data.birthCountry);
          }
        } else errors++;
      }

      // Auto-find ZeroZero link if player has FPF data but no ZZ link
      if (sources.includes('fpf') && !player.zerozero_link && player.name && player.dob) {
        const expectedAge = calcAgeFromDob(player.dob);
        const zzMatch = await searchZzMultiStrategy(player.name, player.club, expectedAge, player.dob);
        if (zzMatch) {
          const idMatch = zzMatch.url.match(/\/jogador\/[^/]+\/(\d+)/);
          await supabase.from('players').update({
            zerozero_link: zzMatch.url,
            zerozero_player_id: idMatch ? idMatch[1] : '',
          }).eq('id', player.id).eq('club_id', clubId);
          // Update local reference so ZZ scrape runs below
          player.zerozero_link = zzMatch.url;
        }
      }

      if (sources.includes('zerozero') && player.zerozero_link) {
        const data = await fetchZeroZeroData(player.zerozero_link);
        if (data) {
          zzUpdated++;
          // Cache ZZ fields
          await supabase.from('players').update({
            zz_current_club: data.currentClub,
            zz_current_team: data.currentTeam,
            zz_games_season: data.gamesSeason,
            zz_goals_season: data.goalsSeason,
            zz_height: data.height,
            zz_weight: data.weight,
            zz_photo_url: data.photoUrl,
            zz_team_history: data.teamHistory?.length ? data.teamHistory : null,
            zz_last_checked: new Date().toISOString(),
            ...(data.clubLogoUrl ? { club_logo_url: data.clubLogoUrl } : {}),
          }).eq('id', player.id).eq('club_id', clubId);

          // ZZ photo takes priority
          if (data.photoUrl) {
            autoUpdates.photo_url = data.photoUrl;
          }
          // Club logo
          if (data.clubLogoUrl) {
            autoUpdates.club_logo_url = data.clubLogoUrl;
          }
          if (data.currentClub && !clubsMatch(data.currentClub, player.club ?? '')) {
            autoUpdates.club = data.currentClub;
          }
          // Height/weight if missing or different
          if (data.height && !player.height) autoUpdates.height = data.height;
          if (data.weight && !player.weight) autoUpdates.weight = data.weight;
          // Nationality / birth country from ZZ if still empty
          if (data.nationality && !player.nationality && !autoUpdates.nationality) {
            autoUpdates.nationality = normalizeCountry(data.nationality);
          }
          if (data.birthCountry && !player.birth_country && !autoUpdates.birth_country) {
            autoUpdates.birth_country = normalizeCountry(data.birthCountry);
          }
        } else errors++;
      }

      // Apply auto-updates
      if (Object.keys(autoUpdates).length > 0) {
        await supabase.from('players').update(autoUpdates).eq('id', player.id).eq('club_id', clubId);
      }
    } catch {
      errors++;
    }
  }

  const hasMore = offset + players.length < (count ?? 0);
  return { total: count ?? 0, processed: offset + players.length, fpfUpdated, zzUpdated, errors, hasMore };
}

/* ───────────── ZeroZero Link Finder ───────────── */

/** Calculate age from DOB string (yyyy-MM-dd) */
function calcAgeFromDob(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/** Remove diacritics from a string for fuzzy comparison */
function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Count how many name parts overlap between two names (case/diacritic insensitive) */
function countNameOverlap(a: string, b: string): number {
  const partsA = removeDiacritics(a).toLowerCase().split(/\s+/);
  const partsB = removeDiacritics(b).toLowerCase().split(/\s+/);
  return partsA.filter((p) => partsB.includes(p)).length;
}

interface ZzSearchCandidate {
  url: string;
  name: string;
  age: number | null;
  club: string | null;
  position: string | null;
}

/** Parse ZeroZero autocomplete search results HTML into structured candidates */
function parseZzAutocompleteResults(html: string): ZzSearchCandidate[] {
  const candidates: ZzSearchCandidate[] = [];

  // Each result: <a href="/jogador/slug/ID?search=1" ...>...<span>Jogadores | Posição | XX anos | Clube</span>...</a>
  const linkRegex = /href="(\/jogador\/[^"?]+)[^"]*"[\s\S]*?<span>([^<]*)<\/span>/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const info = match[2];

    // Parse info: "Jogadores | Médio | 12 anos | Sporting [Jun.C S15 C]"
    const parts = info.split('|').map((p) => p.trim());
    // Skip non-player results
    if (!parts[0]?.includes('Jogador')) continue;

    const ageMatch = info.match(/(\d+)\s*anos/);
    const age = ageMatch ? parseInt(ageMatch[1], 10) : null;

    // Club is usually the last part, remove age group brackets
    const clubPart = parts.length >= 4 ? parts[3] : null;
    const club = clubPart ? clubPart.replace(/\s*\[.*\]/, '').trim() : null;

    const position = parts.length >= 2 ? parts[1] : null;

    // Name from the text div — search WITHIN the matched <a> block (after href, before </a>)
    const nameMatch = match[0].match(/class="text">([^<]+)/);
    const name = nameMatch ? nameMatch[1].trim() : '';

    candidates.push({ url: `https://www.zerozero.pt${url}`, name, age, club, position });
  }

  return candidates;
}

/** Fetch ZeroZero autocomplete results */
async function searchZzAutocomplete(query: string): Promise<ZzSearchCandidate[]> {
  const res = await fetch(
    `https://www.zerozero.pt/jqc_search_search.php?queryString=${encodeURIComponent(query)}`,
    {
      headers: browserHeaders({
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.zerozero.pt/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      }),
      next: { revalidate: 0 },
    },
  );
  // Detect blocked: non-200, redirect to captcha, or empty response
  if (!res.ok || res.url.includes('recaptcha') || res.url.includes('captcha')) {
    console.warn(`[ZZ] Autocomplete bloqueado: status=${res.status} url=${res.url}`);
    throw new Error('ZZ_BLOCKED');
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) {
    console.warn('[ZZ] Autocomplete: resposta vazia');
    throw new Error('ZZ_BLOCKED');
  }
  // ZZ autocomplete responds in UTF-8 (unlike player pages which are ISO-8859-1)
  const html = new TextDecoder('utf-8').decode(buf);
  // Only treat as blocked if there are NO search results AND captcha is present
  // (ZZ may include recaptcha scripts on valid autocomplete responses)
  const hasResults = html.includes('/jogador/') || html.includes('searchresults');
  if (!hasResults && (html.includes('recaptcha') || html.includes('g-recaptcha'))) {
    console.warn(`[ZZ] Autocomplete captcha (sem resultados): size=${buf.byteLength}`);
    throw new Error('ZZ_BLOCKED');
  }
  return parseZzAutocompleteResults(html);
}

/** Extract first + last name from a full name string */
function firstLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Extract first + second name + last name (e.g. "Afonso Maciel Monteiro" from "Afonso Maciel Valentin Monteiro") */
function firstSecondLastName(fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 4) return null;
  return `${parts[0]} ${parts[1]} ${parts[parts.length - 1]}`;
}

/** Extract first name + second-to-last name (e.g. "Afonso Valentin" from "Afonso Maciel Valentin Monteiro") */
function firstAndSecondLastName(fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 3) return null;
  return `${parts[0]} ${parts[parts.length - 2]}`;
}

/**
 * Multi-strategy ZeroZero search using autocomplete with progressively shorter name variants.
 * The autocomplete endpoint works best with 1-3 word queries. Longer names often return empty.
 * Strategy: name+club variants first (most precise), then name-only variants as fallback.
 * Collects all candidates from all variants, then picks the best match by score.
 */
async function searchZzMultiStrategy(
  fullName: string,
  club: string | null,
  expectedAge: number,
  dob: string,
): Promise<ZzSearchCandidate | null> {
  // Build list of unique name variants to try (most specific → least specific)
  // ZZ autocomplete works best with 2-3 word queries; 4+ words usually returns nothing
  const nameVariants: string[] = [];
  const seen = new Set<string>();
  const addVariant = (v: string | null) => { if (v && !seen.has(v)) { seen.add(v); nameVariants.push(v); } };

  const parts = fullName.trim().split(/\s+/);
  // 3-word names: try as-is first (ideal for autocomplete)
  if (parts.length <= 3) addVariant(fullName);
  // First + second name + last (e.g. "Afonso Maciel Monteiro" — most precise 3-word variant)
  addVariant(firstSecondLastName(fullName));
  // First + last (e.g. "Afonso Monteiro")
  const shortName = firstLastName(fullName);
  addVariant(shortName);
  // First + second-to-last (e.g. "Afonso Valentin")
  addVariant(firstAndSecondLastName(fullName));
  // Last name alone — catches players known by surname
  if (parts.length >= 3) addVariant(parts[parts.length - 1]);

  // ZZ autocomplete searches player names only — adding club to the query returns 0 results
  const variants = nameVariants;

  // Collect ALL candidates from ALL variants, then pick the best overall
  const allCandidates: ZzSearchCandidate[] = [];
  const seenUrls = new Set<string>();

  console.log(`[ZZ Search] "${fullName}" club="${club}" age=${expectedAge} dob=${dob} variants=${JSON.stringify(variants)}`);

  for (let i = 0; i < variants.length; i++) {
    if (i > 0) await humanDelay(2000, 4000);

    const candidates = await searchZzAutocomplete(variants[i]);
    console.log(`[ZZ Search] variant "${variants[i]}" → ${candidates.length} results: ${candidates.map((c) => `${c.name}(${c.age},${c.club})`).join(', ')}`);
    for (const c of candidates) {
      if (!seenUrls.has(c.url)) {
        seenUrls.add(c.url);
        allCandidates.push(c);
      }
    }

    // Early exit: skip remaining variants if we have a high-confidence candidate
    // Club match OR exact age + strong name overlap (≥2 parts in common) — DOB verification is the real safety net
    const earlyMatch = shortlistCandidates(allCandidates, expectedAge, club, fullName);
    if (earlyMatch.length > 0) {
      const best = earlyMatch[0];
      const hasClubMatch = best.club && club && clubsMatch(best.club, club);
      const hasStrongName = countNameOverlap(best.name, fullName) >= 2 && best.age === expectedAge;
      if (hasClubMatch || hasStrongName) {
        console.log(`[ZZ Search] Early exit: found ${best.name} (age=${best.age}, club=${best.club}) clubMatch=${!!hasClubMatch} nameOverlap=${countNameOverlap(best.name, fullName)}`);
        break;
      }
    }
  }

  // Pre-filter: keep only candidates with matching age (exact or ±1 for birthday boundary)
  const shortlisted = shortlistCandidates(allCandidates, expectedAge, club, fullName);
  console.log(`[ZZ Search] ${allCandidates.length} total candidates → ${shortlisted.length} shortlisted`);
  if (shortlisted.length === 0) return null;

  // Verify the best candidate by scraping their ZZ profile page to check exact DOB
  // This eliminates false positives (same age but different person)
  let bestUnverified: ZzSearchCandidate | null = null;
  for (const candidate of shortlisted) {
    await humanDelay(1500, 3000);
    const zzData = await fetchZeroZeroData(candidate.url).catch(() => null);
    console.log(`[ZZ Search] DOB check: ${candidate.name} (${candidate.url}) → zz_dob=${zzData?.dob} expected=${dob} match=${zzData?.dob === dob}`);

    if (zzData?.dob) {
      // DOB must match exactly — this is the definitive check
      if (zzData.dob === dob) return candidate;
      // DOB exists but doesn't match — skip (wrong person)
      continue;
    }

    // Profile page blocked/empty — track best unverified candidate for fallback
    // Only accept if high confidence: exact age + club match + name overlap
    if (!bestUnverified && candidate.age === expectedAge && candidate.club && club && clubsMatch(candidate.club, club)) {
      bestUnverified = candidate;
    }
  }

  // Fallback: if all profile pages were blocked but we have a high-confidence candidate,
  // return it — the user still has to confirm in the RefreshPlayerButton dialog
  if (bestUnverified) {
    console.log(`[ZZ Search] DOB unverifiable (page blocked), accepting high-confidence match: ${bestUnverified.name} (${bestUnverified.club})`);
    return bestUnverified;
  }

  console.log(`[ZZ Search] No DOB match found for "${fullName}"`);
  return null;
}

/**
 * Pre-filter and rank autocomplete candidates before DOB verification.
 * Returns candidates sorted by likelihood (age match + name overlap + club match).
 * Only candidates with plausible age (exact or ±1) pass.
 */
function shortlistCandidates(
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

export interface ZzLinkFinderResult {
  success: boolean;
  found: number;
  skipped: number;
  errors: number;
  total: number;
}

/** Find ZeroZero links for players that have FPF data but no ZeroZero link */
export async function findZeroZeroLinks(ageGroupId?: number): Promise<ZzLinkFinderResult> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  // Get players with FPF data + name + DOB but no ZeroZero link
  let query = supabase
    .from('players')
    .select('id, name, dob, club, fpf_link, zerozero_link')
    .eq('club_id', clubId)
    .is('zerozero_link', null)
    .not('dob', 'is', null)
    .not('name', 'is', null)
    .order('id');

  if (ageGroupId) query = query.eq('age_group_id', ageGroupId);

  const { data: players, error } = await query;
  if (error || !players) return { success: false, found: 0, skipped: 0, errors: 0, total: 0 };

  // Also include players with empty string zerozero_link
  const filtered = players.filter((p) => !p.zerozero_link && p.dob && p.name);

  let found = 0;
  let skipped = 0;
  let errors = 0;

  for (const player of filtered) {
    // Rate limit — 2-4s between requests (multi-strategy has its own internal delays)
    if (found + skipped + errors > 0) {
      const delay = 2000 + Math.random() * 2000;
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const expectedAge = calcAgeFromDob(player.dob!);
      const bestMatch = await searchZzMultiStrategy(player.name, player.club, expectedAge, player.dob!);

      if (bestMatch) {
        // Extract ZeroZero player ID from URL: /jogador/slug/ID
        const idMatch = bestMatch.url.match(/\/jogador\/[^/]+\/(\d+)/);
        const zzPlayerId = idMatch ? idMatch[1] : '';

        await supabase.from('players').update({
          zerozero_link: bestMatch.url,
          zerozero_player_id: zzPlayerId,
        }).eq('id', player.id).eq('club_id', clubId);

        found++;
      } else {
        skipped++;
      }
    } catch {
      errors++;
    }
  }

  return { success: true, found, skipped, errors, total: filtered.length };
}

/** Find ZeroZero link for a single player by ID */
export async function findZeroZeroLinkForPlayer(playerId: number): Promise<{ success: boolean; url: string | null; error?: string }> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('id, name, dob, club')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  if (!player) return { success: false, url: null, error: 'Jogador não encontrado' };
  if (!player.dob) return { success: false, url: null, error: 'Data de nascimento necessária' };
  if (!player.name) return { success: false, url: null, error: 'Nome necessário' };

  try {
    const expectedAge = calcAgeFromDob(player.dob);
    const bestMatch = await searchZzMultiStrategy(player.name, player.club, expectedAge, player.dob);

    if (!bestMatch) return { success: true, url: null, error: 'Nenhum resultado corresponde' };

    // Save to DB
    const idMatch = bestMatch.url.match(/\/jogador\/[^/]+\/(\d+)/);
    const zzPlayerId = idMatch ? idMatch[1] : '';

    await supabase.from('players').update({
      zerozero_link: bestMatch.url,
      zerozero_player_id: zzPlayerId,
    }).eq('id', player.id).eq('club_id', clubId);

    revalidatePath(`/jogadores/${playerId}`);

    return { success: true, url: bestMatch.url };
  } catch {
    return { success: false, url: null, error: 'Erro ao pesquisar no ZeroZero' };
  }
}
