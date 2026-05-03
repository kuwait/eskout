// src/actions/scraping/fpf-competitions/playing-up.ts
// "Playing Up" detection — find players competing above their natural age group
// Uses a single SQL RPC for performance (replaces ~15 sequential HTTP requests)
// RELEVANT FILES: supabase/migrations/067_playing_up_rpc.sql, src/lib/constants.ts

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/lib/types';
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
  /** Player's current club in eskout (may differ from competition team if they transferred) */
  eskoutClub: string | null;
  /** Phase name within the competition (e.g. "1.ª Fase") */
  phaseName: string | null;
  /** Series/group name within the competition (e.g. "SÉRIE 01") */
  seriesName: string | null;
  /** FPF profile link from eskout player record */
  fpfLink: string | null;
  /** ZeroZero profile link from eskout player record */
  zerozeroLink: string | null;
}

/* ───────────── Main Query (RPC) ───────────── */

/** Find players competing above their natural age group in a competition.
 *  Uses a single SQL RPC that does aggregation + DOB join + filtering server-side. */
export async function getPlayingUpPlayers(
  competitionId: number,
  // High default — competitions with many series can have 1000+ playing-up players,
  // and an arbitrary 500 cap silently drops entire series with low-minute players.
  // Internal admin tool, payload size not a concern.
  limit: number = 10000,
): Promise<ActionResponse<PlayingUpPlayer[]>> {
  const supabase = await requireCompetitionAccess();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  // PostgREST caps RPC responses at db-max-rows (1000). To get more, paginate
  // via the function's p_offset parameter and accumulate client-side.
  const PAGE = 1000;
  const allRows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < limit; offset += PAGE) {
    const pageLimit = Math.min(PAGE, limit - offset);
    const { data, error } = await supabase.rpc('get_playing_up_players', {
      p_competition_id: competitionId,
      p_limit: pageLimit,
      p_offset: offset,
    });

    if (error) {
      if (error.message?.includes('escalão')) {
        return { success: false, error: 'Competição sem escalão definido — não é possível detetar "jogar acima"' };
      }
      return { success: false, error: error.message };
    }

    if (!data?.length) break;
    allRows.push(...data);
    if (data.length < pageLimit) break; // last page
  }
  const data = allRows;

  // Map DB snake_case rows to camelCase PlayingUpPlayer
  const result: PlayingUpPlayer[] = data.map((r: Record<string, unknown>) => ({
    fpfPlayerId: r.fpf_player_id as number | null,
    playerName: r.player_name as string,
    teamName: r.team_name as string,
    dob: r.dob as string | null,
    birthYear: r.birth_year as number | null,
    naturalEscalao: r.birth_year ? birthYearToAgeGroup(r.birth_year as number) : null,
    competitionEscalao: r.competition_escalao as string,
    yearsAbove: r.years_above as number,
    gamesStarted: r.games_started as number,
    gamesAsSub: r.games_as_sub as number,
    totalGames: r.total_games as number,
    totalMinutes: Number(r.total_minutes),
    goals: Number(r.goals),
    penaltyGoals: Number(r.penalty_goals),
    yellowCards: Number(r.yellow_cards),
    redCards: Number(r.red_cards),
    eskoutPlayerId: r.eskout_player_id as number | null,
    isInEskout: r.is_in_eskout as boolean,
    eskoutClub: r.eskout_club as string | null,
    phaseName: r.phase_name as string | null,
    seriesName: r.series_name as string | null,
    fpfLink: r.fpf_link as string | null,
    zerozeroLink: r.zerozero_link as string | null,
  }));

  return { success: true, data: result };
}
