// src/actions/notes.ts
// Server Actions for observation notes (scout field notes)
// Inserts notes and revalidates the player profile page
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/supabase/club-context.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/club-context';
import { observationNoteSchema } from '@/lib/validators';
import type { ActionResponse } from '@/lib/types';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';

export async function createObservationNote(
  playerId: number,
  content: string,
  matchContext?: string,
  priority: 'normal' | 'importante' | 'urgente' = 'normal'
): Promise<ActionResponse> {
  const parsed = observationNoteSchema.safeParse({ content, matchContext });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId } = await getAuthContext();
  const supabase = await createClient();

  const { data: note, error } = await supabase.from('observation_notes').insert({
    player_id: playerId,
    author_id: userId,
    club_id: clubId,
    content: parsed.data.content,
    match_context: parsed.data.matchContext || null,
    priority,
  }).select('id').single();

  if (error) {
    return { success: false, error: `Erro ao criar nota: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'observation_notes', 'INSERT', userId, note.id);
  return { success: true };
}

export async function updateObservationNote(
  noteId: number,
  playerId: number,
  content: string,
  matchContext?: string,
  priority?: 'normal' | 'importante' | 'urgente'
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  const supabase = await createClient();

  // Only admins can edit notes
  if (role !== 'admin') {
    return { success: false, error: 'Apenas administradores podem editar notas' };
  }

  if (!content.trim()) {
    return { success: false, error: 'Conteúdo obrigatório' };
  }

  const updates: Record<string, unknown> = { content: content.trim() };
  if (matchContext !== undefined) updates.match_context = matchContext || null;
  if (priority) updates.priority = priority;

  const { error } = await supabase
    .from('observation_notes')
    .update(updates)
    .eq('id', noteId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao editar nota: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'observation_notes', 'UPDATE', userId, noteId);
  return { success: true };
}

/** Dismiss a flagged note from the inbox — downgrades priority to 'normal' without deleting */
export async function dismissFlaggedNote(
  noteId: number,
  playerId: number
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  if (role === 'scout' || role === 'recruiter') {
    return { success: false, error: 'Sem permissão para dispensar notas' };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from('observation_notes')
    .update({ priority: 'normal' })
    .eq('id', noteId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao dispensar nota: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  revalidatePath('/');
  await broadcastRowMutation(clubId, 'observation_notes', 'UPDATE', userId, noteId);
  return { success: true };
}

export async function deleteObservationNote(
  noteId: number,
  playerId: number
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getAuthContext();
  const supabase = await createClient();

  const isAdmin = role === 'admin';

  if (!isAdmin) {
    // Check if user is the author
    const { data: note } = await supabase
      .from('observation_notes')
      .select('author_id')
      .eq('id', noteId)
      .eq('club_id', clubId)
      .single();
    if (!note || note.author_id !== userId) {
      return { success: false, error: 'Sem permissão para apagar esta nota' };
    }
  }

  const { error } = await supabase
    .from('observation_notes')
    .delete()
    .eq('id', noteId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao apagar nota: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  await broadcastRowMutation(clubId, 'observation_notes', 'DELETE', userId, noteId);
  return { success: true };
}
