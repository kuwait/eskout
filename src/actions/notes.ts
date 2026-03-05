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
  matchContext?: string
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
  });

  if (error) {
    return { success: false, error: `Erro ao criar nota: ${error.message}` };
  }

  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}
