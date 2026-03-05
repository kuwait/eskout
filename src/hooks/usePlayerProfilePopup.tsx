// src/hooks/usePlayerProfilePopup.tsx
// Reusable hook for player profile popup — manages state, fetches notes/history/role
// Avoids duplicating popup logic across PipelineView, SquadPanelView, etc.
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, src/components/pipeline/PipelineView.tsx, src/components/squad/SquadPanelView.tsx

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Player, ObservationNote, StatusHistoryEntry, UserRole } from '@/lib/types';

interface ProfilePopupState {
  playerId: number | null;
  notes: ObservationNote[];
  history: StatusHistoryEntry[];
  role: UserRole;
}

/**
 * Hook that manages player profile popup state.
 * Returns open/close handlers + a render helper with all data needed for the dialog.
 */
export function usePlayerProfilePopup(allPlayers: Player[]) {
  const [state, setState] = useState<ProfilePopupState>({
    playerId: null,
    notes: [],
    history: [],
    role: 'scout',
  });

  const player = state.playerId
    ? allPlayers.find((p) => p.id === state.playerId) ?? null
    : null;

  // Fetch notes, history, and role when a player is selected
  useEffect(() => {
    if (!state.playerId) return;
    const supabase = createClient();

    supabase
      .from('observation_notes')
      .select('*, profiles:author_id(full_name)')
      .eq('player_id', state.playerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setState((prev) => ({
          ...prev,
          notes: (data ?? []).map((row: Record<string, unknown>) => ({
            id: row.id as number,
            playerId: row.player_id as number,
            authorId: row.author_id as string,
            authorName: (row.profiles as { full_name: string } | null)?.full_name ?? 'Desconhecido',
            content: row.content as string,
            matchContext: row.match_context as string | null,
            createdAt: row.created_at as string,
          })),
        }));
      });

    supabase
      .from('status_history')
      .select('*, profiles:changed_by(full_name)')
      .eq('player_id', state.playerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setState((prev) => ({
          ...prev,
          history: (data ?? []).map((row: Record<string, unknown>) => ({
            id: row.id as number,
            playerId: row.player_id as number,
            fieldChanged: row.field_changed as string,
            oldValue: row.old_value as string | null,
            newValue: row.new_value as string | null,
            changedBy: row.changed_by as string,
            changedByName: (row.profiles as { full_name: string } | null)?.full_name ?? 'Sistema',
            notes: row.notes as string | null,
            createdAt: row.created_at as string,
          })),
        }));
      });

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setState((prev) => ({ ...prev, role: (data?.role as UserRole) ?? 'scout' }));
        });
    });
  }, [state.playerId]);

  const open = useCallback((playerId: number) => {
    setState({ playerId, notes: [], history: [], role: 'scout' });
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, playerId: null }));
  }, []);

  return {
    isOpen: state.playerId !== null,
    player,
    notes: state.notes,
    history: state.history,
    role: state.role,
    open,
    close,
  };
}
