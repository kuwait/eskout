// src/actions/squads.ts
// Server Actions for custom squad management (squads + squad_players tables)
// Handles CRUD for squads, player assignments, reordering, and backward-compat wrappers
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/supabase/queries.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/club-context';
import { createSquadSchema, renameSquadSchema, updateSquadDescriptionSchema, squadPlayerSchema, shadowSquadSchema } from '@/lib/validators';
import type { ActionResponse, Squad, SquadRow, SquadType } from '@/lib/types';
import { broadcastRowMutation, broadcastBulkMutation } from '@/lib/realtime/broadcast';
import { mapSquadRow } from '@/lib/supabase/mappers';
import { isSpecialSection } from '@/lib/constants';
import { normalizePossibilityReason } from '@/lib/squads/possibility-reason';

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

/* ═══════════════════════════════════════════════════════════════════
   SQUAD CRUD (admin only)
   ═══════════════════════════════════════════════════════════════════ */

/* ───────────── Create Squad ───────────── */

export async function createSquad(data: {
  name: string;
  squadType: SquadType;
  ageGroupId?: number;
  description?: string;
}): Promise<ActionResponse<Squad>> {
  const parsed = createSquadSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin') {
    return { success: false, error: 'Apenas administradores podem criar plantéis' };
  }

  // Shadow squads require age group
  if (parsed.data.squadType === 'shadow' && !parsed.data.ageGroupId) {
    return { success: false, error: 'Escalão é obrigatório para plantéis sombra' };
  }

  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from('squads')
    .insert({
      club_id: clubId,
      name: parsed.data.name,
      squad_type: parsed.data.squadType,
      age_group_id: parsed.data.ageGroupId ?? null,
      description: parsed.data.description ?? null,
      created_by: userId,
    })
    .select('*')
    .single();

  if (error || !created) {
    return { success: false, error: `Erro ao criar plantel: ${error?.message ?? 'desconhecido'}` };
  }

  revalidatePath('/campo');
  await broadcastRowMutation(clubId, 'squads', 'INSERT', userId, created.id);
  return { success: true, data: mapSquadRow(created as SquadRow) };
}

/* ───────────── Rename Squad ───────────── */

export async function renameSquad(
  squadId: number,
  name: string
): Promise<ActionResponse> {
  const parsed = renameSquadSchema.safeParse({ squadId, name });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin') {
    return { success: false, error: 'Apenas administradores podem renomear plantéis' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('squads')
    .update({ name: parsed.data.name })
    .eq('id', squadId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao renomear: ${error.message}` };
  }

  revalidatePath('/campo');
  await broadcastRowMutation(clubId, 'squads', 'UPDATE', userId, squadId);
  return { success: true };
}

/* ───────────── Update Squad Description ───────────── */

export async function updateSquadDescription(
  squadId: number,
  description: string | undefined
): Promise<ActionResponse> {
  const parsed = updateSquadDescriptionSchema.safeParse({ squadId, description });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin') {
    return { success: false, error: 'Apenas administradores podem editar plantéis' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('squads')
    .update({ description: parsed.data.description ?? null })
    .eq('id', squadId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar descrição: ${error.message}` };
  }

  revalidatePath('/campo');
  await broadcastRowMutation(clubId, 'squads', 'UPDATE', userId, squadId);
  return { success: true };
}

/* ───────────── Delete Squad ───────────── */

