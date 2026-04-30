// src/components/squad/MultiShadowSquadView.tsx
// Multi-squad shadow view — renders multiple shadow squads in ONE shared DndContext
// Enables cross-squad drag (moving a player from squad A to squad B) plus all single-squad drag flows
// RELEVANT FILES: src/components/squad/SquadPanelView.tsx, src/components/squad/FormationPitch.tsx, src/components/squad/FormationView.tsx

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { FormationPitch } from '@/components/squad/FormationPitch';
import { parsePlayerDragId, parseDroppableId, type DragEndInfo } from '@/components/squad/FormationView';
import type { Player, Squad } from '@/lib/types';

/* ───────────── Types ───────────── */

export interface MultiSquadEntry {
  squad: Squad;
  byPos: Record<string, Player[]>;
  /** Pre-pitch header content (squad name, count, export menu, etc.) */
  header?: React.ReactNode;
  /** Post-pitch footer (e.g. helper text) */
  footer?: React.ReactNode;
}

interface MultiShadowSquadViewProps {
  squads: MultiSquadEntry[];
  onAdd: (squadId: number, position: string) => void;
  onRemovePlayer: (squadId: number, playerId: number) => void;
  onPlayerClick?: (playerId: number) => void;
  /** Same-squad drag end (reorder OR cross-position within one squad) — delegates to SquadPanelView's handler */
  onSameSquadDragEnd: (info: DragEndInfo, squadId: number, byPos: Record<string, Player[]>) => void;
  /** Cross-squad drag end — player moves from fromSquadId to toSquadId */
  onCrossSquadDragEnd: (
    playerId: number,
    fromSquadId: number,
    toSquadId: number,
    newPosition: string,
    newIndex: number,
  ) => void;
}

interface DragVirtual {
  playerId: number;
  fromSquadId: number;
  fromSlot: string;
  toSquadId: number;
  toSlot: string;
  toIndex: number;
}

/* ───────────── Hook: viewport ≥1024 ───────────── */

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect -- media query listener, setState in subscription callback */
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  return isDesktop;
}

/* ───────────── Component ───────────── */

