// src/actions/squads.ts
// Server Actions for shadow squad and real squad management
// Handles adding/removing players from squads with status history logging
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/types/index.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { shadowSquadSchema } from '@/lib/validators';
import type { ActionResponse, PositionCode } from '@/lib/types';

/* ───────────── Helper: log status change ───────────── */

async function logStatusChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: number,
  fieldChanged: string,
  oldValue: string | null,
  newValue: string | null,
  userId: string,
  notes?: string
) {
  await supabase.from('status_history').insert({
    player_id: playerId,
    field_changed: fieldChanged,
    old_value: oldValue,
    new_value: newValue,
    changed_by: userId,
    notes: notes ?? null,
  });
}

/* ───────────── Add to Shadow Squad ───────────── */

export async function addToShadowSquad(
  playerId: number,
  position: PositionCode
): Promise<ActionResponse> {
  const parsed = shadowSquadSchema.safeParse({ playerId, position });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  // Get current state for history
  const { data: player } = await supabase
    .from('players')
    .select('is_shadow_squad, shadow_position')
    .eq('id', playerId)
    .single();

  const { data: updated, error } = await supabase
    .from('players')
    .update({ is_shadow_squad: true, shadow_position: position })
    .eq('id', playerId)
    .select('id')
    .single();

  if (error || !updated) {
    return { success: false, error: `Erro ao adicionar ao plantel sombra: ${error?.message ?? 'sem permissão ou jogador não encontrado'}` };
  }

  await logStatusChange(
    supabase, playerId, 'is_shadow_squad',
    player?.is_shadow_squad ? 'true' : 'false', 'true', user.id,
    `Adicionado ao plantel sombra na posição ${position}`
  );

  if (player?.shadow_position !== position) {
    await logStatusChange(
      supabase, playerId, 'shadow_position',
      player?.shadow_position ?? null, position, user.id
    );
  }

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}

/* ───────────── Remove from Shadow Squad ───────────── */

export async function removeFromShadowSquad(
  playerId: number
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  // Get current state for history
  const { data: player } = await supabase
    .from('players')
    .select('shadow_position')
    .eq('id', playerId)
    .single();

  const { data: updated, error } = await supabase
    .from('players')
    .update({ is_shadow_squad: false, shadow_position: null })
    .eq('id', playerId)
    .select('id')
    .single();

  if (error || !updated) {
    return { success: false, error: `Erro ao remover do plantel sombra: ${error?.message ?? 'sem permissão ou jogador não encontrado'}` };
  }

  await logStatusChange(
    supabase, playerId, 'is_shadow_squad',
    'true', 'false', user.id,
    `Removido do plantel sombra (era ${player?.shadow_position ?? '?'})`
  );

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}

/* ───────────── Toggle Real Squad ───────────── */

export async function toggleRealSquad(
  playerId: number,
  isReal: boolean,
  /** Position to assign in the real squad formation (optional, used when adding) */
  position?: PositionCode
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  // When adding to real squad with a specific position, update position_normalized
  const updateData: Record<string, unknown> = { is_real_squad: isReal };
  if (isReal && position) {
    updateData.position_normalized = position;
  }

  const { data: updated, error } = await supabase
    .from('players')
    .update(updateData)
    .eq('id', playerId)
    .select('id')
    .single();

  if (error || !updated) {
    return { success: false, error: `Erro ao atualizar plantel real: ${error?.message ?? 'sem permissão ou jogador não encontrado'}` };
  }

  await logStatusChange(
    supabase, playerId, 'is_real_squad',
    isReal ? 'false' : 'true', isReal ? 'true' : 'false', user.id,
    isReal ? `Adicionado ao plantel real${position ? ` na posição ${position}` : ''}` : 'Removido do plantel real'
  );

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}

/* ───────────── Reorder Squad Player (within same position) ───────────── */

export async function reorderSquadPlayer(
  playerId: number,
  newOrder: number,
  squadType: 'real' | 'shadow'
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const orderField = squadType === 'shadow' ? 'shadow_order' : 'real_order';
  const { error } = await supabase
    .from('players')
    .update({ [orderField]: newOrder })
    .eq('id', playerId);

  if (error) {
    return { success: false, error: `Erro ao reordenar: ${error.message}` };
  }

  revalidatePath('/campo');
  return { success: true };
}

/* ───────────── Bulk Reorder: update order for multiple players at once ───────────── */

export async function bulkReorderSquad(
  updates: { playerId: number; order: number }[],
  squadType: 'real' | 'shadow'
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const orderField = squadType === 'shadow' ? 'shadow_order' : 'real_order';

  // Update each player's order — small N so sequential is fine
  for (const { playerId, order } of updates) {
    const { error } = await supabase
      .from('players')
      .update({ [orderField]: order })
      .eq('id', playerId);
    if (error) {
      return { success: false, error: `Erro ao reordenar jogador ${playerId}: ${error.message}` };
    }
  }

  revalidatePath('/campo');
  return { success: true };
}

/* ───────────── Move Squad Player to Different Position ───────────── */

export async function moveSquadPlayerPosition(
  playerId: number,
  newPosition: PositionCode,
  newOrder: number,
  squadType: 'real' | 'shadow'
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const orderField = squadType === 'shadow' ? 'shadow_order' : 'real_order';
  const positionField = squadType === 'shadow' ? 'shadow_position' : 'position_normalized';

  // Get old position for history
  const { data: player } = await supabase
    .from('players')
    .select(positionField)
    .eq('id', playerId)
    .single();

  const oldPosition = player ? (player as Record<string, unknown>)[positionField] as string | null : null;

  const { error } = await supabase
    .from('players')
    .update({ [positionField]: newPosition, [orderField]: newOrder })
    .eq('id', playerId);

  if (error) {
    return { success: false, error: `Erro ao mover jogador: ${error.message}` };
  }

  await logStatusChange(
    supabase, playerId, positionField,
    oldPosition as string, newPosition, user.id,
    `Movido de ${oldPosition ?? '?'} para ${newPosition}`
  );

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}
