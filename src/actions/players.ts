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
import { broadcastRowMutation, broadcastBulkMutation } from '@/lib/realtime/broadcast';
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
      fpf_last_checked: rest.fpfLink ? new Date().toISOString() : null,
      zerozero_link: rest.zerozeroLink || null,
      zz_last_checked: rest.zerozeroLink ? new Date().toISOString() : null,
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

  // Broadcast to other clients
  await broadcastRowMutation(clubId, 'players', 'INSERT', userId, player!.id);

  // Scouts and recruiters go to their personal list; admins/editors go to player profile
  const redirectTo = (isScout || role === 'recruiter')
    ? '/meus-jogadores'
    : `/jogadores/${player!.id}`;

  return { success: true, data: { id: player!.id, pendingApproval, redirectTo } };
}

export async function deletePlayer(playerId: number): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();

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

  await broadcastRowMutation(clubId, 'players', 'DELETE', userId, playerId);

  return { success: true };
}

/* ───────────── Approve / Reject / Dismiss Player ───────────── */

/** Approve a scout-created pending player */
export async function approvePlayer(playerId: number): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('players')
    .update({ pending_approval: false, admin_reviewed: true, approved_by: userId })
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) return { success: false, error: error.message };

  // Auto-dismiss for the approver (they don't need to see it anymore)
  await supabase
    .from('player_added_dismissals')
    .upsert({ user_id: userId, player_id: playerId }, { onConflict: 'user_id,player_id' });

  revalidatePath('/jogadores');
  revalidatePath('/admin/pendentes');
  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId);
  return { success: true };
}

/** Reject a scout-created pending player (deletes it) */
export async function rejectPlayer(playerId: number): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
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
  await broadcastRowMutation(clubId, 'players', 'DELETE', userId, playerId);
  return { success: true };
}

/** Dismiss a player from the current user's "Jogadores Adicionados" list (per-user) */
export async function dismissPlayerReview(playerId: number): Promise<ActionResponse> {
  const { clubId, role, userId } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('player_added_dismissals')
    .upsert({ user_id: userId, player_id: playerId }, { onConflict: 'user_id,player_id' });

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/pendentes');
  await broadcastRowMutation(clubId, 'player_added_dismissals', 'INSERT', userId, playerId);
  return { success: true };
}

