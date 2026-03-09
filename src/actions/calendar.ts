// src/actions/calendar.ts
// Server Actions for calendar event CRUD operations
// Creates, updates, and deletes calendar events. Syncs treino/reuniao/assinatura to pipeline.
// RELEVANT FILES: src/lib/validators.ts, src/lib/supabase/queries.ts, src/actions/pipeline.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { calendarEventSchema } from '@/lib/validators';
import type { ActionResponse, RecruitmentStatus } from '@/lib/types';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';

/* ───────────── Event type → pipeline status + date field mapping ───────────── */

const PIPELINE_SYNC_MAP: Record<string, { status: RecruitmentStatus; dateField: string }> = {
  treino: { status: 'vir_treinar', dateField: 'training_date' },
  reuniao: { status: 'reuniao_marcada', dateField: 'meeting_date' },
  assinatura: { status: 'confirmado', dateField: 'signing_date' },
};

/** Sync a calendar event to the player's pipeline status and date field */
async function syncToPipeline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  clubId: string,
  playerId: number,
  eventType: string,
  eventDate: string,
  eventTime?: string | null
) {
  const syncConfig = PIPELINE_SYNC_MAP[eventType];
  if (!syncConfig) return; // observacao and outro don't sync

  // Build ISO datetime for the date field
  const dateTimeValue = eventTime
    ? `${eventDate}T${eventTime}`
    : eventDate;

  // Get current status for history
  const { data: player } = await supabase
    .from('players')
    .select('recruitment_status')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const oldStatus = player?.recruitment_status ?? null;

  // Update player pipeline status + date
  const { error: updateError } = await supabase
    .from('players')
    .update({
      recruitment_status: syncConfig.status,
      [syncConfig.dateField]: dateTimeValue,
    })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (updateError) {
    console.error('[syncToPipeline] Failed to update player:', updateError.message);
    return;
  }

  // Log status change if status actually changed
  if (oldStatus !== syncConfig.status) {
    await supabase.from('status_history').insert({
      player_id: playerId,
      club_id: clubId,
      field_changed: 'recruitment_status',
      old_value: oldStatus,
      new_value: syncConfig.status,
      changed_by: userId,
      notes: `Via calendário`,
    });
  }

  // Revalidate pipeline paths
  revalidatePath('/pipeline');
  revalidatePath(`/jogadores/${playerId}`);
}

/* ───────────── Create Event ───────────── */

export async function createCalendarEvent(formData: {
  ageGroupId?: number;
  playerId?: number;
  eventType: string;
  title: string;
  eventDate: string;
  eventTime?: string;
  location?: string;
  notes?: string;
  assigneeUserId?: string;
  assigneeName?: string;
}): Promise<ActionResponse<{ id: number }>> {
  const parsed = calendarEventSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout' || role === 'recruiter') {
    return { success: false, error: 'Sem permissão para gerir calendário' };
  }

  const supabase = await createClient();

  // Resolve assignee name from profile if a user was selected
  let assigneeName = parsed.data.assigneeName || '';
  if (parsed.data.assigneeUserId && !assigneeName) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', parsed.data.assigneeUserId)
      .single();
    assigneeName = profile?.full_name ?? '';
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      age_group_id: parsed.data.ageGroupId ?? null,
      player_id: parsed.data.playerId ?? null,
      club_id: clubId,
      event_type: parsed.data.eventType,
      title: parsed.data.title,
      event_date: parsed.data.eventDate,
      event_time: parsed.data.eventTime || null,
      location: parsed.data.location || '',
      notes: parsed.data.notes || '',
      assignee_user_id: parsed.data.assigneeUserId || null,
      assignee_name: assigneeName,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { success: false, error: `Erro ao criar evento: ${error?.message}` };
  }

  // Sync to pipeline if applicable (treino, reuniao, assinatura)
  if (parsed.data.playerId && PIPELINE_SYNC_MAP[parsed.data.eventType]) {
    await syncToPipeline(
      supabase, userId, clubId, parsed.data.playerId,
      parsed.data.eventType, parsed.data.eventDate, parsed.data.eventTime
    );
  }

  revalidatePath('/calendario');
  await broadcastRowMutation(clubId, 'calendar_events', 'INSERT', userId, data.id);
  if (parsed.data.playerId && PIPELINE_SYNC_MAP[parsed.data.eventType]) {
    await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, parsed.data.playerId);
  }
  return { success: true, data: { id: data.id } };
}

