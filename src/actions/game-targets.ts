// src/actions/game-targets.ts
// Server Actions for game observation targets — coordinators request specific player observations
// Scouts see targets in their game cards and submit QSRs linked to the game
// RELEVANT FILES: src/lib/types/index.ts, src/lib/supabase/mappers.ts, src/actions/scouting-games.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/club-context';
import type { ActionResponse, GameObservationTarget, GameObservationTargetRow } from '@/lib/types';
import { mapGameObservationTargetRow } from '@/lib/supabase/mappers';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';

/* ───────────── Read ───────────── */

/** Fetch all targets for games in a round, with report completion status */
export async function getTargetsForRound(
  roundId: number,
  gameIds: number[],
): Promise<Map<number, GameObservationTarget[]>> {
  if (gameIds.length === 0) return new Map();

  const supabase = await createClient();

  // Fetch targets with player info
  const { data: targets, error } = await supabase
    .from('game_observation_targets')
    .select('*, players:player_id(name, club, position_normalized, photo_url, zz_photo_url)')
    .in('game_id', gameIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getTargetsForRound] Failed:', error.message);
    return new Map();
  }

  // Fetch QSRs linked to these games to determine completion
  const { data: qsrs } = await supabase
    .from('quick_scout_reports')
    .select('game_id, player_id')
    .in('game_id', gameIds)
    .not('game_id', 'is', null);

  // Build lookup: `gameId|playerId` → has report
  const reportKeys = new Set(
    (qsrs ?? []).map((q) => `${q.game_id}|${q.player_id}`),
  );

  // Group by game
  const result = new Map<number, GameObservationTarget[]>();
  for (const row of (targets ?? []) as GameObservationTargetRow[]) {
    const hasReport = reportKeys.has(`${row.game_id}|${row.player_id}`);
    const target = mapGameObservationTargetRow(row, hasReport);
    const existing = result.get(row.game_id) ?? [];
    existing.push(target);
    result.set(row.game_id, existing);
  }

  return result;
}

/* ───────────── Create ───────────── */

/** Add a player observation target to a game */
export async function addGameTarget(
  gameId: number,
  playerId: number,
  roundId: number,
  notes?: string,
): Promise<ActionResponse<GameObservationTarget>> {
  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from('game_observation_targets')
    .insert({
      club_id: clubId,
      game_id: gameId,
      player_id: playerId,
      added_by: userId,
      notes: notes ?? '',
    })
    .select('*, players:player_id(name, club, position_normalized, photo_url, zz_photo_url)')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Este jogador já é alvo neste jogo' };
    }
    return { success: false, error: `Erro ao adicionar alvo: ${error.message}` };
  }

  revalidatePath(`/observacoes/${roundId}`);
  await broadcastRowMutation(clubId, 'game_observation_targets', 'INSERT', userId, created.id);

  return {
    success: true,
    data: mapGameObservationTargetRow(created as GameObservationTargetRow, false),
  };
}

/* ───────────── Delete ───────────── */

/** Remove a player observation target from a game */
export async function removeGameTarget(
  targetId: number,
  roundId: number,
): Promise<ActionResponse> {
  const { clubId, userId } = await getAuthContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from('game_observation_targets')
    .delete()
    .eq('id', targetId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao remover alvo: ${error.message}` };
  }

  revalidatePath(`/observacoes/${roundId}`);
  await broadcastRowMutation(clubId, 'game_observation_targets', 'DELETE', userId, targetId);

  return { success: true };
}
