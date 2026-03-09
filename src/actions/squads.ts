// src/actions/squads.ts
// Server Actions for shadow squad and real squad management
// Handles adding/removing players from squads with status history logging
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/supabase/club-context.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { shadowSquadSchema } from '@/lib/validators';
import type { ActionResponse } from '@/lib/types';
import { broadcastRowMutation, broadcastBulkMutation } from '@/lib/realtime/broadcast';

/* ───────────── Helper: log status change ───────────── */

async function logStatusChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  playerId: number,
  fieldChanged: string,
  oldValue: string | null,
  newValue: string | null,
  userId: string,
  notes?: string
) {
  await supabase.from('status_history').insert({
    club_id: clubId,
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
  position: string
): Promise<ActionResponse> {
  const parsed = shadowSquadSchema.safeParse({ playerId, position });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout' || role === 'recruiter') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  // Get current state for history
  const { data: player } = await supabase
    .from('players')
    .select('is_shadow_squad, shadow_position')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const { data: updated, error } = await supabase
    .from('players')
    .update({ is_shadow_squad: true, shadow_position: position })
    .eq('id', playerId)
    .eq('club_id', clubId)
    .select('id')
    .single();

  if (error || !updated) {
    return { success: false, error: `Erro ao adicionar ao plantel sombra: ${error?.message ?? 'sem permissão ou jogador não encontrado'}` };
  }

  await logStatusChange(
    supabase, clubId, playerId, 'is_shadow_squad',
    player?.is_shadow_squad ? 'true' : 'false', 'true', userId,
    `Adicionado ao plantel sombra na posição ${position}`
  );

  if (player?.shadow_position !== position) {
    await logStatusChange(
      supabase, clubId, playerId, 'shadow_position',
      player?.shadow_position ?? null, position, userId
    );
  }

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Remove from Shadow Squad ───────────── */

export async function removeFromShadowSquad(
  playerId: number
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout' || role === 'recruiter') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  // Get current state for history
  const { data: player } = await supabase
    .from('players')
    .select('shadow_position')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const { data: updated, error } = await supabase
    .from('players')
    .update({ is_shadow_squad: false, shadow_position: null })
    .eq('id', playerId)
    .eq('club_id', clubId)
    .select('id')
    .single();

  if (error || !updated) {
    return { success: false, error: `Erro ao remover do plantel sombra: ${error?.message ?? 'sem permissão ou jogador não encontrado'}` };
  }

  await logStatusChange(
    supabase, clubId, playerId, 'is_shadow_squad',
    'true', 'false', userId,
    `Removido do plantel sombra (era ${player?.shadow_position ?? '?'})`
  );

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Toggle Real Squad ───────────── */

export async function toggleRealSquad(
  playerId: number,
  isReal: boolean,
  /** Position to assign in the real squad formation (optional, used when adding) */
  position?: string,
  /** Age group to assign — used for cross-age-group "call ups" */
  ageGroupId?: number
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout' || role === 'recruiter') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  // When adding to real squad with a specific position, update real_squad_position (NOT position_normalized)
  const updateData: Record<string, unknown> = { is_real_squad: isReal };
  if (isReal && position) {
    updateData.real_squad_position = position;
  }
  // Clear real_squad_position when removing from real squad
  if (!isReal) {
    updateData.real_squad_position = null;
  }
  // Cross-age-group add: move player to target age group
  if (isReal && ageGroupId) {
    updateData.age_group_id = ageGroupId;
  }

  const { data: updated, error } = await supabase
    .from('players')
    .update(updateData)
    .eq('id', playerId)
    .eq('club_id', clubId)
    .select('id')
    .single();

  if (error || !updated) {
    return { success: false, error: `Erro ao atualizar plantel real: ${error?.message ?? 'sem permissão ou jogador não encontrado'}` };
  }

  await logStatusChange(
    supabase, clubId, playerId, 'is_real_squad',
    isReal ? 'false' : 'true', isReal ? 'true' : 'false', userId,
    isReal ? `Adicionado ao plantel real${position ? ` na posição ${position}` : ''}` : 'Removido do plantel real'
  );

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Reorder Squad Player (within same position) ───────────── */

export async function reorderSquadPlayer(
  playerId: number,
  newOrder: number,
  squadType: 'real' | 'shadow'
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout' || role === 'recruiter') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  const orderField = squadType === 'shadow' ? 'shadow_order' : 'real_order';
  const { error } = await supabase
    .from('players')
    .update({ [orderField]: newOrder })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao reordenar: ${error.message}` };
  }

  revalidatePath('/campo');
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Bulk Reorder: update order for multiple players at once ───────────── */

export async function bulkReorderSquad(
  updates: { playerId: number; order: number }[],
  squadType: 'real' | 'shadow'
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout' || role === 'recruiter') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  const orderField = squadType === 'shadow' ? 'shadow_order' : 'real_order';

  // Update each player's order — small N so sequential is fine
  for (const { playerId, order } of updates) {
    const { error } = await supabase
      .from('players')
      .update({ [orderField]: order })
      .eq('id', playerId)
      .eq('club_id', clubId);
    if (error) {
      return { success: false, error: `Erro ao reordenar jogador ${playerId}: ${error.message}` };
    }
  }

  revalidatePath('/campo');
  await broadcastBulkMutation(clubId, 'players', userId);
  return { success: true };
}

/* ───────────── Move Squad Player to Different Position ───────────── */

export async function moveSquadPlayerPosition(
  playerId: number,
  newPosition: string,
  newOrder: number,
  squadType: 'real' | 'shadow'
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout' || role === 'recruiter') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  const orderField = squadType === 'shadow' ? 'shadow_order' : 'real_order';
  const positionField = squadType === 'shadow' ? 'shadow_position' : 'real_squad_position';

  // Get old position + age group for history context
  const { data: player } = await supabase
    .from('players')
    .select(`${positionField}, age_groups!inner(name)`)
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const oldPosition = player ? (player as Record<string, unknown>)[positionField] as string | null : null;
  const ageGroupName = player ? ((player as Record<string, unknown>).age_groups as { name: string } | null)?.name : null;

  const { error } = await supabase
    .from('players')
    .update({ [positionField]: newPosition, [orderField]: newOrder })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao mover jogador: ${error.message}` };
  }

  const squadPrefix = squadType === 'shadow' ? 'Sombra' : 'Plantel';
  const squadLabel = ageGroupName ? `${squadPrefix} ${ageGroupName}` : (squadType === 'shadow' ? 'Plantel Sombra' : 'Plantel');
  await logStatusChange(
    supabase, clubId, playerId, positionField,
    oldPosition as string, newPosition, userId,
    squadLabel
  );

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}
