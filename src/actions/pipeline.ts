// src/actions/pipeline.ts
// Server Actions for recruitment pipeline status changes
// Updates player recruitment_status and logs every change to status_history
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/supabase/club-context.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { recruitmentStatusChangeSchema, decisionSideSchema } from '@/lib/validators';
import type { ActionResponse, DecisionSide, RecruitmentStatus } from '@/lib/types';
import { broadcastRowMutation, broadcastBulkMutation } from '@/lib/realtime/broadcast';

/* ───────────── Auto-task helper ───────────── */

/** Create an auto-generated task for a user (idempotent — skips if an uncompleted task already exists) */
async function upsertAutoTask(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  userId: string,
  playerId: number,
  title: string,
  source: string,
  dueDate?: string | null,
) {
  // Check if an uncompleted task already exists for this user+player+source
  const { data: existing } = await supabase
    .from('user_tasks')
    .select('id')
    .eq('user_id', userId)
    .eq('player_id', playerId)
    .eq('source', source)
    .eq('completed', false)
    .limit(1)
    .maybeSingle();

  if (existing) return; // Already has an active task — skip

  await supabase.from('user_tasks').insert(
    { club_id: clubId, user_id: userId, created_by: userId, player_id: playerId, title, source, due_date: dueDate ?? null },
  );
}

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

  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar estado de recrutamento' };
  }
  const supabase = await createClient();

  // Get current status and date fields for richer history context
  const { data: player } = await supabase
    .from('players')
    .select('name, recruitment_status, training_date, meeting_date, signing_date, contact_assigned_to, meeting_attendees, signing_attendees')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const oldStatus = player?.recruitment_status ?? null;

  // Skip if same status
  if (oldStatus === newStatus) {
    return { success: true };
  }

  // Auto-clear date fields and context fields when leaving their respective statuses
  const updatePayload: Record<string, unknown> = { recruitment_status: newStatus };
  // Auto-set decision_side when entering a_decidir, auto-clear when leaving
  if (newStatus === 'a_decidir') {
    updatePayload.decision_side = 'club';
  } else if (oldStatus === 'a_decidir') {
    updatePayload.decision_side = null;
  }
  if (oldStatus === 'vir_treinar' && newStatus !== 'vir_treinar') {
    updatePayload.training_date = null;
    updatePayload.training_escalao = null;
  }
  if (oldStatus === 'reuniao_marcada' && newStatus !== 'reuniao_marcada') {
    updatePayload.meeting_date = null;
    updatePayload.meeting_attendees = '{}';
  }
  if (oldStatus === 'confirmado' && newStatus !== 'confirmado') {
    updatePayload.signing_date = null;
    updatePayload.signing_attendees = '{}';
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

  // Auto-complete tasks from the old status
  if (oldStatus) {
    const sourceMap: Record<string, string> = {
      em_contacto: 'pipeline_contact',
      reuniao_marcada: 'pipeline_meeting',
      vir_treinar: 'pipeline_training',
      confirmado: 'pipeline_signing',
    };
    const oldSource = sourceMap[oldStatus];
    if (oldSource) {
      await supabase
        .from('user_tasks')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('player_id', playerId)
        .eq('club_id', clubId)
        .eq('source', oldSource)
        .eq('completed', false);
    }
  }

  // Auto-create tasks for the new status
  const playerName = player?.name ?? `Jogador #${playerId}`;
  if (newStatus === 'em_contacto' && player?.contact_assigned_to) {
    await upsertAutoTask(supabase, clubId, player.contact_assigned_to, playerId, `📞 Contactar ${playerName}`, 'pipeline_contact');
  }
  if (newStatus === 'reuniao_marcada' && player?.meeting_attendees?.length) {
    for (const attendeeId of player.meeting_attendees) {
      await upsertAutoTask(supabase, clubId, attendeeId, playerId, `🤝 Reunião — ${playerName}`, 'pipeline_meeting', player.meeting_date);
    }
  }
  if (newStatus === 'vir_treinar' && player?.contact_assigned_to) {
    await upsertAutoTask(supabase, clubId, player.contact_assigned_to, playerId, '⚽ Registar feedback do treino', 'pipeline_training', player.training_date);
  }
  if (newStatus === 'confirmado' && player?.signing_attendees?.length) {
    for (const attendeeId of player.signing_attendees) {
      await upsertAutoTask(supabase, clubId, attendeeId, playerId, `✍️ Assinatura — ${playerName}`, 'pipeline_signing', player.signing_date);
    }
  }

  revalidatePath('/pipeline');
  revalidatePath('/tarefas');
  revalidatePath('/calendario');
  revalidatePath('/campo');
  revalidatePath('/posicoes');
  revalidatePath(`/jogadores/${playerId}`);
  revalidatePath('/');

  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  await broadcastRowMutation(clubId, 'calendar_events', 'UPDATE', userId, playerId);
  // Notify tasks page — status changes create/complete auto-tasks
  await broadcastRowMutation(clubId, 'user_tasks', 'UPDATE', userId, playerId);

  return { success: true };
}

