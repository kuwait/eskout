// src/actions/scraping.ts
// Server Actions for scraping external data (FPF + ZeroZero) and updating player profiles
// Runs server-side on Vercel — triggered from browser on player save or bulk update
// RELEVANT FILES: src/actions/players.ts, src/lib/supabase/server.ts, src/lib/types/index.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizePosition } from '@/lib/utils/positions';

/* ───────────── Constants ───────────── */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

/* ───────────── Helpers ───────────── */

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

    // BirthDate: FPF model typically has "dd/MM/yyyy" or ISO format
    let dob: string | null = null;
    const rawDob = (model.BirthDate || model.DateOfBirth || model.DataNascimento) as string | null;
    if (rawDob) {
      const ddMM = rawDob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (ddMM) {
        dob = `${ddMM[3]}-${ddMM[2]}-${ddMM[1]}`; // → yyyy-MM-dd
      } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDob)) {
        dob = rawDob.slice(0, 10);
      }
    }

    return {
      currentClub: (model.CurrentClub as string) || null,
      photoUrl: (model.Image as string) || null,
      fullName: (model.FullName as string) || null,
      dob,
      birthCountry: (model.BirthCountry || model.CountryOfBirth || model.PaisNascimento || model.BirthPlace) as string | null,
      nationality: (model.Nationality || model.Nacionalidade) as string | null,
    };
  } catch {
    return null;
  }
}

/** Scrape FPF for a single player — returns scraped data for the client to decide what to update */
export async function scrapePlayerFpf(playerId: number): Promise<FpfScrapeResult> {
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('fpf_link, club, photo_url, zz_photo_url')
    .eq('id', playerId)
    .single();

  if (!player?.fpf_link) return { success: false, club: null, photoUrl: null, birthCountry: null, nationality: null, clubChanged: false };

  const data = await fetchFpfData(player.fpf_link);
  if (!data) return { success: false, club: null, photoUrl: null, birthCountry: null, nationality: null, clubChanged: false };

  // Always update fpf_current_club and fpf_last_checked
  await supabase.from('players').update({
    fpf_current_club: data.currentClub,
    fpf_last_checked: new Date().toISOString(),
  }).eq('id', playerId);

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
    const res = await fetch(zzLink, { headers: HEADERS, next: { revalidate: 0 } });
    if (!res.ok) return null;

    // ZeroZero serves pages in ISO-8859-1 (Latin-1), not UTF-8
    // Using res.text() would corrupt ç, ã, é etc. — decode manually
    const buf = await res.arrayBuffer();
    const html = new TextDecoder('iso-8859-1').decode(buf);
    const result = {
      fullName: null as string | null,
      dob: null as string | null,
      currentClub: null as string | null,
      currentTeam: null as string | null,
      photoUrl: null as string | null,
      height: null as number | null,
      weight: null as number | null,
      nationality: null as string | null,
      birthCountry: null as string | null,
      position: null as string | null,
      foot: null as string | null,
      shirtNumber: null as string | null,
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

    /* ── 2. HTML card-data sidebar (most reliable source on ZeroZero) ── */
    // Helper: extract value after a card-data__label
    function cardValue(label: string): string | null {
      // Pattern: card-data__label">Label</span>...<span class="card-data__value">Value</span>
      const re = new RegExp(`card-data__label">${label}</span>[\\s\\S]*?card-data__value[^>]*>([^<]+)`, 'i');
      const m = html.match(re);
      return m ? m[1].trim() : null;
    }
    // Helper: for fields using micrologo_and_text (nationality, birth country)
    function cardValueWithFlag(label: string): string | null {
      const re = new RegExp(`card-data__label">${label}</span>[\\s\\S]*?class="text">([^<]+)`, 'i');
      const m = html.match(re);
      return m ? m[1].trim() : null;
    }

    // Position — from sidebar card-data (e.g. "Ponta de Lança") — overrides JSON-LD description
    // which only has a generic "Avançado" while sidebar has the precise "Ponta de Lança"
    const sidebarPos = cardValue('Posi[çc][ãa]o');
    if (sidebarPos && sidebarPos.length < 40) result.position = sidebarPos;

    // Club from hidden "Clube atual" row in sidebar
    if (!result.currentClub) {
      const sidebarClub = cardValueWithFlag('Clube atual');
      if (sidebarClub) result.currentClub = sidebarClub;
    }

    // Preferred foot — "Pé preferencial" → "Direito" / "Esquerdo" / "Ambidextro"
    if (!result.foot) {
      const foot = cardValue('P[ée]\\s*[Pp]referencial');
      if (foot) {
        const raw = foot.toLowerCase();
        if (raw.includes('direito') || raw === 'right') result.foot = 'Dir';
        else if (raw.includes('esquerdo') || raw === 'left') result.foot = 'Esq';
        else if (raw.includes('ambidextro') || raw.includes('amb')) result.foot = 'Amb';
      }
    }

    // DOB from sidebar — "dd/MM/yyyy", "dd-MM-yyyy", or "yyyy-MM-dd (XX anos)"
    if (!result.dob) {
      const dobVal = cardValue('Data de Nascimento');
      if (dobVal) {
        // Try dd/MM/yyyy or dd-MM-yyyy first
        const ddMM = dobVal.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
        if (ddMM) {
          result.dob = `${ddMM[3]}-${ddMM[2]}-${ddMM[1]}`;
        } else {
          // Handle "2009-11-27 (16 anos)" or plain "2009-11-27"
          const isoMatch = dobVal.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (isoMatch) result.dob = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
        }
      }
    }

    // Name from sidebar card-data (most reliable on ZeroZero)
    if (!result.fullName) {
      const sidebarName = cardValue('Nome');
      if (sidebarName) result.fullName = sidebarName;
    }

    // Name from page header as last fallback
    if (!result.fullName) {
      const nameMatch = html.match(/<h1[^>]*class="[^"]*zz-enthdr-name[^"]*"[^>]*>([^<]+)/);
      if (nameMatch) result.fullName = nameMatch[1].trim();
    }

    // Shirt number from header — <span class="number">7.</span>
    if (!result.shirtNumber) {
      const numMatch = html.match(/<span\s+class="number"[^>]*>(\d+)\./);
      if (numMatch) result.shirtNumber = numMatch[1];
    }

    // Birth country — uses flag icon + text
    if (!result.birthCountry) {
      result.birthCountry = cardValueWithFlag('Pa[ií]s de Nascimento');
    }

    // Nationality from sidebar (overrides JSON-LD if available since it's more reliable)
    const sidebarNat = cardValueWithFlag('Nacionalidade');
    if (sidebarNat) result.nationality = sidebarNat;

    // Height from sidebar — "185 cm"
    if (result.height === null) {
      const h = cardValue('Altura');
      if (h) {
        const hNum = parseInt(h, 10);
        if (hNum > 0) result.height = hNum;
      }
    }

    // Weight from sidebar — "70 kg"
    if (result.weight === null) {
      const w = cardValue('Peso');
      if (w) {
        const wNum = parseInt(w, 10);
        if (wNum > 0) result.weight = wNum;
      }
    }

    // Club fallback from header or description
    if (!result.currentClub) {
      const clubMatch = html.match(/class="zz-enthdr-club"[^>]*>([^<]+)/);
      if (clubMatch) {
        const club = clubMatch[1].trim();
        if (club && club !== 'Sem Equipa') result.currentClub = club;
      }
    }

    // Photo fallback from HTML img
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
  } catch {
    return null;
  }
}

