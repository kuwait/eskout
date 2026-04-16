// src/actions/training-feedback.ts
// Server Actions for training feedback — presence, avaliação, coach link (legacy + Fase 2)
// Fase 2 additions (migration 107): scheduleTraining, rescheduleTraining, cancelTraining,
// markTrainingMissed, markTrainingAttended, registerPastTraining, updateTrainingEvaluation
// RELEVANT FILES: src/lib/validators.ts, src/lib/supabase/queries.ts, src/components/players/TrainingFeedback.tsx

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub, getAuthContext } from '@/lib/supabase/club-context';
import {
  trainingFeedbackSchema,
  scheduleTrainingSchema,
  rescheduleTrainingSchema,
  cancelTrainingSchema,
  registerPastTrainingSchema,
  updateTrainingEvaluationSchema,
} from '@/lib/validators';
import type { ActionResponse } from '@/lib/types';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';
import { notifyTaskAssigned } from '@/actions/notifications';

export async function createTrainingFeedback(
  playerId: number,
  trainingDate: string,
  presence: string,
  feedback?: string,
  rating?: number,
  escalao?: string,
  decision?: string,
  heightScale?: string | null,
  buildScale?: string | null,
  speedScale?: string | null,
  intensityScale?: string | null,
  tags?: string[],
  ratingPerformance?: number,
  ratingPotential?: number,
  maturation?: string | null,
): Promise<ActionResponse> {
  const parsed = trainingFeedbackSchema.safeParse({
    playerId,
    trainingDate,
    presence,
    feedback,
    rating,
    escalao,
    decision,
    heightScale,
    buildScale,
    speedScale,
    intensityScale,
    tags,
    ratingPerformance,
    ratingPotential,
    maturation,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId } = await getAuthContext();
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from('training_feedback')
    .insert({
      club_id: clubId,
      player_id: playerId,
      author_id: userId,
      training_date: parsed.data.trainingDate,
      escalao: parsed.data.escalao || null,
      presence: parsed.data.presence,
      feedback: parsed.data.feedback || null,
      rating: parsed.data.ratingPerformance ?? null,
      rating_performance: parsed.data.ratingPerformance ?? null,
      rating_potential: parsed.data.ratingPotential ?? null,
      decision: parsed.data.decision,
      height_scale: parsed.data.heightScale ?? null,
      build_scale: parsed.data.buildScale ?? null,
      speed_scale: parsed.data.speedScale ?? null,
      intensity_scale: parsed.data.intensityScale ?? null,
      tags: parsed.data.tags,
      maturation: parsed.data.maturation ?? null,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: `Erro ao criar feedback: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'training_feedback', 'INSERT', userId, row.id);
  return { success: true };
}

export async function updateTrainingFeedback(
  feedbackId: number,
  playerId: number,
  updates: {
    presence?: string;
    feedback?: string;
    rating?: number | null;
    escalao?: string;
    trainingDate?: string;
    decision?: string;
    heightScale?: string | null;
    buildScale?: string | null;
    speedScale?: string | null;
    intensityScale?: string | null;
    tags?: string[];
    ratingPerformance?: number | null;
    ratingPotential?: number | null;
    maturation?: string | null;
  },
): Promise<ActionResponse> {
  const { clubId, userId } = await getAuthContext();
  const supabase = await createClient();

  // Only author or admin can update
  const { data: existing } = await supabase
    .from('training_feedback')
    .select('author_id')
    .eq('id', feedbackId)
    .eq('club_id', clubId)
    .single();

  if (!existing) {
    return { success: false, error: 'Feedback não encontrado' };
  }

  const { role } = await getAuthContext();
  if (existing.author_id !== userId && role !== 'admin') {
    return { success: false, error: 'Sem permissão para editar este feedback' };
  }

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.presence) dbUpdates.presence = updates.presence;
  if (updates.feedback !== undefined) dbUpdates.feedback = updates.feedback || null;
  if (updates.rating !== undefined) dbUpdates.rating = updates.rating;
  if (updates.escalao !== undefined) dbUpdates.escalao = updates.escalao || null;
  if (updates.trainingDate) dbUpdates.training_date = updates.trainingDate;
  if (updates.decision !== undefined) dbUpdates.decision = updates.decision;
  if (updates.heightScale !== undefined) dbUpdates.height_scale = updates.heightScale;
  if (updates.buildScale !== undefined) dbUpdates.build_scale = updates.buildScale;
  if (updates.speedScale !== undefined) dbUpdates.speed_scale = updates.speedScale;
  if (updates.intensityScale !== undefined) dbUpdates.intensity_scale = updates.intensityScale;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.ratingPerformance !== undefined) dbUpdates.rating_performance = updates.ratingPerformance;
  if (updates.ratingPotential !== undefined) dbUpdates.rating_potential = updates.ratingPotential;
  if (updates.maturation !== undefined) dbUpdates.maturation = updates.maturation;

  const { error } = await supabase
    .from('training_feedback')
    .update(dbUpdates)
    .eq('id', feedbackId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao editar feedback: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'training_feedback', 'UPDATE', userId, feedbackId);
  return { success: true };
}

export async function deleteTrainingFeedback(
  feedbackId: number,
  playerId: number,
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  const supabase = await createClient();

  // Admin can delete any; others can only delete their own
  if (role !== 'admin') {
    const { data: existing } = await supabase
      .from('training_feedback')
      .select('author_id')
      .eq('id', feedbackId)
      .eq('club_id', clubId)
      .single();

    if (!existing || existing.author_id !== userId) {
      return { success: false, error: 'Sem permissão para apagar este feedback' };
    }
  }

  const { error } = await supabase
    .from('training_feedback')
    .delete()
    .eq('id', feedbackId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao apagar feedback: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'training_feedback', 'DELETE', userId, feedbackId);
  return { success: true };
}

/* ───────────── Mark feedbacks as seen (for badge count) ───────────── */

/** Update training_feedback_seen_at on club_memberships to clear the "new" badge */
export async function markTrainingFeedbacksSeen(): Promise<ActionResponse> {
  const { clubId, userId } = await getAuthContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from('club_memberships')
    .update({ training_feedback_seen_at: new Date().toISOString() })
    .eq('club_id', clubId)
    .eq('user_id', userId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/* ───────────── Share with External Coach ───────────── */

/** Create a coach-evaluation share link.
 *  If `existingTrainingId` is provided, attaches token to that training (revoking any active tokens).
 *  Otherwise cria nova linha stub (fluxo standalone legacy). */
export async function createCoachFeedbackLink(
  playerId: number,
  trainingDate: string,
  escalao?: string,
  existingTrainingId?: number,
): Promise<ActionResponse<{ url: string }>> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para pedir feedback externo' };
  }
  if (!trainingDate) {
    return { success: false, error: 'Data é obrigatória' };
  }
  const supabase = await createClient();

  let feedbackId: number;
  let isNewRow = false;

  if (existingTrainingId) {
    // Verifica ownership + estado — não deixa pedir em cancelado/faltou
    const { data: existing } = await supabase
      .from('training_feedback')
      .select('id, status')
      .eq('id', existingTrainingId)
      .eq('club_id', clubId)
      .eq('player_id', playerId)
      .maybeSingle();

    if (!existing) {
      return { success: false, error: 'Treino não encontrado' };
    }
    if (existing.status === 'cancelado' || existing.status === 'faltou') {
      return { success: false, error: 'Não é possível pedir feedback em treinos cancelados ou faltados' };
    }

    // Revoga tokens activos deste treino (1 link activo por treino)
    await supabase
      .from('feedback_share_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('feedback_id', existingTrainingId)
      .eq('club_id', clubId)
      .is('revoked_at', null)
      .is('used_at', null);

    feedbackId = existingTrainingId;
  } else {
    // Standalone flow — cria linha stub
    const { data: fb, error: fbError } = await supabase
      .from('training_feedback')
      .insert({
        club_id: clubId,
        player_id: playerId,
        author_id: userId,
        training_date: trainingDate,
        escalao: escalao || null,
        status: 'agendado',
        presence: 'attended',
      })
      .select('id')
      .single();

    if (fbError || !fb) {
      return { success: false, error: `Erro ao criar feedback: ${fbError?.message}` };
    }
    feedbackId = fb.id;
    isNewRow = true;
  }

  // Create share token — expires in 7 days
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: token, error: tokenError } = await supabase
    .from('feedback_share_tokens')
    .insert({
      club_id: clubId,
      feedback_id: feedbackId,
      created_by: userId,
      expires_at: expiresAt,
    })
    .select('token')
    .single();

  if (tokenError || !token) {
    return { success: false, error: `Erro ao criar link: ${tokenError?.message}` };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = `${appUrl}/feedback/${token.token}`;

  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'training_feedback', isNewRow ? 'INSERT' : 'UPDATE', userId, feedbackId);

  return { success: true, data: { url } };
}

/** Revoke an active share token */
export async function revokeShareToken(
  tokenId: number,
): Promise<ActionResponse> {
  const { clubId } = await getAuthContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from('feedback_share_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao revogar: ${error.message}` };
  }
  return { success: true };
}

/** Get active share tokens for a list of feedback IDs */
export async function getShareTokensForFeedbacks(
  feedbackIds: number[],
): Promise<{ feedbackId: number; tokenId: number; token: string; usedAt: string | null; revokedAt: string | null; expiresAt: string; coachName: string | null }[]> {
  if (feedbackIds.length === 0) return [];
  const { clubId } = await getAuthContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from('feedback_share_tokens')
    .select('id, feedback_id, token, used_at, revoked_at, expires_at, coach_name')
    .eq('club_id', clubId)
    .in('feedback_id', feedbackIds)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    feedbackId: row.feedback_id,
    tokenId: row.id,
    token: row.token,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
    coachName: row.coach_name,
  }));
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ───────────── Fase 2 (migration 107): Training Sessions novas actions ───── */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Sync `players.training_date` + `training_escalao` para espelhar o próximo treino agendado.
 * Chamado após criar/alterar/cancelar qualquer treino para manter o pipeline card legacy actualizado.
 */
