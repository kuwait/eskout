// src/actions/quick-scout-reports.ts
// Server Actions for Quick Scout Reports — tap-based mobile evaluations
// All roles can submit. Author can edit/delete, admin can delete any.
// RELEVANT FILES: src/lib/types/index.ts, src/lib/validators.ts, src/lib/constants/quick-report-tags.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { quickScoutReportSchema, type QuickScoutReportData } from '@/lib/validators';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';
import type { ActionResponse, QuickScoutReport } from '@/lib/types';

/* ───────────── Submit ───────────── */

/** Submit a new quick scout report */
export async function submitQuickReport(input: QuickScoutReportData): Promise<ActionResponse<{ id: number }>> {
  const parsed = quickScoutReportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();
  const d = parsed.data;

  const { data, error } = await supabase
    .from('quick_scout_reports')
    .insert({
      club_id: clubId,
      player_id: d.playerId,
      author_id: userId,
      rating_tecnica: d.ratingTecnica,
      rating_tatica: d.ratingTatica,
      rating_fisico: d.ratingFisico,
      rating_mentalidade: d.ratingMentalidade,
      rating_potencial: d.ratingPotencial,
      rating_overall: d.ratingOverall,
      recommendation: d.recommendation,
      tags_tecnica: d.tagsTecnica,
      tags_tatica: d.tagsTatica,
      tags_fisico: d.tagsFisico,
      tags_mentalidade: d.tagsMentalidade,
      tags_potencial: d.tagsPotencial,
      maturation: d.maturation ?? null,
      observed_foot: d.observedFoot ?? null,
      height_impression: d.heightImpression ?? null,
      build_impression: d.buildImpression ?? null,
      opponent_level: d.opponentLevel ?? null,
      observed_position: d.observedPosition ?? null,
      minutes_observed: d.minutesObserved ?? null,
      standout_level: d.standoutLevel ?? null,
      starter: d.starter ?? null,
      sub_minute: d.subMinute ?? null,
      conditions: d.conditions ?? [],
      competition: d.competition ?? null,
      opponent: d.opponent ?? null,
      match_date: d.matchDate ?? null,
      notes: d.notes ?? null,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: `Erro ao submeter: ${error.message}` };

  revalidatePath(`/jogadores/${d.playerId}`);
  revalidatePath('/meus-relatorios');
  await broadcastRowMutation(clubId, 'quick_scout_reports' as never, 'INSERT', userId, data.id);

  return { success: true, data: { id: data.id } };
}

/* ───────────── Read ───────────── */

/** Get all quick reports for a player, with author names */
export async function getQuickReportsForPlayer(playerId: number): Promise<QuickScoutReport[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('quick_scout_reports')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  // Resolve author names
  const authorIds = [...new Set(data.map(r => r.author_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', authorIds);
  const nameMap = new Map((profiles ?? []).map(p => [p.id, p.full_name]));

  return data.map(row => ({
    id: row.id,
    clubId: row.club_id,
    playerId: row.player_id,
    authorId: row.author_id,
    authorName: nameMap.get(row.author_id) ?? 'Desconhecido',
    ratingTecnica: row.rating_tecnica,
    ratingTatica: row.rating_tatica,
    ratingFisico: row.rating_fisico,
    ratingMentalidade: row.rating_mentalidade,
    ratingPotencial: row.rating_potencial,
    ratingOverall: row.rating_overall,
    recommendation: row.recommendation,
    tagsTecnica: row.tags_tecnica ?? [],
    tagsTatica: row.tags_tatica ?? [],
    tagsFisico: row.tags_fisico ?? [],
    tagsMentalidade: row.tags_mentalidade ?? [],
    tagsPotencial: row.tags_potencial ?? [],
    maturation: row.maturation,
    observedFoot: row.observed_foot,
    heightImpression: row.height_impression,
    buildImpression: row.build_impression,
    opponentLevel: row.opponent_level,
    observedPosition: row.observed_position,
    minutesObserved: row.minutes_observed,
    standoutLevel: row.standout_level,
    starter: row.starter,
    subMinute: row.sub_minute,
    conditions: row.conditions ?? [],
    competition: row.competition,
    opponent: row.opponent,
    matchDate: row.match_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Get quick reports authored by the current user */
export async function getMyQuickReports(): Promise<QuickScoutReport[]> {
  const { userId } = await getActiveClub();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('quick_scout_reports')
    .select('*, players(name)')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single();

  return data.map(row => ({
    id: row.id,
    clubId: row.club_id,
    playerId: row.player_id,
    authorId: row.author_id,
    authorName: profile?.full_name ?? 'Eu',
    ratingTecnica: row.rating_tecnica,
    ratingTatica: row.rating_tatica,
    ratingFisico: row.rating_fisico,
    ratingMentalidade: row.rating_mentalidade,
    ratingPotencial: row.rating_potencial,
    ratingOverall: row.rating_overall,
    recommendation: row.recommendation,
    tagsTecnica: row.tags_tecnica ?? [],
    tagsTatica: row.tags_tatica ?? [],
    tagsFisico: row.tags_fisico ?? [],
    tagsMentalidade: row.tags_mentalidade ?? [],
    tagsPotencial: row.tags_potencial ?? [],
    maturation: row.maturation,
    observedFoot: row.observed_foot,
    heightImpression: row.height_impression,
    buildImpression: row.build_impression,
    opponentLevel: row.opponent_level,
    observedPosition: row.observed_position,
    minutesObserved: row.minutes_observed,
    standoutLevel: row.standout_level,
    starter: row.starter,
    subMinute: row.sub_minute,
    conditions: row.conditions ?? [],
    competition: row.competition,
    opponent: row.opponent,
    matchDate: row.match_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/* ───────────── Delete ───────────── */

/** Delete a quick report — author or admin */
export async function deleteQuickReport(reportId: number): Promise<ActionResponse> {
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  const { data: report } = await supabase
    .from('quick_scout_reports')
    .select('player_id')
    .eq('id', reportId)
    .single();

  const { error } = await supabase
    .from('quick_scout_reports')
    .delete()
    .eq('id', reportId);

  if (error) return { success: false, error: `Erro ao eliminar: ${error.message}` };

  if (report) revalidatePath(`/jogadores/${report.player_id}`);
  revalidatePath('/meus-relatorios');
  await broadcastRowMutation(clubId, 'quick_scout_reports' as never, 'DELETE', userId, reportId);

  return { success: true };
}
