// src/lib/supabase/queries.ts
// Database query functions for fetching players, age groups, and related data
// All queries run server-side via the Supabase server client
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/supabase/mappers.ts, src/actions/players.ts

import { createClient } from '@/lib/supabase/server';
import { mapPlayerRow, mapCalendarEventRow, mapScoutingReportRow } from '@/lib/supabase/mappers';
import type { CalendarEvent, CalendarEventRow, NotePriority, Player, PlayerRow, Profile, ScoutEvaluation, ScoutingReport, ScoutingReportRow, StatusHistoryEntry, ObservationNote } from '@/lib/types';

/* ───────────── Players ───────────── */

export async function getPlayersByAgeGroup(ageGroupId: number): Promise<Player[]> {
  const supabase = await createClient();
  // Join latest observation note per player (newest first, limit 1)
  const { data, error } = await supabase
    .from('players')
    .select('*, observation_notes(content, created_at)')
    .eq('age_group_id', ageGroupId)
    .order('name');

  if (error) throw new Error(error.message);
  return (data as (PlayerRow & { observation_notes: { content: string; created_at: string }[] })[]).map((row) => {
    const player = mapPlayerRow(row);
    const sorted = (row.observation_notes ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    player.observationNotePreviews = sorted.map((n) => n.content);
    return player;
  });
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

export async function getCurrentUserRole(): Promise<'admin' | 'editor' | 'scout' | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return (data?.role as 'admin' | 'editor' | 'scout') ?? null;
}

/* ───────────── Scouting Reports ───────────── */

export async function getScoutingReports(playerId: number): Promise<ScoutingReport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('scouting_reports')
    .select('*')
    .eq('player_id', playerId)
    .order('report_number', { ascending: true });

  if (error) {
    console.error('[getScoutingReports] Failed to fetch:', error);
    return [];
  }

  return (data ?? []).map((row) => mapScoutingReportRow(row as ScoutingReportRow));
}

/* ───────────── Scout Evaluations ───────────── */

export async function getScoutEvaluations(playerId: number): Promise<ScoutEvaluation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('id, player_id, user_id, rating, created_at, updated_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getScoutEvaluations] Failed to fetch:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Fetch profile names for each user (profiles table uses auth.users id as PK)
  const userIds = [...new Set(data.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return data.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    userId: row.user_id,
    userName: nameMap.get(row.user_id) ?? 'Scout',
    rating: row.rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/* ───────────── Status History ───────────── */

export async function getStatusHistory(playerId: number): Promise<StatusHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('status_history')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getStatusHistory] Failed to fetch:', error);
    return [];
  }

  // Resolve author names from profiles in a separate query to avoid join issues
  const changedByIds = [...new Set((data ?? []).map((r) => r.changed_by).filter(Boolean))];
  let profileMap: Record<string, string> = {};
  if (changedByIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', changedByIds);
    profileMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p.full_name])
    );
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    playerId: row.player_id,
    fieldChanged: row.field_changed,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedBy: row.changed_by,
    changedByName: (row.changed_by && profileMap[row.changed_by]) || 'Sistema',
    notes: row.notes,
    createdAt: row.created_at,
  }));
}

/* ───────────── Observation Notes ───────────── */

export async function getObservationNotes(playerId: number): Promise<ObservationNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('observation_notes')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getObservationNotes] Failed to fetch:', error);
    return [];
  }

  // Resolve author names separately to avoid join issues
  const authorIds = [...new Set((data ?? []).map((r) => r.author_id).filter(Boolean))];
  let profileMap: Record<string, string> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', authorIds);
    profileMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p.full_name])
    );
  }

  // Get player's referred_by to show as author for imported notes (no author_id)
  const hasImported = (data ?? []).some((r) => !r.author_id);
  let referredBy: string | null = null;
  if (hasImported) {
    const { data: player } = await supabase
      .from('players')
      .select('referred_by')
      .eq('id', playerId)
      .single();
    referredBy = player?.referred_by || null;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    playerId: row.player_id,
    authorId: row.author_id,
    authorName: row.author_id
      ? (profileMap[row.author_id] || 'Desconhecido')
      : (referredBy || 'Importado'),
    content: row.content,
    matchContext: row.match_context,
    priority: row.priority ?? 'normal',
    createdAt: row.created_at,
  }));
}

/* ───────────── Flagged Notes (important + urgent, across all players) ───────────── */

export interface FlaggedNote extends ObservationNote {
  playerName: string;
  playerPhotoUrl: string | null;
}

