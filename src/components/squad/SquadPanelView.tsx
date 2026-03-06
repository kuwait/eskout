// src/components/squad/SquadPanelView.tsx
// Single squad panel view (real OR shadow) — used by /campo/real and /campo/sombra
// Shows positions grouped with add/remove. Includes age group selector + drag-and-drop reorder.
// RELEVANT FILES: src/components/squad/FormationView.tsx, src/components/squad/AddToSquadDialog.tsx, src/actions/squads.ts

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePageAgeGroup } from '@/hooks/usePageAgeGroup';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { SQUAD_SLOT_CODES } from '@/lib/constants';
import { LayoutGrid, List, Columns2 } from 'lucide-react';
import { AgeGroupSelector } from '@/components/layout/AgeGroupSelector';
import { FormationView, type DragEndInfo } from '@/components/squad/FormationView';
import { SquadListView } from '@/components/squad/SquadListView';
import { SquadCompareView } from '@/components/squad/SquadCompareView';
import { AddToSquadDialog } from '@/components/squad/AddToSquadDialog';
import { addToShadowSquad, removeFromShadowSquad, toggleRealSquad, bulkReorderSquad, moveSquadPlayerPosition } from '@/actions/squads';
import { SquadExportMenu } from '@/components/squad/SquadExportMenu';
import type { Player, PlayerRow, PositionCode } from '@/lib/types';

type ViewMode = 'campo' | 'lista' | 'comparar';

const VIEW_MODE_KEY_PREFIX = 'eskout-view-';

/** Read persisted view mode from localStorage */
function getStoredViewMode(squadType: string): ViewMode {
  if (typeof window === 'undefined') return 'campo';
  const stored = localStorage.getItem(`${VIEW_MODE_KEY_PREFIX}${squadType}`);
  if (stored === 'lista' || stored === 'comparar') return stored;
  return 'campo';
}

interface SquadPanelViewProps {
  squadType: 'real' | 'shadow';
}

