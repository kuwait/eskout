// src/actions/players.ts
// Server Actions for player CRUD operations
// Handles creating new players with auto age group detection and Zod validation
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/validators.ts, src/lib/supabase/club-context.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { playerFormSchema } from '@/lib/validators';
import { birthYearToAgeGroup, CURRENT_SEASON } from '@/lib/constants';
import type { ActionResponse } from '@/lib/types';

export async function createPlayer(formData: FormData): Promise<ActionResponse<{ id: number; pendingApproval: boolean; redirectTo: string }>> {
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

  const { clubId, userId, role } = await getActiveClub();
  const supabase = await createClient();

  // Role-based approval: scouts need approval, recruiters/editors auto-approved but admin notified
  const isScout = role === 'scout';
  const needsAdminReview = role === 'recruiter' || role === 'editor';
  const pendingApproval = isScout;
  const adminReviewed = !isScout && !needsAdminReview; // true only for admin

  // Duplicate detection — check by FPF/ZeroZero links first, then by name+DOB
  const fpfLink = rest.fpfLink?.trim() || null;
  const zzLink = rest.zerozeroLink?.trim() || null;

  if (fpfLink) {
    const { data: dup } = await supabase
      .from('players').select('id, name').eq('fpf_link', fpfLink).eq('club_id', clubId).maybeSingle();
    if (dup) {
      return { success: false, error: `Jogador já existe com este link FPF: ${dup.name} (ID ${dup.id})` };
    }
  }
  if (zzLink) {
    const { data: dup } = await supabase
      .from('players').select('id, name').eq('zerozero_link', zzLink).eq('club_id', clubId).maybeSingle();
    if (dup) {
      return { success: false, error: `Jogador já existe com este link ZeroZero: ${dup.name} (ID ${dup.id})` };
    }
  }
  // Name + DOB match (case-insensitive name)
  const { data: nameDup } = await supabase
    .from('players').select('id, name')
    .ilike('name', rest.name.trim())
    .eq('dob', dob)
    .eq('club_id', clubId)
    .maybeSingle();
  if (nameDup) {
    return { success: false, error: `Jogador com o mesmo nome e data de nascimento já existe: ${nameDup.name} (ID ${nameDup.id})` };
  }

  // Find or create age group (club-scoped)
  let { data: ageGroup } = await supabase
    .from('age_groups')
    .select('id')
    .eq('name', ageGroupName)
    .eq('season', CURRENT_SEASON)
    .eq('club_id', clubId)
    .single();

  if (!ageGroup) {
    const { data: newAg, error: agError } = await supabase
      .from('age_groups')
      .insert({ name: ageGroupName, generation_year: birthYear, season: CURRENT_SEASON, club_id: clubId })
      .select('id')
      .single();

    if (agError) {
      return { success: false, error: `Erro ao criar escalão: ${agError.message}` };
    }
    ageGroup = newAg;
  }

  const { data: player, error } = await supabase
    .from('players')
    .insert({
      club_id: clubId,
      age_group_id: ageGroup!.id,
      name: rest.name,
      dob,
      club: rest.club,
      position_normalized: rest.positionNormalized || null,
      foot: rest.foot || null,
      shirt_number: rest.shirtNumber || null,
      contact: rest.contact || null,
      department_opinion: rest.departmentOpinion?.length ? rest.departmentOpinion : ['Por Observar'],
      observer: rest.observer || null,
      observer_eval: rest.observerEval || null,
      observer_decision: rest.observerDecision || null,
      referred_by: rest.referredBy || null,
      fpf_link: rest.fpfLink || null,
      zerozero_link: rest.zerozeroLink || null,
      recruitment_status: rest.recruitmentStatus || null,
      // Scraped fields (populated when creating from FPF/ZeroZero links)
      photo_url: rest.photoUrl || null,
      height: rest.height ? parseInt(rest.height, 10) : null,
      weight: rest.weight ? parseInt(rest.weight, 10) : null,
      nationality: rest.nationality || null,
      birth_country: rest.birthCountry || null,
      created_by: userId,
      pending_approval: pendingApproval,
      admin_reviewed: adminReviewed,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: `Erro ao criar jogador: ${error.message}` };
  }

  // If notes were provided, create an observation note instead of storing on player
  if (rest.notes?.trim()) {
    await supabase.from('observation_notes').insert({
      club_id: clubId,
      player_id: player!.id,
      author_id: userId,
      content: rest.notes.trim(),
    });
  }

  revalidatePath('/jogadores');
  revalidatePath('/admin/pendentes');
  revalidatePath('/meus-jogadores');

  // Scouts and recruiters go to their personal list; admins/editors go to player profile
  const redirectTo = (isScout || role === 'recruiter')
    ? '/meus-jogadores'
    : `/jogadores/${player!.id}`;

  return { success: true, data: { id: player!.id, pendingApproval, redirectTo } };
}