/** Bulk reorder pipeline cards within a status column (drag-and-drop) */
export async function reorderPipelineCards(
  updates: { playerId: number; order: number }[]
): Promise<ActionResponse> {
  if (updates.length === 0) return { success: true };

  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
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

  await broadcastBulkMutation(clubId, 'players', userId, updates.map(u => u.playerId));

  return { success: true };
}

/** Update the training date/time for a player with status 'vir_treinar' */
export async function updateTrainingDate(
  playerId: number,
  dateTime: string | null
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
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

  // Sync due_date on existing training tasks for this player
  await supabase
    .from('user_tasks')
    .update({ due_date: dateTime })
    .eq('player_id', playerId)
    .eq('club_id', clubId)
    .eq('source', 'pipeline_training')
    .eq('completed', false);

  revalidatePath('/pipeline');
  revalidatePath('/tarefas');
  revalidatePath('/calendario');
  revalidatePath(`/jogadores/${playerId}`);

  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  await broadcastRowMutation(clubId, 'calendar_events', 'UPDATE', userId, playerId);
  await broadcastRowMutation(clubId, 'user_tasks', 'UPDATE', userId, playerId);

  return { success: true };
}

/** Update the signing date for a player with status 'confirmado' */
export async function updateSigningDate(
  playerId: number,
  dateTime: string | null
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
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

  // Sync due_date on existing signing tasks for this player
  await supabase
    .from('user_tasks')
    .update({ due_date: dateTime })
    .eq('player_id', playerId)
    .eq('club_id', clubId)
    .eq('source', 'pipeline_signing')
    .eq('completed', false);

  revalidatePath('/pipeline');
  revalidatePath('/tarefas');
  revalidatePath('/calendario');
  revalidatePath(`/jogadores/${playerId}`);

  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  await broadcastRowMutation(clubId, 'calendar_events', 'UPDATE', userId, playerId);
  await broadcastRowMutation(clubId, 'user_tasks', 'UPDATE', userId, playerId);

  return { success: true };
}

/** Update the meeting date/time for a player with status 'reuniao_marcada' */
export async function updateMeetingDate(
  playerId: number,
  dateTime: string | null
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
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

  // Sync due_date on existing meeting tasks for this player
  await supabase
    .from('user_tasks')
    .update({ due_date: dateTime })
    .eq('player_id', playerId)
    .eq('club_id', clubId)
    .eq('source', 'pipeline_meeting')
    .eq('completed', false);

  revalidatePath('/pipeline');
  revalidatePath('/tarefas');
  revalidatePath('/calendario');
  revalidatePath(`/jogadores/${playerId}`);

  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  await broadcastRowMutation(clubId, 'calendar_events', 'UPDATE', userId, playerId);
  // Notify tasks page — meeting date is displayed on task cards
  await broadcastRowMutation(clubId, 'user_tasks', 'UPDATE', userId, playerId);

  return { success: true };
}

/* ───────────── Meeting Attendees ───────────── */