/** Dismiss all players from the current user's "Jogadores Adicionados" list */
export async function dismissAllPlayerReviews(): Promise<ActionResponse> {
  const { clubId, role, userId } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  const supabase = await createClient();

  // Fetch all player IDs the user hasn't dismissed yet (created by others in this club)
  const { data: dismissed } = await supabase
    .from('player_added_dismissals')
    .select('player_id')
    .eq('user_id', userId);
  const dismissedIds = new Set((dismissed ?? []).map((d) => d.player_id));

  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('club_id', clubId)
    .neq('created_by', userId);

  if (!players) return { success: true };

  const toDismiss = players
    .filter((p) => !dismissedIds.has(p.id))
    .map((p) => ({ user_id: userId, player_id: p.id }));

  if (toDismiss.length > 0) {
    const { error } = await supabase
      .from('player_added_dismissals')
      .upsert(toDismiss, { onConflict: 'user_id,player_id' });

    if (error) return { success: false, error: error.message };
  }

  revalidatePath('/admin/pendentes');
  await broadcastBulkMutation(clubId, 'player_added_dismissals', userId);
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

// Whitelist of columns that can be updated via updatePlayer — prevents arbitrary field injection
const ALLOWED_UPDATE_FIELDS = new Set([
  // Basic info
  'name', 'dob', 'club', 'position_normalized', 'secondary_position', 'tertiary_position',
  'foot', 'shirt_number', 'contact', 'nationality', 'birth_country', 'height', 'weight',
  // Scouting
  'department_opinion', 'observer', 'observer_eval', 'observer_decision',
  'referred_by', 'referred_by_user_id', 'notes',
  // Pipeline & squads
  'recruitment_status', 'recruitment_notes', 'contact_assigned_to',
  'is_shadow_squad', 'shadow_position', 'shadow_order',
  'is_real_squad', 'real_squad_position', 'real_order', 'pipeline_order',
  'training_date', 'meeting_date', 'signing_date',
  // External data
  'fpf_link', 'zerozero_link', 'photo_url', 'club_logo_url',
  'fpf_current_club', 'fpf_last_checked', 'fpf_photo_url',
  'zz_club', 'zz_team', 'zz_games', 'zz_goals', 'zz_assists',
  'zz_photo_url', 'zz_height', 'zz_weight', 'zz_history', 'zz_last_checked',
  // Admin
  'pending_approval', 'admin_reviewed', 'age_group_id',
]);

export async function updatePlayer(
  playerId: number,
  updates: Record<string, unknown>
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();

  // Role check — scouts and recruiters cannot edit player profiles directly
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão para editar jogadores' };
  }

  // Strip any fields not in the whitelist to prevent arbitrary column injection
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) {
      sanitized[key] = value;
    }
  }
  if (Object.keys(sanitized).length === 0) {
    return { success: false, error: 'Nenhum campo válido para atualizar' };
  }

  const supabase = await createClient();

  // Fetch current values for tracked fields so we can detect changes
  const trackedInUpdates = TRACKED_FIELDS.filter((f) => f in sanitized);
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
    .update(sanitized)
    .eq('id', playerId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: `Erro ao atualizar jogador: ${error.message}` };
  }

  // Log changes to status_history for tracked fields
  if (trackedInUpdates.length > 0) {
    for (const field of trackedInUpdates) {
      const oldVal = oldValues[field];
      const newVal = sanitized[field];
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

  // Auto-task: when contact_assigned_to is set on a player in a relevant status, create a task for the assignee
  if ('contact_assigned_to' in sanitized && sanitized.contact_assigned_to) {
    const assigneeId = sanitized.contact_assigned_to as string;
    const { data: current } = await supabase
      .from('players')
      .select('name, recruitment_status, signing_date, training_date')
      .eq('id', playerId)
      .eq('club_id', clubId)
      .single();

    // Map statuses to task source + title + due date (confirmado uses signing_attendees, not contact_assigned_to)
    const statusTaskMap: Record<string, { source: string; emoji: string; label: string; dueDate: string | null }> = {
      em_contacto: { source: 'pipeline_contact', emoji: '📞', label: 'Contactar', dueDate: null },
      vir_treinar: { source: 'pipeline_training', emoji: '⚽', label: 'Treino —', dueDate: current?.training_date ?? null },
    };

    const taskConfig = current?.recruitment_status ? statusTaskMap[current.recruitment_status] : null;
    if (taskConfig) {
      const playerName = current!.name ?? `Jogador #${playerId}`;
      const { data: existingTask } = await supabase
        .from('user_tasks')
        .select('id')
        .eq('user_id', assigneeId)
        .eq('player_id', playerId)
        .eq('source', taskConfig.source)
        .eq('completed', false)
        .limit(1)
        .maybeSingle();

      if (!existingTask) {
        await supabase.from('user_tasks').insert(
          { club_id: clubId, user_id: assigneeId, created_by: userId, player_id: playerId, title: `${taskConfig.emoji} ${taskConfig.label} ${playerName}`, source: taskConfig.source, due_date: taskConfig.dueDate },
        );
        revalidatePath('/tarefas');
        await broadcastRowMutation(clubId, 'user_tasks', 'INSERT', userId, playerId);
      }
    }
  }

  revalidatePath('/jogadores');
  revalidatePath(`/jogadores/${playerId}`);
  revalidatePath('/pipeline');
  revalidatePath('/campo');

  await broadcastRowMutation(clubId, 'players', 'UPDATE', userId, playerId, Object.keys(sanitized));

  return { success: true };
}

/* ───────────── Delete status history entry ───────────── */

/** Delete a single status_history entry — admin only */
export async function deleteStatusHistoryEntry(entryId: number): Promise<ActionResponse> {
  const { clubId, role } = await getActiveClub();
  if (role !== 'admin') {
    return { success: false, error: 'Apenas administradores podem apagar histórico.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('status_history')
    .delete()
    .eq('id', entryId)
    .eq('club_id', clubId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