export async function deletePlayer(playerId: number): Promise<ActionResponse> {
  const { clubId, role } = await getActiveClub();

  if (role !== 'admin') {
    return { success: false, error: 'Apenas administradores podem eliminar jogadores' };
  }

  const supabase = await createClient();

  // Delete related records first (observation_notes, status_history, scouting_reports)
  await supabase.from('observation_notes').delete().eq('player_id', playerId).eq('club_id', clubId);
  await supabase.from('status_history').delete().eq('player_id', playerId).eq('club_id', clubId);
  await supabase.from('scouting_reports').delete().eq('player_id', playerId).eq('club_id', clubId);

  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('club_id', clubId);
  if (error) {
    return { success: false, error: `Erro ao eliminar jogador: ${error.message}` };
  }

  revalidatePath('/jogadores');
  revalidatePath('/pipeline');
  revalidatePath('/campo');
  return { success: true };
}

/* ───────────── Approve / Reject / Dismiss Player ───────────── */

/** Approve a scout-created pending player */
export async function approvePlayer(playerId: number): Promise<ActionResponse> {
  const { clubId, role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('players')
    .update({ pending_approval: false, admin_reviewed: true })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/jogadores');
  revalidatePath('/admin/pendentes');
  return { success: true };
}

/** Reject a scout-created pending player (deletes it) */
export async function rejectPlayer(playerId: number): Promise<ActionResponse> {
  const { clubId, role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  // Delete related records first
  await supabase.from('observation_notes').delete().eq('player_id', playerId).eq('club_id', clubId);
  await supabase.from('scouting_reports').delete().eq('player_id', playerId).eq('club_id', clubId);

  const { error } = await supabase
    .from('players')
    .delete()
    .eq('id', playerId)
    .eq('club_id', clubId)
    .eq('pending_approval', true);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/pendentes');
  return { success: true };
}

/** Dismiss a recruiter/editor notification (mark as reviewed) */
export async function dismissPlayerReview(playerId: number): Promise<ActionResponse> {
  const { clubId, role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('players')
    .update({ admin_reviewed: true })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/pendentes');
  return { success: true };
}

/** Dismiss all unreviewed players at once */
export async function dismissAllPlayerReviews(): Promise<ActionResponse> {
  const { clubId, role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('players')
    .update({ admin_reviewed: true })
    .eq('club_id', clubId)
    .eq('admin_reviewed', false);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/pendentes');
  return { success: true };
}

// Fields that are tracked in status_history when changed via player profile
const TRACKED_FIELDS = [
  'recruitment_status',
  'department_opinion',
  'is_shadow_squad',
  'is_real_squad',
  'shadow_position',
  'position_normalized',
  'club',
  'observer_decision',
] as const;

export async function updatePlayer(
  playerId: number,
  updates: Record<string, unknown>
): Promise<ActionResponse> {
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  // Fetch current values for tracked fields so we can detect changes
  const trackedInUpdates = TRACKED_FIELDS.filter((f) => f in updates);
  let oldValues: Record<string, unknown> = {};

  if (trackedInUpdates.length > 0) {
    const { data: current } = await supabase
      .from('players')
      .select(trackedInUpdates.join(','))
      .eq('id', playerId)
      .eq('club_id', clubId)
      .single();
    if (current) oldValues = current as unknown as Record<string, unknown>;
  }

  const { error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar jogador: ${error.message}` };
  }

  // Log changes to status_history for tracked fields
  if (trackedInUpdates.length > 0) {
    for (const field of trackedInUpdates) {
      const oldVal = oldValues[field];
      const newVal = updates[field];
      // Stringify for comparison (arrays like department_opinion)
      const oldStr = oldVal == null ? null : (Array.isArray(oldVal) ? oldVal.join(', ') : String(oldVal));
      const newStr = newVal == null ? null : (Array.isArray(newVal) ? (newVal as string[]).join(', ') : String(newVal));

      if (oldStr !== newStr) {
        await supabase.from('status_history').insert({
          club_id: clubId,
          player_id: playerId,
          field_changed: field,
          old_value: oldStr,
          new_value: newStr,
          changed_by: userId,
        });
      }
    }
  }

  revalidatePath('/jogadores');
  revalidatePath(`/jogadores/${playerId}`);
  revalidatePath('/pipeline');
  revalidatePath('/campo');
  return { success: true };
}