async function syncPlayerNextTraining(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  playerId: number,
): Promise<void> {
  const { data: next } = await supabase
    .from('training_feedback')
    .select('training_date, session_time, escalao')
    .eq('player_id', playerId)
    .eq('club_id', clubId)
    .eq('status', 'agendado')
    .eq('is_retroactive', false)
    .order('training_date', { ascending: true })
    .order('session_time', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  // Combinar date + time como TZ-naive wall-clock (contexto PT)
  const nextDateTime = next
    ? (next.session_time ? `${next.training_date}T${next.session_time}` : next.training_date)
    : null;

  await supabase
    .from('players')
    .update({
      training_date: nextDateTime,
      training_escalao: next?.escalao ?? null,
    })
    .eq('id', playerId)
    .eq('club_id', clubId);
}

/**
 * Dedupe: rejeita insert se já existe treino com mesma (player_id, author_id, training_date, session_time)
 * criado em < 10s (previne double-click / dupla chamada).
 */
async function checkDuplicateSchedule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  playerId: number,
  authorId: string,
  trainingDate: string,
  sessionTime: string | null,
): Promise<boolean> {
  const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();
  const query = supabase
    .from('training_feedback')
    .select('id')
    .eq('club_id', clubId)
    .eq('player_id', playerId)
    .eq('author_id', authorId)
    .eq('training_date', trainingDate)
    .gt('created_at', tenSecondsAgo)
    .limit(1);

  const { data } = sessionTime
    ? await query.eq('session_time', sessionTime).maybeSingle()
    : await query.is('session_time', null).maybeSingle();

  return !!data;
}