/* ───────────── Update Event ───────────── */

export async function updateCalendarEvent(
  eventId: number,
  formData: {
    ageGroupId?: number;
    playerId?: number | null;
    eventType?: string;
    title?: string;
    eventDate?: string;
    eventTime?: string | null;
    location?: string;
    notes?: string;
    assigneeUserId?: string | null;
    assigneeName?: string;
  }
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout' || role === 'recruiter') {
    return { success: false, error: 'Sem permissão para gerir calendário' };
  }
  const supabase = await createClient();

  // Build update payload — only include provided fields
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (formData.ageGroupId !== undefined) payload.age_group_id = formData.ageGroupId || null;
  if (formData.playerId !== undefined) payload.player_id = formData.playerId || null;
  if (formData.eventType) payload.event_type = formData.eventType;
  if (formData.title) payload.title = formData.title;
  if (formData.eventDate) payload.event_date = formData.eventDate;
  if (formData.eventTime !== undefined) payload.event_time = formData.eventTime || null;
  if (formData.location !== undefined) payload.location = formData.location;
  if (formData.notes !== undefined) payload.notes = formData.notes;
  if (formData.assigneeUserId !== undefined) payload.assignee_user_id = formData.assigneeUserId || null;
  if (formData.assigneeName !== undefined) payload.assignee_name = formData.assigneeName;

  // Fetch old event before updating — need old type to clear stale pipeline date
  const { data: oldEvent } = await supabase
    .from('calendar_events')
    .select('event_type, player_id')
    .eq('id', eventId)
    .eq('club_id', clubId)
    .single();

  const { error } = await supabase
    .from('calendar_events')
    .update(payload)
    .eq('id', eventId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar evento: ${error.message}` };
  }

  // Sync to pipeline if applicable
  const eventType = formData.eventType;
  const playerId = formData.playerId ?? oldEvent?.player_id;
  const eventDate = formData.eventDate;
  if (eventType && playerId && eventDate && PIPELINE_SYNC_MAP[eventType]) {
    // If event type changed, clear the OLD pipeline date field first
    const oldType = oldEvent?.event_type;
    if (oldType && oldType !== eventType && PIPELINE_SYNC_MAP[oldType]) {
      await supabase
        .from('players')
        .update({ [PIPELINE_SYNC_MAP[oldType].dateField]: null })
        .eq('id', playerId)
        .eq('club_id', clubId);
    }

    await syncToPipeline(supabase, userId, clubId, playerId, eventType, eventDate, formData.eventTime);
  }

  revalidatePath('/calendario');
  await broadcastRowMutation(clubId, 'calendar_events', 'UPDATE', userId, eventId);
  if (playerId && eventType && PIPELINE_SYNC_MAP[eventType]) {
    await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  }
  return { success: true };
}

/* ───────────── Delete Event ───────────── */

export async function deleteCalendarEvent(eventId: number): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout' || role === 'recruiter') {
    return { success: false, error: 'Sem permissão para gerir calendário' };
  }
  const supabase = await createClient();

  // Fetch event before deleting — need player_id and event_type for pipeline sync
  const { data: event } = await supabase
    .from('calendar_events')
    .select('player_id, event_type')
    .eq('id', eventId)
    .eq('club_id', clubId)
    .single();

  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', eventId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao eliminar evento: ${error.message}` };
  }

  // Clear pipeline date if this was a synced event type
  if (event?.player_id && PIPELINE_SYNC_MAP[event.event_type]) {
    const syncConfig = PIPELINE_SYNC_MAP[event.event_type];
    await supabase
      .from('players')
      .update({ [syncConfig.dateField]: null })
      .eq('id', event.player_id)
      .eq('club_id', clubId);
  }

  revalidatePath('/calendario');
  revalidatePath('/pipeline');
  await broadcastRowMutation(clubId, 'calendar_events', 'DELETE', userId, eventId);
  if (event?.player_id && PIPELINE_SYNC_MAP[event.event_type]) {
    await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, event.player_id);
  }
  return { success: true };
}