export function SquadPanelView({ squadType }: SquadPanelViewProps) {
  const router = useRouter();
  const { ageGroups, selectedId, setSelectedId } = usePageAgeGroup({
    pageId: `squad-${squadType}`,
  });
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);

  const [viewMode, setViewModeState] = useState<ViewMode>(() => getStoredViewMode(squadType));
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(`${VIEW_MODE_KEY_PREFIX}${squadType}`, mode);
  }, [squadType]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPosition, setDialogPosition] = useState<string>('GR');
  // Defer DndContext rendering to client to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Ref for capturing squad view as image
  const squadContentRef = useRef<HTMLDivElement>(null);

  // Players filtered by selected age group — instant tab switching, no extra fetches
  const players = useMemo(
    () => selectedId ? allPlayers.filter((p) => p.ageGroupId === selectedId) : [],
    [allPlayers, selectedId]
  );

  // Navigate to player profile page (always fresh data, unlike stale client cache)
  const handlePlayerClick = useCallback((playerId: number) => {
    router.push(`/jogadores/${playerId}`);
  }, [router]);

  /* ───────────── Fetch ───────────── */

  // Fetch all players once — ~2000 players max for a youth club
  const fetchAllPlayers = useCallback(() => {
    const supabase = createClient();
    supabase
      .from('players')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) {
          setAllPlayers((data as PlayerRow[]).map(mapPlayerRow));
        }
      });
  }, []);

  useEffect(() => {
    fetchAllPlayers();
  }, [fetchAllPlayers]);

  /* ───────────── Group by position (sorted by order field) ───────────── */

  const byPosition = useMemo(() => {
    const orderField = squadType === 'shadow' ? 'shadowOrder' : 'realOrder';
    const map: Record<string, Player[]> = {};
    for (const slot of SQUAD_SLOT_CODES) map[slot] = [];
    for (const p of players) {
      if (squadType === 'real' && p.isRealSquad && p.positionNormalized) {
        // DC players without DC_E/DC_D → distribute to DC_E (odd index) and DC_D (even index)
        if (p.positionNormalized === 'DC') {
          const dcE = map['DC_E'] ?? [];
          const dcD = map['DC_D'] ?? [];
          // Balance: put in whichever sub-slot has fewer players
          if (dcE.length <= dcD.length) {
            dcE.push(p);
            map['DC_E'] = dcE;
          } else {
            dcD.push(p);
            map['DC_D'] = dcD;
          }
        } else {
          map[p.positionNormalized]?.push(p);
        }
      }
      if (squadType === 'shadow' && p.isShadowSquad && p.shadowPosition) {
        map[p.shadowPosition]?.push(p);
      }
    }
    for (const slot of SQUAD_SLOT_CODES) {
      map[slot]?.sort((a, b) => a[orderField] - b[orderField]);
    }
    return map;
  }, [players, squadType]);

  // Other squad grouped by position — for compare view
  const otherByPosition = useMemo(() => {
    const otherType = squadType === 'shadow' ? 'real' : 'shadow';
    const otherOrderField = otherType === 'shadow' ? 'shadowOrder' : 'realOrder';
    const map: Record<string, Player[]> = {};
    for (const slot of SQUAD_SLOT_CODES) map[slot] = [];
    for (const p of players) {
      if (otherType === 'real' && p.isRealSquad && p.positionNormalized) {
        if (p.positionNormalized === 'DC') {
          const dcE = map['DC_E'] ?? [];
          const dcD = map['DC_D'] ?? [];
          if (dcE.length <= dcD.length) {
            dcE.push(p);
            map['DC_E'] = dcE;
          } else {
            dcD.push(p);
            map['DC_D'] = dcD;
          }
        } else {
          map[p.positionNormalized]?.push(p);
        }
      }
      if (otherType === 'shadow' && p.isShadowSquad && p.shadowPosition) {
        map[p.shadowPosition]?.push(p);
      }
    }
    for (const slot of SQUAD_SLOT_CODES) {
      map[slot]?.sort((a, b) => a[otherOrderField] - b[otherOrderField]);
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
    for (const slot of SQUAD_SLOT_CODES) {
      for (const p of (byPosition[slot] ?? [])) ids.add(p.id);
    }
    return ids;
  }, [byPosition]);

  /* ───────────── Handlers ───────────── */

  /** Optimistic add: inject player into local state, persist in background */
  function handleAdd(player: Player, pos: string) {
    if (squadType === 'shadow') {
      // Optimistic: mark as shadow squad at this position
      setAllPlayers((prev) => {
        const exists = prev.find((p) => p.id === player.id);
        if (exists) {
          return prev.map((p) => p.id === player.id ? { ...p, isShadowSquad: true, shadowPosition: pos } : p);
        }
        return [...prev, { ...player, isShadowSquad: true, shadowPosition: pos }];
      });
      // Persist in background — refetch on failure to revert optimistic update
      addToShadowSquad(player.id, pos).then((res) => {
        if (!res.success) {
          console.error('addToShadowSquad failed:', res.error);
          alert(`Erro ao adicionar: ${res.error}`);
          fetchAllPlayers();
        }
      });
    } else {
      // DC_E/DC_D stored directly in position_normalized (requires migration 013)
      const dbPos = pos;
      // Move player to current age group so they appear in this squad view ("call up")
      const targetAgeGroupId = selectedId;
      setAllPlayers((prev) => {
        const exists = prev.find((p) => p.id === player.id);
        if (exists) {
          return prev.map((p) => p.id === player.id
            ? { ...p, isRealSquad: true, positionNormalized: dbPos, ageGroupId: targetAgeGroupId! }
            : p);
        }
        return [...prev, { ...player, isRealSquad: true, positionNormalized: dbPos, ageGroupId: targetAgeGroupId! }];
      });
      toggleRealSquad(player.id, true, dbPos, targetAgeGroupId ?? undefined).then((res) => {
        if (!res.success) {
          console.error('toggleRealSquad failed:', res.error);
          alert(`Erro ao adicionar: ${res.error}`);
          fetchAllPlayers();
        }
      });
    }
  }

  /** Optimistic remove: remove from local state, persist in background */
  function handleRemove(playerId: number) {
    if (squadType === 'shadow') {
      setAllPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, isShadowSquad: false, shadowPosition: null } : p));
      removeFromShadowSquad(playerId).then((res) => {
        if (!res.success) { console.error('removeFromShadowSquad failed:', res.error); fetchAllPlayers(); }
      });
    } else {
      setAllPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, isRealSquad: false } : p));
      toggleRealSquad(playerId, false).then((res) => {
        if (!res.success) { console.error('toggleRealSquad failed:', res.error); fetchAllPlayers(); }
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
      setAllPlayers((prev) =>
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
      // Move to different position — DC_E/DC_D are valid DB values for both squads
      const dbPosition = targetPosition;

      const posField = squadType === 'shadow' ? 'shadowPosition' : 'positionNormalized';
      setAllPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? { ...p, [posField]: dbPosition, [orderField]: newIndex }
            : p
        )
      );

      // Persist
      moveSquadPlayerPosition(playerId, dbPosition, newIndex, squadType).then((res) => {
        if (!res.success) {
          console.error('moveSquadPlayerPosition failed:', res.error);
          fetchAllPlayers(); // revert on failure
        }
      });
    }
  }

  // Shadow squad tabs show birth year, real squad tabs show age group name
  const labelFn = squadType === 'shadow'
    ? (ag: { generationYear: number }) => String(ag.generationYear)
    : undefined;

  if (!selectedId) {
    return (
      <div className="space-y-4">
        <AgeGroupSelector showAll={false} variant="navigator" value={selectedId} onChange={setSelectedId} ageGroups={ageGroups} labelFn={labelFn} />
        <p className="text-muted-foreground">Selecione um escalão para ver o plantel.</p>
      </div>
    );
  }

  const realPos = squadType === 'real' ? byPosition : otherByPosition;
  const shadowPos = squadType === 'shadow' ? byPosition : otherByPosition;

  // Age group label for exports
  const selectedAgeGroup = ageGroups.find((ag) => ag.id === selectedId);
  const ageGroupLabel = selectedAgeGroup
    ? (squadType === 'shadow' ? String(selectedAgeGroup.generationYear) : selectedAgeGroup.name)
    : '';
  const exportData = { squadType, ageGroupLabel, byPosition };

  return (
    <div className="space-y-4">
      {/* Sticky header — age group tabs always visible while scrolling on mobile */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-transparent bg-white px-4 pb-2 pt-1 shadow-[0_1px_3px_rgba(0,0,0,0.05)] lg:-mx-6 lg:px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AgeGroupSelector showAll={false} variant="navigator" value={selectedId} onChange={setSelectedId} ageGroups={ageGroups} labelFn={labelFn} />

        {/* View mode toggle + export */}
        <div className="flex items-center gap-2">
        <div className="flex shrink-0 rounded-lg border bg-white p-0.5">
          {([
            { mode: 'campo' as ViewMode, icon: LayoutGrid, label: 'Campo' },
            { mode: 'lista' as ViewMode, icon: List, label: 'Lista' },
            { mode: 'comparar' as ViewMode, icon: Columns2, label: 'Comparar' },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <SquadExportMenu data={exportData} captureRef={squadContentRef} />
        </div>
      </div>

      {/* ───────────── Squad content (wrapped for image capture) ───────────── */}
      <div ref={squadContentRef}>

      {/* ───────────── Campo view (formation pitch) ───────────── */}
      {viewMode === 'campo' && (
        <>
          {mounted ? (
            <FormationView
              byPosition={byPosition}
              squadType={squadType}
              onAdd={(pos) => { setDialogPosition(pos); setDialogOpen(true); }}
              onRemovePlayer={handleRemove}
              onPlayerClick={handlePlayerClick}
              onDragEnd={handleDragEnd}
            />
          ) : (
            <div className="flex h-[520px] items-center justify-center rounded-xl bg-green-700">
              <span className="text-sm text-white/60">A carregar campo...</span>
            </div>
          )}
          {squadType === 'shadow' && (
            <p data-export-hide className="text-center text-xs text-muted-foreground italic">
              Jogadores mais acima = primeira opção. Arraste para reordenar.
            </p>
          )}
        </>
      )}

      {/* ───────────── Lista view (rich cards grouped by position) ───────────── */}
      {viewMode === 'lista' && (
        <SquadListView
          byPosition={byPosition}
          squadType={squadType}
          onAdd={(pos) => { setDialogPosition(pos); setDialogOpen(true); }}
          onRemovePlayer={handleRemove}
          onPlayerClick={handlePlayerClick}
        />
      )}

      {/* ───────────── Comparar view (Real vs Shadow side-by-side) ───────────── */}
      {viewMode === 'comparar' && (
        <SquadCompareView
          realByPosition={realPos}
          shadowByPosition={shadowPos}
          onPlayerClick={handlePlayerClick}
        />
      )}

      </div>{/* end capture ref wrapper */}

      <AddToSquadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        position={dialogPosition}
        squadType={squadType}
        availablePlayers={availablePlayers}
        allPlayers={squadType === 'real' ? allPlayers : undefined}
        excludeIds={squadPlayerIds}
        initialYear={selectedAgeGroup ? String(selectedAgeGroup.generationYear) : undefined}
        onAddPlayer={(player) => { handleAdd(player, dialogPosition); setDialogOpen(false); }}
      />

    </div>
  );
}
