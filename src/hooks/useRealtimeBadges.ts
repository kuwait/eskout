// src/hooks/useRealtimeBadges.ts
// Hook to live-update nav badge counts (alerts, pending reports, pending players)
// Only refetches counts relevant to the table that changed — avoids cascading queries
// RELEVANT FILES: src/lib/realtime/RealtimeProvider.tsx, src/components/layout/AppShell.tsx, src/components/layout/Sidebar.tsx

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeAny } from '@/hooks/useRealtimeTable';
import type { AlertCounts } from '@/components/layout/AppShell';
import type { MutationEvent } from '@/lib/realtime/types';

/* ───────────── Table → Badge mapping ───────────── */

// Which badge counts each table affects — only refetch what changed
const TABLE_TO_BADGES: Record<string, (keyof AlertCounts)[]> = {
  observation_notes: ['urgente', 'importante'],
  scouting_reports: ['pendingReports'],
  players: ['pendingPlayers'],
  player_added_dismissals: ['pendingPlayers'],
  user_tasks: ['pendingTasks'],
  player_lists: ['observationCount'],
  player_list_items: ['observationCount'],
  training_feedback: ['newFeedbacks'],
};

const BADGE_TABLES = new Set(Object.keys(TABLE_TO_BADGES));

/**
 * Live-update navigation badge counts via Realtime.
 *
 * Starts with server-rendered counts and refetches from Supabase
 * only the counts relevant to the table that triggered the event.
 */
export function useRealtimeBadges(initialCounts: AlertCounts, userId: string, clubId: string | null): AlertCounts {
  const [counts, setCounts] = useState<AlertCounts>(initialCounts);
  // Track which list IDs the user has (fetched once, updated on list changes)
  const listIdsRef = useRef<number[]>([]);

  /* Sync with server-rendered counts when they change (e.g. after router.refresh()) */
  const initialKey = `${initialCounts.pendingTasks}-${initialCounts.pendingReports}-${initialCounts.pendingPlayers}-${initialCounts.urgente}-${initialCounts.importante}-${initialCounts.observationCount}-${initialCounts.newFeedbacks}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stable key comparison
  useEffect(() => { setCounts(initialCounts); }, [initialKey]);

  /* ───────────── Individual badge fetchers ───────────── */

  const fetchNotes = useCallback(async () => {
    if (!clubId) return;
    const supabase = createClient();
    const [urgRes, impRes] = await Promise.all([
      supabase.from('observation_notes').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('priority', 'urgente'),
      supabase.from('observation_notes').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('priority', 'importante'),
    ]);
    setCounts((prev) => ({ ...prev, urgente: urgRes.count ?? 0, importante: impRes.count ?? 0 }));
  }, [clubId]);

  const fetchReports = useCallback(async () => {
    if (!clubId) return;
    const supabase = createClient();
    const { count } = await supabase.from('scouting_reports').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('status', 'pendente');
    setCounts((prev) => ({ ...prev, pendingReports: count ?? 0 }));
  }, [clubId]);

  const fetchPlayers = useCallback(async () => {
    if (!clubId) return;
    const supabase = createClient();
    const [playersRes, dismissedRes] = await Promise.all([
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', clubId).neq('created_by', userId),
      supabase.from('player_added_dismissals').select('player_id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    setCounts((prev) => ({ ...prev, pendingPlayers: Math.max(0, (playersRes.count ?? 0) - (dismissedRes.count ?? 0)) }));
  }, [clubId, userId]);

  const fetchTasks = useCallback(async () => {
    if (!clubId) return;
    const supabase = createClient();
    const { count } = await supabase.from('user_tasks').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('user_id', userId).eq('completed', false);
    setCounts((prev) => ({ ...prev, pendingTasks: count ?? 0 }));
  }, [clubId, userId]);

  const fetchObservationCount = useCallback(async () => {
    if (!clubId) return;
    const supabase = createClient();

    // Refresh list IDs on list table changes
    const { data: lists } = await supabase.from('player_lists').select('id').eq('club_id', clubId).eq('user_id', userId);
    const ids = (lists ?? []).map((l: { id: number }) => l.id);
    listIdsRef.current = ids;

    if (ids.length === 0) {
      setCounts((prev) => ({ ...prev, observationCount: 0 }));
      return;
    }
    const { count } = await supabase.from('player_list_items').select('*', { count: 'exact', head: true }).in('list_id', ids);
    setCounts((prev) => ({ ...prev, observationCount: count ?? 0 }));
  }, [clubId, userId]);

  const fetchNewFeedbacks = useCallback(async () => {
    if (!clubId) return;
    const supabase = createClient();
    // Get user's last seen timestamp from club_memberships
    const { data: membership } = await supabase
      .from('club_memberships')
      .select('training_feedback_seen_at')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .single();

    const seenAt = membership?.training_feedback_seen_at;
    let query = supabase
      .from('training_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .or('feedback.neq.,rating_performance.not.is.null,coach_submitted_at.not.is.null');

    if (seenAt) {
      query = query.gt('created_at', seenAt);
    }

    const { count } = await query;
    setCounts((prev) => ({ ...prev, newFeedbacks: count ?? 0 }));
  }, [clubId, userId]);

  /* ───────────── Dispatch map ───────────── */

  const fetcherMap: Record<keyof AlertCounts, () => Promise<void>> = {
    urgente: fetchNotes,
    importante: fetchNotes,
    pendingReports: fetchReports,
    pendingPlayers: fetchPlayers,
    pendingTasks: fetchTasks,
    observationCount: fetchObservationCount,
    newFeedbacks: fetchNewFeedbacks,
  };

  const handleEvent = useCallback((event: MutationEvent) => {
    if (!BADGE_TABLES.has(event.table)) return;

    const badgeKeys = TABLE_TO_BADGES[event.table];
    if (!badgeKeys) return;

    // Deduplicate fetchers (e.g. urgente+importante both call fetchNotes)
    const fetchers = new Set(badgeKeys.map((key) => fetcherMap[key]));
    for (const fetcher of fetchers) {
      fetcher().catch((err) => console.error('[Realtime] badge refetch failed:', err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcherMap is stable via its callbacks
  }, [fetchNotes, fetchReports, fetchPlayers, fetchTasks, fetchObservationCount, fetchNewFeedbacks]);

  useRealtimeAny(handleEvent);

  return counts;
}
