// src/actions/comparisons.ts
// Server Actions for saving and managing player comparisons
// Users can save a named set of 2-3 player IDs for quick access later
// RELEVANT FILES: src/app/comparar/page.tsx, src/app/comparar/ComparePageClient.tsx, src/lib/types/index.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';
import { saveComparisonSchema } from '@/lib/validators';
import type { ActionResponse, SavedComparison, SavedComparisonRow } from '@/lib/types';

/* ───────────── Helpers ───────────── */

function mapRow(row: SavedComparisonRow): SavedComparison {
  return {
    id: row.id,
    clubId: row.club_id,
    userId: row.user_id,
    name: row.name,
    playerIds: row.player_ids,
    createdAt: row.created_at,
  };
}

/* ───────────── Queries ───────────── */

/** Get all saved comparisons for the current club */
export async function getSavedComparisons(): Promise<SavedComparison[]> {
  const ctx = await getActiveClub();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('saved_comparisons')
    .select('*')
    .eq('club_id', ctx.clubId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getSavedComparisons error:', error);
    return [];
  }

  return (data as SavedComparisonRow[]).map(mapRow);
}

/* ───────────── Mutations ───────────── */

/** Save a new comparison */
export async function saveComparison(
  input: { name: string; playerIds: number[] },
): Promise<ActionResponse<SavedComparison>> {
  const parsed = saveComparisonSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }

  const ctx = await getActiveClub();
  if (ctx.isDemo) return { success: false, error: 'Modo demonstração — apenas leitura' };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('saved_comparisons')
    .insert({
      club_id: ctx.clubId,
      user_id: ctx.userId,
      name: parsed.data.name,
      player_ids: parsed.data.playerIds,
    })
    .select()
    .single();

  if (error) {
    console.error('saveComparison error:', error);
    return { success: false, error: 'Erro ao guardar comparação' };
  }

  const comparison = mapRow(data as SavedComparisonRow);

  await broadcastRowMutation(ctx.clubId, 'saved_comparisons', 'INSERT', ctx.userId, comparison.id);

  revalidatePath('/comparar');
  return { success: true, data: comparison };
}

/** Delete a saved comparison */
export async function deleteComparison(comparisonId: number): Promise<ActionResponse> {
  const ctx = await getActiveClub();
  if (ctx.isDemo) return { success: false, error: 'Modo demonstração — apenas leitura' };
  const supabase = await createClient();

  const { error } = await supabase
    .from('saved_comparisons')
    .delete()
    .eq('id', comparisonId)
    .eq('club_id', ctx.clubId);

  if (error) {
    console.error('deleteComparison error:', error);
    return { success: false, error: 'Erro ao eliminar comparação' };
  }

  await broadcastRowMutation(ctx.clubId, 'saved_comparisons', 'DELETE', ctx.userId, comparisonId);

  revalidatePath('/comparar');
  return { success: true };
}
