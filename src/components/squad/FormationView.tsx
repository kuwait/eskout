// src/components/squad/FormationView.tsx
// Responsive formation layout: horizontal pitch on desktop, vertical column on mobile
// Desktop (md+): columns left-to-right GR | DEF | MID | ATK | PL
// Mobile (<md): single column top-to-bottom GR → DEF → MID → ATK → PL
// RELEVANT FILES: src/components/squad/FormationSlot.tsx, src/components/squad/SquadPanelView.tsx, src/lib/types/index.ts

'use client';

import { useState, useCallback, useEffect } from 'react';
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

/* ───────────── Formation Groups ───────────── */

/** Visual slot IDs — DC split into two visual groups (by order, not foot) */
type FormationSlotId = PositionCode | 'DC_E' | 'DC_D';

/** Desktop groups: columns left-to-right on horizontal pitch */
const DESKTOP_GROUPS: FormationSlotId[][] = [
  ['GR'],                              // Goalkeeper
  ['DE', 'DC_E', 'DC_D', 'DD'],       // Defence — two DC slots
  ['MDC', 'MC'],                       // Midfield
  ['EE', 'MOC', 'ED'],                // Wingers + Attacking mid
  ['PL'],                              // Striker
];

/** Mobile groups: rows top-to-bottom on vertical pitch (GR top, PL bottom) */
const MOBILE_GROUPS: FormationSlotId[][] = [
  ['GR'],                              // Goalkeeper
  ['DC_E', 'DC_D'],                    // Central defenders
  ['DE', 'DD'],                        // Full-backs
  ['MDC', 'MC'],                       // Midfield
  ['MOC'],                             // Attacking mid
  ['EE', 'PL', 'ED'],                 // Wingers + Striker
];

const SLOT_CONFIG: Record<FormationSlotId, { position: PositionCode; label: string }> = {
  GR: { position: 'GR', label: 'GR' },
  DD: { position: 'DD', label: 'DD' },
  DE: { position: 'DE', label: 'DE' },
  DC: { position: 'DC', label: 'DC' },
  DC_E: { position: 'DC', label: 'DC (E)' },
  DC_D: { position: 'DC', label: 'DC (D)' },
  MDC: { position: 'MDC', label: 'MDC' },
  MC: { position: 'MC', label: 'MC' },
  MOC: { position: 'MOC', label: 'MOC' },
  ED: { position: 'ED', label: 'ED' },
  EE: { position: 'EE', label: 'EE' },
  PL: { position: 'PL', label: 'PL' },
};

export interface DragEndInfo {
  playerId: number;
  sourcePosition: string;
  targetPosition: string;
  /** New index within target position array */
  newIndex: number;
}

interface FormationViewProps {
  byPosition: Record<string, Player[]>;
  squadType: 'real' | 'shadow';
  onAdd: (position: string) => void;
  onRemovePlayer: (playerId: number) => void;
  onPlayerClick?: (playerId: number) => void;
  onDragEnd?: (info: DragEndInfo) => void;
}

/** Drag item data encoded in the draggable ID: "player-{id}-{slotId}" */
function parseDragId(id: string): { playerId: number; position: string } | null {
  const parts = id.split('-');
  if (parts[0] !== 'player' || parts.length < 3) return null;
  const position = parts.slice(2).join('-');
  return { playerId: parseInt(parts[1], 10), position };
}

/** true when viewport ≥ 1024px (lg breakpoint) — drives conditional render to avoid duplicate DnD IDs */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

