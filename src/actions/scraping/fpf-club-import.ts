// src/actions/scraping/fpf-club-import.ts
// Server actions for importing players from FPF club pages — search clubs, list registered players, import
// Enables bulk import of a club's registered players by escalão directly from FPF data
// RELEVANT FILES: src/actions/scraping/fpf.ts, src/actions/players.ts, src/app/admin/dados/FpfClubImportTab.tsx

'use server';

import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { birthYearToAgeGroup, CURRENT_SEASON } from '@/lib/constants';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';
import { revalidatePath } from 'next/cache';
import { fetchFpfData } from './fpf';
import { HEADERS, getFpfSeasonId } from './helpers';
import type { ActionResponse } from '@/lib/types';

/* ───────────── FPF API Constants ───────────── */

const FPF_BASE = 'https://www.fpf.pt';

// DNN module routing headers — discovered from FPF AngularJS source
const CLUB_SEARCH_HEADERS = { ModuleId: '3220', TabId: '848' };
const CLUB_DETAIL_HEADERS = { ModuleId: '3221', TabId: '1499' };

// Season ID computed via shared helper (getFpfSeasonId in helpers.ts)

/* ───────────── Types ───────────── */

export interface FpfClubSearchResult {
  id: number;
  name: string;
  url: string;
}

export interface FpfClubPlayer {
  name: string;
  birthdate: string; // ISO format from FPF
  url: string; // FPF player profile URL
  photoUrl: string | null;
}

export interface ImportPlayerResult {
  action: 'created' | 'updated' | 'unchanged';
  playerId?: number;
  playerName: string;
  reason?: string;
}

/* ───────────── Search Clubs ───────────── */

/** Search FPF clubs by name (autocomplete) */
export async function searchFpfClubs(searchText: string): Promise<ActionResponse<FpfClubSearchResult[]>> {
  const { role } = await getActiveClub();
  if (role !== 'admin') return { success: false, error: 'Sem permissão' };

  if (!searchText || searchText.trim().length < 2) {
    return { success: false, error: 'Pesquisa deve ter pelo menos 2 caracteres' };
  }

  try {
    const res = await fetch(`${FPF_BASE}/DesktopModules/MVC/SearchClubs/Default/GetClubsByName`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        ...CLUB_SEARCH_HEADERS,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Referer': `${FPF_BASE}/pt/competicoes/clubes`,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ searchText: searchText.trim() }),
      next: { revalidate: 0 },
    });

    if (!res.ok) return { success: false, error: `Erro FPF: ${res.status}` };

    const data = await res.json() as { Id: number; Text: string; Url: string }[];
    const clubs: FpfClubSearchResult[] = data.map((c) => ({
      id: c.Id,
      name: c.Text,
      url: c.Url,
    }));

    return { success: true, data: clubs };
  } catch (e) {
    return { success: false, error: `Erro ao pesquisar: ${e instanceof Error ? e.message : 'desconhecido'}` };
  }
}

/* ───────────── Get Club Players ───────────── */

