// src/components/squad/SquadPanelView.tsx
// Single squad panel view (real OR shadow) — used by /campo/real and /campo/sombra
// Shows positions grouped with add/remove. Includes age group selector + drag-and-drop reorder.
// RELEVANT FILES: src/components/squad/FormationView.tsx, src/components/squad/AddToSquadDialog.tsx, src/actions/squads.ts

'use client';

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { useAgeGroup } from '@/hooks/useAgeGroup';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { POSITION_CODES } from '@/lib/constants';
import { AgeGroupSelector } from '@/components/layout/AgeGroupSelector';
import { FormationView, type DragEndInfo } from '@/components/squad/FormationView';
import { AddToSquadDialog } from '@/components/squad/AddToSquadDialog';
import { addToShadowSquad, removeFromShadowSquad, toggleRealSquad, bulkReorderSquad, moveSquadPlayerPosition } from '@/actions/squads';
import { usePlayerProfilePopup } from '@/hooks/usePlayerProfilePopup';
import { PlayerProfile } from '@/components/players/PlayerProfile';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { Player, PlayerRow, PositionCode } from '@/lib/types';

interface SquadPanelViewProps {
  squadType: 'real' | 'shadow';
}

export function SquadPanelView({ squadType }: SquadPanelViewProps) {
  const { selectedId } = useAgeGroup();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isPending, startTransition] = useTransition();

  const [allDbPlayers, setAllDbPlayers] = useState<Player[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPosition, setDialogPosition] = useState<PositionCode>('GR');
  // Defer DndContext rendering to client to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Player profile popup
  const profile = usePlayerProfilePopup(players);

  /* ───────────── Fetch ───────────── */

  const fetchPlayers = useCallback(() => {
    if (!selectedId) return;
    const supabase = createClient();

    // Fetch age-group players + any cross-escalão players already in this squad
    const squadFilter = squadType === 'shadow' ? 'is_shadow_squad' : 'is_real_squad';

    Promise.all([
      // 1) All players from selected age group
      supabase.from('players').select('*').eq('age_group_id', selectedId).order('name'),
      // 2) Players from OTHER age groups that are in this squad
      supabase.from('players').select('*').neq('age_group_id', selectedId).eq(squadFilter, true).order('name'),
    ]).then(([ageGroupRes, crossRes]) => {
      const ageGroupPlayers = (!ageGroupRes.error && ageGroupRes.data)
        ? (ageGroupRes.data as PlayerRow[]).map(mapPlayerRow)
        : [];
      const crossPlayers = (!crossRes.error && crossRes.data)
        ? (crossRes.data as PlayerRow[]).map(mapPlayerRow)
        : [];

      // Merge: age group players + cross-escalão squad members (no duplicates)
      const ageGroupIds = new Set(ageGroupPlayers.map((p) => p.id));
      const merged = [...ageGroupPlayers, ...crossPlayers.filter((p) => !ageGroupIds.has(p.id))];

      startTransition(() => {
        setPlayers(merged);
      });
    });
  }, [selectedId, squadType]);

  /** Fetch ALL players (cross-escalão) for the add dialog */
  const fetchAllPlayers = useCallback(() => {
    const supabase = createClient();
    supabase
      .from('players')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) {
          setAllDbPlayers((data as PlayerRow[]).map(mapPlayerRow));
        }
      });
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  // Fetch all players once for the add dialog cross-escalão search
  useEffect(() => {
    fetchAllPlayers();
  }, [fetchAllPlayers]);

  /* ───────────── Group by position (sorted by order field) ───────────── */

  const byPosition = useMemo(() => {
    const orderField = squadType === 'shadow' ? 'shadowOrder' : 'realOrder';
    const map: Record<string, Player[]> = {};
    for (const pos of POSITION_CODES) map[pos] = [];
    for (const p of players) {
      if (squadType === 'real' && p.isRealSquad && p.positionNormalized) {
        map[p.positionNormalized]?.push(p);
      }
      if (squadType === 'shadow' && p.isShadowSquad && p.shadowPosition) {
        map[p.shadowPosition]?.push(p);
      }
    }
    // Sort each position array by order
    for (const pos of POSITION_CODES) {
      map[pos].sort((a, b) => a[orderField] - b[orderField]);
    }
    return map;
  }, [players, squadType]);

  const availablePlayers = useMemo(() => {
    if (squadType === 'real') return players.filter((p) => !p.isRealSquad);
    return players.filter((p) => !p.isShadowSquad);
  }, [players, squadType]);

  // IDs of players currently in this squad (optimistic, always up-to-date)
  const squadPlayerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const pos of POSITION_CODES) {
      for (const p of byPosition[pos]) ids.add(p.id);
    }
    return ids;
  }, [byPosition]);

  /* ───────────── Handlers ───────────── */

  /** Optimistic add: inject player into local state, persist in background */
  function handleAdd(player: Player, pos: PositionCode) {
    if (squadType === 'shadow') {
      // Optimistic: mark as shadow squad at this position
      setPlayers((prev) => {
        const exists = prev.find((p) => p.id === player.id);
        if (exists) {
          return prev.map((p) => p.id === player.id ? { ...p, isShadowSquad: true, shadowPosition: pos } : p);
        }
        return [...prev, { ...player, isShadowSquad: true, shadowPosition: pos }];
      });
      // Persist in background
      addToShadowSquad(player.id, pos).then((res) => {
        if (!res.success) { console.error('addToShadowSquad failed:', res.error); fetchPlayers(); }
      });
    } else {
      setPlayers((prev) => {
        const exists = prev.find((p) => p.id === player.id);
        if (exists) {
          return prev.map((p) => p.id === player.id ? { ...p, isRealSquad: true, positionNormalized: pos } : p);
        }
        return [...prev, { ...player, isRealSquad: true, positionNormalized: pos }];
      });
      toggleRealSquad(player.id, true, pos).then((res) => {
        if (!res.success) { console.error('toggleRealSquad failed:', res.error); fetchPlayers(); }
      });
    }
  }

  /** Optimistic remove: remove from local state, persist in background */
  function handleRemove(playerId: number) {
    if (squadType === 'shadow') {
      setPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, isShadowSquad: false, shadowPosition: null } : p));
      removeFromShadowSquad(playerId).then((res) => {
        if (!res.success) { console.error('removeFromShadowSquad failed:', res.error); fetchPlayers(); }
      });
    } else {
      setPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, isRealSquad: false } : p));
      toggleRealSquad(playerId, false).then((res) => {
        if (!res.success) { console.error('toggleRealSquad failed:', res.error); fetchPlayers(); }
      });
    }
  }

  /** Handle drag-and-drop reorder / position move */
  function handleDragEnd(info: DragEndInfo) {
    const { playerId, sourcePosition, targetPosition, newIndex } = info;
    const orderField = squadType === 'shadow' ? 'shadowOrder' : 'realOrder';

    if (sourcePosition === targetPosition) {
      // Reorder within same position
      const currentList = [...(byPosition[sourcePosition] ?? [])];
      const draggedIdx = currentList.findIndex((p) => p.id === playerId);
      if (draggedIdx < 0 || draggedIdx === newIndex) return;

      // Move element
      const [moved] = currentList.splice(draggedIdx, 1);
      currentList.splice(newIndex, 0, moved);

      // Optimistic update
      const updates = currentList.map((p, i) => ({ playerId: p.id, order: i }));
      setPlayers((prev) =>
        prev.map((p) => {
          const upd = updates.find((u) => u.playerId === p.id);
          return upd ? { ...p, [orderField]: upd.order } : p;
        })
      );

      // Persist
      bulkReorderSquad(updates, squadType).then((res) => {
        if (!res.success) console.error('bulkReorderSquad failed:', res.error);
      });
    } else {
      // Move to different position — optimistic update
      const posField = squadType === 'shadow' ? 'shadowPosition' : 'positionNormalized';
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? { ...p, [posField]: targetPosition, [orderField]: newIndex }
            : p
        )
      );

      // Persist
      moveSquadPlayerPosition(playerId, targetPosition, newIndex, squadType).then((res) => {
        if (!res.success) {
          console.error('moveSquadPlayerPosition failed:', res.error);
          fetchPlayers(); // revert on failure
        }
      });
    }
  }

  if (!selectedId) {
    return (
      <div className="space-y-4">
        <AgeGroupSelector showAll={false} />
        <p className="text-muted-foreground">Selecione um escalão para ver o plantel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AgeGroupSelector showAll={false} />

      {isPending && players.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-100" />
          ))}
        </div>
      )}

      {/* Render only on client — DndContext causes hydration mismatch if SSR'd */}
      {mounted ? (
        <FormationView
          byPosition={byPosition}
          squadType={squadType}
          onAdd={(pos) => { setDialogPosition(pos); setDialogOpen(true); }}
          onRemovePlayer={handleRemove}
          onPlayerClick={profile.open}
          onDragEnd={handleDragEnd}
        />
      ) : (
        <div className="flex h-[520px] items-center justify-center rounded-xl bg-green-700">
          <span className="text-sm text-white/60">A carregar campo...</span>
        </div>
      )}

      {/* Legend for shadow squad */}
      {squadType === 'shadow' && (
        <p className="text-center text-xs text-muted-foreground italic">
          Jogadores mais acima = primeira opção. Arraste para reordenar.
        </p>
      )}

      <AddToSquadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        position={dialogPosition}
        squadType={squadType}
        availablePlayers={availablePlayers}
        allPlayers={allDbPlayers}
        excludeIds={squadPlayerIds}
        onAddPlayer={(player) => { handleAdd(player, dialogPosition); setDialogOpen(false); }}
      />

      {/* Player profile popup */}
      <Dialog open={profile.isOpen} onOpenChange={(open) => { if (!open) profile.close(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="sr-only">Ficha do Jogador</DialogTitle>
          {profile.player && (
            <PlayerProfile
              player={profile.player}
              userRole={profile.role}
              notes={profile.notes}
              statusHistory={profile.history}
              onClose={profile.close}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
