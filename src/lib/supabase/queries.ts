// src/lib/supabase/queries.ts
// Database query functions for fetching players, age groups, and related data
// All queries run server-side via the Supabase server client
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/supabase/mappers.ts, src/actions/players.ts

import { createClient } from '@/lib/supabase/server';
import { mapPlayerRow, mapCalendarEventRow } from '@/lib/supabase/mappers';
import type { CalendarEvent, CalendarEventRow, Player, PlayerRow, Profile, StatusHistoryEntry, ObservationNote } from '@/lib/types';

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

/* ───────────── Calendar Events ───────────── */

/** Fetch calendar events for a given month, merged with player pipeline dates (training/meeting/signing) */
export async function getCalendarEvents(
  year: number,
  month: number,
  ageGroupId?: number
): Promise<CalendarEvent[]> {
  const supabase = await createClient();

  // Build date range for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // last day of month
  const start = startDate.toISOString().split('T')[0];
  const end = endDate.toISOString().split('T')[0];

  // 1. Fetch manual calendar events
  let eventsQuery = supabase
    .from('calendar_events')
    .select('*, players:player_id(name, photo_url, zz_photo_url, club, position_normalized, dob, foot)')
    .gte('event_date', start)
    .lte('event_date', end)
    .order('event_date')
    .order('event_time', { nullsFirst: false });

  if (ageGroupId) {
    eventsQuery = eventsQuery.or(`age_group_id.eq.${ageGroupId},age_group_id.is.null`);
  }

  // 2. Fetch players with pipeline dates in this month range
  // training_date, meeting_date, signing_date are stored as ISO timestamps or date strings
  let playersQuery = supabase
    .from('players')
    .select('id, name, age_group_id, training_date, meeting_date, signing_date, recruitment_status, photo_url, zz_photo_url, club, position_normalized, dob, foot')
    .or(`training_date.gte.${start},meeting_date.gte.${start},signing_date.gte.${start}`)
    .not('recruitment_status', 'is', null);

  if (ageGroupId) {
    playersQuery = playersQuery.eq('age_group_id', ageGroupId);
  }

  const [eventsResult, playersResult] = await Promise.all([eventsQuery, playersQuery]);

  // Map manual calendar events
  const manualEvents: CalendarEvent[] = eventsResult.error
    ? []
    : (eventsResult.data as CalendarEventRow[]).map(mapCalendarEventRow);

  // Map player pipeline dates into synthetic calendar events
  const playerDateEvents: CalendarEvent[] = [];
  if (!playersResult.error && playersResult.data) {
    // Use negative IDs to distinguish from real calendar_events
    let syntheticId = -1;

    for (const player of playersResult.data) {
      const pInfo: SyntheticPlayerInfo = {
        photoUrl: player.photo_url,
        zzPhotoUrl: player.zz_photo_url,
        club: player.club,
        positionNormalized: player.position_normalized,
        dob: player.dob,
        foot: player.foot,
      };

      // Training date → 'treino' event
      if (player.training_date) {
        const dateEvent = playerDateToCalendarEvent(
          syntheticId--, player.id, player.name, player.age_group_id,
          player.training_date, 'treino', 'Vir Treinar', pInfo
        );
        if (dateEvent && dateEvent.eventDate >= start && dateEvent.eventDate <= end) {
          playerDateEvents.push(dateEvent);
        }
      }
      // Meeting date → 'reuniao' event
      if (player.meeting_date) {
        const dateEvent = playerDateToCalendarEvent(
          syntheticId--, player.id, player.name, player.age_group_id,
          player.meeting_date, 'reuniao', 'Reunião Marcada', pInfo
        );
        if (dateEvent && dateEvent.eventDate >= start && dateEvent.eventDate <= end) {
          playerDateEvents.push(dateEvent);
        }
      }
      // Signing date → 'assinatura' event
      if (player.signing_date) {
        const dateEvent = playerDateToCalendarEvent(
          syntheticId--, player.id, player.name, player.age_group_id,
          player.signing_date, 'assinatura', 'Assinatura', pInfo
        );
        if (dateEvent && dateEvent.eventDate >= start && dateEvent.eventDate <= end) {
          playerDateEvents.push(dateEvent);
        }
      }
    }
  }

  // Deduplicate: skip synthetic events when a manual calendar event exists for the same player+type+date
  // This prevents double-showing when a calendar event syncs a date to the player's pipeline
  const manualEventKeys = new Set(
    manualEvents
      .filter((e) => e.playerId)
      .map((e) => `${e.playerId}:${e.eventType}:${e.eventDate}`)
  );
  const dedupedPlayerEvents = playerDateEvents.filter(
    (e) => !manualEventKeys.has(`${e.playerId}:${e.eventType}:${e.eventDate}`)
  );

  // Merge and sort by date, then time
  const allEvents = [...manualEvents, ...dedupedPlayerEvents].sort((a, b) => {
    const dateCmp = a.eventDate.localeCompare(b.eventDate);
    if (dateCmp !== 0) return dateCmp;
    // Events with time come after all-day events, then sort by time
    if (!a.eventTime && b.eventTime) return -1;
    if (a.eventTime && !b.eventTime) return 1;
    if (a.eventTime && b.eventTime) return a.eventTime.localeCompare(b.eventTime);
    return 0;
  });

  return allEvents;
}

/** Player info for synthetic calendar events */
interface SyntheticPlayerInfo {
  photoUrl: string | null;
  zzPhotoUrl: string | null;
  club: string | null;
  positionNormalized: string | null;
  dob: string | null;
  foot: string | null;
}

/** Convert a player's pipeline date (ISO timestamp or date string) into a synthetic CalendarEvent */
function playerDateToCalendarEvent(
  id: number,
  playerId: number,
  playerName: string,
  ageGroupId: number,
  dateValue: string,
  eventType: CalendarEvent['eventType'],
  typeLabel: string,
  playerInfo: SyntheticPlayerInfo,
): CalendarEvent | null {
  // dateValue can be "2026-01-15", "2026-01-15T11:00:00", or full ISO
  const dateStr = dateValue.slice(0, 10); // YYYY-MM-DD
  // Extract time if present (after T)
  let timeStr: string | null = null;
  if (dateValue.length > 10 && dateValue.includes('T')) {
    timeStr = dateValue.slice(11, 16); // HH:mm
    // Skip midnight "00:00" — likely means no time was set
    if (timeStr === '00:00') timeStr = null;
  }

  return {
    id,
    ageGroupId,
    playerId,
    playerName,
    playerPhotoUrl: playerInfo.photoUrl || playerInfo.zzPhotoUrl || null,
    playerClub: playerInfo.club ?? null,
    playerPosition: playerInfo.positionNormalized ?? null,
    playerDob: playerInfo.dob ?? null,
    playerFoot: playerInfo.foot ?? null,
    eventType,
    title: `${typeLabel} — ${playerName}`,
    eventDate: dateStr,
    eventTime: timeStr,
    location: '',
    notes: '',
    assigneeUserId: null,
    assigneeName: '',
    createdBy: null,
    createdByName: 'Abordagens',
    createdAt: '',
    updatedAt: '',
    isPlayerDate: true,
  };
}

/** Fetch all app users (for assignee dropdown) */
export async function getAllProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name');

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    role: row.role as Profile['role'],
  }));
}

/** Fetch all players (full objects) for player picker dialogs */
export async function getAllPlayers(): Promise<Player[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('name');

  if (error || !data) return [];
  return (data as PlayerRow[]).map(mapPlayerRow);
}
