// src/actions/scout-assignments.ts
// Server Actions for scout assignments — assign scouts to games with conflict detection
// Admin/editor assign; scouts can confirm/complete their own assignments
// RELEVANT FILES: src/lib/types/index.ts, src/lib/validators.ts, src/actions/scouting-games.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import type { ActionResponse, ScoutAssignment, ScoutAssignmentRow, ScoutAssignmentStatus } from '@/lib/types';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';
import { mapScoutAssignmentRow } from '@/lib/supabase/mappers';

/* ───────────── Read ───────────── */

/** Fetch all assignments for all games in a round */
export async function getAssignmentsForRound(roundId: number): Promise<ScoutAssignment[]> {
  const supabase = await createClient();

  // Get game IDs for this round, then fetch assignments
  const { data: games } = await supabase
    .from('scouting_games')
    .select('id')
    .eq('round_id', roundId);

  if (!games || games.length === 0) return [];

  const gameIds = games.map((g) => g.id);

  const { data, error } = await supabase
    .from('scout_assignments')
    .select('*')
    .in('game_id', gameIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getAssignmentsForRound] Failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => mapScoutAssignmentRow(row as ScoutAssignmentRow));
}

/** Assigned game with round and game details — used for /meus-jogos */
export interface AssignedGame {
  assignmentId: number;
  assignmentStatus: ScoutAssignmentStatus;
  roundId: number;
  roundName: string;
  gameId: number;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  matchTime: string | null;
  venue: string | null;
  competitionName: string | null;
  escalao: string | null;
}

