// src/hooks/useRealtimeBadges.ts
// Hook to live-update nav badge counts (alerts, pending reports, pending players)
// Listens to observation_notes, scouting_reports, and players tables
// RELEVANT FILES: src/lib/realtime/RealtimeProvider.tsx, src/components/layout/AppShell.tsx, src/components/layout/Sidebar.tsx

'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeAny } from '@/hooks/useRealtimeTable';
import type { AlertCounts } from '@/components/layout/AppShell';
import type { MutationEvent } from '@/lib/realtime/types';

/** Tables that affect badge counts */
const BADGE_TABLES = new Set(['observation_notes', 'scouting_reports', 'players', 'player_added_dismissals', 'user_tasks', 'player_lists', 'player_list_items']);

/**
 * Live-update navigation badge counts via Realtime.
 *
 * Starts with server-rendered counts and refetches from Supabase
 * when a relevant mutation event arrives from another user.
 */
export function useRealtimeBadges(initialCounts: AlertCounts, userId: string): AlertCounts {
  const [counts, setCounts] = useState<AlertCounts>(initialCounts);

  const refetchCounts = useCallback(async () => {
    try {
      const supabase = createClient();

      // Fetch alert counts + per-user pending players (total by others minus user's dismissals)
      // First fetch user's list IDs, then count items across all lists
      const [urgRes, impRes, pendingRes, playersRes, dismissedRes, tasksRes, listsRes] = await Promise.all([
        supabase
          .from('observation_notes')
          .select('id', { count: 'exact', head: true })
          .eq('priority', 'urgente'),
        supabase
          .from('observation_notes')
          .select('id', { count: 'exact', head: true })
          .eq('priority', 'importante'),
        supabase
          .from('scouting_reports')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pendente'),
        supabase
          .from('players')
          .select('id', { count: 'exact', head: true })
          .neq('created_by', userId),
        supabase
          .from('player_added_dismissals')
          .select('player_id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('user_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('completed', false),
        supabase
          .from('player_lists')
          .select('id')
          .eq('user_id', userId),
      ]);

      // Count total items across all user lists
      let observationCount = 0;
      const listIds = (listsRes.data ?? []).map((l: { id: number }) => l.id);
      if (listIds.length > 0) {
        const { count } = await supabase
          .from('player_list_items')
          .select('*', { count: 'exact', head: true })
          .in('list_id', listIds);
        observationCount = count ?? 0;
      }

      setCounts({
        urgente: urgRes.count ?? 0,
        importante: impRes.count ?? 0,
        pendingReports: pendingRes.count ?? 0,
        pendingPlayers: Math.max(0, (playersRes.count ?? 0) - (dismissedRes.count ?? 0)),
        pendingTasks: tasksRes.count ?? 0,
        observationCount,
      });
    } catch (err) {
      console.error('[Realtime] badge refetch failed:', err);
    }
  }, [userId]);

  const handleEvent = useCallback((event: MutationEvent) => {
    if (BADGE_TABLES.has(event.table)) {
      refetchCounts();
    }
  }, [refetchCounts]);

  useRealtimeAny(handleEvent);

  return counts;
}