/** Scrape ZeroZero for a single player — returns scraped data for the client to decide */
export async function scrapePlayerZeroZero(playerId: number): Promise<ZzScrapeResult> {
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('zerozero_link, club')
    .eq('id', playerId)
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
  }).eq('id', playerId);

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
  /** Fields that have new/changed values */
  club: string | null;
  clubChanged: boolean;
  photoUrl: string | null;
  hasNewPhoto: boolean;
  height: number | null;
  heightChanged: boolean;
  weight: number | null;
  weightChanged: boolean;
  birthCountry: string | null;
  birthCountryChanged: boolean;
  nationality: string | null;
  nationalityChanged: boolean;
  /** Normalized position code (e.g. "MDC") from ZeroZero raw position text */
  position: string | null;
  /** Raw position text from ZeroZero (e.g. "Médio Defensivo") for display */
  positionRaw: string | null;
  positionChanged: boolean;
  /** Preferred foot from ZeroZero (normalized to "Dir"/"Esq"/"Amb") */
  foot: string | null;
  footChanged: boolean;
  gamesSeason: number | null;
  goalsSeason: number | null;
  /** True if any field has meaningful changes to show */
  hasChanges: boolean;
}

/** Scrape BOTH FPF and ZeroZero for a player, merge results, return what changed */
export async function scrapePlayerAll(playerId: number): Promise<ScrapedChanges> {
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('fpf_link, zerozero_link, club, photo_url, zz_photo_url, height, weight, birth_country, nationality, position_normalized, foot')
    .eq('id', playerId)
    .single();

  const EMPTY_RESULT: ScrapedChanges = { success: false, errors: [], club: null, clubChanged: false, photoUrl: null, hasNewPhoto: false, height: null, heightChanged: false, weight: null, weightChanged: false, birthCountry: null, birthCountryChanged: false, nationality: null, nationalityChanged: false, position: null, positionRaw: null, positionChanged: false, foot: null, footChanged: false, gamesSeason: null, goalsSeason: null, hasChanges: false };

  if (!player) {
    return { ...EMPTY_RESULT, errors: ['Jogador não encontrado'] };
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
      ? fetchZeroZeroData(player.zerozero_link).catch(() => null as ZzData)
      : Promise.resolve(null as ZzData),
  ]);

  if (!fpfResult && player.fpf_link) errors.push('FPF');
  if (!zzResult && player.zerozero_link) errors.push('ZeroZero');

  if (!fpfResult && !zzResult) {
    const noLinks = !player.fpf_link && !player.zerozero_link;
    return { ...EMPTY_RESULT, success: !noLinks, errors: noLinks ? ['Sem links externos'] : errors };
  }

  // Update zz_* and fpf_* cache fields
  const cacheUpdates: Record<string, unknown> = {};
  if (fpfResult) {
    cacheUpdates.fpf_current_club = fpfResult.currentClub;
    cacheUpdates.fpf_last_checked = new Date().toISOString();
  }
  if (zzResult) {
    cacheUpdates.zz_current_club = zzResult.currentClub;
    cacheUpdates.zz_current_team = zzResult.currentTeam;
    cacheUpdates.zz_games_season = zzResult.gamesSeason;
    cacheUpdates.zz_goals_season = zzResult.goalsSeason;
    cacheUpdates.zz_height = zzResult.height;
    cacheUpdates.zz_weight = zzResult.weight;
    cacheUpdates.zz_photo_url = zzResult.photoUrl;
    cacheUpdates.zz_team_history = zzResult.teamHistory?.length ? zzResult.teamHistory : null;
    cacheUpdates.zz_last_checked = new Date().toISOString();
  }
  await supabase.from('players').update(cacheUpdates).eq('id', playerId);

  // Merge: ZeroZero takes priority for photo, height, weight; FPF for nationality/birthCountry
  // Club: prefer FPF if available, else ZZ
  const mergedClub = fpfResult?.currentClub || zzResult?.currentClub || null;
  const clubChanged = mergedClub ? !clubsMatch(mergedClub, player.club ?? '') : false;

  // Photo: ZeroZero priority, then FPF
  const mergedPhoto = zzResult?.photoUrl || fpfResult?.photoUrl || null;
  const currentPhoto = player.photo_url || player.zz_photo_url;
  const hasNewPhoto = !!mergedPhoto && !currentPhoto;

  // Height/weight from ZeroZero
  const mergedHeight = zzResult?.height ?? null;
  const heightChanged = mergedHeight !== null && mergedHeight !== player.height;
  const mergedWeight = zzResult?.weight ?? null;
  const weightChanged = mergedWeight !== null && mergedWeight !== player.weight;

  // Nationality: FPF priority, then ZZ
  const mergedNationality = fpfResult?.nationality || zzResult?.nationality || null;
  const nationalityChanged = !!mergedNationality && mergedNationality !== player.nationality;

  // Birth country: FPF priority, then ZZ (ZeroZero has it in sidebar card-data)
  const mergedBirthCountry = fpfResult?.birthCountry || zzResult?.birthCountry || null;
  const birthCountryChanged = !!mergedBirthCountry && mergedBirthCountry !== player.birth_country;

  // Position from ZeroZero — normalize to code, compare with current
  const positionRaw = zzResult?.position ?? null;
  const positionNormalized = positionRaw ? normalizePosition(positionRaw) : '';
  const positionChanged = !!positionNormalized && positionNormalized !== (player.position_normalized ?? '');

  // Foot from ZeroZero
  const mergedFoot = zzResult?.foot ?? null;
  const footChanged = !!mergedFoot && mergedFoot !== (player.foot ?? '');

  const hasChanges = clubChanged || hasNewPhoto || heightChanged || weightChanged || nationalityChanged || birthCountryChanged || positionChanged || footChanged;

  revalidatePath(`/jogadores/${playerId}`);

  return {
    success: true,
    errors,
    club: mergedClub,
    clubChanged,
    photoUrl: mergedPhoto,
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
    foot: mergedFoot,
    footChanged,
    gamesSeason: zzResult?.gamesSeason ?? null,
    goalsSeason: zzResult?.goalsSeason ?? null,
    hasChanges,
  };
}