export function FormationView({ byPosition, squadType, onAdd, onRemovePlayer, onPlayerClick, onDragEnd }: FormationViewProps) {
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const isDesktop = useIsDesktop();

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

    // Dropped on a position droppable (e.g. "droppable-DC_E")
    if (overId.startsWith('droppable-')) {
      const targetPos = overId.replace('droppable-', '');
      const targetPlayers = byPosition[targetPos] ?? [];
      onDragEnd({
        playerId: source.playerId,
        sourcePosition: source.position,
        targetPosition: targetPos,
        newIndex: targetPlayers.length,
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

  /** Render a single formation slot */
  const renderSlot = (slotId: FormationSlotId) => {
    const config = SLOT_CONFIG[slotId];
    return (
      <FormationSlot
        key={slotId}
        position={config.position}
        slotId={slotId}
        positionLabel={config.label !== config.position ? config.label : undefined}
        players={byPosition[slotId] ?? []}
        squadType={squadType}
        onAdd={() => onAdd(slotId)}
        onRemovePlayer={onRemovePlayer}
        onPlayerClick={onPlayerClick}
      />
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Conditional render (not CSS hidden) — avoids duplicate DnD droppable IDs */}
      {isDesktop ? (
        /* ───────────── Desktop: horizontal pitch (lg+) ───────────── */
        <div className="relative overflow-x-auto rounded-xl">
          <div className="relative bg-green-700 p-4" style={{ width: 'max(100%, 720px)', minHeight: 520 }}>
            <PitchMarkingsHorizontal />
            <div className="relative flex h-full items-stretch justify-between gap-2 px-2 py-2" style={{ minHeight: 488 }}>
              {DESKTOP_GROUPS.map((group, i) => (
                <div
                  key={i}
                  className={`flex flex-1 flex-col items-center ${
                    group.length === 1 ? 'justify-center' : 'justify-between'
                  } py-2`}
                >
                  {group.map(renderSlot)}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ───────────── Mobile/Tablet: vertical pitch (<lg) ───────────── */
        <div className="relative overflow-hidden rounded-xl bg-green-700 p-3">
          <PitchMarkingsVertical />
          <div className="relative flex flex-col gap-1 py-2">
            {MOBILE_GROUPS.map((group, i) => (
              <div
                key={i}
                className="flex items-start justify-center gap-1"
              >
                {group.map(renderSlot)}
              </div>
            ))}
          </div>
        </div>
      )}

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

/* ───────────── Pitch Markings: Horizontal (desktop) ───────────── */

function PitchMarkingsHorizontal() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Outer border */}
      <div className="absolute inset-3 rounded border-2 border-white/25" />
      {/* Centre line */}
      <div className="absolute inset-y-3 left-1/2 w-0 border-l-2 border-white/25" />
      {/* Centre circle */}
      <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" />
      {/* Centre dot */}
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />

      {/* Left goal area (GR side) */}
      <div className="absolute left-3 top-1/2 h-40 w-14 -translate-y-1/2 rounded-r border-2 border-l-0 border-white/25" />
      <div className="absolute left-3 top-1/2 h-24 w-7 -translate-y-1/2 rounded-r border-2 border-l-0 border-white/25" />
      <div className="absolute left-1 top-1/2 h-16 w-2 -translate-y-1/2 rounded-r border-2 border-l-0 border-white/30" />
      <div className="absolute left-[68px] top-1/2 h-16 w-8 -translate-y-1/2 rounded-r-full border-2 border-l-0 border-white/20" />

      {/* Right goal area (PL side) */}
      <div className="absolute right-3 top-1/2 h-40 w-14 -translate-y-1/2 rounded-l border-2 border-r-0 border-white/25" />
      <div className="absolute right-3 top-1/2 h-24 w-7 -translate-y-1/2 rounded-l border-2 border-r-0 border-white/25" />
      <div className="absolute right-1 top-1/2 h-16 w-2 -translate-y-1/2 rounded-l border-2 border-r-0 border-white/30" />
      <div className="absolute right-[68px] top-1/2 h-16 w-8 -translate-y-1/2 rounded-l-full border-2 border-r-0 border-white/20" />

      {/* Corner arcs */}
      <div className="absolute left-3 top-3 h-4 w-4 rounded-br-full border-b-2 border-r-2 border-white/20" />
      <div className="absolute bottom-3 left-3 h-4 w-4 rounded-tr-full border-r-2 border-t-2 border-white/20" />
      <div className="absolute right-3 top-3 h-4 w-4 rounded-bl-full border-b-2 border-l-2 border-white/20" />
      <div className="absolute bottom-3 right-3 h-4 w-4 rounded-tl-full border-l-2 border-t-2 border-white/20" />
    </div>
  );
}

/* ───────────── Pitch Markings: Vertical (mobile) ───────────── */

function PitchMarkingsVertical() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Outer border */}
      <div className="absolute inset-3 rounded border-2 border-white/25" />
      {/* Centre line — horizontal on vertical pitch */}
      <div className="absolute inset-x-3 top-1/2 h-0 border-t-2 border-white/25" />
      {/* Centre circle */}
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" />
      {/* Centre dot */}
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />

      {/* Top goal area (GR side) */}
      <div className="absolute left-1/2 top-3 h-10 w-36 -translate-x-1/2 rounded-b border-2 border-t-0 border-white/25" />
      <div className="absolute left-1/2 top-3 h-5 w-20 -translate-x-1/2 rounded-b border-2 border-t-0 border-white/25" />
      <div className="absolute left-1/2 top-1 h-2 w-14 -translate-x-1/2 rounded-b border-2 border-t-0 border-white/30" />
      {/* Penalty arc */}
      <div className="absolute left-1/2 top-[52px] h-6 w-14 -translate-x-1/2 rounded-b-full border-2 border-t-0 border-white/20" />

      {/* Bottom goal area (PL side) */}
      <div className="absolute bottom-3 left-1/2 h-10 w-36 -translate-x-1/2 rounded-t border-2 border-b-0 border-white/25" />
      <div className="absolute bottom-3 left-1/2 h-5 w-20 -translate-x-1/2 rounded-t border-2 border-b-0 border-white/25" />
      <div className="absolute bottom-1 left-1/2 h-2 w-14 -translate-x-1/2 rounded-t border-2 border-b-0 border-white/30" />
      {/* Penalty arc */}
      <div className="absolute bottom-[52px] left-1/2 h-6 w-14 -translate-x-1/2 rounded-t-full border-2 border-b-0 border-white/20" />

      {/* Corner arcs */}
      <div className="absolute left-3 top-3 h-4 w-4 rounded-br-full border-b-2 border-r-2 border-white/20" />
      <div className="absolute right-3 top-3 h-4 w-4 rounded-bl-full border-b-2 border-l-2 border-white/20" />
      <div className="absolute bottom-3 left-3 h-4 w-4 rounded-tr-full border-r-2 border-t-2 border-white/20" />
      <div className="absolute bottom-3 right-3 h-4 w-4 rounded-tl-full border-l-2 border-t-2 border-white/20" />
    </div>
  );
}
