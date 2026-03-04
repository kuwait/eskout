// src/actions/players.ts
// Server Actions for player CRUD operations
// Handles creating new players with auto age group detection and Zod validation
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/constants.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { playerFormSchema } from '@/lib/validators';
import { birthYearToAgeGroup, CURRENT_SEASON } from '@/lib/constants';
import type { ActionResponse } from '@/lib/types';

export async function createPlayer(formData: FormData): Promise<ActionResponse<{ id: number }>> {
  const raw = Object.fromEntries(formData.entries());

  const parsed = playerFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { dob, ...rest } = parsed.data;

  // Auto-detect age group from DOB
  const birthYear = new Date(dob).getFullYear();
  const ageGroupName = birthYearToAgeGroup(birthYear);
  if (!ageGroupName) {
    return { success: false, error: `Ano de nascimento ${birthYear} não corresponde a nenhum escalão` };
  }

  const supabase = await createClient();

  // Find or create age group
  let { data: ageGroup } = await supabase
    .from('age_groups')
    .select('id')
    .eq('name', ageGroupName)
    .eq('season', CURRENT_SEASON)
    .single();

  if (!ageGroup) {
    const { data: newAg, error: agError } = await supabase
      .from('age_groups')
      .insert({ name: ageGroupName, generation_year: birthYear, season: CURRENT_SEASON })
      .select('id')
      .single();

    if (agError) {
      return { success: false, error: `Erro ao criar escalão: ${agError.message}` };
    }
    ageGroup = newAg;
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  const { data: player, error } = await supabase
    .from('players')
    .insert({
      age_group_id: ageGroup!.id,
      name: rest.name,
      dob,
      club: rest.club,
      position_normalized: rest.positionNormalized || null,
      foot: rest.foot || null,
      shirt_number: rest.shirtNumber || null,
      contact: rest.contact || null,
      department_opinion: rest.departmentOpinion || 'Por Observar',
      observer: rest.observer || null,
      observer_eval: rest.observerEval || null,
      observer_decision: rest.observerDecision || null,
      referred_by: rest.referredBy || null,
      notes: rest.notes || null,
      fpf_link: rest.fpfLink || null,
      zerozero_link: rest.zerozeroLink || null,
      recruitment_status: rest.recruitmentStatus || 'pool',
      created_by: user?.id,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: `Erro ao criar jogador: ${error.message}` };
  }

  revalidatePath('/jogadores');
  return { success: true, data: { id: player!.id } };
}

export async function updatePlayer(
  playerId: number,
  updates: Record<string, unknown>
): Promise<ActionResponse> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', playerId);

  if (error) {
    return { success: false, error: `Erro ao atualizar jogador: ${error.message}` };
  }

  revalidatePath('/jogadores');
  revalidatePath(`/jogadores/${playerId}`);
  return { success: true };
}
