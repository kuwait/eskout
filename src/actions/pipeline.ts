// src/actions/pipeline.ts
// Server Actions for recruitment pipeline status changes
// Updates player recruitment_status and logs every change to status_history
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/types/index.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { recruitmentStatusChangeSchema } from '@/lib/validators';
import type { ActionResponse, RecruitmentStatus } from '@/lib/types';

/* ───────────── Calendar ↔ Pipeline sync helper ───────────── */

/** Event type mapping: pipeline date field → calendar event type */
const DATE_FIELD_TO_EVENT_TYPE: Record<string, string> = {
  training_date: 'treino',
  meeting_date: 'reuniao',
  signing_date: 'assinatura',
};

/**
 * Upsert a calendar_events row when a pipeline date is set/changed.
 * If dateTime is null, deletes any existing calendar event for this player+type.
 */
async function syncCalendarEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  playerId: number,
  dateField: string,
  dateTime: string | null,
) {
  const eventType = DATE_FIELD_TO_EVENT_TYPE[dateField];
  if (!eventType) return;

  if (!dateTime) {
    // Remove existing calendar event for this player+type
    await supabase
      .from('calendar_events')
      .delete()
      .eq('player_id', playerId)
      .eq('event_type', eventType);
    return;
  }

  // Parse date and time from ISO timestamp
  const eventDate = dateTime.slice(0, 10);
  const rawTime = dateTime.length > 10 ? dateTime.slice(11, 16) : null;
  const eventTime = rawTime === '00:00' ? null : rawTime;

  // Get player name for auto-generated title
  const { data: player } = await supabase
    .from('players')
    .select('name')
    .eq('id', playerId)
    .single();
  const playerName = player?.name ?? '';

  const TYPE_LABELS: Record<string, string> = {
    treino: 'Vir Treinar',
    reuniao: 'Reunião',
    assinatura: 'Assinatura',
  };
  const title = `${TYPE_LABELS[eventType] ?? eventType} — ${playerName}`;

  // Check if a calendar event already exists for this player+type
  const { data: existing } = await supabase
    .from('calendar_events')
    .select('id')
    .eq('player_id', playerId)
    .eq('event_type', eventType)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Update existing event
    await supabase
      .from('calendar_events')
      .update({
        event_date: eventDate,
        event_time: eventTime,
        title,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Create new calendar event
    await supabase
      .from('calendar_events')
      .insert({
        player_id: playerId,
        event_type: eventType,
        title,
        event_date: eventDate,
        event_time: eventTime,
        created_by: userId,
      });
  }
}

export async function updateRecruitmentStatus(
  playerId: number,
  newStatus: RecruitmentStatus | null,
  note?: string
): Promise<ActionResponse> {
  console.log('[updateRecruitmentStatus] called:', { playerId, newStatus, note });

  // Validate only when setting a status (null means removing from abordagens)
  if (newStatus) {
    const parsed = recruitmentStatusChangeSchema.safeParse({ playerId, newStatus, note });
    if (!parsed.success) {
      console.log('[updateRecruitmentStatus] validation failed:', parsed.error.issues[0].message);
      return { success: false, error: parsed.error.issues[0].message };
    }
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log('[updateRecruitmentStatus] not authenticated');
    return { success: false, error: 'Não autenticado' };
  }

  // Get current status for history
  const { data: player } = await supabase
    .from('players')
    .select('recruitment_status')
    .eq('id', playerId)
    .single();

  const oldStatus = player?.recruitment_status ?? null;
  console.log('[updateRecruitmentStatus] oldStatus:', oldStatus, '→ newStatus:', newStatus);

  // Skip if same status
  if (oldStatus === newStatus) {
    console.log('[updateRecruitmentStatus] same status, skipping');
    return { success: true };
  }

  // Auto-clear date fields when leaving their respective statuses
  const updatePayload: Record<string, unknown> = { recruitment_status: newStatus };
  if (oldStatus === 'vir_treinar' && newStatus !== 'vir_treinar') {
    updatePayload.training_date = null;
  }
  if (oldStatus === 'reuniao_marcada' && newStatus !== 'reuniao_marcada') {
    updatePayload.meeting_date = null;
  }
  if (oldStatus === 'confirmado' && newStatus !== 'confirmado') {
    updatePayload.signing_date = null;
  }

  const { error } = await supabase
    .from('players')
    .update(updatePayload)
    .eq('id', playerId);

  if (error) {
    return { success: false, error: `Erro ao atualizar estado: ${error.message}` };
  }

  // Sync calendar events: delete events for cleared date fields
  if (oldStatus === 'vir_treinar' && newStatus !== 'vir_treinar') {
    await syncCalendarEvent(supabase, user.id, playerId, 'training_date', null);
  }
  if (oldStatus === 'reuniao_marcada' && newStatus !== 'reuniao_marcada') {
    await syncCalendarEvent(supabase, user.id, playerId, 'meeting_date', null);
  }
  if (oldStatus === 'confirmado' && newStatus !== 'confirmado') {
    await syncCalendarEvent(supabase, user.id, playerId, 'signing_date', null);
  }

  // Log to status_history
  const { error: historyError } = await supabase.from('status_history').insert({
    player_id: playerId,
    field_changed: 'recruitment_status',
    old_value: oldStatus,
    new_value: newStatus,
    changed_by: user.id,
    notes: note ?? null,
  });
  if (historyError) {
    console.error('Failed to insert status_history:', historyError);
  }

  revalidatePath('/pipeline');
  revalidatePath('/calendario');
  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  revalidatePath('/');
  return { success: true };
}

/** Bulk reorder pipeline cards within a status column (drag-and-drop) */
export async function reorderPipelineCards(
  updates: { playerId: number; order: number }[]
): Promise<ActionResponse> {
  if (updates.length === 0) return { success: true };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  // Small N per column, sequential is fine
  for (const { playerId, order } of updates) {
    const { error } = await supabase
      .from('players')
      .update({ pipeline_order: order })
      .eq('id', playerId);
    if (error) {
      return { success: false, error: `Erro ao reordenar jogador ${playerId}: ${error.message}` };
    }
  }

  revalidatePath('/pipeline');
  return { success: true };
}

/** Update the training date/time for a player with status 'vir_treinar' */
export async function updateTrainingDate(
  playerId: number,
  dateTime: string | null
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const { error } = await supabase
    .from('players')
    .update({ training_date: dateTime })
    .eq('id', playerId);

  if (error) {
    return { success: false, error: `Erro ao atualizar data de treino: ${error.message}` };
  }

  // Sync to calendar (create/update/delete calendar event)
  await syncCalendarEvent(supabase, user.id, playerId, 'training_date', dateTime);

  revalidatePath('/pipeline');
  revalidatePath('/calendario');
  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}

/** Update the signing date for a player with status 'confirmado' */
export async function updateSigningDate(
  playerId: number,
  dateTime: string | null
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const { error } = await supabase
    .from('players')
    .update({ signing_date: dateTime })
    .eq('id', playerId);

  if (error) {
    return { success: false, error: `Erro ao atualizar data de assinatura: ${error.message}` };
  }

  // Sync to calendar (create/update/delete calendar event)
  await syncCalendarEvent(supabase, user.id, playerId, 'signing_date', dateTime);

  revalidatePath('/pipeline');
  revalidatePath('/calendario');
  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}

/** Update the meeting date/time for a player with status 'reuniao_marcada' */
export async function updateMeetingDate(
  playerId: number,
  dateTime: string | null
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const { error } = await supabase
    .from('players')
    .update({ meeting_date: dateTime })
    .eq('id', playerId);

  if (error) {
    return { success: false, error: `Erro ao atualizar data de reunião: ${error.message}` };
  }

  // Sync to calendar (create/update/delete calendar event)
  await syncCalendarEvent(supabase, user.id, playerId, 'meeting_date', dateTime);

  revalidatePath('/pipeline');
  revalidatePath('/calendario');
  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}
