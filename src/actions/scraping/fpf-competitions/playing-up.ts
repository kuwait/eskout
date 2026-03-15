// src/actions/scraping/fpf-competitions/playing-up.ts
// "Playing Up" detection — find players competing above their natural age group
// Cross-references player DOB with competition escalão to find younger players with significant minutes
// RELEVANT FILES: src/actions/scraping/fpf-competitions/stats.ts, src/lib/constants.ts

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResponse, FpfCompetitionRow, FpfMatchPlayerRow } from '@/lib/types';
import { birthYearToAgeGroup } from '@/lib/constants';

/* ───────────── Auth Helper ───────────── */

async function requireCompetitionAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin, can_view_competitions')
    .eq('id', user.id)
    .single();

  if (!profile?.is_superadmin && !profile?.can_view_competitions) return null;
  return supabase;
}

/* ───────────── Types ───────────── */

export interface PlayingUpPlayer {
  fpfPlayerId: number | null;
  playerName: string;
  teamName: string;
  dob: string | null;
  birthYear: number | null;
  naturalEscalao: string | null;
  competitionEscalao: string;
  yearsAbove: number;
  gamesStarted: number;
  gamesAsSub: number;
  totalGames: number;
  totalMinutes: number;
  goals: number;
  penaltyGoals: number;
  yellowCards: number;
  redCards: number;
  eskoutPlayerId: number | null;
  /** Whether this player already exists in our eskout DB */
  isInEskout: boolean;
}

/* ───────────── DOB Sources ───────────── */

/** Try to get DOB for an FPF player from our eskout DB.
 *  Returns a map of fpfPlayerId → dob string. */
async function getPlayerDobs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fpfPlayerIds: number[],
): Promise<Map<number, string>> {
  const dobMap = new Map<number, string>();
  if (fpfPlayerIds.length === 0) return dobMap;

  // Strategy 1: match via eskout_player_id link (already linked from scraping)
  const { data: linked } = await supabase
    .from('fpf_match_players')
    .select('fpf_player_id, eskout_player_id')
    .in('fpf_player_id', fpfPlayerIds)
    .not('eskout_player_id', 'is', null);

  const eskoutIds = [...new Set((linked ?? [])
    .filter((r: { eskout_player_id: number | null }) => r.eskout_player_id != null)
    .map((r: { eskout_player_id: number | null }) => r.eskout_player_id!))];

  if (eskoutIds.length > 0) {
    const { data: players } = await supabase
      .from('players')
      .select('id, dob')
      .in('id', eskoutIds);

    // Build eskout_id → dob map
    const eskoutDob = new Map<number, string>();
    for (const p of (players ?? [])) {
      if (p.dob) eskoutDob.set(p.id, p.dob);
    }

    // Map back to fpf_player_id
    for (const link of (linked ?? [])) {
      if (link.eskout_player_id && link.fpf_player_id) {
        const dob = eskoutDob.get(link.eskout_player_id);
        if (dob) dobMap.set(link.fpf_player_id, dob);
      }
    }
  }

  // No Strategy 2 (name-based DOB lookup) — too unreliable.
  // Players must be properly linked (via FPF ID or manual) to appear in "Jogar Acima".
  // Better to miss a player than to show wrong data from a false name match.

  return dobMap;
}

/* ───────────── Main Query ───────────── */

/** Find players competing above their natural age group in a competition.
 *  Only returns players where we can determine their DOB and it's younger than expected. */