/** Agendar treino futuro. Cria training_feedback + calendar_event + user_task + email. */
export async function scheduleTraining(input: {
  playerId: number;
  trainingDate: string;
  sessionTime?: string;
  location?: string;
  escalao?: string;
}): Promise<ActionResponse<{ trainingId: number }>> {
  const parsed = scheduleTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  // Data tem de ser hoje ou futuro
  const todayISO = new Date().toISOString().slice(0, 10);
  if (parsed.data.trainingDate < todayISO) {
    return {
      success: false,
      error: 'Data de treino não pode ser passada. Usa "Registar treino passado" em vez disto.',
    };
  }

  const { clubId, userId, role, club } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor' && role !== 'recruiter') {
    return { success: false, error: 'Sem permissão para agendar treinos' };
  }

  const supabase = await createClient();

  // Dedupe window
  const sessionTime = parsed.data.sessionTime ?? null;
  const isDup = await checkDuplicateSchedule(
    supabase, clubId, parsed.data.playerId, userId, parsed.data.trainingDate, sessionTime,
  );
  if (isDup) {
    return { success: false, error: 'Treino duplicado — já foi criado há instantes.' };
  }

  // Insert training_feedback
  const { data: training, error } = await supabase
    .from('training_feedback')
    .insert({
      club_id: clubId,
      player_id: parsed.data.playerId,
      author_id: userId,
      training_date: parsed.data.trainingDate,
      session_time: sessionTime,
      location: parsed.data.location ?? null,
      escalao: parsed.data.escalao ?? null,
      status: 'agendado',
      is_retroactive: false,
      presence: 'attended',  // legacy default, não usado mais
    })
    .select('id')
    .single();

  if (error || !training) {
    return { success: false, error: `Erro ao agendar treino: ${error?.message}` };
  }

  const trainingId = training.id;

  // Fetch player info (nome para calendar title + email)
  const { data: player } = await supabase
    .from('players')
    .select('name, club, contact, position_normalized, dob, foot, fpf_link, zerozero_link, photo_url, zz_photo_url, recruitment_status')
    .eq('id', parsed.data.playerId)
    .eq('club_id', clubId)
    .single();

  const playerName = player?.name ?? `Jogador #${parsed.data.playerId}`;

  // Create calendar event (1 per treino)
  await supabase.from('calendar_events').insert({
    club_id: clubId,
    player_id: parsed.data.playerId,
    training_feedback_id: trainingId,
    event_type: 'treino',
    title: `Treino — ${playerName}`,
    event_date: parsed.data.trainingDate,
    event_time: sessionTime,
    location: parsed.data.location ?? '',
    created_by: userId,
  });

  // Auto-move pipeline: se player em por_tratar/em_contacto → vir_treinar (+ actualiza vir_treinar_entered_at)
  const oldRecruitmentStatus = player?.recruitment_status ?? null;
  const shouldAutoMove = oldRecruitmentStatus === 'por_tratar' || oldRecruitmentStatus === 'em_contacto';
  if (shouldAutoMove) {
    await supabase
      .from('players')
      .update({
        recruitment_status: 'vir_treinar',
        vir_treinar_entered_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.playerId)
      .eq('club_id', clubId);

    // Log to status_history
    await supabase.from('status_history').insert({
      club_id: clubId,
      player_id: parsed.data.playerId,
      field_changed: 'recruitment_status',
      old_value: oldRecruitmentStatus,
      new_value: 'vir_treinar',
      changed_by: userId,
      notes: 'Via agendamento de treino',
    });
  }

  // Sync players.training_date (próximo agendado)
  await syncPlayerNextTraining(supabase, clubId, parsed.data.playerId);

  // Auto-task para o agendador
  await supabase.from('user_tasks').insert({
    club_id: clubId,
    user_id: userId,
    created_by: userId,
    player_id: parsed.data.playerId,
    training_feedback_id: trainingId,
    title: '⚽ Registar feedback do treino',
    source: 'pipeline_training',
    due_date: parsed.data.trainingDate,
  });

  // Email (skip self — notifyTaskAssigned já faz)
  const { data: assigner } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
  notifyTaskAssigned({
    clubId, clubName: club.name,
    assignedByUserId: userId,
    assignedByName: assigner?.full_name ?? 'Eskout',
    targetUserId: userId,
    taskTitle: '⚽ Registar feedback do treino',
    taskSource: 'pipeline_training',
    playerName,
    playerClub: player?.club ?? null,
    playerPhotoUrl: player?.photo_url ?? player?.zz_photo_url ?? null,
    playerContact: player?.contact ?? null,
    playerPosition: player?.position_normalized ?? null,
    playerDob: player?.dob ?? null,
    playerFoot: player?.foot ?? null,
    playerFpfLink: player?.fpf_link ?? null,
    playerZzLink: player?.zerozero_link ?? null,
    contactPurpose: null,
    dueDate: sessionTime ? `${parsed.data.trainingDate}T${sessionTime}` : parsed.data.trainingDate,
    trainingEscalao: parsed.data.escalao ?? null,
    kind: 'created',
  });

  revalidatePath(`/jogadores/${parsed.data.playerId}`);
  revalidatePath('/pipeline');
  revalidatePath('/calendario');
  revalidatePath('/tarefas');
  revalidatePath('/');

  await broadcastRowMutation(clubId, 'training_feedback', 'INSERT', userId, trainingId);
  await broadcastRowMutation(clubId, 'calendar_events', 'INSERT', userId, parsed.data.playerId);
  await broadcastRowMutation(clubId, 'user_tasks', 'INSERT', userId, parsed.data.playerId);
  if (shouldAutoMove) {
    await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, parsed.data.playerId);
  }

  return { success: true, data: { trainingId } };
}

