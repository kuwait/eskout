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
const BADGE_TABLES = new Set(['observation_notes', 'scouting_reports', 'players']);

/**
 * Live-update navigation badge counts via Realtime.
 *
 * Starts with server-rendered counts and refetches from Supabase
 * when a relevant mutation event arrives from another user.
 */
export function useRealtimeBadges(initialCounts: AlertCounts): AlertCounts {
  const [counts, setCounts] = useState<AlertCounts>(initialCounts);

  const refetchCounts = useCallback(async () => {
    try {
      const supabase = createClient();

      const [urgRes, impRes, pendingRes, pendingPlayersRes, unreviewedRes] = await Promise.all([
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
          .eq('pending_approval', true),
        supabase
          .from('players')
          .select('id', { count: 'exact', head: true })
          .eq('admin_reviewed', false)
          .eq('pending_approval', false),
      ]);

      setCounts({
        urgente: urgRes.count ?? 0,
        importante: impRes.count ?? 0,
        pendingReports: pendingRes.count ?? 0,
        pendingPlayers: (pendingPlayersRes.count ?? 0) + (unreviewedRes.count ?? 0),
      });
    } catch (err) {
      console.error('[Realtime] badge refetch failed:', err);
    }
  }, []);

  const handleEvent = useCallback((event: MutationEvent) => {
    if (BADGE_TABLES.has(event.table)) {
      refetchCounts();
    }
  }, [refetchCounts]);

  useRealtimeAny(handleEvent);

  return counts;
}
