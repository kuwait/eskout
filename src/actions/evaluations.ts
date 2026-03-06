// src/actions/evaluations.ts
// Server Actions for scout evaluations — each scout can rate a player independently (1-5)
// One evaluation per scout per player (upsert), affects hybrid rating average
// RELEVANT FILES: src/lib/types/index.ts, src/components/players/ScoutEvaluations.tsx, src/components/players/PlayerProfile.tsx

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/lib/types';

/** Create or update the current user's evaluation for a player */
export async function upsertScoutEvaluation(
  playerId: number,
  rating: number
): Promise<ActionResponse> {
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return { success: false, error: 'Avaliação deve ser entre 1 e 5' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const { error } = await supabase
    .from('scout_evaluations')
    .upsert(
      { player_id: playerId, user_id: user.id, rating, updated_at: new Date().toISOString() },
      { onConflict: 'player_id,user_id' }
    );

  if (error) {
    return { success: false, error: `Erro ao guardar avaliação: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}

/** Delete the current user's evaluation for a player */
export async function deleteScoutEvaluation(
  playerId: number
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const { error } = await supabase
    .from('scout_evaluations')
    .delete()
    .eq('player_id', playerId)
    .eq('user_id', user.id);

  if (error) {
    return { success: false, error: `Erro ao remover avaliação: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}
