// src/actions/pipeline.ts
// Server Actions for recruitment pipeline status changes
// Updates player recruitment_status and logs every change to status_history
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/types/index.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { recruitmentStatusChangeSchema } from '@/lib/validators';
import type { ActionResponse, RecruitmentStatus } from '@/lib/types';

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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  // Get current status for history
  const { data: player } = await supabase
    .from('players')
    .select('recruitment_status')
    .eq('id', playerId)
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
    .eq('id', playerId);

  if (error) {
    return { success: false, error: `Erro ao atualizar estado: ${error.message}` };
  }

  // Log to status_history
  await supabase.from('status_history').insert({
    player_id: playerId,
    field_changed: 'recruitment_status',
    old_value: oldStatus,
    new_value: newStatus,
    changed_by: user.id,
    notes: note ?? null,
  });

  revalidatePath('/pipeline');
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

  revalidatePath('/pipeline');
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

  revalidatePath('/pipeline');
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

  revalidatePath('/pipeline');
  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}
