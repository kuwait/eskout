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
      rating: parsed.data.rating ?? null,
      decision: parsed.data.decision,
      height_scale: parsed.data.heightScale ?? null,
      build_scale: parsed.data.buildScale ?? null,
      speed_scale: parsed.data.speedScale ?? null,
      intensity_scale: parsed.data.intensityScale ?? null,
      tags: parsed.data.tags,
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