/** Apply merged scraped data to the player's main fields */
export async function applyScrapedData(
  playerId: number,
  updates: {
    club?: string;
    photoUrl?: string;
    height?: number;
    weight?: number;
    birthCountry?: string;
    nationality?: string;
    position?: string;
    foot?: string;
  }
): Promise<{ success: boolean }> {
  const supabase = await createClient();
  const dbUpdates: Record<string, unknown> = {};

  if (updates.club) dbUpdates.club = updates.club;
  if (updates.photoUrl) dbUpdates.photo_url = updates.photoUrl;
  if (updates.height) dbUpdates.height = updates.height;
  if (updates.weight) dbUpdates.weight = updates.weight;
  if (updates.birthCountry) dbUpdates.birth_country = updates.birthCountry;
  if (updates.nationality) dbUpdates.nationality = updates.nationality;
  if (updates.position) dbUpdates.position_normalized = updates.position;
  if (updates.foot) dbUpdates.foot = updates.foot;

  if (Object.keys(dbUpdates).length === 0) return { success: true };

  const { error } = await supabase.from('players').update(dbUpdates).eq('id', playerId);
  if (error) return { success: false };

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
  foot: string | null;
  shirtNumber: string | null;
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
    position: null, positionRaw: null, foot: null, shirtNumber: null, photoUrl: null,
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
  const foot = zzResult?.foot ?? null;
  const shirtNumber = zzResult?.shirtNumber ?? null;
  const photoUrl = zzResult?.photoUrl || fpfResult?.photoUrl || null;
  const height = zzResult?.height ?? null;
  const weight = zzResult?.weight ?? null;
  const nationality = fpfResult?.nationality || zzResult?.nationality || null;
  const birthCountry = fpfResult?.birthCountry || zzResult?.birthCountry || null;

  return {
    success: true, errors,
    name, dob, club, position, positionRaw, foot, shirtNumber,
    photoUrl, height, weight, nationality, birthCountry,
  };
}