export async function getPlayingUpPlayers(
  competitionId: number,
  limit: number = 100,
): Promise<ActionResponse<PlayingUpPlayer[]>> {
  const supabase = await requireCompetitionAccess();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  // Get competition info (needed for escalão + expected birth years)
  const { data: comp } = await supabase
    .from('fpf_competitions')
    .select('*')
    .eq('id', competitionId)
    .single();

  if (!comp) return { success: false, error: 'Competição não encontrada' };

  const typedComp = comp as FpfCompetitionRow;
  if (!typedComp.escalao || !typedComp.expected_birth_year_end) {
    return { success: false, error: 'Competição sem escalão definido — não é possível detetar "jogar acima"' };
  }

  // Fetch all match players for this competition
  const { data: matches } = await supabase
    .from('fpf_matches')
    .select('id')
    .eq('competition_id', competitionId);

  if (!matches?.length) return { success: true, data: [] };
  const matchIds = matches.map((m: { id: number }) => m.id);

  // Paginated fetch of all match_players
  const PAGE = 1000;
  const allRows: FpfMatchPlayerRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('fpf_match_players')
      .select('*')
      .in('match_id', matchIds)
      .range(offset, offset + PAGE - 1);

    if (!data?.length) break;
    allRows.push(...(data as FpfMatchPlayerRow[]));
    if (data.length < PAGE) break;
  }

  // Get unique FPF player IDs
  const fpfPlayerIds = [...new Set(allRows.filter((r) => r.fpf_player_id).map((r) => r.fpf_player_id!))];

  // Get DOBs from our DB
  const dobMap = await getPlayerDobs(supabase, fpfPlayerIds);

  // Aggregate stats per player
  const playerMap = new Map<string, {
    fpfPlayerId: number | null;
    playerName: string;
    teamName: string;
    gamesStarted: number;
    gamesAsSub: number;
    totalGames: number;
    totalMinutes: number;
    goals: number;
    penaltyGoals: number;
    yellowCards: number;
    redCards: number;
    eskoutPlayerId: number | null;
  }>();

  for (const r of allRows) {
    const key = r.fpf_player_id ? `id:${r.fpf_player_id}` : `name:${r.player_name}|${r.team_name}`;
    const existing = playerMap.get(key);

    if (existing) {
      existing.gamesStarted += r.is_starter ? 1 : 0;
      existing.gamesAsSub += (!r.is_starter && (r.minutes_played ?? 0) > 0) ? 1 : 0;
      existing.totalGames += (r.is_starter || (r.minutes_played ?? 0) > 0) ? 1 : 0;
      existing.totalMinutes += r.minutes_played ?? 0;
      existing.goals += r.goals;
      existing.penaltyGoals += r.penalty_goals;
      existing.yellowCards += r.yellow_cards;
      existing.redCards += r.red_cards;
      if (r.eskout_player_id) existing.eskoutPlayerId = r.eskout_player_id;
    } else {
      playerMap.set(key, {
        fpfPlayerId: r.fpf_player_id,
        playerName: r.player_name,
        teamName: r.team_name,
        gamesStarted: r.is_starter ? 1 : 0,
        gamesAsSub: (!r.is_starter && (r.minutes_played ?? 0) > 0) ? 1 : 0,
        totalGames: (r.is_starter || (r.minutes_played ?? 0) > 0) ? 1 : 0,
        totalMinutes: r.minutes_played ?? 0,
        goals: r.goals,
        penaltyGoals: r.penalty_goals,
        yellowCards: r.yellow_cards,
        redCards: r.red_cards,
        eskoutPlayerId: r.eskout_player_id,
      });
    }
  }

  // Filter to players with DOB younger than expected
  const expectedOldestYear = typedComp.expected_birth_year_end;
  const result: PlayingUpPlayer[] = [];

  for (const player of playerMap.values()) {
    if (!player.fpfPlayerId) continue;

    const dob = dobMap.get(player.fpfPlayerId);
    if (!dob) continue;

    const birthYear = parseInt(dob.slice(0, 4), 10);
    if (isNaN(birthYear)) continue;

    // Player is "playing up" if born AFTER the youngest expected year
    // E.g. Sub-15 expected 2011-2012, player born 2013 → playing 1 year up
    if (birthYear <= expectedOldestYear) continue;

    const yearsAbove = birthYear - expectedOldestYear;
    const naturalEscalao = birthYearToAgeGroup(birthYear);

    result.push({
      ...player,
      dob,
      birthYear,
      naturalEscalao,
      competitionEscalao: typedComp.escalao!,
      yearsAbove,
      isInEskout: player.eskoutPlayerId != null,
    });
  }

  // Sort by minutes (most minutes = most trusted by coach)
  result.sort((a, b) => b.totalMinutes - a.totalMinutes || b.goals - a.goals);

  return { success: true, data: result.slice(0, limit) };
}