export async function deleteSquad(squadId: number): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin') {
    return { success: false, error: 'Apenas administradores podem eliminar plantéis' };
  }

  const supabase = await createClient();

  // CASCADE will delete squad_players automatically
  const { error } = await supabase
    .from('squads')
    .delete()
    .eq('id', squadId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao eliminar: ${error.message}` };
  }

  revalidatePath('/campo');
  await broadcastRowMutation(clubId, 'squads', 'DELETE', userId, squadId);
  return { success: true };
}

/* ───────────── Reorder Squads ───────────── */

/** Update sort_order for multiple squads at once (admin only) */
export async function reorderSquads(
  updates: { id: number; sortOrder: number }[]
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin') {
    return { success: false, error: 'Apenas administradores podem reordenar plantéis' };
  }

  const supabase = await createClient();

  // Update each squad's sort_order
  for (const { id, sortOrder } of updates) {
    const { error } = await supabase
      .from('squads')
      .update({ sort_order: sortOrder })
      .eq('id', id)
      .eq('club_id', clubId);

    if (error) {
      return { success: false, error: `Erro ao reordenar: ${error.message}` };
    }

    await broadcastRowMutation(clubId, 'squads', 'UPDATE', userId, id);
  }

  revalidatePath('/campo');
  revalidatePath('/definicoes/planteis');
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════
   SQUAD PLAYER MANAGEMENT
   ═══════════════════════════════════════════════════════════════════ */

/* ───────────── Add Player to Squad ───────────── */

export async function addPlayerToSquad(
  squadId: number,
  playerId: number,
  position: string
): Promise<ActionResponse> {
  const parsed = squadPlayerSchema.safeParse({ squadId, playerId, position });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  // Get squad info for history context
  const { data: squad } = await supabase
    .from('squads')
    .select('name, squad_type')
    .eq('id', squadId)
    .eq('club_id', clubId)
    .single();

  if (!squad) {
    return { success: false, error: 'Plantel não encontrado' };
  }

  // Find max sort_order in this squad+position so new player enters at the end
  const { data: orderRows } = await supabase
    .from('squad_players')
    .select('sort_order')
    .eq('squad_id', squadId)
    .eq('position', position);
  const maxOrder = orderRows?.reduce((max, r) => Math.max(max, r.sort_order ?? 0), 0) ?? 0;

  const { error } = await supabase
    .from('squad_players')
    .insert({
      squad_id: squadId,
      player_id: playerId,
      club_id: clubId,
      position,
      sort_order: maxOrder + 1,
    });

  if (error) {
    // Unique constraint violation = player already in squad
    if (error.code === '23505') {
      return { success: false, error: 'Jogador já está neste plantel' };
    }
    return { success: false, error: `Erro ao adicionar: ${error.message}` };
  }

  // Keep legacy boolean flags in sync for backward compat
  await syncLegacyFlags(supabase, clubId, playerId, squad.squad_type as SquadType, position);

  await logStatusChange(
    supabase, clubId, playerId,
    squad.squad_type === 'shadow' ? 'is_shadow_squad' : 'is_real_squad',
    'false', 'true', userId,
    `Adicionado ao plantel "${squad.name}" na posição ${position}`
  );

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'squad_players', 'INSERT', userId, playerId);
  // Also broadcast player update for views that listen to player mutations
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Remove Player from Squad ───────────── */

export async function removePlayerFromSquad(
  squadId: number,
  playerId: number
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  // Get squad info + current position for history
  const [{ data: squad }, { data: sp }] = await Promise.all([
    supabase.from('squads').select('name, squad_type').eq('id', squadId).eq('club_id', clubId).single(),
    supabase.from('squad_players').select('position').eq('squad_id', squadId).eq('player_id', playerId).single(),
  ]);

  if (!squad) {
    return { success: false, error: 'Plantel não encontrado' };
  }

  const { error } = await supabase
    .from('squad_players')
    .delete()
    .eq('squad_id', squadId)
    .eq('player_id', playerId);

  if (error) {
    return { success: false, error: `Erro ao remover: ${error.message}` };
  }

  // Sync legacy flags — check if player is still in any squad of same type
  await syncLegacyFlagsAfterRemoval(supabase, clubId, playerId, squad.squad_type as SquadType);

  await logStatusChange(
    supabase, clubId, playerId,
    squad.squad_type === 'shadow' ? 'is_shadow_squad' : 'is_real_squad',
    'true', 'false', userId,
    `Removido do plantel "${squad.name}" (era ${sp?.position ?? '?'})`
  );

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'squad_players', 'DELETE', userId, playerId);
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Toggle Doubt Flag ───────────── */

/** Mark or unmark a squad player as "Dúvida" */
export async function toggleSquadPlayerDoubt(
  squadId: number,
  playerId: number,
  isDoubt: boolean
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from('squad_players')
    .update({ is_doubt: isDoubt })
    .eq('squad_id', squadId)
    .eq('player_id', playerId);

  if (error) {
    return { success: false, error: `Erro ao atualizar dúvida: ${error.message}` };
  }

  revalidatePath('/campo');
  await broadcastRowMutation(clubId, 'squad_players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Sign Status — 3-state cycle: none → will_sign → signed → none ───────────── */

export type SquadSignStatus = 'none' | 'will_sign' | 'signed';

/**
 * Set the sign status of a player in a squad. The three states are mutually exclusive
 * at the UI level — exactly one (or none) of is_will_sign / is_signed is true.
 */
export async function setSquadPlayerSignStatus(
  squadId: number,
  playerId: number,
  status: SquadSignStatus
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from('squad_players')
    .update({
      is_will_sign: status === 'will_sign',
      is_signed: status === 'signed',
    })
    .eq('squad_id', squadId)
    .eq('player_id', playerId);

  if (error) {
    return { success: false, error: `Erro ao atualizar assinatura: ${error.message}` };
  }

  revalidatePath('/campo');
  await broadcastRowMutation(clubId, 'squad_players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Set Doubt Reason (Dúvida section only, independent of pipeline) ───────────── */

/** Set or clear the doubt reason for a squad player — used in the Dúvida special section */
export async function setSquadPlayerDoubtReason(
  squadId: number,
  playerId: number,
  reason: string | null,
  customText?: string | null,
  customColor?: string | null
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  // When clearing or not 'outro', null the custom fields to keep data clean
  const payload = {
    doubt_reason: reason,
    doubt_reason_custom: reason === 'outro' ? (customText ?? null) : null,
    doubt_reason_color: reason === 'outro' ? (customColor ?? null) : null,
  };

  const { error } = await supabase
    .from('squad_players')
    .update(payload)
    .eq('squad_id', squadId)
    .eq('player_id', playerId);

  if (error) {
    return { success: false, error: `Erro ao atualizar motivo da dúvida: ${error.message}` };
  }

  revalidatePath('/campo');
  await broadcastRowMutation(clubId, 'squad_players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Set Possibility Reason (Possibilidade section, real squads only) ───────────── */

/**
 * Store a custom motivo + color for a player in the Possibilidade section.
 * Pass null for customText to clear the motivo (returns card to plain status strip).
 */
export async function setSquadPlayerPossibilityReason(
  squadId: number,
  playerId: number,
  customText: string | null,
  customColor: string | null
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  const { text, color } = normalizePossibilityReason(customText, customColor);

  const { error } = await supabase
    .from('squad_players')
    .update({
      possibility_reason_custom: text,
      possibility_reason_color: color,
    })
    .eq('squad_id', squadId)
    .eq('player_id', playerId);

  if (error) {
    return { success: false, error: `Erro ao atualizar motivo: ${error.message}` };
  }

  revalidatePath('/campo');
  await broadcastRowMutation(clubId, 'squad_players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Toggle Pré-Época (squad-level, independent of pipeline) ───────────── */

/** Mark or unmark a squad player as "Pré-Época" */
export async function toggleSquadPlayerPreseason(
  squadId: number,
  playerId: number,
  isPreseason: boolean
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from('squad_players')
    .update({ is_preseason: isPreseason })
    .eq('squad_id', squadId)
    .eq('player_id', playerId);

  if (error) {
    return { success: false, error: `Erro ao atualizar pré-época: ${error.message}` };
  }

  revalidatePath('/campo');
  await broadcastRowMutation(clubId, 'squad_players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Reorder Squad Player (within same position) ───────────── */

export async function reorderSquadPlayer(
  playerId: number,
  newOrder: number,
  squadType: 'real' | 'shadow',
  /** New: optional squadId — if provided, uses squad_players table */
  squadId?: number
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  if (squadId) {
    // New path: update squad_players
    const { error } = await supabase
      .from('squad_players')
      .update({ sort_order: newOrder })
      .eq('squad_id', squadId)
      .eq('player_id', playerId);

    if (error) {
      return { success: false, error: `Erro ao reordenar: ${error.message}` };
    }
  } else {
    // Legacy path: update players table directly
    const orderField = squadType === 'shadow' ? 'shadow_order' : 'real_order';
    const { error } = await supabase
      .from('players')
      .update({ [orderField]: newOrder })
      .eq('id', playerId)
      .eq('club_id', clubId);

    if (error) {
      return { success: false, error: `Erro ao reordenar: ${error.message}` };
    }
  }

  revalidatePath('/campo');
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Bulk Reorder: update order for multiple players at once ───────────── */

export async function bulkReorderSquad(
  updates: { playerId: number; order: number }[],
  squadType: 'real' | 'shadow',
  /** New: optional squadId — if provided, uses squad_players table */
  squadId?: number
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  // Parallel updates — rows are independent. Sequential was N round-trips per drop
  // (e.g. reordering a 20-player squad = 20 sequential queries).
  if (squadId) {
    const results = await Promise.all(updates.map(({ playerId, order }) =>
      supabase
        .from('squad_players')
        .update({ sort_order: order })
        .eq('squad_id', squadId)
        .eq('player_id', playerId),
    ));
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return { success: false, error: `Erro ao reordenar: ${failed.error.message}` };
    }
  } else {
    // Legacy path: update players table directly
    const orderField = squadType === 'shadow' ? 'shadow_order' : 'real_order';
    const results = await Promise.all(updates.map(({ playerId, order }) =>
      supabase
        .from('players')
        .update({ [orderField]: order })
        .eq('id', playerId)
        .eq('club_id', clubId),
    ));
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return { success: false, error: `Erro ao reordenar: ${failed.error.message}` };
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
  squadType: 'real' | 'shadow',
  /** New: optional squadId — if provided, uses squad_players table */
  squadId?: number
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  let oldPosition: string | null = null;
  let squadLabel = squadType === 'shadow' ? 'Plantel Sombra' : 'Plantel';

  if (squadId) {
    // New path: get old position from squad_players
    const { data: sp } = await supabase
      .from('squad_players')
      .select('position')
      .eq('squad_id', squadId)
      .eq('player_id', playerId)
      .single();
    oldPosition = sp?.position ?? null;

    // Get squad name for label
    const { data: squad } = await supabase
      .from('squads')
      .select('name')
      .eq('id', squadId)
      .single();
    squadLabel = squad?.name ?? squadLabel;

    const { error } = await supabase
      .from('squad_players')
      .update({ position: newPosition, sort_order: newOrder })
      .eq('squad_id', squadId)
      .eq('player_id', playerId);

    if (error) {
      return { success: false, error: `Erro ao mover jogador: ${error.message}` };
    }

    // Sync legacy position field — special sections don't have a pitch position
    const positionField = squadType === 'shadow' ? 'shadow_position' : 'real_squad_position';
    const legacyPosition = isSpecialSection(newPosition) ? null : newPosition;
    await supabase
      .from('players')
      .update({ [positionField]: legacyPosition })
      .eq('id', playerId)
      .eq('club_id', clubId);

  } else {
    // Legacy path: update players table directly
    const orderField = squadType === 'shadow' ? 'shadow_order' : 'real_order';
    const positionField = squadType === 'shadow' ? 'shadow_position' : 'real_squad_position';

    // Get old position + age group for history context
    const { data: player } = await supabase
      .from('players')
      .select(`${positionField}, age_groups!inner(name, generation_year)`)
      .eq('id', playerId)
      .eq('club_id', clubId)
      .single();

    oldPosition = player ? (player as Record<string, unknown>)[positionField] as string | null : null;
    const ageGroupData = player ? (player as Record<string, unknown>).age_groups as { name: string; generation_year: number } | null : null;

    // Shadow squads are by generation year, real squads by escalão
    squadLabel = squadType === 'shadow'
      ? (ageGroupData?.generation_year ? `Sombra ${ageGroupData.generation_year}` : 'Plantel Sombra')
      : (ageGroupData?.name ? `Plantel ${ageGroupData.name}` : 'Plantel');

    const { error } = await supabase
      .from('players')
      .update({ [positionField]: newPosition, [orderField]: newOrder })
      .eq('id', playerId)
      .eq('club_id', clubId);

    if (error) {
      return { success: false, error: `Erro ao mover jogador: ${error.message}` };
    }
  }

  await logStatusChange(
    supabase, clubId, playerId,
    squadType === 'shadow' ? 'shadow_position' : 'real_squad_position',
    oldPosition, newPosition, userId, squadLabel
  );

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Move Player Across Squads (same age group) ───────────── */

/**
 * Atomically move a player from one squad to another by updating their squad_players row.
 * Used for cross-squad drag in the multi-shadow-squad view.
 * The unique constraint on (squad_id, player_id) prevents duplicates if the player
 * already exists in the target squad — caller should ensure that's not the case.
 */
export async function moveSquadPlayerToOtherSquad(
  playerId: number,
  fromSquadId: number,
  toSquadId: number,
  newPosition: string,
  newOrder: number,
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  if (fromSquadId === toSquadId) {
    return { success: false, error: 'Plantel de origem e destino são iguais' };
  }
  const supabase = await createClient();

  // Validate both squads belong to this club + are the same type (defence in depth — UI already enforces)
  const { data: squads } = await supabase
    .from('squads')
    .select('id, name, squad_type, age_group_id')
    .in('id', [fromSquadId, toSquadId])
    .eq('club_id', clubId);

  if (!squads || squads.length !== 2) {
    return { success: false, error: 'Plantéis não encontrados' };
  }
  const fromSquad = squads.find((s) => s.id === fromSquadId);
  const toSquad = squads.find((s) => s.id === toSquadId);
  if (!fromSquad || !toSquad) {
    return { success: false, error: 'Plantéis não encontrados' };
  }
  if (fromSquad.squad_type !== toSquad.squad_type) {
    return { success: false, error: 'Não é possível mover entre tipos de plantel diferentes' };
  }

  // Update squad_id (and position/order) — single statement, atomic
  const { error } = await supabase
    .from('squad_players')
    .update({ squad_id: toSquadId, position: newPosition, sort_order: newOrder })
    .eq('squad_id', fromSquadId)
    .eq('player_id', playerId);

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Jogador já existe no plantel de destino' };
    }
    return { success: false, error: `Erro ao mover jogador: ${error.message}` };
  }

  // Keep legacy boolean flags in sync — `position` field reflects the latest squad assignment
  await syncLegacyFlags(supabase, clubId, playerId, toSquad.squad_type as SquadType, newPosition);

  // Log change with both squad names for context
  await logStatusChange(
    supabase, clubId, playerId,
    toSquad.squad_type === 'shadow' ? 'shadow_position' : 'real_squad_position',
    fromSquad.name, toSquad.name, userId,
    `Movido de "${fromSquad.name}" para "${toSquad.name}" na posição ${newPosition}`
  );

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'squad_players', 'UPDATE', userId, playerId);
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════
   BACKWARD COMPAT — Legacy actions delegate to new squad_players system
   These maintain the old boolean flags on players table for views that
   haven't been migrated yet.
   ═══════════════════════════════════════════════════════════════════ */

/* ───────────── Add to Shadow Squad (legacy wrapper) ───────────── */
// Only updates boolean flags on players table — squad_players managed via new CRUD actions

export async function addToShadowSquad(
  playerId: number,
  position: string
): Promise<ActionResponse> {
  const parsed = shadowSquadSchema.safeParse({ playerId, position });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  // Get current state for history
  const { data: player } = await supabase
    .from('players')
    .select('is_shadow_squad, shadow_position, shadow_order')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  if (!player) {
    return { success: false, error: 'Jogador não encontrado' };
  }

  // Update legacy boolean flags on players table
  const { error } = await supabase
    .from('players')
    .update({ is_shadow_squad: true, shadow_position: position })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao adicionar ao plantel sombra: ${error.message}` };
  }

  await logStatusChange(
    supabase, clubId, playerId, 'is_shadow_squad',
    player.is_shadow_squad ? 'true' : 'false', 'true', userId,
    `Adicionado ao plantel sombra na posição ${position}`
  );

  if (player.shadow_position !== position) {
    await logStatusChange(
      supabase, clubId, playerId, 'shadow_position',
      player.shadow_position ?? null, position, userId
    );
  }

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ───────────── Remove from Shadow Squad (legacy wrapper) ───────────── */

