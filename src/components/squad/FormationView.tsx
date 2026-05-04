// src/components/squad/FormationView.tsx
// Responsive formation layout: horizontal pitch on desktop, vertical column on mobile
// Desktop (md+): columns left-to-right GR | DEF | MID | ATK | PL
// Mobile (<md): single column top-to-bottom GR → DEF → MID → ATK → PL
// RELEVANT FILES: src/components/squad/FormationSlot.tsx, src/components/squad/SquadPanelView.tsx, src/lib/types/index.ts

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
import { FormationSlot } from '@/components/squad/FormationSlot';
import type { Player, PositionCode } from '@/lib/types';
import type { SquadSignStatus } from '@/actions/squads';
import { isSpecialSection } from '@/lib/constants';
import type { SpecialSquadSection } from '@/lib/constants';

/* ───────────── Formation Groups ───────────── */

/** Visual slot IDs — DC split into two visual groups. AD/AE excluded from squad formations */
type FormationSlotId = Exclude<PositionCode, 'AD' | 'AE' | 'MD' | 'ME' | 'SA'> | 'DC_E' | 'DC_D';

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
  ['DC_D', 'DC_E'],                    // Central defenders — mirrored: pitch viewed from above
  ['DD', 'DE'],                        // Full-backs — mirrored: pitch viewed from above
  ['MDC', 'MC'],                       // Midfield
  ['MOC'],                             // Attacking mid
  ['ED', 'EE'],                        // Wingers — ED left, EE right (mirrored: pitch viewed from above)
  ['PL'],                              // Striker — own row at bottom
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
  onToggleDoubt?: (playerId: number, isDoubt: boolean) => void;
  onSetSignStatus?: (playerId: number, status: SquadSignStatus) => void;
  onTogglePreseason?: (playerId: number, isPreseason: boolean) => void;
  /** Move player to a special section (Dúvida / Possibilidades) — real squads only */
  onMoveToSection?: (playerId: number, section: SpecialSquadSection) => void;
  /** Players in special sections (DUVIDA, POSSIBILIDADE) — included in DnD context for cross-zone drag */
  specialSections?: Record<string, Player[]>;
  /** Extra content rendered inside the DndContext (after the pitch) — e.g. droppable special sections */
  children?: React.ReactNode;
}

/** Parse drag ID — supports scoped (`player-{scope}-{id}`) and unscoped (`player-{id}`) */
export function parsePlayerDragId(id: string): { scope: number | null; playerId: number } | null {
  if (!id.startsWith('player-')) return null;
  const rest = id.slice('player-'.length);
  const dashIdx = rest.indexOf('-');
  if (dashIdx > 0) {
    const scopeStr = rest.slice(0, dashIdx);
    const playerStr = rest.slice(dashIdx + 1);
    const scope = parseInt(scopeStr, 10);
    const playerId = parseInt(playerStr, 10);
    // Strict integer match — parseInt is lenient ("7a" → 7), so we cross-check via toString
    if (!isNaN(scope) && String(scope) === scopeStr && !isNaN(playerId) && String(playerId) === playerStr) {
      return { scope, playerId };
    }
    return null;
  }
  const playerId = parseInt(rest, 10);
  if (isNaN(playerId) || String(playerId) !== rest) return null;
  return { scope: null, playerId };
}

/** Parse droppable ID — supports scoped (`droppable-{scope}-{slot}`) and unscoped (`droppable-{slot}`) */
export function parseDroppableId(id: string): { scope: number | null; slot: string } | null {
  if (!id.startsWith('droppable-')) return null;
  const rest = id.slice('droppable-'.length);
  const dashIdx = rest.indexOf('-');
  if (dashIdx > 0) {
    const scopeStr = rest.slice(0, dashIdx);
    const scope = parseInt(scopeStr, 10);
    if (!isNaN(scope) && String(scope) === scopeStr) {
      return { scope, slot: rest.slice(dashIdx + 1) };
    }
  }
  return { scope: null, slot: rest };
}

/** Backward-compat helper: parses unscoped ID → playerId, returns null otherwise */
function parseDragPlayerId(id: string): number | null {
  const parsed = parsePlayerDragId(id);
  return parsed ? parsed.playerId : null;
}

/** true when viewport ≥ 1024px (lg breakpoint) — drives conditional render to avoid duplicate DnD IDs */
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

/** Virtual cross-position move during drag */
export interface DragVirtual {
  playerId: number;
  fromSlot: string;
  toSlot: string;
  toIndex: number;
}

/** Compute the per-slot display lists during a cross-position drag.
 *  Pulls `activePlayer` out of the source slot and inserts it at the target index — gives
 *  the user a "this is where it'll go" preview as they hover.
 *
 *  Special-section sources (POSSIBILIDADE / DUVIDA) are intentionally NOT previewed: those
 *  cards are rendered from `specialSections` by code outside FormationView (passed in via
 *  `children`), so we can't filter the source render from here. Inserting the player into a
 *  pitch slot too would create the same `useSortable` id under two SortableContexts in the
 *  same DndContext — dnd-kit treats that as a duplicate and crashes the drag. The DragOverlay
 *  still floats the picked-up card so the user keeps visual feedback. */
