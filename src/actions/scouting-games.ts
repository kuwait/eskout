// src/actions/scouting-games.ts
// Server Actions for scouting games — add/edit/delete games within a round
// Games can be manual (tournaments, friendlies) or imported from FPF matches
// RELEVANT FILES: src/lib/types/index.ts, src/lib/validators.ts, src/lib/supabase/mappers.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { scoutingGameSchema } from '@/lib/validators';
import type { ActionResponse, ScoutingGame, ScoutingGameRow } from '@/lib/types';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';
import { mapScoutingGameRow } from '@/lib/supabase/mappers';

/* ───────────── Read ───────────── */

/** Fetch all games for a round */
export async function getGamesForRound(roundId: number): Promise<ScoutingGame[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scouting_games')
    .select('*')
    .eq('round_id', roundId)
    .order('match_date', { ascending: true })
    .order('match_time', { ascending: true });

  if (error) {
    console.error('[getGamesForRound] Failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => mapScoutingGameRow(row as ScoutingGameRow));
}

/** Fetch FPF matches available for import (in round date range, not already added) */
export async function getFpfMatchesForImport(
  roundId: number,
  startDate: string,
  endDate: string,
): Promise<{ id: number; homeTeam: string; awayTeam: string; matchDate: string; matchTime: string | null; venue: string | null; competitionName: string | null; escalao: string | null }[]> {
  const { role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') return [];

  const supabase = await createClient();

  // Get already-added FPF match IDs for this round
  const { data: existing } = await supabase
    .from('scouting_games')
    .select('fpf_match_id')
    .eq('round_id', roundId)
    .not('fpf_match_id', 'is', null);

  const existingIds = new Set((existing ?? []).map((r) => r.fpf_match_id));

  // Fetch FPF matches in the date range
  const { data: matches, error } = await supabase
    .from('fpf_matches')
    .select('id, home_team, away_team, match_date, match_time, venue, competition_id, fpf_matches_competition:competition_id(name, escalao)')
    .gte('match_date', startDate)
    .lte('match_date', endDate)
    .eq('is_forfeit', false)
    .order('match_date', { ascending: true })
    .order('match_time', { ascending: true });

  if (error) {
    console.error('[getFpfMatchesForImport] Failed:', error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (matches ?? []).filter((m: any) => !existingIds.has(m.id)).map((m: any) => ({
    id: m.id,
    homeTeam: m.home_team,
    awayTeam: m.away_team,
    matchDate: m.match_date,
    matchTime: m.match_time,
    venue: m.venue,
    competitionName: m.fpf_matches_competition?.name ?? null,
    escalao: m.fpf_matches_competition?.escalao ?? null,
  }));
}

/* ───────────── Create — Manual ───────────── */

export async function addManualGame(data: {
  roundId: number;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  matchTime?: string;
  venue?: string;
  competitionName?: string;
  escalao?: string;
  notes?: string;
}): Promise<ActionResponse<ScoutingGame>> {
  const parsed = scoutingGameSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from('scouting_games')
    .insert({
      club_id: clubId,
      round_id: parsed.data.roundId,
      home_team: parsed.data.homeTeam,
      away_team: parsed.data.awayTeam,
      match_date: parsed.data.matchDate,
      match_time: parsed.data.matchTime ?? null,
      venue: parsed.data.venue ?? null,
      competition_name: parsed.data.competitionName ?? null,
      escalao: parsed.data.escalao ?? null,
      priority: parsed.data.priority,
      notes: parsed.data.notes ?? '',
      created_by: userId,
    })
    .select('*')
    .single();

  if (error || !created) {
    return { success: false, error: `Erro ao criar jogo: ${error?.message ?? 'desconhecido'}` };
  }

  revalidatePath(`/observacoes/${data.roundId}`);
  await broadcastRowMutation(clubId, 'scouting_games', 'INSERT', userId, created.id);
  return { success: true, data: mapScoutingGameRow(created as ScoutingGameRow) };
}

/* ───────────── Create — From FPF ───────────── */

export async function addFpfGame(
  roundId: number,
  fpfMatchId: number,
): Promise<ActionResponse<ScoutingGame>> {
  const { clubId, userId, role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  // Fetch FPF match data
  const { data: match } = await supabase
    .from('fpf_matches')
    .select('*, fpf_matches_competition:competition_id(name, escalao)')
    .eq('id', fpfMatchId)
    .single();

  if (!match) {
    return { success: false, error: 'Jogo FPF não encontrado' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comp = (match as any).fpf_matches_competition;

  const { data: created, error } = await supabase
    .from('scouting_games')
    .insert({
      club_id: clubId,
      round_id: roundId,
      fpf_match_id: fpfMatchId,
      home_team: match.home_team,
      away_team: match.away_team,
      match_date: match.match_date,
      match_time: match.match_time,
      venue: match.venue,
      competition_name: comp?.name ?? null,
      escalao: comp?.escalao ?? null,
      notes: '',
      created_by: userId,
    })
    .select('*')
    .single();

  if (error || !created) {
    if (error?.code === '23505') {
      return { success: false, error: 'Este jogo FPF já foi adicionado a esta jornada' };
    }
    return { success: false, error: `Erro ao importar: ${error?.message ?? 'desconhecido'}` };
  }

  revalidatePath(`/observacoes/${roundId}`);
  await broadcastRowMutation(clubId, 'scouting_games', 'INSERT', userId, created.id);
  return { success: true, data: mapScoutingGameRow(created as ScoutingGameRow) };
}

/* ───────────── Delete ───────────── */

export async function deleteGame(
  gameId: number,
  roundId: number,
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('scouting_games')
    .delete()
    .eq('id', gameId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao eliminar: ${error.message}` };
  }

  revalidatePath(`/observacoes/${roundId}`);
  await broadcastRowMutation(clubId, 'scouting_games', 'DELETE', userId, gameId);
  return { success: true };
}