export async function removeFromShadowSquad(
  playerId: number
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  // Get current state for history
  const { data: player } = await supabase
    .from('players')
    .select('shadow_position, age_group_id')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  // Find all shadow squad IDs for this club
  const { data: shadowSquads } = await supabase
    .from('squads')
    .select('id')
    .eq('club_id', clubId)
    .eq('squad_type', 'shadow');

  const shadowSquadIds = (shadowSquads ?? []).map((s) => s.id);

  // Remove from all shadow squads
  if (shadowSquadIds.length > 0) {
    await supabase
      .from('squad_players')
      .delete()
      .eq('player_id', playerId)
      .eq('club_id', clubId)
      .in('squad_id', shadowSquadIds);
  }

  // Update legacy flags
  const { error } = await supabase
    .from('players')
    .update({ is_shadow_squad: false, shadow_position: null })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao remover do plantel sombra: ${error.message}` };
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

/* ───────────── Toggle Real Squad (legacy wrapper) ───────────── */
// Only updates boolean flags on players table — squad_players managed via new CRUD actions

export async function toggleRealSquad(
  playerId: number,
  isReal: boolean,
  position?: string,
  ageGroupId?: number
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para gerir plantéis' };
  }
  const supabase = await createClient();

  if (isReal) {
    // Update legacy flags
    const updateData: Record<string, unknown> = {
      is_real_squad: true,
      real_squad_position: position ?? null,
    };
    if (ageGroupId) updateData.age_group_id = ageGroupId;

    const { error } = await supabase
      .from('players')
      .update(updateData)
      .eq('id', playerId)
      .eq('club_id', clubId);

    if (error) {
      return { success: false, error: `Erro ao atualizar plantel: ${error.message}` };
    }
  } else {
    // Clear legacy flags
    const { error } = await supabase
      .from('players')
      .update({ is_real_squad: false, real_squad_position: null })
      .eq('id', playerId)
      .eq('club_id', clubId);

    if (error) {
      return { success: false, error: `Erro ao atualizar plantel: ${error.message}` };
    }
  }

  await logStatusChange(
    supabase, clubId, playerId, 'is_real_squad',
    isReal ? 'false' : 'true', isReal ? 'true' : 'false', userId,
    isReal ? `Adicionado ao plantel${position ? ` na posição ${position}` : ''}` : 'Removido do plantel'
  );

  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════
   LEGACY SYNC HELPERS — keep boolean flags on players in sync
   ═══════════════════════════════════════════════════════════════════ */

/** After adding to a squad, sync the legacy boolean flags on the players table */
async function syncLegacyFlags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  playerId: number,
  squadType: SquadType,
  position: string
) {
  if (squadType === 'shadow') {
    await supabase
      .from('players')
      .update({ is_shadow_squad: true, shadow_position: position })
      .eq('id', playerId)
      .eq('club_id', clubId);
  } else {
    // Special sections (DUVIDA, POSSIBILIDADE) keep the player in the squad system
    // but don't occupy a pitch position
    const legacyPosition = isSpecialSection(position) ? null : position;
    await supabase
      .from('players')
      .update({ is_real_squad: true, real_squad_position: legacyPosition })
      .eq('id', playerId)
      .eq('club_id', clubId);
  }
}

/** After removing from a squad, check if player is still in any squad of same type */
async function syncLegacyFlagsAfterRemoval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  playerId: number,
  squadType: SquadType
) {
  // Check if player is still in any squad of this type
  const { data: remaining } = await supabase
    .from('squad_players')
    .select('position, squads!inner(squad_type)')
    .eq('player_id', playerId)
    .eq('club_id', clubId)
    .eq('squads.squad_type', squadType)
    .limit(1);

  if (!remaining || remaining.length === 0) {
    // Player not in any squad of this type — clear legacy flags
    if (squadType === 'shadow') {
      await supabase
        .from('players')
        .update({ is_shadow_squad: false, shadow_position: null })
        .eq('id', playerId)
        .eq('club_id', clubId);
    } else {
      await supabase
        .from('players')
        .update({ is_real_squad: false, real_squad_position: null })
        .eq('id', playerId)
        .eq('club_id', clubId);
    }
  }
}
