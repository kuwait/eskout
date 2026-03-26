// src/actions/training-feedback.ts
// Server Actions for training feedback — presence tracking + coach feedback after a player trains
// Scouts and above can create; author can update; admin can delete
// RELEVANT FILES: src/lib/validators.ts, src/lib/supabase/queries.ts, src/components/players/TrainingFeedback.tsx

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { trainingFeedbackSchema } from '@/lib/validators';
import type { ActionResponse } from '@/lib/types';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';

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

  const { clubId, userId } = await getActiveClub();
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
  const { clubId, userId } = await getActiveClub();
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

  const { role } = await getActiveClub();
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
  const { clubId, userId, role } = await getActiveClub();
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
  const { clubId, userId } = await getActiveClub();
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

/** Create a feedback stub (attended, no data) + shareable link for an external coach */
export async function createCoachFeedbackLink(
  playerId: number,
  trainingDate: string,
  escalao?: string,
): Promise<ActionResponse<{ url: string }>> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para pedir feedback externo' };
  }
  if (!trainingDate) {
    return { success: false, error: 'Data é obrigatória' };
  }
  const supabase = await createClient();

  // Create a stub feedback entry (presence=attended, everything else empty — coach fills in)
  const { data: fb, error: fbError } = await supabase
    .from('training_feedback')
    .insert({
      club_id: clubId,
      player_id: playerId,
      author_id: userId,
      training_date: trainingDate,
      escalao: escalao || null,
      presence: 'attended',
    })
    .select('id')
    .single();

  if (fbError || !fb) {
    return { success: false, error: `Erro ao criar feedback: ${fbError?.message}` };
  }

  // Create share token — expires in 7 days
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: token, error: tokenError } = await supabase
    .from('feedback_share_tokens')
    .insert({
      club_id: clubId,
      feedback_id: fb.id,
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
  await broadcastRowMutation(clubId, 'training_feedback', 'INSERT', userId, fb.id);

  return { success: true, data: { url } };
}

/** Revoke an active share token */
export async function revokeShareToken(
  tokenId: number,
): Promise<ActionResponse> {
  const { clubId } = await getActiveClub();
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
  const { clubId } = await getActiveClub();
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
