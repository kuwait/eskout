// src/lib/supabase/queries.ts
// Database query functions for fetching players, age groups, and related data
// All queries run server-side via the Supabase server client
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/supabase/mappers.ts, src/actions/players.ts

import { createClient } from '@/lib/supabase/server';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import type { Player, PlayerRow, StatusHistoryEntry, ObservationNote } from '@/lib/types';

/* ───────────── Players ───────────── */

export async function getPlayersByAgeGroup(ageGroupId: number): Promise<Player[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('age_group_id', ageGroupId)
    .order('name');

  if (error) throw new Error(error.message);
  return (data as PlayerRow[]).map(mapPlayerRow);
}

export async function getPlayerById(id: number): Promise<Player | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return mapPlayerRow(data as PlayerRow);
}

/* ───────────── Profile (current user role) ───────────── */

export async function getCurrentUserRole(): Promise<'admin' | 'scout' | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return (data?.role as 'admin' | 'scout') ?? null;
}

/* ───────────── Status History ───────────── */

export async function getStatusHistory(playerId: number): Promise<StatusHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('status_history')
    .select('*, profiles:changed_by(full_name)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id,
    playerId: row.player_id,
    fieldChanged: row.field_changed,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedBy: row.changed_by,
    // Supabase join returns { full_name } or null
    changedByName: (row.profiles as { full_name: string } | null)?.full_name ?? 'Sistema',
    notes: row.notes,
    createdAt: row.created_at,
  }));
}

/* ───────────── Observation Notes ───────────── */

export async function getObservationNotes(playerId: number): Promise<ObservationNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('observation_notes')
    .select('*, profiles:author_id(full_name)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id,
    playerId: row.player_id,
    authorId: row.author_id,
    authorName: (row.profiles as { full_name: string } | null)?.full_name ?? 'Desconhecido',
    content: row.content,
    matchContext: row.match_context,
    createdAt: row.created_at,
  }));
}

/* ───────────── Dashboard Stats ───────────── */

export interface DashboardStats {
  totalPlayers: number;
  realSquadCount: number;
  shadowSquadCount: number;
  pipelineActiveCount: number;
  byOpinion: Record<string, number>;
  byPosition: Record<string, { real: number; shadow: number }>;
}

export async function getDashboardStats(ageGroupId: number): Promise<DashboardStats> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('players')
    .select('position_normalized, department_opinion, recruitment_status, is_real_squad, is_shadow_squad, shadow_position')
    .eq('age_group_id', ageGroupId);

  if (error || !data) {
    return {
      totalPlayers: 0, realSquadCount: 0, shadowSquadCount: 0,
      pipelineActiveCount: 0, byOpinion: {}, byPosition: {},
    };
  }

  const stats: DashboardStats = {
    totalPlayers: data.length,
    realSquadCount: data.filter((p) => p.is_real_squad).length,
    shadowSquadCount: data.filter((p) => p.is_shadow_squad).length,
    // "Active" = not pool and not rejected
    pipelineActiveCount: data.filter((p) =>
      p.recruitment_status !== 'pool' && p.recruitment_status !== 'rejected'
    ).length,
    byOpinion: {},
    byPosition: {},
  };

  // Count by opinion
  for (const p of data) {
    const op = p.department_opinion || 'Sem opinião';
    stats.byOpinion[op] = (stats.byOpinion[op] ?? 0) + 1;
  }

  // Count by position (real vs shadow)
  const positions = ['GR', 'DD', 'DE', 'DC', 'MDC', 'MC', 'MOC', 'ED', 'EE', 'PL'];
  for (const pos of positions) {
    stats.byPosition[pos] = {
      real: data.filter((p) => p.is_real_squad && p.position_normalized === pos).length,
      shadow: data.filter((p) => p.is_shadow_squad && p.shadow_position === pos).length,
    };
  }

  return stats;
}

/* ───────────── Recent Changes ───────────── */

export interface RecentChange {
  id: number;
  playerName: string;
  playerId: number;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedByName: string;
  createdAt: string;
}

export async function getRecentChanges(ageGroupId: number, limit = 10): Promise<RecentChange[]> {
  const supabase = await createClient();

  // Get player IDs for this age group first
  const { data: playerIds } = await supabase
    .from('players')
    .select('id')
    .eq('age_group_id', ageGroupId);

  if (!playerIds?.length) return [];

  const ids = playerIds.map((p) => p.id);

  const { data, error } = await supabase
    .from('status_history')
    .select('*, players:player_id(name), profiles:changed_by(full_name)')
    .in('player_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    playerName: (row.players as { name: string } | null)?.name ?? '?',
    playerId: row.player_id,
    fieldChanged: row.field_changed,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedByName: (row.profiles as { full_name: string } | null)?.full_name ?? 'Sistema',
    createdAt: row.created_at,
  }));
}