export async function getFlaggedNotes(ageGroupId?: number): Promise<FlaggedNote[]> {
  const supabase = await createClient();

  let query = supabase
    .from('observation_notes')
    .select('*, players:player_id(name, age_group_id, photo_url, zz_photo_url, referred_by)')
    .in('priority', ['importante', 'urgente'])
    .order('created_at', { ascending: false })
    .limit(50);

  // If age group provided, filter by it (via joined player)
  // Note: Supabase doesn't support filtering on joined columns directly in .eq(),
  // so we filter in JS after fetch
  const { data, error } = await query;

  if (error) {
    console.error('[getFlaggedNotes] Failed to fetch:', error);
    return [];
  }

  // Resolve author names
  const authorIds = [...new Set((data ?? []).map((r) => r.author_id).filter(Boolean))];
  let profileMap: Record<string, string> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', authorIds);
    profileMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p.full_name])
    );
  }

  const mapped = (data ?? [])
    .filter((row) => {
      // Filter by age group if provided
      if (!ageGroupId) return true;
      const player = row.players as { name: string; age_group_id: number; photo_url: string | null; zz_photo_url: string | null; referred_by: string | null } | null;
      return player?.age_group_id === ageGroupId;
    })
    .map((row) => {
      const player = row.players as { name: string; age_group_id: number; photo_url: string | null; zz_photo_url: string | null; referred_by: string | null } | null;
      return {
        id: row.id,
        playerId: row.player_id,
        authorId: row.author_id,
        authorName: row.author_id ? (profileMap[row.author_id] || 'Desconhecido') : (player?.referred_by || 'Importado'),
        content: row.content,
        matchContext: row.match_context,
        priority: (row.priority ?? 'normal') as NotePriority,
        createdAt: row.created_at,
        playerName: player?.name ?? '?',
        playerPhotoUrl: player?.photo_url || player?.zz_photo_url || null,
      };
    });

  return mapped;
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
    .select('position_normalized, department_opinion, recruitment_status, is_real_squad, is_shadow_squad, real_squad_position, shadow_position')
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
      real: data.filter((p) => p.is_real_squad && (p.real_squad_position === pos || p.real_squad_position === `${pos}_E` || p.real_squad_position === `${pos}_D`)).length,
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
    .select('*')
    .in('player_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // Resolve player names and author names separately to avoid join issues
  const playerIdSet = [...new Set(data.map((r) => r.player_id).filter(Boolean))];
  const changedByIds = [...new Set(data.map((r) => r.changed_by).filter(Boolean))];

  const [playersRes, profilesRes] = await Promise.all([
    playerIdSet.length > 0
      ? supabase.from('players').select('id, name').in('id', playerIdSet)
      : { data: [] },
    changedByIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', changedByIds)
      : { data: [] },
  ]);

  const playerMap = Object.fromEntries(
    (playersRes.data ?? []).map((p) => [p.id, p.name])
  );
  const profileMap = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.id, p.full_name])
  );

  return data.map((row) => ({
    id: row.id,
    playerName: (row.player_id && playerMap[row.player_id]) || '?',
    playerId: row.player_id,
    fieldChanged: row.field_changed,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedByName: (row.changed_by && profileMap[row.changed_by]) || 'Sistema',
    createdAt: row.created_at,
  }));
}

/* ───────────── Calendar Events ───────────── */

/** Fetch calendar events for a given date range, merged with player pipeline dates (training/meeting/signing) */
export async function getCalendarEvents(
  year: number,
  month: number,
  ageGroupId?: number,
  /** Optional explicit date range (overrides year/month) */
  dateRange?: { start: string; end: string }
): Promise<CalendarEvent[]> {
  const supabase = await createClient();

  // Build date range — explicit range or fall back to month
  let start: string;
  let end: string;
  if (dateRange) {
    start = dateRange.start;
    end = dateRange.end;
  } else {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // last day of month
    start = startDate.toISOString().split('T')[0];
    end = endDate.toISOString().split('T')[0];
  }

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

/** Fetch all players with ratings and notes — used by home page and jogadores page for instant render */
export async function fetchAllPlayers(): Promise<Player[]> {
  const supabase = await createClient();
  const MAX = 4999;

  const [playersRes, reportsRes, evalsRes, notesRes] = await Promise.all([
    supabase.from('players').select('*').order('name').range(0, MAX),
    supabase.from('scouting_reports').select('player_id, rating').not('rating', 'is', null).range(0, MAX),
    supabase.from('scout_evaluations').select('player_id, rating').range(0, MAX),
    supabase.from('observation_notes').select('player_id, content, created_at').order('created_at', { ascending: false }).range(0, MAX),
  ]);

  // Build note previews map
  const notesMap = new Map<number, string[]>();
  if (notesRes.data) {
    for (const n of notesRes.data) {
      const arr = notesMap.get(n.player_id) ?? [];
      arr.push(n.content);
      notesMap.set(n.player_id, arr);
    }
  }

  const players: Player[] = ((playersRes.data ?? []) as unknown as PlayerRow[]).map((row) => {
    const player = mapPlayerRow(row);
    player.observationNotePreviews = notesMap.get(row.id) ?? [];
    return player;
  });

  // Build rating aggregates
  const agg = new Map<number, { sum: number; count: number }>();
  const addRating = (playerId: number, rating: number) => {
    const existing = agg.get(playerId) ?? { sum: 0, count: 0 };
    existing.sum += rating;
    existing.count += 1;
    agg.set(playerId, existing);
  };

  if (reportsRes.data) {
    for (const r of reportsRes.data) addRating(r.player_id, r.rating!);
  }
  if (evalsRes.data) {
    for (const e of evalsRes.data) addRating(e.player_id, e.rating);
  }

  for (const p of players) {
    const stats = agg.get(p.id);
    if (stats) {
      p.reportAvgRating = Math.round((stats.sum / stats.count) * 10) / 10;
      p.reportRatingCount = stats.count;
    }
  }

  return players;
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
