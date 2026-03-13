// src/actions/scraping/unified.ts
// Unified FPF + ZeroZero scraper — merges data from both sources and applies changes to player profiles
// Handles the "refresh player" flow: scrape both, detect changes, let user confirm
// RELEVANT FILES: src/actions/scraping/fpf.ts, src/actions/scraping/zerozero.ts, src/actions/scraping/zz-finder.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { normalizePosition } from '@/lib/utils/positions';
import { type ZzParsedProfile } from '@/lib/zerozero/parser';
import { type ZzSearchCandidate } from '@/lib/zerozero/helpers';
import { normalizeCountry, clubsMatch, calcAgeFromDob } from './helpers';
import { fetchFpfData } from './fpf';
import { fetchZeroZeroData } from './zerozero';
import { searchZzMultiStrategy } from './zz-finder';

/* ───────────── Types ───────────── */

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

/** Pre-fetched ZZ data from client-side — avoids server-side ZZ fetch */
export interface PreFetchedZz {
  profileData: ZzParsedProfile | null;
  searchCandidate: { url: string; name: string; age: number | null; club: string | null } | null;
  blocked: boolean;
  /** ZZ was skipped due to cooldown (not a fresh block — just waiting for backoff to expire) */
  cooldown?: boolean;
  searchAttempted: boolean;
}

/* ───────────── Scrape All ───────────── */

/** Scrape BOTH FPF and ZeroZero for a player, merge results, return what changed.
 *  When preZz is provided, ZZ data comes from client-side fetch (no server-side ZZ request). */
export async function scrapePlayerAll(playerId: number, preZz?: PreFetchedZz): Promise<ScrapedChanges> {
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

  // When client provides pre-fetched ZZ data, use it instead of server-side fetch
  if (preZz) {
    zzBlocked = preZz.blocked;
    zzSearchAttempted = preZz.searchAttempted;
    if (preZz.searchCandidate) {
      zzCandidate = { ...preZz.searchCandidate, position: null };
      zzLinkFound = preZz.searchCandidate.url;
      player.zerozero_link = preZz.searchCandidate.url;
    }
  } else if (!player.zerozero_link && player.name && player.dob) {
    // Server-side fallback (bulk/auto operations)
    zzSearchAttempted = true;
    try {
      const expectedAge = calcAgeFromDob(player.dob);
      zzCandidate = await searchZzMultiStrategy(player.name, player.club, expectedAge, player.dob);
      if (zzCandidate) {
        zzLinkFound = zzCandidate.url;
        player.zerozero_link = zzCandidate.url;
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'ZZ_BLOCKED') zzBlocked = true;
    }
  }

  const errors: string[] = [];

  // Scrape FPF server-side + ZZ (from client or server)
  type FpfData = Awaited<ReturnType<typeof fetchFpfData>>;
  type ZzData = Awaited<ReturnType<typeof fetchZeroZeroData>>;

  // ZZ: use pre-fetched client data when available, otherwise fetch server-side
  const zzFromClient = preZz ? preZz.profileData : undefined;

  const [fpfResult, zzResult] = await Promise.all([
    player.fpf_link
      ? fetchFpfData(player.fpf_link).catch(() => null as FpfData)
      : Promise.resolve(null as FpfData),
    // If client provided ZZ data, use it directly (no server fetch)
    zzFromClient !== undefined
      ? Promise.resolve(zzFromClient as ZzData)
      : player.zerozero_link
        ? fetchZeroZeroData(player.zerozero_link).catch((e: unknown) => {
            if (e instanceof Error && e.message === 'ZZ_BLOCKED') zzBlocked = true;
            return null as ZzData;
          })
        : Promise.resolve(null as ZzData),
  ]);

  if (!fpfResult && player.fpf_link) errors.push('FPF indisponível');
  // Detect empty ZZ result (page returned but no useful data — e.g. VPN/geo issues)
  const zzEmpty = !!zzResult && !zzResult.fullName && !zzResult.currentClub && !zzResult.height && !zzResult.photoUrl;
  if (zzBlocked && preZz?.cooldown) errors.push('ZeroZero em pausa (bloqueado recentemente) — apenas FPF atualizado.');
  else if (zzBlocked) errors.push('ZeroZero bloqueou o acesso (captcha) — apenas FPF atualizado.');
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
  // "Sem Clube" from FPF = player left club — propose clearing club in dialog
  const mergedClub = fpfResult?.currentClub || (zzConfirmed ? zzData?.currentClub : null) || null;
  const clubChanged = mergedClub
    ? mergedClub === 'Sem Clube'
      ? Boolean(player.club?.trim())          // "Sem Clube" is a change if player currently has a club
      : !clubsMatch(mergedClub, player.club ?? '')
    : false;

  // FPF-sourced: nationality, birth country (FPF priority, ZZ fallback if confirmed)
  // normalizeCountry fixes FPF accent issues (e.g. "Guine Bissau" → "Guiné-Bissau")
  const mergedNationality = normalizeCountry(fpfResult?.nationality || (zzConfirmed ? zzData?.nationality : null) || null);
  const nationalityChanged = !!mergedNationality && mergedNationality !== player.nationality;
  const mergedBirthCountry = normalizeCountry(fpfResult?.birthCountry || (zzConfirmed ? zzData?.birthCountry : null) || null);
  const birthCountryChanged = !!mergedBirthCountry && mergedBirthCountry !== player.birth_country;

  // Club logo: skip if player is "Sem Clube" (no club = no logo to show)
  // FPF and ZZ return different URLs for the same club — don't nag when club is the same
  const mergedLogo = mergedClub === 'Sem Clube' ? null : ((zzConfirmed ? zzData?.clubLogoUrl : null) || fpfResult?.clubLogoUrl || null);
  const clubLogoChanged = !!mergedLogo && (clubChanged || !player.club_logo_url);

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

/* ───────────── Apply Scraped Data ───────────── */

/** Apply merged scraped data to the player's main fields.
 *  preZzProfile: when client already fetched ZZ profile, skip server-side ZZ fetch for cache fields. */
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
  },
  preZzProfile?: ZzParsedProfile | null,
): Promise<{ success: boolean }> {
  const { clubId, role, isDemo } = await getActiveClub();
  if (isDemo) return { success: false };
  if (role === 'scout') {
    return { success: false };
  }

  const supabase = await createClient();
  const dbUpdates: Record<string, unknown> = {};

  // "Sem Clube" is a valid state — FPF confirmed player has no club; also clear club logo
  if (updates.club) {
    dbUpdates.club = updates.club;
    if (updates.club === 'Sem Clube') dbUpdates.club_logo_url = null;
  }
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

  // Fill ZZ cache fields since the link is saved
  // Also fill in main profile fields (nationality, position, foot, height, weight) if still empty
  if (updates.zzLinkFound) {
    // Use client-provided ZZ profile data when available, otherwise fetch server-side
    const zzData = preZzProfile !== undefined ? preZzProfile : await fetchZeroZeroData(updates.zzLinkFound).catch(() => null);
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