/** Update the meeting attendees for a player in 'reuniao_marcada' status */
export async function updateMeetingAttendees(
  playerId: number,
  attendeeIds: string[]
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('name, meeting_attendees, meeting_date')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const { error } = await supabase
    .from('players')
    .update({ meeting_attendees: attendeeIds })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar participantes: ${error.message}` };
  }

  // Create auto-tasks for new attendees
  const playerName = player?.name ?? `Jogador #${playerId}`;
  const oldAttendees = new Set((player?.meeting_attendees ?? []) as string[]);
  for (const id of attendeeIds) {
    if (!oldAttendees.has(id)) {
      await upsertAutoTask(supabase, clubId, id, playerId, `🤝 Reunião — ${playerName}`, 'pipeline_meeting', player?.meeting_date);
    }
  }
  // Auto-complete tasks for removed attendees
  const newAttendees = new Set(attendeeIds);
  for (const id of oldAttendees) {
    if (!newAttendees.has(id)) {
      await supabase
        .from('user_tasks')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('player_id', playerId)
        .eq('user_id', id)
        .eq('source', 'pipeline_meeting')
        .eq('completed', false);
    }
  }

  revalidatePath('/pipeline');
  revalidatePath('/tarefas');
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  await broadcastRowMutation(clubId, 'user_tasks', 'UPDATE', userId, playerId);

  return { success: true };
}

/* ───────────── Signing Attendees ───────────── */

/** Update the signing attendees for a player in 'confirmado' status */
export async function updateSigningAttendees(
  playerId: number,
  attendeeIds: string[]
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('name, signing_attendees, signing_date')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const { error } = await supabase
    .from('players')
    .update({ signing_attendees: attendeeIds })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar responsáveis: ${error.message}` };
  }

  // Create auto-tasks for new attendees
  const playerName = player?.name ?? `Jogador #${playerId}`;
  const oldAttendees = new Set((player?.signing_attendees ?? []) as string[]);
  for (const id of attendeeIds) {
    if (!oldAttendees.has(id)) {
      await upsertAutoTask(supabase, clubId, id, playerId, `✍️ Assinatura — ${playerName}`, 'pipeline_signing', player?.signing_date);
    }
  }
  // Auto-complete tasks for removed attendees
  const newAttendees = new Set(attendeeIds);
  for (const id of oldAttendees) {
    if (!newAttendees.has(id)) {
      await supabase
        .from('user_tasks')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('player_id', playerId)
        .eq('user_id', id)
        .eq('source', 'pipeline_signing')
        .eq('completed', false);
    }
  }

  revalidatePath('/pipeline');
  revalidatePath('/tarefas');
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  await broadcastRowMutation(clubId, 'user_tasks', 'UPDATE', userId, playerId);

  return { success: true };
}

/* ───────────── Training Escalão ───────────── */

/** Update the training escalão for a player in 'vir_treinar' status */
export async function updateTrainingEscalao(
  playerId: number,
  escalao: string | null
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from('players')
    .update({ training_escalao: escalao })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar escalão: ${error.message}` };
  }

  revalidatePath('/pipeline');
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);

  return { success: true };
}

/* ───────────── Decision Side (A Decidir sub-sections) ───────────── */

/** Update decision_side for a player in 'a_decidir' status (club vs player deciding) */
export async function updateDecisionSide(
  playerId: number,
  side: DecisionSide
): Promise<ActionResponse> {
  const parsed = decisionSideSchema.safeParse(side);
  if (!parsed.success) {
    return { success: false, error: 'Lado de decisão inválido' };
  }

  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
  const supabase = await createClient();

  // Get current values for history
  const { data: player } = await supabase
    .from('players')
    .select('decision_side, recruitment_status')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  if (!player || player.recruitment_status !== 'a_decidir') {
    return { success: false, error: 'Jogador não está no estado "A decidir"' };
  }

  const oldSide = player.decision_side;
  if (oldSide === side) return { success: true };

  const { error } = await supabase
    .from('players')
    .update({ decision_side: side })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar lado de decisão: ${error.message}` };
  }

  // Log to status_history
  await supabase.from('status_history').insert({
    club_id: clubId,
    player_id: playerId,
    field_changed: 'decision_side',
    old_value: oldSide,
    new_value: side,
    changed_by: userId,
  });

  revalidatePath('/pipeline');
  revalidatePath(`/jogadores/${playerId}`);

  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);

  return { success: true };
}