/** Alterar data/hora/local de treino agendado. Mantém avaliação se houver. */
export async function rescheduleTraining(input: {
  trainingId: number;
  trainingDate: string;
  sessionTime?: string;
  location?: string;
}): Promise<ActionResponse> {
  const parsed = rescheduleTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role, club } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor' && role !== 'recruiter') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  // Fetch existing training
  const { data: training } = await supabase
    .from('training_feedback')
    .select('id, player_id, author_id, status, training_date, session_time, escalao')
    .eq('id', parsed.data.trainingId)
    .eq('club_id', clubId)
    .single();

  if (!training) {
    return { success: false, error: 'Treino não encontrado' };
  }
  if (training.status !== 'agendado' && training.status !== 'realizado') {
    return { success: false, error: 'Só treinos agendados ou realizados podem ser alterados' };
  }

  // Update training_feedback
  const sessionTime = parsed.data.sessionTime ?? null;
  const { error } = await supabase
    .from('training_feedback')
    .update({
      training_date: parsed.data.trainingDate,
      session_time: sessionTime,
      location: parsed.data.location ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.trainingId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro: ${error.message}` };
  }

  // Update linked calendar event (if exists)
  await supabase
    .from('calendar_events')
    .update({
      event_date: parsed.data.trainingDate,
      event_time: sessionTime,
      location: parsed.data.location ?? '',
      updated_at: new Date().toISOString(),
    })
    .eq('training_feedback_id', parsed.data.trainingId)
    .eq('club_id', clubId);

  // Update task due_date
  await supabase
    .from('user_tasks')
    .update({ due_date: parsed.data.trainingDate })
    .eq('training_feedback_id', parsed.data.trainingId)
    .eq('completed', false);

  // Sync players.training_date
  await syncPlayerNextTraining(supabase, clubId, training.player_id);

  // Email ao agendador original (skip self via notifyTaskAssigned)
  if (training.author_id) {
    const { data: player } = await supabase
      .from('players')
      .select('name, club, contact, position_normalized, dob, foot, fpf_link, zerozero_link, photo_url, zz_photo_url')
      .eq('id', training.player_id)
      .single();
    const { data: assigner } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
    notifyTaskAssigned({
      clubId, clubName: club.name,
      assignedByUserId: userId,
      assignedByName: assigner?.full_name ?? 'Eskout',
      targetUserId: training.author_id,
      taskTitle: `📅 Alterado: Treino de ${player?.name ?? ''}`,
      taskSource: 'pipeline_training',
      playerName: player?.name ?? null,
      playerClub: player?.club ?? null,
      playerPhotoUrl: player?.photo_url ?? player?.zz_photo_url ?? null,
      playerContact: player?.contact ?? null,
      playerPosition: player?.position_normalized ?? null,
      playerDob: player?.dob ?? null,
      playerFoot: player?.foot ?? null,
      playerFpfLink: player?.fpf_link ?? null,
      playerZzLink: player?.zerozero_link ?? null,
      contactPurpose: null,
      dueDate: sessionTime ? `${parsed.data.trainingDate}T${sessionTime}` : parsed.data.trainingDate,
      trainingEscalao: training.escalao,
      kind: 'rescheduled',
    });
  }

  revalidatePath(`/jogadores/${training.player_id}`);
  revalidatePath('/pipeline');
  revalidatePath('/calendario');
  revalidatePath('/tarefas');

  await broadcastRowMutation(clubId, 'training_feedback', 'UPDATE', userId, parsed.data.trainingId);
  await broadcastRowMutation(clubId, 'calendar_events', 'UPDATE', userId, training.player_id);
  await broadcastRowMutation(clubId, 'user_tasks', 'UPDATE', userId, training.player_id);

  return { success: true };
}

/** Cancelar treino. Apaga calendar event, revoga tokens, completa tasks. */
export async function cancelTraining(input: {
  trainingId: number;
  reason?: string;
}): Promise<ActionResponse> {
  const parsed = cancelTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role, club } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor' && role !== 'recruiter') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  const { data: training } = await supabase
    .from('training_feedback')
    .select('id, player_id, author_id, training_date, session_time, escalao, status')
    .eq('id', parsed.data.trainingId)
    .eq('club_id', clubId)
    .single();

  if (!training) {
    return { success: false, error: 'Treino não encontrado' };
  }
  if (training.status === 'cancelado') {
    return { success: true }; // idempotent
  }

  // Update to cancelado
  const { error } = await supabase
    .from('training_feedback')
    .update({
      status: 'cancelado',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: parsed.data.reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.trainingId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro: ${error.message}` };
  }

  // Delete calendar event
  await supabase
    .from('calendar_events')
    .delete()
    .eq('training_feedback_id', parsed.data.trainingId)
    .eq('club_id', clubId);

  // Revoke active feedback share tokens
  await supabase
    .from('feedback_share_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('feedback_id', parsed.data.trainingId)
    .eq('club_id', clubId)
    .is('revoked_at', null)
    .is('used_at', null);

  // Complete associated tasks
  await supabase
    .from('user_tasks')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq('training_feedback_id', parsed.data.trainingId)
    .eq('completed', false);

  // Sync players.training_date
  await syncPlayerNextTraining(supabase, clubId, training.player_id);

  // Email ao agendador original
  if (training.author_id) {
    const { data: player } = await supabase
      .from('players')
      .select('name, club, contact, position_normalized, dob, foot, fpf_link, zerozero_link, photo_url, zz_photo_url')
      .eq('id', training.player_id)
      .single();
    const { data: assigner } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
    notifyTaskAssigned({
      clubId, clubName: club.name,
      assignedByUserId: userId,
      assignedByName: assigner?.full_name ?? 'Eskout',
      targetUserId: training.author_id,
      taskTitle: `❌ Cancelado: Treino de ${player?.name ?? ''}`,
      taskSource: 'pipeline_training',
      playerName: player?.name ?? null,
      playerClub: player?.club ?? null,
      playerPhotoUrl: player?.photo_url ?? player?.zz_photo_url ?? null,
      playerContact: player?.contact ?? null,
      playerPosition: player?.position_normalized ?? null,
      playerDob: player?.dob ?? null,
      playerFoot: player?.foot ?? null,
      playerFpfLink: player?.fpf_link ?? null,
      playerZzLink: player?.zerozero_link ?? null,
      contactPurpose: null,
      dueDate: training.session_time ? `${training.training_date}T${training.session_time}` : training.training_date,
      trainingEscalao: training.escalao,
      kind: 'cancelled',
    });
  }

  revalidatePath(`/jogadores/${training.player_id}`);
  revalidatePath('/pipeline');
  revalidatePath('/calendario');
  revalidatePath('/tarefas');

  await broadcastRowMutation(clubId, 'training_feedback', 'UPDATE', userId, parsed.data.trainingId);
  await broadcastRowMutation(clubId, 'calendar_events', 'DELETE', userId, training.player_id);
  await broadcastRowMutation(clubId, 'user_tasks', 'UPDATE', userId, training.player_id);

  return { success: true };
}

