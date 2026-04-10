// src/actions/scouting-rounds.ts
// Server Actions for scouting round CRUD — weekly observation round management
// Admin/editor can create/update/delete; scouts can read published rounds
// RELEVANT FILES: src/lib/types/index.ts, src/lib/validators.ts, src/lib/supabase/mappers.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/club-context';
import { scoutingRoundSchema } from '@/lib/validators';
import type { ActionResponse, ScoutingRound, ScoutingRoundRow, ScoutingRoundStatus } from '@/lib/types';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';
import { mapScoutingRoundRow } from '@/lib/supabase/mappers';

const REVALIDATE_PATH = '/observacoes';

/* ───────────── Read ───────────── */

/** Fetch scouting rounds for the active club. Scouts only see published rounds. */
export async function getScoutingRounds(): Promise<ScoutingRound[]> {
  const { clubId, role } = await getAuthContext();
  const supabase = await createClient();

  let query = supabase
    .from('scouting_rounds')
    .select('*')
    .eq('club_id', clubId)
    .order('start_date', { ascending: false });

  // Scouts and recruiters only see published rounds
  if (role === 'scout' || role === 'recruiter') {
    query = query.eq('status', 'published');
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getScoutingRounds] Failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => mapScoutingRoundRow(row as ScoutingRoundRow));
}

/* ───────────── Create ───────────── */

export async function createScoutingRound(data: {
  name: string;
  startDate: string;
  endDate: string;
  notes?: string;
}): Promise<ActionResponse<ScoutingRound>> {
  const parsed = scoutingRoundSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from('scouting_rounds')
    .insert({
      club_id: clubId,
      name: parsed.data.name,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      notes: parsed.data.notes || '',
      status: 'published',
      created_by: userId,
    })
    .select('*')
    .single();

  if (error || !created) {
    return { success: false, error: `Erro ao criar jornada: ${error?.message ?? 'desconhecido'}` };
  }

  revalidatePath(REVALIDATE_PATH);
  await broadcastRowMutation(clubId, 'scouting_rounds', 'INSERT', userId, created.id);
  return { success: true, data: mapScoutingRoundRow(created as ScoutingRoundRow) };
}

/* ───────────── Update ───────────── */

export async function updateScoutingRound(
  roundId: number,
  updates: { name?: string; startDate?: string; endDate?: string; notes?: string },
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
  if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

  const { error } = await supabase
    .from('scouting_rounds')
    .update(dbUpdates)
    .eq('id', roundId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar: ${error.message}` };
  }

  revalidatePath(REVALIDATE_PATH);
  await broadcastRowMutation(clubId, 'scouting_rounds', 'UPDATE', userId, roundId);
  return { success: true };
}

/* ───────────── Update Status ───────────── */

export async function updateRoundStatus(
  roundId: number,
  status: ScoutingRoundStatus,
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const validStatuses: ScoutingRoundStatus[] = ['draft', 'published', 'closed'];
  if (!validStatuses.includes(status)) {
    return { success: false, error: 'Estado inválido' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('scouting_rounds')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', roundId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao alterar estado: ${error.message}` };
  }

  revalidatePath(REVALIDATE_PATH);
  await broadcastRowMutation(clubId, 'scouting_rounds', 'UPDATE', userId, roundId);
  return { success: true };
}

/* ───────────── Delete ───────────── */

export async function deleteScoutingRound(roundId: number): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin') {
    return { success: false, error: 'Apenas administradores podem eliminar jornadas' };
  }

  const supabase = await createClient();

  // CASCADE deletes games, assignments, availability
  const { error } = await supabase
    .from('scouting_rounds')
    .delete()
    .eq('id', roundId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao eliminar: ${error.message}` };
  }

  revalidatePath(REVALIDATE_PATH);
  await broadcastRowMutation(clubId, 'scouting_rounds', 'DELETE', userId, roundId);
  return { success: true };
}