/* ───────────── Auto-scrape on Link Change ───────────── */

/** Called after saving a player profile — scrapes any links that changed */
export async function autoScrapePlayer(
  playerId: number,
  fpfLinkChanged: boolean,
  zzLinkChanged: boolean
): Promise<void> {
  const promises: Promise<unknown>[] = [];
  if (fpfLinkChanged) promises.push(scrapePlayerFpf(playerId));
  if (zzLinkChanged) promises.push(scrapePlayerZeroZero(playerId));
  await Promise.all(promises);
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
  const supabase = await createClient();

  let query = supabase.from('players').select('id, fpf_link, zerozero_link, club, photo_url, zz_photo_url, height, weight, birth_country, nationality', { count: 'exact' });

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
          }).eq('id', player.id);

          // Auto-apply: photo if player has none
          if (data.photoUrl && !player.photo_url && !player.zz_photo_url) {
            autoUpdates.photo_url = data.photoUrl;
          }
          // Club if changed
          if (data.currentClub && !clubsMatch(data.currentClub, player.club ?? '')) {
            autoUpdates.club = data.currentClub;
          }
          // Nationality / birth country if empty
          if (data.nationality && !player.nationality) {
            autoUpdates.nationality = data.nationality;
          }
          if (data.birthCountry && !player.birth_country) {
            autoUpdates.birth_country = data.birthCountry;
          }
        } else errors++;
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
          }).eq('id', player.id);

          // ZZ photo takes priority
          if (data.photoUrl) {
            autoUpdates.photo_url = data.photoUrl;
          }
          if (data.currentClub && !clubsMatch(data.currentClub, player.club ?? '')) {
            autoUpdates.club = data.currentClub;
          }
          // Height/weight if missing or different
          if (data.height && !player.height) autoUpdates.height = data.height;
          if (data.weight && !player.weight) autoUpdates.weight = data.weight;
          // Nationality from ZZ if still empty
          if (data.nationality && !player.nationality && !autoUpdates.nationality) {
            autoUpdates.nationality = data.nationality;
          }
        } else errors++;
      }

      // Apply auto-updates
      if (Object.keys(autoUpdates).length > 0) {
        await supabase.from('players').update(autoUpdates).eq('id', player.id);
      }
    } catch {
      errors++;
    }
  }

  const hasMore = offset + players.length < (count ?? 0);
  return { total: count ?? 0, processed: offset + players.length, fpfUpdated, zzUpdated, errors, hasMore };
}
