// src/actions/evaluations.ts
// Server Actions for scout evaluations — each scout can rate a player independently (1-5)
// One evaluation per scout per player (upsert), affects hybrid rating average
// RELEVANT FILES: src/lib/types/index.ts, src/components/players/ScoutEvaluations.tsx, src/lib/supabase/club-context.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import type { ActionResponse } from '@/lib/types';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';

/** Create or update the current user's evaluation for a player */
export async function upsertScoutEvaluation(
  playerId: number,
  rating: number
): Promise<ActionResponse> {
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return { success: false, error: 'Avaliação deve ser entre 1 e 5' };
  }

  const { clubId, userId, isDemo } = await getActiveClub();
  if (isDemo) return { success: false, error: 'Modo demonstração — apenas leitura' };
  const supabase = await createClient();

  const { error } = await supabase
    .from('scout_evaluations')
    .upsert(
      { player_id: playerId, user_id: userId, club_id: clubId, rating, updated_at: new Date().toISOString() },
      { onConflict: 'player_id,user_id' }
    );

  if (error) {
    return { success: false, error: `Erro ao guardar avaliação: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'scout_evaluations', 'UPDATE', userId, playerId);
  return { success: true };
}

/** Delete the current user's evaluation for a player */
export async function deleteScoutEvaluation(
  playerId: number
): Promise<ActionResponse> {
  const { clubId, userId, isDemo } = await getActiveClub();
  if (isDemo) return { success: false, error: 'Modo demonstração — apenas leitura' };
  const supabase = await createClient();

  const { error } = await supabase
    .from('scout_evaluations')
    .delete()
    .eq('player_id', playerId)
    .eq('user_id', userId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao remover avaliação: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'scout_evaluations', 'DELETE', userId, playerId);
  return { success: true };
}
