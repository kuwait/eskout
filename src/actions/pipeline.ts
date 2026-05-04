// src/actions/pipeline.ts
// Server Actions for recruitment pipeline status changes
// Updates player recruitment_status and logs every change to status_history
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/supabase/club-context.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getActiveClub, getAuthContext } from '@/lib/supabase/club-context';
import { recruitmentStatusChangeSchema, decisionSideSchema } from '@/lib/validators';
import type { ActionResponse, DecisionSide, RecruitmentStatus } from '@/lib/types';
import { broadcastRowMutation, broadcastBulkMutation } from '@/lib/realtime/broadcast';
import { notifyTaskAssigned } from '@/actions/notifications';

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

/** Event type mapping: pipeline date field -> calendar event type.
 *  Nota: `training_date` removido (Fase 5) — calendar events de treino são geridos via
 *  training_feedback_id FK. Este helper só lida com reunião/assinatura. */
const DATE_FIELD_TO_EVENT_TYPE: Record<string, string> = {
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
  note?: string,
  /** Contact purpose ID when moving to em_contacto (from contact_purposes table) */
  contactPurposeId?: string | null,
  /** Free-text contact purpose when "Outro" is selected */
  contactPurposeCustom?: string | null,
  /** Assign contact responsibility when moving to em_contacto */
  contactAssignedTo?: string | null,
  /** Explicit decision side when moving to a_decidir (avoids race condition with separate updateDecisionSide call) */
  decisionSide?: DecisionSide | null,
  /** Mandatory reason text when moving to em_standby */
  standbyReason?: string | null,
): Promise<ActionResponse> {
  // Validate only when setting a status (null means removing from abordagens)
  if (newStatus) {
    const parsed = recruitmentStatusChangeSchema.safeParse({ playerId, newStatus, note });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }
  }

  const { clubId, userId, role, club } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar estado de recrutamento' };
  }
  const supabase = await createClient();

  // Get current status and date fields for richer history context
  const { data: player } = await supabase
    .from('players')
    .select('name, club, contact, position_normalized, dob, foot, fpf_link, zerozero_link, photo_url, zz_photo_url, recruitment_status, training_date, training_escalao, meeting_date, signing_date, contact_assigned_to, meeting_attendees, signing_attendees')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  // Fetch assigner name for email notifications
  const { data: assignerProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single();
  const assignerName = assignerProfile?.full_name ?? 'Eskout';

  const oldStatus = player?.recruitment_status ?? null;

  // Skip if same status
  if (oldStatus === newStatus) {
    return { success: true };
  }

  // Auto-clear date fields and context fields when leaving their respective statuses
  const updatePayload: Record<string, unknown> = { recruitment_status: newStatus };
  // Set contact_assigned_to when moving to em_contacto with an assigned person
  if (newStatus === 'em_contacto' && contactAssignedTo !== undefined) {
    updatePayload.contact_assigned_to = contactAssignedTo;
  }
  // Snapshot quando player entra em vir_treinar — usado pelo pipeline card para
  // filtrar treinos do ciclo actual (migration 107)
  if (newStatus === 'vir_treinar' && oldStatus !== 'vir_treinar') {
    updatePayload.vir_treinar_entered_at = new Date().toISOString();
  }
  // Auto-set decision_side when entering a_decidir, auto-clear when leaving
  // If caller provides explicit decisionSide, use it; otherwise default to 'club'
  if (newStatus === 'a_decidir') {
    updatePayload.decision_side = decisionSide ?? 'club';
  } else if (oldStatus === 'a_decidir') {
    updatePayload.decision_side = null;
    updatePayload.decision_date = null;
  }
  // Set standby_reason when entering em_standby, auto-clear when leaving
  if (newStatus === 'em_standby') {
    updatePayload.standby_reason = standbyReason ?? null;
  } else if (oldStatus === 'em_standby') {
    updatePayload.standby_reason = null;
  }
  if (oldStatus === 'vir_treinar' && newStatus !== 'vir_treinar') {
    updatePayload.training_date = null;
    updatePayload.training_escalao = null;
  }
  if (oldStatus === 'reuniao_marcada' && newStatus !== 'reuniao_marcada') {
    updatePayload.meeting_date = null;
    updatePayload.meeting_attendees = [];
  }
  if (oldStatus === 'confirmado' && newStatus !== 'confirmado') {
    updatePayload.signing_date = null;
    updatePayload.signing_attendees = [];
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
  // Nota: vir_treinar NÃO toca calendar (events de treino têm training_feedback_id próprio,
  // geridos via training-feedback actions). Agendados em curso ficam no calendar mesmo após
  // sair do ciclo; utilizador decide se cancela via perfil do atleta.
  if (oldStatus === 'reuniao_marcada' && newStatus !== 'reuniao_marcada') {
    await syncCalendarEvent(supabase, clubId, userId, playerId, 'meeting_date', null);
  }
  if (oldStatus === 'confirmado' && newStatus !== 'confirmado') {
    await syncCalendarEvent(supabase, clubId, userId, playerId, 'signing_date', null);
  }

  // Log to status_history (include contact purpose when moving to em_contacto)
  await supabase.from('status_history').insert({
    club_id: clubId,
    player_id: playerId,
    field_changed: 'recruitment_status',
    old_value: oldStatus,
    new_value: newStatus,
    changed_by: userId,
    notes: note ?? null,
    contact_purpose_id: newStatus === 'em_contacto' ? (contactPurposeId ?? null) : null,
    contact_purpose_custom: newStatus === 'em_contacto' ? (contactPurposeCustom ?? null) : null,
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

  // Auto-create tasks for the new status + send email notifications
  const playerName = player?.name ?? `Jogador #${playerId}`;
  const playerClub = player?.club ?? null;
  const playerContact = player?.contact ?? null;

  // Shared notification context builder
  const playerPosition = player?.position_normalized ?? null;
  const playerDob = player?.dob ?? null;
  const playerFoot = player?.foot ?? null;
  const playerFpfLink = player?.fpf_link ?? null;
  const playerZzLink = player?.zerozero_link ?? null;
  const playerPhotoUrl = player?.photo_url ?? player?.zz_photo_url ?? null;

  const notifyCtx = (targetUserId: string, taskTitle: string, taskSource: string, extra?: Partial<Parameters<typeof notifyTaskAssigned>[0]>) => {
    // Fire-and-forget — don't await
    notifyTaskAssigned({
      clubId, clubName: club.name,
      assignedByUserId: userId, assignedByName: assignerName,
      targetUserId, taskTitle, taskSource,
      playerName, playerClub, playerPhotoUrl, playerContact,
      playerPosition, playerDob, playerFoot, playerFpfLink, playerZzLink,
      contactPurpose: null, dueDate: null, trainingEscalao: null,
      ...extra,
    });
  };

  // Use the newly assigned person (from dialog) or fall back to existing assignment
  const effectiveAssignedTo = contactAssignedTo ?? player?.contact_assigned_to ?? null;
  if (newStatus === 'em_contacto' && effectiveAssignedTo) {
    // Resolve contact purpose label for task title
    let purposeLabel = '';
    if (contactPurposeCustom) {
      purposeLabel = contactPurposeCustom;
    } else if (contactPurposeId) {
      const { data: purposeRow } = await supabase
        .from('contact_purposes')
        .select('label')
        .eq('id', contactPurposeId)
        .maybeSingle();
      if (purposeRow?.label) purposeLabel = purposeRow.label;
    }
    const purposeSuffix = purposeLabel ? ` — ${purposeLabel}` : '';
    const taskTitle = `📞 Contactar ${playerName}${purposeSuffix}`;
    await upsertAutoTask(supabase, clubId, effectiveAssignedTo, playerId, taskTitle, 'pipeline_contact');
    notifyCtx(effectiveAssignedTo, taskTitle, 'pipeline_contact', { contactPurpose: purposeLabel || null });
  }
  if (newStatus === 'reuniao_marcada' && player?.meeting_attendees?.length) {
    const taskTitle = `🤝 Reunião — ${playerName}`;
    // Dedupe + parallel upserts. Without dedupe, the same userId twice in the array races
    // upsertAutoTask in Promise.all (both SELECT see existing=null → both INSERT → duplicate
    // tasks for same user_id+player_id+source). user_tasks has no UNIQUE constraint.
    const meetingAttendees = Array.from(new Set(player.meeting_attendees as string[]));
    await Promise.all(meetingAttendees.map(async (attendeeId) => {
      await upsertAutoTask(supabase, clubId, attendeeId, playerId, taskTitle, 'pipeline_meeting', player.meeting_date);
      notifyCtx(attendeeId, taskTitle, 'pipeline_meeting', { dueDate: player.meeting_date });
    }));
  }
  if (newStatus === 'vir_treinar' && player?.contact_assigned_to) {
    const taskTitle = `⚽ Registar feedback do treino`;
    await upsertAutoTask(supabase, clubId, player.contact_assigned_to, playerId, taskTitle, 'pipeline_training', player.training_date);
    notifyCtx(player.contact_assigned_to, taskTitle, 'pipeline_training', { dueDate: player.training_date, trainingEscalao: player.training_escalao ?? null });
  }
  if (newStatus === 'confirmado' && player?.signing_attendees?.length) {
    const taskTitle = `✍️ Assinatura — ${playerName}`;
    const signingAttendees = Array.from(new Set(player.signing_attendees as string[]));
    await Promise.all(signingAttendees.map(async (attendeeId) => {
      await upsertAutoTask(supabase, clubId, attendeeId, playerId, taskTitle, 'pipeline_signing', player.signing_date);
      notifyCtx(attendeeId, taskTitle, 'pipeline_signing', { dueDate: player.signing_date });
    }));
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

  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
  const supabase = await createClient();

  // Parallel updates — rows are independent. Sequential was N round-trips per drag.
  // allSettled (not all) so a single failure doesn't hide the fact that the others
  // already wrote — we surface partial-success info in the error message.
  const results = await Promise.allSettled(updates.map(({ playerId, order }) =>
    supabase
      .from('players')
      .update({ pipeline_order: order })
      .eq('id', playerId)
      .eq('club_id', clubId),
  ));
  const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
  if (failed.length > 0) {
    const firstErr = failed[0].status === 'rejected'
      ? (failed[0].reason as Error).message
      : (failed[0].value.error as { message: string }).message;
    return { success: false, error: `Erro ao reordenar (${failed.length}/${updates.length} falharam): ${firstErr}` };
  }

  revalidatePath('/pipeline');

  await broadcastBulkMutation(clubId, 'players', userId, updates.map(u => u.playerId));

  return { success: true };
}

// updateTrainingDate REMOVIDO (Fase 5). Agendamento/edição de datas de treino passa via
// scheduleTraining/rescheduleTraining em src/actions/training-feedback.ts — cada treino
// tem o seu training_feedback + calendar event próprio.

/** Update the signing date for a player with status 'confirmado' */
export async function updateSigningDate(
  playerId: number,
  dateTime: string | null
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
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
  const { clubId, userId, role } = await getAuthContext();
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
  const { clubId, userId, role, club } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
  const supabase = await createClient();

  // Dedupe — same userId twice in the array would race upsertAutoTask in Promise.all
  // (both see existing=null + insert). The schema has no UNIQUE on user_tasks
  // (user_id, player_id, source) so duplicates would actually be created.
  attendeeIds = Array.from(new Set(attendeeIds));

  const { data: player } = await supabase
    .from('players')
    .select('name, club, contact, position_normalized, dob, foot, fpf_link, zerozero_link, photo_url, zz_photo_url, meeting_attendees, meeting_date')
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

  // Fetch assigner name for notifications
  const { data: assignerProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single();
  const assignerName = assignerProfile?.full_name ?? 'Eskout';

  // Create auto-tasks + send email for new attendees (parallel — N independent upserts)
  const playerName = player?.name ?? `Jogador #${playerId}`;
  const oldAttendees = new Set((player?.meeting_attendees ?? []) as string[]);
  const addedAttendees = attendeeIds.filter((id) => !oldAttendees.has(id));
  await Promise.all(addedAttendees.map(async (id) => {
    const taskTitle = `🤝 Reunião — ${playerName}`;
    await upsertAutoTask(supabase, clubId, id, playerId, taskTitle, 'pipeline_meeting', player?.meeting_date);
    notifyTaskAssigned({
      clubId, clubName: club.name,
      assignedByUserId: userId, assignedByName: assignerName,
      targetUserId: id, taskTitle, taskSource: 'pipeline_meeting',
      playerName, playerClub: player?.club ?? null,
      playerPhotoUrl: player?.photo_url ?? player?.zz_photo_url ?? null,
      playerContact: player?.contact ?? null,
      playerPosition: player?.position_normalized ?? null,
      playerDob: player?.dob ?? null,
      playerFoot: player?.foot ?? null,
      playerFpfLink: player?.fpf_link ?? null,
      playerZzLink: player?.zerozero_link ?? null,
      contactPurpose: null, dueDate: player?.meeting_date ?? null, trainingEscalao: null,
    });
  }));
  // Auto-complete tasks for removed attendees (parallel — independent updates)
  const newAttendees = new Set(attendeeIds);
  const removedAttendees = Array.from(oldAttendees).filter((id) => !newAttendees.has(id));
  await Promise.all(removedAttendees.map((id) =>
    supabase
      .from('user_tasks')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('player_id', playerId)
      .eq('user_id', id)
      .eq('source', 'pipeline_meeting')
      .eq('completed', false),
  ));

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
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
  const supabase = await createClient();

  // Dedupe — see updateMeetingAttendees for rationale (race in upsertAutoTask).
  attendeeIds = Array.from(new Set(attendeeIds));

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

  // Create auto-tasks for new attendees (parallel — N independent upserts)
  const playerName = player?.name ?? `Jogador #${playerId}`;
  const oldAttendees = new Set((player?.signing_attendees ?? []) as string[]);
  const addedAttendees = attendeeIds.filter((id) => !oldAttendees.has(id));
  await Promise.all(addedAttendees.map((id) =>
    upsertAutoTask(supabase, clubId, id, playerId, `✍️ Assinatura — ${playerName}`, 'pipeline_signing', player?.signing_date),
  ));
  // Auto-complete tasks for removed attendees (parallel — independent updates)
  const newAttendees = new Set(attendeeIds);
  const removedAttendees = Array.from(oldAttendees).filter((id) => !newAttendees.has(id));
  await Promise.all(removedAttendees.map((id) =>
    supabase
      .from('user_tasks')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('player_id', playerId)
      .eq('user_id', id)
      .eq('source', 'pipeline_signing')
      .eq('completed', false),
  ));

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
  const { clubId, userId, role } = await getAuthContext();
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

/* ───────────── Decision Date ───────────── */

/** Update the decision date for a player in 'a_decidir' status */
export async function updateDecisionDate(
  playerId: number,
  dateTime: string | null
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
  const supabase = await createClient();

  // Get old value for history
  const { data: player } = await supabase
    .from('players')
    .select('decision_date')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  const { error } = await supabase
    .from('players')
    .update({ decision_date: dateTime })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar data de decisão: ${error.message}` };
  }

  // Log to status_history
  await supabase.from('status_history').insert({
    club_id: clubId,
    player_id: playerId,
    field_changed: 'decision_date',
    old_value: player?.decision_date ?? null,
    new_value: dateTime,
    changed_by: userId,
  });

  revalidatePath('/pipeline');
  revalidatePath(`/jogadores/${playerId}`);

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

  const { clubId, userId, role } = await getAuthContext();
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

/* ───────────── Standby Reason (update on existing em_standby cards) ───────────── */

/** Update the standby reason text for a player in em_standby status */
export async function updateStandbyReason(
  playerId: number,
  reason: string
): Promise<ActionResponse> {
  if (!reason.trim()) {
    return { success: false, error: 'Motivo é obrigatório' };
  }

  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
  const supabase = await createClient();

  // Verify player is in em_standby
  const { data: player } = await supabase
    .from('players')
    .select('recruitment_status, standby_reason')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  if (!player || player.recruitment_status !== 'em_standby') {
    return { success: false, error: 'Jogador não está em Stand-by' };
  }

  const { error } = await supabase
    .from('players')
    .update({ standby_reason: reason.trim() })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar motivo: ${error.message}` };
  }

  revalidatePath('/pipeline');
  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);

  return { success: true };
}

/* ───────────── Contact Purpose (update on existing em_contacto cards) ───────────── */

/** Set or update the contact purpose for a player already in em_contacto.
 *  Updates the most recent em_contacto status_history entry, or creates one if none exists. */
export async function updateContactPurpose(
  playerId: number,
  contactPurposeId: string | null,
  contactPurposeCustom: string | null,
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para alterar pipeline' };
  }
  const supabase = await createClient();

  // Find the most recent em_contacto status_history entry for this player
  const { data: existing } = await supabase
    .from('status_history')
    .select('id')
    .eq('club_id', clubId)
    .eq('player_id', playerId)
    .eq('field_changed', 'recruitment_status')
    .eq('new_value', 'em_contacto')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Use service client to bypass RLS "No updates" policy on status_history
    const serviceClient = await createServiceClient();
    const { error } = await serviceClient
      .from('status_history')
      .update({
        contact_purpose_id: contactPurposeId,
        contact_purpose_custom: contactPurposeCustom,
      })
      .eq('id', existing.id);

    if (error) {
      return { success: false, error: `Erro ao atualizar objetivo: ${error.message}` };
    }
  } else {
    // No em_contacto entry exists — create one
    await supabase.from('status_history').insert({
      club_id: clubId,
      player_id: playerId,
      field_changed: 'recruitment_status',
      old_value: null,
      new_value: 'em_contacto',
      changed_by: userId,
      contact_purpose_id: contactPurposeId,
      contact_purpose_custom: contactPurposeCustom,
    });
  }

  revalidatePath('/pipeline');
  revalidatePath(`/jogadores/${playerId}`);

  return { success: true };
}
