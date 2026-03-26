// src/lib/supabase/queries.ts
// Database query functions for fetching players, age groups, and related data
// All queries run server-side via the Supabase server client, scoped by club_id
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/supabase/mappers.ts, src/lib/supabase/club-context.ts

import { createClient } from '@/lib/supabase/server';
import { getActiveClub, getActiveClubId } from '@/lib/supabase/club-context';
import { mapPlayerRow, mapCalendarEventRow, mapScoutingReportRow, mapTrainingFeedbackRow, mapSquadRow, mapSquadPlayerRow } from '@/lib/supabase/mappers';
import type { CalendarEvent, CalendarEventRow, NotePriority, Player, PlayerRow, Profile, ScoutEvaluation, ScoutingReport, ScoutingReportRow, Squad, SquadRow, SquadPlayer, SquadPlayerRow, SquadType, SquadWithPlayers, StatusHistoryEntry, ObservationNote, TrainingFeedback, TrainingFeedbackRow, TrainingFeedbackWithPlayer } from '@/lib/types';

/* ───────────── Players ───────────── */

export async function getPlayersByAgeGroup(ageGroupId: number): Promise<Player[]> {
  const clubId = await getActiveClubId();
  const supabase = await createClient();
  let query = supabase
    .from('players')
    .select('*, observation_notes(content, created_at)')
    .eq('age_group_id', ageGroupId)
    .order('name');

  if (clubId) query = query.eq('club_id', clubId);

  const { data, error } = await query;

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

/* ───────────── Profile (current user role — club-scoped) ───────────── */

export async function getCurrentUserRole(): Promise<'admin' | 'editor' | 'scout' | 'recruiter' | null> {
  try {
    const { role } = await getActiveClub();
    return role;
  } catch {
    // Fallback: no club context (e.g. club picker page)
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
    .select('*, contact_purposes(label)')
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
    contactPurposeId: row.contact_purpose_id ?? null,
    contactPurposeCustom: row.contact_purpose_custom ?? null,
    // Resolved label from join — contact_purposes is a single FK join (object, not array)
    contactPurposeLabel: (row.contact_purposes as { label: string } | null)?.label ?? undefined,
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
  const clubId = await getActiveClubId();
  const supabase = await createClient();

  let query = supabase
    .from('observation_notes')
    .select('*, players:player_id(name, age_group_id, photo_url, zz_photo_url, referred_by)')
    .in('priority', ['importante', 'urgente'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (clubId) query = query.eq('club_id', clubId);

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
  const clubId = await getActiveClubId();
  const supabase = await createClient();

  // Get player IDs for this age group first
  let playerQuery = supabase
    .from('players')
    .select('id')
    .eq('age_group_id', ageGroupId);
  if (clubId) playerQuery = playerQuery.eq('club_id', clubId);

  const { data: playerIds } = await playerQuery;

  if (!playerIds?.length) return [];

  const ids = playerIds.map((p) => p.id);

  let historyQuery = supabase
    .from('status_history')
    .select('*')
    .in('player_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (clubId) historyQuery = historyQuery.eq('club_id', clubId);

  const { data, error } = await historyQuery;

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

/* ───────────── Training Feedback ───────────── */

export async function getTrainingFeedback(playerId: number): Promise<TrainingFeedback[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('training_feedback')
    .select('*, profiles:author_id(full_name)')
    .eq('player_id', playerId)
    .order('training_date', { ascending: false });

  if (error) {
    console.error('[getTrainingFeedback] Failed to fetch:', error);
    return [];
  }

  return (data ?? []).map((row) => mapTrainingFeedbackRow(row as TrainingFeedbackRow));
}

/** Fetch all training feedbacks for the club, enriched with player info, ordered by most recent.
 *  Excludes stub entries (awaiting coach feedback) that have no actual content. */
export async function getAllTrainingFeedbacks(): Promise<TrainingFeedbackWithPlayer[]> {
  const clubId = await getActiveClubId();
  const supabase = await createClient();

  const PAGE_SIZE = 1000;
  let allRows: TrainingFeedbackRow[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('training_feedback')
      .select('*, profiles:author_id(full_name)')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('[getAllTrainingFeedbacks] Failed to fetch:', error.message, error);
      break;
    }

    allRows = allRows.concat((data ?? []) as TrainingFeedbackRow[]);
    hasMore = (data?.length ?? 0) === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  // Filter out stubs awaiting coach feedback (no content)
  allRows = allRows.filter((row) => {
    const isStub = row.presence === 'attended' && !row.feedback && !row.rating_performance && !row.coach_submitted_at;
    return !isStub;
  });

  if (allRows.length === 0) return [];

  // Fetch player info for all unique player IDs
  const playerIds = [...new Set(allRows.map((r) => r.player_id))];
  const playerMap: Record<number, { name: string; club: string | null; position: string | null; photo: string | null }> = {};

  for (let i = 0; i < playerIds.length; i += PAGE_SIZE) {
    const batch = playerIds.slice(i, i + PAGE_SIZE);
    const { data: players, error: playerError } = await supabase
      .from('players')
      .select('id, name, club, position_normalized, photo_url')
      .eq('club_id', clubId)
      .in('id', batch);

    if (playerError) {
      console.error('[getAllTrainingFeedbacks] Failed to fetch players:', playerError.message, playerError);
    }

    for (const p of players ?? []) {
      playerMap[p.id] = {
        name: p.name,
        club: p.club,
        position: p.position_normalized,
        photo: p.photo_url,
      };
    }
  }

  return allRows.map((row) => {
    const fb = mapTrainingFeedbackRow(row);
    const player = playerMap[row.player_id];
    return {
      ...fb,
      playerName: player?.name ?? 'Jogador desconhecido',
      playerClub: player?.club ?? null,
      playerPosition: player?.position ?? null,
      playerPhotoUrl: player?.photo ?? null,
    };
  });
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
  const clubId = await getActiveClubId();
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
    .select('*, players:player_id(name, photo_url, zz_photo_url, club, position_normalized, dob, foot, training_escalao)')
    .gte('event_date', start)
    .lte('event_date', end)
    .order('event_date')
    .order('event_time', { nullsFirst: false });

  if (clubId) eventsQuery = eventsQuery.eq('club_id', clubId);

  if (ageGroupId) {
    eventsQuery = eventsQuery.or(`age_group_id.eq.${ageGroupId},age_group_id.is.null`);
  }

  // 2. Fetch players with pipeline dates in this month range
  let playersQuery = supabase
    .from('players')
    .select('id, name, age_group_id, training_date, meeting_date, signing_date, recruitment_status, photo_url, zz_photo_url, club, position_normalized, dob, foot, training_escalao')
    .or(`training_date.gte.${start},meeting_date.gte.${start},signing_date.gte.${start}`)
    .not('recruitment_status', 'is', null);

  if (clubId) playersQuery = playersQuery.eq('club_id', clubId);

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
        trainingEscalao: player.training_escalao,
        dob: player.dob,
        foot: player.foot,
      };

      // Training date -> 'treino' event
      if (player.training_date) {
        const dateEvent = playerDateToCalendarEvent(
          syntheticId--, player.id, player.name, player.age_group_id,
          player.training_date, 'treino', 'Vir Treinar', pInfo
        );
        if (dateEvent && dateEvent.eventDate >= start && dateEvent.eventDate <= end) {
          playerDateEvents.push(dateEvent);
        }
      }
      // Meeting date -> 'reuniao' event
      if (player.meeting_date) {
        const dateEvent = playerDateToCalendarEvent(
          syntheticId--, player.id, player.name, player.age_group_id,
          player.meeting_date, 'reuniao', 'Reunião Marcada', pInfo
        );
        if (dateEvent && dateEvent.eventDate >= start && dateEvent.eventDate <= end) {
          playerDateEvents.push(dateEvent);
        }
      }
      // Signing date -> 'assinatura' event
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
  trainingEscalao: string | null;
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
    playerTrainingEscalao: eventType === 'treino' ? (playerInfo.trainingEscalao ?? null) : null,
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

/** Fetch all app users for the current club (for assignee dropdown) */
export async function getAllProfiles(): Promise<Profile[]> {
  const clubId = await getActiveClubId();
  const supabase = await createClient();

  if (clubId) {
    // Fetch only members of the current club
    const { data: memberships } = await supabase
      .from('club_memberships')
      .select('user_id, role, profiles:user_id(id, full_name)')
      .eq('club_id', clubId);

    if (!memberships) return [];
    return memberships.map((m) => {
      const profile = m.profiles as unknown as { id: string; full_name: string };
      return {
        id: profile.id,
        fullName: profile.full_name,
        role: m.role as Profile['role'],
      };
    });
  }

  // Fallback: all profiles (shouldn't happen in multi-tenant)
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

/* ───────────── Custom Squads ───────────── */

/** Fetch all squads for a club, optionally filtered by age group and/or type */
export async function getClubSquads(
  opts?: { ageGroupId?: number; squadType?: SquadType }
): Promise<Squad[]> {
  const clubId = await getActiveClubId();
  if (!clubId) return [];
  const supabase = await createClient();

  let query = supabase
    .from('squads')
    .select('*')
    .eq('club_id', clubId)
    .order('name');

  if (opts?.ageGroupId) query = query.eq('age_group_id', opts.ageGroupId);
  if (opts?.squadType) query = query.eq('squad_type', opts.squadType);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as SquadRow[]).map(mapSquadRow);
}

/** Fetch a squad with its players joined to player data */
export async function getSquadWithPlayers(squadId: number): Promise<SquadWithPlayers | null> {
  const clubId = await getActiveClubId();
  if (!clubId) return null;
  const supabase = await createClient();

  // Fetch the squad
  const { data: squadData, error: squadError } = await supabase
    .from('squads')
    .select('*')
    .eq('id', squadId)
    .eq('club_id', clubId)
    .single();

  if (squadError || !squadData) return null;
  const squad = mapSquadRow(squadData as SquadRow);

  // Fetch squad_players with joined player data
  const { data: spData, error: spError } = await supabase
    .from('squad_players')
    .select('*, players(*)')
    .eq('squad_id', squadId)
    .order('sort_order');

  if (spError || !spData) {
    return { ...squad, players: [] };
  }

  const players = spData.map((row) => {
    const sp = mapSquadPlayerRow(row as SquadPlayerRow);
    const playerRow = (row as Record<string, unknown>).players as PlayerRow;
    return {
      ...sp,
      player: mapPlayerRow(playerRow),
    };
  });

  return { ...squad, players };
}

/** Fetch all squads a player belongs to (for player profile).
 *  Joins age_groups to get the escalão name for display. */
export async function getPlayerSquads(playerId: number): Promise<(SquadPlayer & { squad: Squad & { ageGroupName: string | null } })[]> {
  const clubId = await getActiveClubId();
  if (!clubId) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('squad_players')
    .select('*, squads(*, age_groups(name))')
    .eq('player_id', playerId)
    .eq('club_id', clubId);

  if (error || !data) return [];

  return data.map((row) => {
    const sp = mapSquadPlayerRow(row as SquadPlayerRow);
    const squadRaw = (row as Record<string, unknown>).squads as Record<string, unknown>;
    const ageGroupData = squadRaw?.age_groups as { name: string } | null;
    const squadRow = squadRaw as unknown as SquadRow;
    const squad = mapSquadRow(squadRow);
    return {
      ...sp,
      squad: { ...squad, ageGroupName: ageGroupData?.name ?? null },
    };
  });
}

/** Fetch all players (full objects) for player picker dialogs */
export async function getAllPlayers(): Promise<Player[]> {
  const clubId = await getActiveClubId();
  const supabase = await createClient();

  let query = supabase
    .from('players')
    .select('*')
    .order('name');
  if (clubId) query = query.eq('club_id', clubId);

  const { data, error } = await query;

  if (error || !data) return [];
  return (data as PlayerRow[]).map(mapPlayerRow);
}