/** Marcar treino como "faltou" (atleta não apareceu). Similar ao cancelamento mas estado distinto. */
export async function markTrainingMissed(trainingId: number, reason?: string): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin' && role !== 'editor' && role !== 'recruiter') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  const { data: training } = await supabase
    .from('training_feedback')
    .select('id, player_id, status')
    .eq('id', trainingId)
    .eq('club_id', clubId)
    .single();

  if (!training) {
    return { success: false, error: 'Treino não encontrado' };
  }
  if (training.status === 'faltou' || training.status === 'cancelado') {
    return { success: true };
  }

  const { error } = await supabase
    .from('training_feedback')
    .update({
      status: 'faltou',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', trainingId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro: ${error.message}` };
  }

  // Delete calendar event + revoke tokens + complete tasks (mesmo flow que cancel)
  await supabase.from('calendar_events').delete()
    .eq('training_feedback_id', trainingId).eq('club_id', clubId);
  await supabase.from('feedback_share_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('feedback_id', trainingId).eq('club_id', clubId)
    .is('revoked_at', null).is('used_at', null);
  await supabase.from('user_tasks')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq('training_feedback_id', trainingId).eq('completed', false);

  await syncPlayerNextTraining(supabase, clubId, training.player_id);

  revalidatePath(`/jogadores/${training.player_id}`);
  revalidatePath('/pipeline');
  revalidatePath('/calendario');
  revalidatePath('/tarefas');

  await broadcastRowMutation(clubId, 'training_feedback', 'UPDATE', userId, trainingId);
  await broadcastRowMutation(clubId, 'calendar_events', 'DELETE', userId, training.player_id);
  await broadcastRowMutation(clubId, 'user_tasks', 'UPDATE', userId, training.player_id);

  return { success: true };
}

/** Marcar agendado/realizado como realizado sem avaliação (manual transition). */
export async function markTrainingAttended(trainingId: number): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin' && role !== 'editor' && role !== 'recruiter') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  const { data: training } = await supabase
    .from('training_feedback')
    .select('id, player_id, status')
    .eq('id', trainingId)
    .eq('club_id', clubId)
    .single();

  if (!training) return { success: false, error: 'Treino não encontrado' };
  if (training.status !== 'agendado') {
    return { success: false, error: 'Só treinos agendados podem ser marcados como realizados' };
  }

  const { error } = await supabase
    .from('training_feedback')
    .update({ status: 'realizado', updated_at: new Date().toISOString() })
    .eq('id', trainingId)
    .eq('club_id', clubId);

  if (error) return { success: false, error: `Erro: ${error.message}` };

  await syncPlayerNextTraining(supabase, clubId, training.player_id);

  revalidatePath(`/jogadores/${training.player_id}`);
  revalidatePath('/pipeline');
  await broadcastRowMutation(clubId, 'training_feedback', 'UPDATE', userId, trainingId);

  return { success: true };
}

