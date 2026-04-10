// src/actions/scraping/links.ts
// Link-based scraping — scrape from raw URLs (new player flow), scout reports, and auto-scrape on link change
// No player ID needed for scrapeFromLinks — used when creating new players
// RELEVANT FILES: src/actions/scraping/fpf.ts, src/actions/scraping/zerozero.ts, src/actions/scraping/zz-finder.ts

'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/club-context';
import { normalizePosition } from '@/lib/utils/positions';
import { type ZzParsedProfile } from '@/lib/zerozero/parser';
import { type ZzSearchCandidate } from '@/lib/zerozero/helpers';
import { normalizeCountry } from './helpers';
import { fetchFpfData, scrapePlayerFpf } from './fpf';
import { fetchZeroZeroData, scrapePlayerZeroZero, scrapePlayerZeroZeroWithData } from './zerozero';
import { searchZzMultiStrategy, findZeroZeroLinkForPlayer } from './zz-finder';

/* ───────────── Types ───────────── */

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

export interface ScoutReportScrapeResult extends ScrapedNewPlayerData {
  zzLinkFound: string | null;
  zzCandidateName: string | null;
  zzCandidateAge: number | null;
  zzCandidateClub: string | null;
  zzPhotoUrl: string | null;
}

/* ───────────── Scrape from Links ───────────── */

/** Scrape FPF and/or ZeroZero from raw URLs — no player needed, used for creating new players.
 *  When preZzData is provided, ZZ data comes from client-side fetch (no server-side ZZ request). */
export async function scrapeFromLinks(fpfLink?: string, zzLink?: string, preZzData?: ZzParsedProfile | null): Promise<ScrapedNewPlayerData> {
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
    // Use pre-fetched client data when available
    preZzData !== undefined
      ? Promise.resolve(preZzData as ZzData)
      : zzLink ? fetchZeroZeroData(zzLink).catch(() => null as ZzData) : Promise.resolve(null as ZzData),
  ]);

  if (!fpfResult && fpfLink) errors.push('Não foi possível aceder ao FPF');
  if (!zzResult && zzLink) errors.push('Não foi possível aceder ao ZeroZero');

  if (!fpfResult && !zzResult) return { ...EMPTY, errors };

  // Merge: FPF for name/DOB/nationality, ZZ for position/foot/height/weight/photo
  const name = fpfResult?.fullName || zzResult?.fullName || null;
  // FPF DOB is the official source — always prefer it; ZZ is fallback only
  const dob = fpfResult?.dob || zzResult?.dob || null;
  if (!dob && fpfLink && fpfResult) {
    errors.push('Data de nascimento não encontrada no FPF');
  }
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

/* ───────────── Scout Report Scraping ───────────── */

/** Used by /submeter — scrapes FPF, tries to auto-find ZZ link, then scrapes ZZ too.
 *  When preZz is provided, ZZ data comes from client-side fetch. */
export async function scrapeForScoutReport(
  fpfLink: string,
  zzLink?: string,
  preZz?: { profileData: ZzParsedProfile | null; searchCandidate: { url: string; name: string; age: number | null; club: string | null } | null },
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

  // Step 2: if no ZZ link provided, use client-provided search result or server-side fallback
  let resolvedZzLink = zzLink?.trim() || null;
  let candidate: ZzSearchCandidate | null = null;
  let preZzProfile: ZzParsedProfile | null | undefined = undefined;

  if (preZz) {
    // Client already searched and/or fetched ZZ data
    if (preZz.searchCandidate) {
      candidate = { ...preZz.searchCandidate, position: null };
      resolvedZzLink = preZz.searchCandidate.url;
    }
    preZzProfile = preZz.profileData;
  } else if (!resolvedZzLink && fpfData.fullName && fpfData.dob) {
    // Server-side fallback (no client data provided)
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

  // Step 3: scrape both with the resolved ZZ link (ZZ from client when available)
  const result = await scrapeFromLinks(fpfLink, resolvedZzLink || undefined, preZzProfile);

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

/** Called after saving a player profile — scrapes any links that changed.
 *  preZzProfile: when client already fetched ZZ profile, skip server-side ZZ fetch. */
export async function autoScrapePlayer(
  playerId: number,
  fpfLinkChanged: boolean,
  zzLinkChanged: boolean,
  preZzProfile?: ZzParsedProfile | null,
): Promise<{ errors: string[] }> {
  const errors: string[] = [];

  const fpfPromise = fpfLinkChanged ? scrapePlayerFpf(playerId) : Promise.resolve(null);
  // Use client-provided ZZ profile when available
  const zzPromise = zzLinkChanged
    ? (preZzProfile !== undefined ? scrapePlayerZeroZeroWithData(playerId, preZzProfile) : scrapePlayerZeroZero(playerId))
    : Promise.resolve(null);
  const [fpfResult, zzResult] = await Promise.all([fpfPromise, zzPromise]);

  if (fpfResult && !fpfResult.success) errors.push('FPF: falha ao aceder aos dados');
  if (zzResult && !zzResult.success) errors.push('ZeroZero: bloqueado ou indisponível');

  // After FPF scrape, try to auto-find ZeroZero link if player doesn't have one
  if (fpfLinkChanged && !zzLinkChanged) {
    const { clubId } = await getAuthContext();
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
