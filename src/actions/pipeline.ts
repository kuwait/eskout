// src/actions/pipeline.ts
// Server Actions for recruitment pipeline status changes
// Updates player recruitment_status and logs every change to status_history
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/supabase/club-context.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { recruitmentStatusChangeSchema } from '@/lib/validators';
import type { ActionResponse, RecruitmentStatus } from '@/lib/types';

/* ───────────── Calendar <-> Pipeline sync helper ───────────── */

/** Event type mapping: pipeline date field -> calendar event type */
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
  clubId: string,
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
      .eq('event_type', eventType)
      .eq('club_id', clubId);
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
    .eq('club_id', clubId)
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
        club_id: clubId,
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
  // Validate only when setting a status (null means removing from abordagens)
  if (newStatus) {
    const parsed = recruitmentStatusChangeSchema.safeParse({ playerId, newStatus, note });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }
  }

  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  // Get current status and date fields for richer history context
  const { data: player } = await supabase
    .from('players')
    .select('recruitment_status, training_date, meeting_date, signing_date')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const oldStatus = player?.recruitment_status ?? null;

  // Skip if same status
  if (oldStatus === newStatus) {
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
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar estado: ${error.message}` };
  }

  // Sync calendar events: delete events for cleared date fields
  if (oldStatus === 'vir_treinar' && newStatus !== 'vir_treinar') {
    await syncCalendarEvent(supabase, clubId, userId, playerId, 'training_date', null);
  }
  if (oldStatus === 'reuniao_marcada' && newStatus !== 'reuniao_marcada') {
    await syncCalendarEvent(supabase, clubId, userId, playerId, 'meeting_date', null);
  }
  if (oldStatus === 'confirmado' && newStatus !== 'confirmado') {
    await syncCalendarEvent(supabase, clubId, userId, playerId, 'signing_date', null);
  }

  // Log to status_history
  await supabase.from('status_history').insert({
    club_id: clubId,
    player_id: playerId,
    field_changed: 'recruitment_status',
    old_value: oldStatus,
    new_value: newStatus,
    changed_by: userId,
    notes: note ?? null,
  });

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

  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  // Small N per column, sequential is fine
  for (const { playerId, order } of updates) {
    const { error } = await supabase
      .from('players')
      .update({ pipeline_order: order })
      .eq('id', playerId)
      .eq('club_id', clubId);
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
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  // Get old value for history
  const { data: player } = await supabase
    .from('players')
    .select('training_date')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const { error } = await supabase
    .from('players')
    .update({ training_date: dateTime })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar data de treino: ${error.message}` };
  }

  // Log to status_history
  await supabase.from('status_history').insert({
    club_id: clubId,
    player_id: playerId,
    field_changed: 'training_date',
    old_value: player?.training_date ?? null,
    new_value: dateTime,
    changed_by: userId,
  });

  // Sync to calendar (create/update/delete calendar event)
  await syncCalendarEvent(supabase, clubId, userId, playerId, 'training_date', dateTime);

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
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  // Get old value for history
  const { data: player } = await supabase
    .from('players')
    .select('signing_date')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const { error } = await supabase
    .from('players')
    .update({ signing_date: dateTime })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar data de assinatura: ${error.message}` };
  }

  // Log to status_history
  await supabase.from('status_history').insert({
    club_id: clubId,
    player_id: playerId,
    field_changed: 'signing_date',
    old_value: player?.signing_date ?? null,
    new_value: dateTime,
    changed_by: userId,
  });

  // Sync to calendar (create/update/delete calendar event)
  await syncCalendarEvent(supabase, clubId, userId, playerId, 'signing_date', dateTime);

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
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  // Get old value for history
  const { data: player } = await supabase
    .from('players')
    .select('meeting_date')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const { error } = await supabase
    .from('players')
    .update({ meeting_date: dateTime })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar data de reunião: ${error.message}` };
  }

  // Log to status_history
  await supabase.from('status_history').insert({
    club_id: clubId,
    player_id: playerId,
    field_changed: 'meeting_date',
    old_value: player?.meeting_date ?? null,
    new_value: dateTime,
    changed_by: userId,
  });

  // Sync to calendar (create/update/delete calendar event)
  await syncCalendarEvent(supabase, clubId, userId, playerId, 'meeting_date', dateTime);

  revalidatePath('/pipeline');
  revalidatePath('/calendario');
  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}