/** Registar treino retroactivo (já aconteceu) — só no perfil, não toca calendar nem pipeline. */
export async function registerPastTraining(input: {
  playerId: number;
  trainingDate: string;
  escalao?: string;
  location?: string;
  observedPosition?: string;
  feedback?: string;
  ratingPerformance?: number;
  ratingPotential?: number;
  decision?: string;
  heightScale?: string | null;
  buildScale?: string | null;
  speedScale?: string | null;
  intensityScale?: string | null;
  maturation?: string | null;
  tags?: string[];
}): Promise<ActionResponse<{ trainingId: number }>> {
  const parsed = registerPastTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role } = await getAuthContext();
  if (role !== 'admin' && role !== 'editor' && role !== 'recruiter') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  const { data: training, error } = await supabase
    .from('training_feedback')
    .insert({
      club_id: clubId,
      player_id: parsed.data.playerId,
      author_id: userId,
      training_date: parsed.data.trainingDate,
      escalao: parsed.data.escalao ?? null,
      location: parsed.data.location ?? null,
      observed_position: parsed.data.observedPosition ?? null,
      status: 'realizado',
      is_retroactive: true,
      presence: 'attended',
      feedback: parsed.data.feedback ?? null,
      rating: parsed.data.ratingPerformance ?? null,
      rating_performance: parsed.data.ratingPerformance ?? null,
      rating_potential: parsed.data.ratingPotential ?? null,
      decision: parsed.data.decision,
      height_scale: parsed.data.heightScale ?? null,
      build_scale: parsed.data.buildScale ?? null,
      speed_scale: parsed.data.speedScale ?? null,
      intensity_scale: parsed.data.intensityScale ?? null,
      maturation: parsed.data.maturation ?? null,
      tags: parsed.data.tags,
    })
    .select('id')
    .single();

  if (error || !training) {
    return { success: false, error: `Erro: ${error?.message}` };
  }

  revalidatePath(`/jogadores/${parsed.data.playerId}`);
  await broadcastRowMutation(clubId, 'training_feedback', 'INSERT', userId, training.id);

  return { success: true, data: { trainingId: training.id } };
}