export function MultiShadowSquadView({
  squads,
  onAdd,
  onRemovePlayer,
  onPlayerClick,
  onSameSquadDragEnd,
  onCrossSquadDragEnd,
}: MultiShadowSquadViewProps) {
  const isDesktop = useIsDesktop();
  const [activeDrag, setActiveDrag] = useState<{ squadId: number; player: Player } | null>(null);
  const [dragVirtual, setDragVirtual] = useState<DragVirtual | null>(null);

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 20 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  /** squadId → playerSlotMap so we can find the source slot for any dragged player */
  const playerSlotMaps = useMemo(() => {
    const result = new Map<number, Map<number, string>>();
    for (const { squad, byPos } of squads) {
      const map = new Map<number, string>();
      for (const [slot, players] of Object.entries(byPos)) {
        for (const p of players) map.set(p.id, slot);
      }
      result.set(squad.id, map);
    }
    return result;
  }, [squads]);

  /** Apply virtual move to each squad's byPos so visual feedback shows player shifting between pitches */
  const displayBySquad = useMemo(() => {
    const result = new Map<number, Record<string, Player[]>>();
    for (const { squad, byPos } of squads) {
      // Shallow clone of the slot lists
      const cloned: Record<string, Player[]> = {};
      for (const [k, v] of Object.entries(byPos)) cloned[k] = [...v];
      result.set(squad.id, cloned);
    }

    if (!dragVirtual || !activeDrag) return result;

    // Remove from source squad+slot
    const fromSquad = result.get(dragVirtual.fromSquadId);
    if (fromSquad?.[dragVirtual.fromSlot]) {
      fromSquad[dragVirtual.fromSlot] = fromSquad[dragVirtual.fromSlot].filter(
        (p) => p.id !== dragVirtual.playerId,
      );
    }
    // Insert into target squad+slot
    const toSquad = result.get(dragVirtual.toSquadId);
    if (toSquad) {
      if (!toSquad[dragVirtual.toSlot]) toSquad[dragVirtual.toSlot] = [];
      const list = [...toSquad[dragVirtual.toSlot]];
      list.splice(dragVirtual.toIndex, 0, activeDrag.player);
      toSquad[dragVirtual.toSlot] = list;
    }
    return result;
  }, [squads, dragVirtual, activeDrag]);

  /* ───────────── Drag handlers ───────────── */

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const parsed = parsePlayerDragId(String(event.active.id));
    if (!parsed || parsed.scope === null) return;
    const slot = playerSlotMaps.get(parsed.scope)?.get(parsed.playerId);
    if (!slot) return;
    const entry = squads.find((s) => s.squad.id === parsed.scope);
    const player = entry?.byPos[slot]?.find((p) => p.id === parsed.playerId);
    if (player) setActiveDrag({ squadId: parsed.scope, player });
  }, [playerSlotMaps, squads]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    if (!activeDrag) return;
    const { over } = event;
    if (!over) { setDragVirtual(null); return; }

    const overId = String(over.id);
    let targetSquadId: number | null = null;
    let targetSlot: string | null = null;
    let targetIndex: number | null = null;

    const dropTarget = parseDroppableId(overId);
    if (dropTarget && dropTarget.scope !== null) {
      targetSquadId = dropTarget.scope;
      targetSlot = dropTarget.slot;
      const display = displayBySquad.get(targetSquadId);
      const list = (display?.[targetSlot] ?? []).filter((p) => p.id !== activeDrag.player.id);
      targetIndex = list.length;
    } else {
      const playerOver = parsePlayerDragId(overId);
      if (!playerOver || playerOver.scope === null) { setDragVirtual(null); return; }
      targetSquadId = playerOver.scope;
      // Find slot inside the target squad's display
      const display = displayBySquad.get(targetSquadId);
      if (!display) { setDragVirtual(null); return; }
      for (const [slot, players] of Object.entries(display)) {
        const idx = players.findIndex((p) => p.id === playerOver.playerId);
        if (idx >= 0) {
          targetSlot = slot;
          targetIndex = idx;
          break;
        }
      }
    }

    if (targetSquadId === null || !targetSlot || targetIndex === null) {
      setDragVirtual(null);
      return;
    }

    const sourceSlot = playerSlotMaps.get(activeDrag.squadId)?.get(activeDrag.player.id);
    if (!sourceSlot) return;

    // Hovering same squad+slot → no virtual move (let SortableContext handle within-slot reorder)
    if (targetSquadId === activeDrag.squadId && targetSlot === sourceSlot) {
      setDragVirtual(null);
      return;
    }

    setDragVirtual({
      playerId: activeDrag.player.id,
      fromSquadId: activeDrag.squadId,
      fromSlot: sourceSlot,
      toSquadId: targetSquadId,
      toSlot: targetSlot,
      toIndex: targetIndex,
    });
  }, [activeDrag, displayBySquad, playerSlotMaps]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const virtual = dragVirtual;
    const drag = activeDrag;
    setActiveDrag(null);
    setDragVirtual(null);
    if (!drag) return;

    const { over } = event;
    if (!over) return;

    // Cross-position OR cross-squad move via virtual state
    if (virtual) {
      if (virtual.fromSquadId === virtual.toSquadId) {
        const sourceSquad = squads.find((s) => s.squad.id === virtual.fromSquadId);
        if (!sourceSquad) return;
        onSameSquadDragEnd(
          {
            playerId: virtual.playerId,
            sourcePosition: virtual.fromSlot,
            targetPosition: virtual.toSlot,
            newIndex: virtual.toIndex,
          },
          virtual.fromSquadId,
          sourceSquad.byPos,
        );
      } else {
        onCrossSquadDragEnd(
          virtual.playerId,
          virtual.fromSquadId,
          virtual.toSquadId,
          virtual.toSlot,
          virtual.toIndex,
        );
      }
      return;
    }

    // No virtual → same-squad same-slot reorder via sortable index
    const overId = String(over.id);
    const playerOver = parsePlayerDragId(overId);
    const sourceSquad = squads.find((s) => s.squad.id === drag.squadId);
    if (!sourceSquad) return;
    const sourceSlot = playerSlotMaps.get(drag.squadId)?.get(drag.player.id);
    if (!sourceSlot) return;

    if (playerOver && playerOver.scope === drag.squadId) {
      const list = sourceSquad.byPos[sourceSlot] ?? [];
      const overIndex = list.findIndex((p) => p.id === playerOver.playerId);
      onSameSquadDragEnd(
        {
          playerId: drag.player.id,
          sourcePosition: sourceSlot,
          targetPosition: sourceSlot,
          newIndex: overIndex >= 0 ? overIndex : list.length,
        },
        drag.squadId,
        sourceSquad.byPos,
      );
    }
  }, [dragVirtual, activeDrag, squads, playerSlotMaps, onSameSquadDragEnd, onCrossSquadDragEnd]);

  /* ───────────── Render ───────────── */

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        {squads.map(({ squad, header, footer }) => {
          const display = displayBySquad.get(squad.id) ?? {};
          return (
            <div key={squad.id} className="space-y-2">
              {header}
              <FormationPitch
                byPosition={display}
                squadType="shadow"
                isDesktop={isDesktop}
                onAdd={(slot) => onAdd(squad.id, slot)}
                onRemovePlayer={(pid) => onRemovePlayer(squad.id, pid)}
                onPlayerClick={onPlayerClick}
                idScope={squad.id}
              />
              {footer}
            </div>
          );
        })}
      </div>

      <DragOverlay>
        {activeDrag && (
          <div className="rounded-md bg-white/95 px-3 py-2 text-center shadow-lg">
            <p className="text-xs font-semibold text-neutral-900">{activeDrag.player.name}</p>
            <p className="text-[10px] text-neutral-500">{activeDrag.player.club || '—'}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