/** Fetch all assigned games for the current user across published rounds */
export async function getMyAssignedGames(): Promise<AssignedGame[]> {
  const { userId } = await getActiveClub();
  const supabase = await createClient();

  // Fetch assignments with joined game + round data
  const { data, error } = await supabase
    .from('scout_assignments')
    .select(`
      id, status, game_id,
      scouting_games!inner(id, round_id, home_team, away_team, match_date, match_time, venue, competition_name, escalao,
        scouting_rounds!inner(id, name, status)
      )
    `)
    .eq('scout_id', userId)
    .neq('status', 'cancelled');

  if (error) {
    console.error('[getMyAssignedGames] Failed:', error.message);
    return [];
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (data ?? []).filter((row: any) => {
    // Only published rounds
    return row.scouting_games?.scouting_rounds?.status === 'published';
  }).map((row: any) => {
  /* eslint-enable @typescript-eslint/no-explicit-any */
    const game = row.scouting_games;
    const round = game.scouting_rounds;
    return {
      assignmentId: row.id,
      assignmentStatus: row.status as ScoutAssignmentStatus,
      roundId: round.id,
      roundName: round.name,
      gameId: game.id,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      matchDate: game.match_date,
      matchTime: game.match_time,
      venue: game.venue,
      competitionName: game.competition_name,
      escalao: game.escalao,
    };
  }).sort((a: AssignedGame, b: AssignedGame) => a.matchDate.localeCompare(b.matchDate));
}

/* ───────────── Conflict Detection ───────────── */

export interface AssignmentConflict {
  type: 'already_assigned' | 'no_availability';
  message: string;
  gameId?: number;
  gameName?: string;
}

/** Check for conflicts before assigning a scout to a game. Returns warnings (not blocking). */
export async function checkAssignmentConflicts(
  scoutId: string,
  gameId: number,
  roundId: number,
): Promise<AssignmentConflict[]> {
  const supabase = await createClient();
  const conflicts: AssignmentConflict[] = [];

  // Get the target game's date/time
  const { data: targetGame } = await supabase
    .from('scouting_games')
    .select('match_date, match_time, home_team, away_team')
    .eq('id', gameId)
    .single();

  if (!targetGame) return conflicts;

  // 1. Check if scout is already assigned to another game at the same date+time
  const { data: roundGames } = await supabase
    .from('scouting_games')
    .select('id, match_date, match_time, home_team, away_team')
    .eq('round_id', roundId)
    .eq('match_date', targetGame.match_date)
    .neq('id', gameId);

  if (roundGames && roundGames.length > 0) {
    const sameTimeGameIds = roundGames
      .filter((g) => !targetGame.match_time || !g.match_time || g.match_time === targetGame.match_time)
      .map((g) => g.id);

    if (sameTimeGameIds.length > 0) {
      const { data: existingAssignments } = await supabase
        .from('scout_assignments')
        .select('game_id')
        .eq('scout_id', scoutId)
        .in('game_id', sameTimeGameIds)
        .neq('status', 'cancelled');

      if (existingAssignments && existingAssignments.length > 0) {
        const conflictGame = roundGames.find((g) => g.id === existingAssignments[0].game_id);
        conflicts.push({
          type: 'already_assigned',
          message: `Já atribuído a ${conflictGame?.home_team ?? '?'} vs ${conflictGame?.away_team ?? '?'} no mesmo horário`,
          gameId: existingAssignments[0].game_id,
          gameName: conflictGame ? `${conflictGame.home_team} vs ${conflictGame.away_team}` : undefined,
        });
      }
    }
  }

  // 2. Check if scout has declared availability for this date
  const { data: avail } = await supabase
    .from('scout_availability')
    .select('availability_type, available_date, period, time_start, time_end')
    .eq('round_id', roundId)
    .eq('scout_id', scoutId);

  if (!avail || avail.length === 0) {
    conflicts.push({
      type: 'no_availability',
      message: 'Scout não declarou disponibilidade para esta jornada',
    });
  } else {
    const hasAlways = avail.some((a) => a.availability_type === 'always');
    const hasDateMatch = avail.some((a) => a.available_date === targetGame.match_date);
    if (!hasAlways && !hasDateMatch) {
      conflicts.push({
        type: 'no_availability',
        message: `Scout não tem disponibilidade para ${new Date(targetGame.match_date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}`,
      });
    }
  }

  return conflicts;
}

/* ───────────── Create ───────────── */

export async function assignScout(
  gameId: number,
  scoutId: string,
  roundId: number,
  coordinatorNotes?: string,
): Promise<ActionResponse<ScoutAssignment & { conflicts: AssignmentConflict[] }>> {
  const { clubId, userId, role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  // Check conflicts (warnings only — doesn't block)
  const conflicts = await checkAssignmentConflicts(scoutId, gameId, roundId);

  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from('scout_assignments')
    .insert({
      club_id: clubId,
      game_id: gameId,
      scout_id: scoutId,
      assigned_by: userId,
      coordinator_notes: coordinatorNotes ?? '',
    })
    .select('*')
    .single();

  if (error || !created) {
    if (error?.code === '23505') {
      return { success: false, error: 'Scout já está atribuído a este jogo' };
    }
    return { success: false, error: `Erro ao atribuir: ${error?.message ?? 'desconhecido'}` };
  }

  revalidatePath(`/observacoes/${roundId}`);
  await broadcastRowMutation(clubId, 'scout_assignments', 'INSERT', userId, created.id);

  const assignment = mapScoutAssignmentRow(created as ScoutAssignmentRow);
  return { success: true, data: { ...assignment, conflicts } };
}

/* ───────────── Remove ───────────── */

export async function removeAssignment(
  assignmentId: number,
  roundId: number,
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('scout_assignments')
    .delete()
    .eq('id', assignmentId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao remover: ${error.message}` };
  }

  revalidatePath(`/observacoes/${roundId}`);
  await broadcastRowMutation(clubId, 'scout_assignments', 'DELETE', userId, assignmentId);
  return { success: true };
}

/* ───────────── Update Status ───────────── */

export async function updateAssignmentStatus(
  assignmentId: number,
  status: ScoutAssignmentStatus,
  roundId: number,
): Promise<ActionResponse> {
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  // RLS handles permission (scout own + admin/editor any)
  const { error } = await supabase
    .from('scout_assignments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', assignmentId);

  if (error) {
    return { success: false, error: `Erro ao alterar estado: ${error.message}` };
  }

  revalidatePath(`/observacoes/${roundId}`);
  await broadcastRowMutation(clubId, 'scout_assignments', 'UPDATE', userId, assignmentId);
  return { success: true };
}
