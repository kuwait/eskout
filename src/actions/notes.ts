// src/actions/notes.ts
// Server Actions for observation notes (scout field notes)
// Inserts notes and revalidates the player profile page
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/types/index.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { observationNoteSchema } from '@/lib/validators';
import type { ActionResponse } from '@/lib/types';

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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const { error } = await supabase.from('observation_notes').insert({
    player_id: playerId,
    author_id: user.id,
    content: parsed.data.content,
    match_context: parsed.data.matchContext || null,
    priority,
  });

  if (error) {
    return { success: false, error: `Erro ao criar nota: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}

export async function updateObservationNote(
  noteId: number,
  playerId: number,
  content: string,
  matchContext?: string,
  priority?: 'normal' | 'importante' | 'urgente'
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  // Only admins can edit notes
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
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
    .eq('id', noteId);

  if (error) {
    return { success: false, error: `Erro ao editar nota: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}

export async function deleteObservationNote(
  noteId: number,
  playerId: number
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  // Only admins or the note author can delete
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';

  if (!isAdmin) {
    // Check if user is the author
    const { data: note } = await supabase
      .from('observation_notes')
      .select('author_id')
      .eq('id', noteId)
      .single();
    if (!note || note.author_id !== user.id) {
      return { success: false, error: 'Sem permissão para apagar esta nota' };
    }
  }

  const { error } = await supabase
    .from('observation_notes')
    .delete()
    .eq('id', noteId);

  if (error) {
    return { success: false, error: `Erro ao apagar nota: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}