export function computeDisplayByPosition(
  byPosition: Record<string, Player[]>,
  specialSections: Record<string, Player[]> | undefined,
  dragVirtual: DragVirtual | null,
  activePlayer: Player | null,
): Record<string, Player[]> {
  if (!dragVirtual || !activePlayer) return byPosition;

  // Source is a special section → skip the destination preview to avoid duplicate
  // useSortable IDs (see function-level comment).
  if (specialSections && dragVirtual.fromSlot in specialSections) return byPosition;

  const result: Record<string, Player[]> = {};
  for (const [key, players] of Object.entries(byPosition)) {
    result[key] = [...players];
  }
  // Remove from source pitch slot
  if (result[dragVirtual.fromSlot]) {
    result[dragVirtual.fromSlot] = result[dragVirtual.fromSlot].filter(
      (p) => p.id !== dragVirtual.playerId,
    );
  }
  // Insert into target slot at index
  if (!result[dragVirtual.toSlot]) result[dragVirtual.toSlot] = [];
  const targetList = [...result[dragVirtual.toSlot]];
  targetList.splice(dragVirtual.toIndex, 0, activePlayer);
  result[dragVirtual.toSlot] = targetList;
  return result;
}

export function FormationView({ byPosition, squadType, onAdd, onRemovePlayer, onPlayerClick, onDragEnd, onToggleDoubt, onSetSignStatus, onTogglePreseason, onMoveToSection, specialSections, children }: FormationViewProps) {
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [dragVirtual, setDragVirtual] = useState<DragVirtual | null>(null);
  const isDesktop = useIsDesktop();

  // Require 8px movement before activating — prevents accidental drags on tap
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 20 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  // Map player ID → slot for quick lookup of source position (includes special sections)
  const playerSlotMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const [slot, players] of Object.entries(byPosition)) {
      for (const p of players) map.set(p.id, slot);
    }
    // Include special section players so drag-from-section works
    if (specialSections) {
      for (const [section, players] of Object.entries(specialSections)) {
        for (const p of players) map.set(p.id, section);
      }
    }
    return map;
  }, [byPosition, specialSections]);

  // Display positions: during cross-position drag, player is virtually moved to target slot
  // (see computeDisplayByPosition for the special-section duplicate-id avoidance)
  const displayByPosition = useMemo(
    () => computeDisplayByPosition(byPosition, specialSections, dragVirtual, activePlayer),
    [byPosition, specialSections, dragVirtual, activePlayer],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const playerId = parseDragPlayerId(String(event.active.id));
    if (playerId === null) return;
    const slot = playerSlotMap.get(playerId);
    if (!slot) return;
    // Look up player from pitch positions or special sections
    const player = (byPosition[slot] ?? specialSections?.[slot] ?? []).find((p) => p.id === playerId);
    setActivePlayer(player ?? null);
  }, [byPosition, specialSections, playerSlotMap]);

  /** Detect cross-position hover → virtually move player to target slot */
  const handleDragOver = useCallback((event: DragOverEvent) => {
    if (!activePlayer) return;
    const { over } = event;
    if (!over) { setDragVirtual(null); return; }

    const sourceSlot = playerSlotMap.get(activePlayer.id);
    if (!sourceSlot) return;

    const overId = String(over.id);
    let targetSlot: string | null = null;
    let targetIndex: number | null = null;

    if (overId.startsWith('droppable-')) {
      targetSlot = overId.replace('droppable-', '');
      // Use the current display list (which may already have the player moved)
      const currentList = (displayByPosition[targetSlot] ?? []).filter((p) => p.id !== activePlayer.id);
      targetIndex = currentList.length;
    } else {
      const overPlayerId = parseDragPlayerId(overId);
      if (overPlayerId === null) { setDragVirtual(null); return; }
      // Find which slot the over-player is in (using display positions, not original)
      for (const [slot, players] of Object.entries(displayByPosition)) {
        const idx = players.findIndex((p) => p.id === overPlayerId);
        if (idx >= 0) {
          targetSlot = slot;
          targetIndex = idx;
          break;
        }
      }
      // Also check special sections if not found in pitch positions
      if (!targetSlot && specialSections) {
        for (const [section, players] of Object.entries(specialSections)) {
          const idx = players.findIndex((p) => p.id === overPlayerId);
          if (idx >= 0) {
            targetSlot = section;
            targetIndex = idx;
            break;
          }
        }
      }
    }

    if (!targetSlot || targetIndex === null) { setDragVirtual(null); return; }

    // Back to source position → clear virtual move
    if (targetSlot === sourceSlot) { setDragVirtual(null); return; }

    setDragVirtual({ playerId: activePlayer.id, fromSlot: sourceSlot, toSlot: targetSlot, toIndex: targetIndex });
  }, [activePlayer, playerSlotMap, displayByPosition, specialSections]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const virtual = dragVirtual;
    setActivePlayer(null);
    setDragVirtual(null);
    if (!onDragEnd) return;

    const playerId = parseDragPlayerId(String(event.active.id));
    if (playerId === null) return;
    const sourceSlot = playerSlotMap.get(playerId);
    if (!sourceSlot) return;

    const { over } = event;
    if (!over) return;

    // Cross-position move — use virtual state
    if (virtual) {
      onDragEnd({
        playerId,
        sourcePosition: virtual.fromSlot,
        targetPosition: virtual.toSlot,
        newIndex: virtual.toIndex,
      });
      return;
    }

    // Check if dropped on a droppable zone (position or special section)
    const overId = String(over.id);
    if (overId.startsWith('droppable-')) {
      const targetSlot = overId.replace('droppable-', '');
      // Dropped on a special section without virtual — handle directly
      if (isSpecialSection(targetSlot) && targetSlot !== sourceSlot) {
        onDragEnd({ playerId, sourcePosition: sourceSlot, targetPosition: targetSlot, newIndex: 0 });
        return;
      }
      // Dropped on own pitch position droppable — no-op
      return;
    }

    const overPlayerId = parseDragPlayerId(overId);
    if (overPlayerId === null) return;

    // Check if the over-player is in a special section (dropped on a section card)
    const overPlayerSlot = playerSlotMap.get(overPlayerId);
    if (overPlayerSlot && isSpecialSection(overPlayerSlot) && overPlayerSlot !== sourceSlot) {
      onDragEnd({ playerId, sourcePosition: sourceSlot, targetPosition: overPlayerSlot, newIndex: 0 });
      return;
    }

    // Same-section reorder: source list lives in specialSections (not byPosition) when sourceSlot is special
    const sourceList = isSpecialSection(sourceSlot)
      ? (specialSections?.[sourceSlot] ?? [])
      : (byPosition[sourceSlot] ?? []);
    const overIndex = sourceList.findIndex((p) => p.id === overPlayerId);

    onDragEnd({
      playerId,
      sourcePosition: sourceSlot,
      targetPosition: sourceSlot,
      newIndex: overIndex >= 0 ? overIndex : sourceList.length,
    });
  }, [byPosition, specialSections, onDragEnd, dragVirtual, playerSlotMap]);

  /** Render a single formation slot */
  const renderSlot = (slotId: FormationSlotId) => {
    const config = SLOT_CONFIG[slotId];
    return (
      <FormationSlot
        key={slotId}
        position={config.position}
        slotId={slotId}
        positionLabel={config.label !== config.position ? config.label : undefined}
        players={displayByPosition[slotId] ?? []}
        squadType={squadType}
        onAdd={() => onAdd(slotId)}
        onRemovePlayer={onRemovePlayer}
        onPlayerClick={onPlayerClick}
        onToggleDoubt={onToggleDoubt}
        onSetSignStatus={onSetSignStatus}
        onTogglePreseason={onTogglePreseason}
        onMoveToSection={onMoveToSection}
      />
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Conditional render (not CSS hidden) — avoids duplicate DnD droppable IDs */}
      {isDesktop ? (
        /* ───────────── Desktop: horizontal pitch (lg+) ───────────── */
        <div className="relative overflow-x-auto rounded-xl">
          <div className="relative bg-green-700 p-4" style={{ width: 'max(100%, 720px)', minHeight: 520 }}>
            <PitchMarkingsHorizontal />
            <div className="relative flex h-full items-stretch justify-between gap-2 px-2 py-2" style={{ minHeight: 488 }}>
              {DESKTOP_GROUPS.map((group, i) => {
                /* Group 2: MDC/MC — closer to vertical centre of pitch */
                const isMidfield = i === 2;
                /* Group 3: EE/MOC/ED — extremos slightly inward, MOC slightly lower */
                const isAttacking = i === 3;

                return (
                  <div
                    key={i}
                    className={`flex flex-1 flex-col items-center ${
                      isMidfield
                        ? 'justify-center gap-[6rem]'
                        : isAttacking
                          ? 'justify-center gap-[3rem]'
                          : group.length === 1
                            ? 'justify-center'
                            : 'justify-between'
                    } py-2`}
                  >
                    {group.map(renderSlot)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ───────────── Mobile/Tablet: vertical pitch (<lg) ───────────── */
        <div className="relative overflow-hidden rounded-xl bg-green-700 p-3">
          <PitchMarkingsVertical />
          <div className="relative flex flex-col gap-1 py-2">
            {MOBILE_GROUPS.map((group, i) => {
              // Full-backs (DE,DD) and wingers (EE,ED) spread to edges
              const isWideRow = group.length === 2 && (
                (group.includes('DE') && group.includes('DD')) ||
                (group.includes('EE') && group.includes('ED'))
              );
              return (
                <div
                  key={i}
                  className={`flex items-start ${isWideRow ? 'justify-between px-[5px]' : 'justify-center gap-1'}`}
                >
                  {group.map(renderSlot)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Extra content inside DndContext — e.g. droppable special sections */}
      {children}

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