/** Preencher avaliação num treino existente (agendado ou realizado).
 *  Se estava agendado → passa a realizado (avaliação = transição implícita). */
export async function updateTrainingEvaluation(input: {
  trainingId: number;
  feedback?: string;
  ratingPerformance?: number | null;
  ratingPotential?: number | null;
  decision?: string;
  heightScale?: string | null;
  buildScale?: string | null;
  speedScale?: string | null;
  intensityScale?: string | null;
  maturation?: string | null;
  tags?: string[];
  observedPosition?: string;
}): Promise<ActionResponse> {
  const parsed = updateTrainingEvaluationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId, role } = await getAuthContext();

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('training_feedback')
    .select('id, player_id, author_id, status')
    .eq('id', parsed.data.trainingId)
    .eq('club_id', clubId)
    .single();

  if (!existing) return { success: false, error: 'Treino não encontrado' };

  // Permission: author or admin
  if (existing.author_id !== userId && role !== 'admin') {
    return { success: false, error: 'Sem permissão para editar este treino' };
  }

  // Transição implícita: agendado + preencheu rating/feedback → realizado
  const hasEval = parsed.data.ratingPerformance != null
    || parsed.data.ratingPotential != null
    || (parsed.data.feedback && parsed.data.feedback.trim().length > 0);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.feedback !== undefined) updates.feedback = parsed.data.feedback || null;
  if (parsed.data.ratingPerformance !== undefined) updates.rating_performance = parsed.data.ratingPerformance;
  if (parsed.data.ratingPotential !== undefined) updates.rating_potential = parsed.data.ratingPotential;
  if (parsed.data.decision !== undefined) updates.decision = parsed.data.decision;
  if (parsed.data.heightScale !== undefined) updates.height_scale = parsed.data.heightScale;
  if (parsed.data.buildScale !== undefined) updates.build_scale = parsed.data.buildScale;
  if (parsed.data.speedScale !== undefined) updates.speed_scale = parsed.data.speedScale;
  if (parsed.data.intensityScale !== undefined) updates.intensity_scale = parsed.data.intensityScale;
  if (parsed.data.maturation !== undefined) updates.maturation = parsed.data.maturation;
  if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;
  if (parsed.data.observedPosition !== undefined) updates.observed_position = parsed.data.observedPosition;

  if (existing.status === 'agendado' && hasEval) {
    updates.status = 'realizado';
  }

  const { error } = await supabase
    .from('training_feedback')
    .update(updates)
    .eq('id', parsed.data.trainingId)
    .eq('club_id', clubId);

  if (error) return { success: false, error: `Erro: ${error.message}` };

  // Se mudou para realizado, sync pipeline card (training_date não é mais o "próximo")
  if (existing.status === 'agendado' && hasEval) {
    await syncPlayerNextTraining(supabase, clubId, existing.player_id);
  }

  revalidatePath(`/jogadores/${existing.player_id}`);
  revalidatePath('/pipeline');
  await broadcastRowMutation(clubId, 'training_feedback', 'UPDATE', userId, parsed.data.trainingId);

  return { success: true };
}
