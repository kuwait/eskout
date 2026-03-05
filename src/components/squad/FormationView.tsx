// src/components/squad/FormationView.tsx
// Horizontal 4-3-3 formation layout on a green pitch background with drag-and-drop
// Columns left-to-right: GR | DE-DC-DD | MDC-MC | EE-MOC-ED | PL
// RELEVANT FILES: src/components/squad/FormationSlot.tsx, src/components/squad/SquadPanelView.tsx, src/lib/types/index.ts

'use client';

import { useState, useCallback } from 'react';
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
} from '@dnd-kit/core';
import { FormationSlot } from '@/components/squad/FormationSlot';
import type { Player, PositionCode } from '@/lib/types';

/* ───────────── Formation Columns (left to right on pitch) ───────────── */

const FORMATION_COLS: PositionCode[][] = [
  ['GR'],                 // Goalkeeper
  ['DE', 'DC', 'DD'],     // Defence (top to bottom = left to right on pitch)
  ['MDC', 'MC'],          // Midfield
  ['EE', 'MOC', 'ED'],   // Wingers + Attacking mid
  ['PL'],                 // Striker
];

export interface DragEndInfo {
  playerId: number;
  sourcePosition: PositionCode;
  targetPosition: PositionCode;
  /** New index within target position array */
  newIndex: number;
}

interface FormationViewProps {
  byPosition: Record<string, Player[]>;
  squadType: 'real' | 'shadow';
  onAdd: (position: PositionCode) => void;
  onRemovePlayer: (playerId: number) => void;
  onPlayerClick?: (playerId: number) => void;
  onDragEnd?: (info: DragEndInfo) => void;
}

/** Drag item data encoded in the draggable ID: "player-{id}-{position}" */
function parseDragId(id: string): { playerId: number; position: PositionCode } | null {
  const parts = id.split('-');
  if (parts[0] !== 'player' || parts.length < 3) return null;
  return { playerId: parseInt(parts[1], 10), position: parts.slice(2).join('-') as PositionCode };
}

export function FormationView({ byPosition, squadType, onAdd, onRemovePlayer, onPlayerClick, onDragEnd }: FormationViewProps) {
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);

  // Require 8px movement before activating — prevents accidental drags on tap
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const parsed = parseDragId(String(event.active.id));
    if (!parsed) return;
    const players = byPosition[parsed.position] ?? [];
    const player = players.find((p) => p.id === parsed.playerId);
    setActivePlayer(player ?? null);
  }, [byPosition]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActivePlayer(null);
    if (!onDragEnd) return;

    const { active, over } = event;
    if (!over) return;

    const source = parseDragId(String(active.id));
    if (!source) return;

    const overId = String(over.id);

    // Dropped on a position droppable (e.g. "droppable-DC")
    if (overId.startsWith('droppable-')) {
      const targetPos = overId.replace('droppable-', '') as PositionCode;
      const targetPlayers = byPosition[targetPos] ?? [];
      onDragEnd({
        playerId: source.playerId,
        sourcePosition: source.position,
        targetPosition: targetPos,
        newIndex: targetPlayers.length, // append at end
      });
      return;
    }

    // Dropped on another player card
    const target = parseDragId(overId);
    if (!target) return;

    const targetPlayers = byPosition[target.position] ?? [];
    const targetIndex = targetPlayers.findIndex((p) => p.id === target.playerId);

    onDragEnd({
      playerId: source.playerId,
      sourcePosition: source.position,
      targetPosition: target.position,
      newIndex: targetIndex >= 0 ? targetIndex : targetPlayers.length,
    });
  }, [byPosition, onDragEnd]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="relative overflow-x-auto overflow-y-hidden rounded-xl bg-green-700 p-4" style={{ minHeight: 520 }}>
        {/* ───────────── Pitch markings ───────────── */}
        <div className="pointer-events-none absolute inset-0">
          {/* Outer border */}
          <div className="absolute inset-3 border-2 border-white/25 rounded" />
          {/* Centre line */}
          <div className="absolute inset-y-3 left-1/2 w-0 border-l-2 border-white/25" />
          {/* Centre circle */}
          <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" />
          {/* Centre dot */}
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />

          {/* Left goal area (GR side) */}
          <div className="absolute left-3 top-1/2 h-40 w-14 -translate-y-1/2 border-2 border-l-0 border-white/25 rounded-r" />
          <div className="absolute left-3 top-1/2 h-24 w-7 -translate-y-1/2 border-2 border-l-0 border-white/25 rounded-r" />
          {/* Left goal */}
          <div className="absolute left-1 top-1/2 h-16 w-2 -translate-y-1/2 rounded-r border-2 border-l-0 border-white/30" />
          {/* Left penalty arc */}
          <div className="absolute left-[68px] top-1/2 h-16 w-8 -translate-y-1/2 rounded-r-full border-2 border-l-0 border-white/20" />

          {/* Right goal area (PL side) */}
          <div className="absolute right-3 top-1/2 h-40 w-14 -translate-y-1/2 border-2 border-r-0 border-white/25 rounded-l" />
          <div className="absolute right-3 top-1/2 h-24 w-7 -translate-y-1/2 border-2 border-r-0 border-white/25 rounded-l" />
          {/* Right goal */}
          <div className="absolute right-1 top-1/2 h-16 w-2 -translate-y-1/2 rounded-l border-2 border-r-0 border-white/30" />
          {/* Right penalty arc */}
          <div className="absolute right-[68px] top-1/2 h-16 w-8 -translate-y-1/2 rounded-l-full border-2 border-r-0 border-white/20" />

          {/* Corner arcs */}
          <div className="absolute left-3 top-3 h-4 w-4 rounded-br-full border-b-2 border-r-2 border-white/20" />
          <div className="absolute left-3 bottom-3 h-4 w-4 rounded-tr-full border-t-2 border-r-2 border-white/20" />
          <div className="absolute right-3 top-3 h-4 w-4 rounded-bl-full border-b-2 border-l-2 border-white/20" />
          <div className="absolute right-3 bottom-3 h-4 w-4 rounded-tl-full border-t-2 border-l-2 border-white/20" />
        </div>

        {/* ───────────── Formation columns ───────────── */}
        <div className="relative flex h-full items-stretch justify-between gap-4 px-2 py-2" style={{ minWidth: 640, minHeight: 488 }}>
          {FORMATION_COLS.map((col, i) => (
            <div
              key={i}
              className={`flex flex-col items-center ${
                col.length === 1 ? 'justify-center' : 'justify-between'
              } py-2`}
            >
              {col.map((pos) => (
                <FormationSlot
                  key={pos}
                  position={pos}
                  players={byPosition[pos] ?? []}
                  squadType={squadType}
                  onAdd={() => onAdd(pos)}
                  onRemovePlayer={onRemovePlayer}
                  onPlayerClick={onPlayerClick}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Drag overlay — floating card that follows the cursor */}
      <DragOverlay>
        {activePlayer && (
          <div className="rounded-md bg-white/95 px-3 py-2 text-center shadow-lg">
            <p className="text-xs font-semibold text-neutral-900">{activePlayer.name}</p>
            <p className="text-[10px] text-neutral-500">{activePlayer.club || '—'}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
