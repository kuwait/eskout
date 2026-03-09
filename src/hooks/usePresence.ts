// src/hooks/usePresence.ts
// Hook for tracking and reading Supabase Realtime presence (who's online, who's editing)
// Provides page-level presence tracking and current viewers list
// RELEVANT FILES: src/lib/realtime/RealtimeProvider.tsx, src/lib/realtime/types.ts, src/components/players/PlayerProfile.tsx

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRealtime } from '@/lib/realtime/RealtimeProvider';
import type { PresenceState } from '@/lib/realtime/types';

interface UsePresenceOptions {
  /** Current page path — used to track where the user is */
  page: string;
  /** Whether the user is actively editing (form open, unsaved changes) */
  editing?: boolean;
}

interface UsePresenceResult {
  /** All users currently present in the app */
  allPresences: PresenceState[];
  /** Users on the same page as the current user (excluding self) */
  pageViewers: PresenceState[];
  /** Users actively editing on the same page (excluding self) */
  pageEditors: PresenceState[];
  /** Update editing state (call when form opens/closes) */
  setEditing: (editing: boolean) => void;
}

/**
 * Track the current user's presence and see who else is viewing/editing the same page.
 *
 * @example
 * ```tsx
 * const { pageViewers, pageEditors, setEditing } = usePresence({
 *   page: `/jogadores/${playerId}`,
 * });
 *
 * // Show "Diogo está a editar" banner
 * if (pageEditors.length > 0) { ... }
 *
 * // Mark as editing when form opens
 * setEditing(true);
 * ```
 */
export function usePresence({ page, editing = false }: UsePresenceOptions): UsePresenceResult {
  const realtime = useRealtime();
  const [allPresences, setAllPresences] = useState<PresenceState[]>([]);
  const editingRef = useRef(editing);

  // Track presence on mount and page change
  useEffect(() => {
    if (!realtime) return;
    realtime.trackPresence(page, editingRef.current);
  }, [realtime, page]);

  // Update editing state
  const setEditing = useCallback((newEditing: boolean) => {
    editingRef.current = newEditing;
    if (realtime) {
      realtime.trackPresence(page, newEditing);
    }
  }, [realtime, page]);

  // Listen to presence changes
  useEffect(() => {
    if (!realtime) return;

    const unsub = realtime.bus.onPresence((presences) => {
      setAllPresences(presences);
    });

    return () => unsub();
  }, [realtime]);

  // Filter to current page viewers/editors (excluding self)
  const currentUserId = realtime?.currentUserId;
  const pageViewers = allPresences.filter(
    (p) => p.page === page && p.userId !== currentUserId
  );
  const pageEditors = pageViewers.filter((p) => p.editing);

  return { allPresences, pageViewers, pageEditors, setEditing };
}