/** Fetch registered players for a club + escalão from FPF */
export async function getFpfClubPlayers(
  clubId: number,
  classId: number,
): Promise<ActionResponse<FpfClubPlayer[]>> {
  const { role } = await getActiveClub();
  if (role !== 'admin') return { success: false, error: 'Sem permissão' };

  try {
    const seasonId = getFpfSeasonId();
    const params = new URLSearchParams({
      seasonId: String(seasonId),
      type: '1', // Futebol
      gender: '2', // Masculino
      classId: String(classId),
      clubId: String(clubId),
    });

    // Need a session cookie from FPF — fetch club page first to get cookies
    const pageRes = await fetch(`${FPF_BASE}/pt/Clubes/Detalhe-de-clube/Club/${clubId}`, {
      headers: HEADERS,
      next: { revalidate: 0 },
    });
    const cookies = pageRes.headers.getSetCookie?.() ?? [];
    const cookieStr = cookies.map((c) => c.split(';')[0]).join('; ');

    const res = await fetch(
      `${FPF_BASE}/DesktopModules/MVC/ClubDetail/Default/GetClubPlayers?${params}`,
      {
        headers: {
          ...HEADERS,
          ...CLUB_DETAIL_HEADERS,
          'Accept': 'application/json',
          'Referer': `${FPF_BASE}/pt/Clubes/Detalhe-de-clube/Club/${clubId}`,
          'X-Requested-With': 'XMLHttpRequest',
          ...(cookieStr ? { Cookie: cookieStr } : {}),
        },
        next: { revalidate: 0 },
      },
    );

    if (!res.ok) return { success: false, error: `Erro FPF: ${res.status}` };

    const data = await res.json() as { Name: string; Birthdate: string; Url: string; PhotoUrl: string | null }[];
    const players: FpfClubPlayer[] = data.map((p) => ({
      name: p.Name,
      birthdate: p.Birthdate ? p.Birthdate.slice(0, 10) : '', // "2011-01-28T00:00:00" → "2011-01-28"
      url: p.Url.startsWith('http') ? p.Url : `${FPF_BASE}${p.Url}`,
      photoUrl: p.PhotoUrl || null,
    }));

    return { success: true, data: players };
  } catch (e) {
    return { success: false, error: `Erro ao buscar jogadores: ${e instanceof Error ? e.message : 'desconhecido'}` };
  }
}

/* ───────────── Import / Update Single Player ───────────── */

/** Import or update a single FPF player. Creates if new, updates club/photo/data if exists. */
export async function importFpfPlayer(
  player: FpfClubPlayer,
  clubName: string,
): Promise<ActionResponse<ImportPlayerResult>> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  const fpfLink = player.url;

  // Scrape individual FPF profile for extra data (nationality, photo, club logo)
  const fpfData = await fetchFpfData(fpfLink);
  const now = new Date().toISOString();

  // Check if player already exists — by FPF link first, then name+DOB
  const { data: existing } = await supabase
    .from('players')
    .select('id, name, club, photo_url, zz_photo_url, fpf_link, nationality, birth_country')
    .eq('fpf_link', fpfLink)
    .eq('club_id', clubId)
    .maybeSingle();

  // Fallback: name + DOB match (player exists but without FPF link)
  const matched = existing ?? (player.name && player.birthdate
    ? (await supabase.from('players')
        .select('id, name, club, photo_url, zz_photo_url, fpf_link, nationality, birth_country')
        .ilike('name', player.name.trim())
        .eq('dob', player.birthdate)
        .eq('club_id', clubId)
        .maybeSingle()).data
    : null);

  if (matched) {
    const res = await updateExistingPlayer(supabase, matched, fpfLink, clubName, clubId, fpfData, now);
    if (!res.success) console.error('[FPF Import] Update failed:', player.name, res.error);
    return res;
  }

  // New player — create
  const res = await createNewPlayer(supabase, player, fpfLink, clubName, clubId, fpfData, now);
  if (!res.success) console.error('[FPF Import] Create failed:', player.name, res.error);
  return res;
}

/** Update an existing player with fresh FPF data */
async function updateExistingPlayer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  existing: { id: number; name: string; club: string | null; photo_url: string | null; zz_photo_url: string | null; fpf_link: string | null; nationality: string | null; birth_country: string | null },
  fpfLink: string,
  clubName: string,
  clubId: string,
  fpfData: Awaited<ReturnType<typeof fetchFpfData>>,
  now: string,
): Promise<ActionResponse<ImportPlayerResult>> {
  // Build updates — only include fields that actually changed
  const updates: Record<string, unknown> = {
    fpf_last_checked: now,
  };

  // FPF link (if missing or different)
  if (!existing.fpf_link || existing.fpf_link !== fpfLink) {
    updates.fpf_link = fpfLink;
  }

  // Club — always update to match the club we're importing from
  if (existing.club !== clubName) {
    updates.club = clubName;
  }

  // FPF scraped data
  if (fpfData) {
    updates.fpf_current_club = fpfData.currentClub;
    if (fpfData.clubLogoUrl) updates.club_logo_url = fpfData.clubLogoUrl;
    if (fpfData.nationality && !existing.nationality) updates.nationality = fpfData.nationality;
    if (fpfData.birthCountry && !existing.birth_country) updates.birth_country = fpfData.birthCountry;

    // Photo logic:
    // - Club changed → always update photo (new club = new identity, old photo is outdated)
    // - Same club → only update if current photo is NOT from ZeroZero (user chose ZZ → preserve)
    const clubChanged = existing.club !== clubName;
    const hasZzPhoto = existing.zz_photo_url && existing.photo_url === existing.zz_photo_url;
    if (fpfData.photoUrl && (clubChanged || !hasZzPhoto)) {
      updates.photo_url = fpfData.photoUrl;
    }
  }

  // Check if anything actually changed (besides fpf_last_checked)
  const meaningfulKeys = Object.keys(updates).filter((k) => k !== 'fpf_last_checked');

  const { error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', existing.id)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar: ${error.message}` };
  }

  await broadcastRowMutation(clubId, 'players', 'UPDATE', 'system', existing.id);

  if (meaningfulKeys.length === 0) {
    return { success: true, data: { action: 'unchanged', playerId: existing.id, playerName: existing.name, reason: 'Sem alterações' } };
  }

  return { success: true, data: { action: 'updated', playerId: existing.id, playerName: existing.name, reason: `Atualizado: ${meaningfulKeys.join(', ')}` } };
}

/** Create a new player from FPF data */
async function createNewPlayer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  player: FpfClubPlayer,
  fpfLink: string,
  clubName: string,
  clubId: string,
  fpfData: Awaited<ReturnType<typeof fetchFpfData>>,
  now: string,
): Promise<ActionResponse<ImportPlayerResult>> {
  const birthYear = new Date(player.birthdate).getFullYear();
  const ageGroupName = birthYearToAgeGroup(birthYear);
  if (!ageGroupName) {
    return { success: false, error: `Ano ${birthYear} sem escalão` };
  }

  // Find or create age group
  let { data: ageGroup } = await supabase
    .from('age_groups')
    .select('id')
    .eq('name', ageGroupName)
    .eq('season', CURRENT_SEASON)
    .eq('club_id', clubId)
    .single();

  if (!ageGroup) {
    const { data: newAg, error: agError } = await supabase
      .from('age_groups')
      .insert({ name: ageGroupName, generation_year: birthYear, season: CURRENT_SEASON, club_id: clubId })
      .select('id')
      .single();
    if (agError) return { success: false, error: `Erro escalão: ${agError.message}` };
    ageGroup = newAg;
  }

  const { data: newPlayer, error } = await supabase
    .from('players')
    .insert({
      club_id: clubId,
      age_group_id: ageGroup!.id,
      name: player.name,
      dob: player.birthdate,
      club: clubName,
      fpf_link: fpfLink,
      fpf_last_checked: now,
      fpf_current_club: fpfData?.currentClub ?? clubName,
      photo_url: fpfData?.photoUrl ?? null,
      club_logo_url: fpfData?.clubLogoUrl ?? null,
      nationality: fpfData?.nationality ?? null,
      birth_country: fpfData?.birthCountry ?? null,
      department_opinion: ['Por Observar'],
      recruitment_status: null,
      created_by: null,
      pending_approval: false,
      admin_reviewed: true,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: `Erro ao criar: ${error.message}` };
  }

  await broadcastRowMutation(clubId, 'players', 'INSERT', 'system', newPlayer!.id);

  return { success: true, data: { action: 'created', playerId: newPlayer!.id, playerName: player.name } };
}

/** Revalidate pages after batch import completes */
export async function finishFpfImport(): Promise<void> {
  revalidatePath('/jogadores');
  revalidatePath('/admin/dados');
  revalidatePath('/campo');
  revalidatePath('/pipeline');
}
