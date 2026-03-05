// src/components/squad/FormationSlot.tsx
// Formation slot showing position badge, draggable player cards with badges
// Each slot is a droppable area; each player card is draggable for reordering
// RELEVANT FILES: src/components/squad/FormationView.tsx, src/lib/constants.ts, src/lib/types/index.ts

'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { POSITION_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { Player, PositionCode } from '@/lib/types';

interface FormationSlotProps {
  position: PositionCode;
  players: Player[];
  squadType: 'real' | 'shadow';
  onAdd: () => void;
  onRemovePlayer: (playerId: number) => void;
  onPlayerClick?: (playerId: number) => void;
}

/** Get display name: first + last for long names */
function displayName(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/* ───────────── Draggable Player Card ───────────── */

function DraggablePlayerCard({
  player,
  position,
  index,
  squadType,
  onRemove,
  onPlayerClick,
}: {
  player: Player;
  position: PositionCode;
  index: number;
  squadType: 'real' | 'shadow';
  onRemove: () => void;
  onPlayerClick?: (playerId: number) => void;
}) {
  const dragId = `player-${player.id}-${position}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId });
  const [showActions, setShowActions] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Track if a drag happened so we don't toggle actions after dragging
  const wasDragged = useRef(false);
  useEffect(() => {
    if (isDragging) wasDragged.current = true;
  }, [isDragging]);

  function handleCardClick() {
    // Don't toggle actions if we just finished a drag
    if (wasDragged.current) { wasDragged.current = false; return; }
    setShowActions((v) => !v);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative w-full min-w-[110px] max-w-[150px] cursor-grab rounded-md bg-white/90 shadow-sm touch-none active:cursor-grabbing"
      onClick={handleCardClick}
    >
      {/* Card content */}
      <div className="px-2 py-1.5 text-center">
        {/* Priority number for shadow squad */}
        {squadType === 'shadow' && (
          <span className="text-[9px] font-bold text-green-800">{index + 1}ª</span>
        )}
        <p className="text-xs font-semibold leading-tight text-neutral-900">
          {displayName(player.name)}
        </p>
        <p className="text-[10px] leading-tight text-neutral-500">
          {player.club || '—'}
        </p>
        {/* Compact badges */}
        <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
          <OpinionBadge opinion={player.departmentOpinion} className="px-1 py-0 text-[8px]" />
          {player.recruitmentStatus && (
            <StatusBadge status={player.recruitmentStatus} className="px-1 py-0 text-[8px]" />
          )}
        </div>
      </div>

      {/* Action bar — slides in on tap */}
      {showActions && (
        <div
          className="flex items-center justify-between gap-1 border-t border-neutral-200 bg-white px-1.5 py-1 rounded-b-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            className="flex-1 rounded px-1.5 py-1 text-center text-[10px] font-medium text-blue-600 hover:bg-blue-50"
            onClick={(e) => { e.stopPropagation(); setShowActions(false); onPlayerClick?.(player.id); }}
          >
            Ver perfil
          </button>
          <button
            className="flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-1 text-[10px] font-medium text-red-600 hover:bg-red-100"
            onClick={(e) => { e.stopPropagation(); setShowActions(false); onRemove(); }}
            aria-label={`Remover ${player.name}`}
          >
            <Trash2 className="h-3 w-3" />
            Remover
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────── Formation Slot (droppable + sortable container) ───────────── */

export function FormationSlot({ position, players, squadType, onAdd, onRemovePlayer, onPlayerClick }: FormationSlotProps) {
  const label = POSITION_LABELS[position] ?? position;

  // Make this slot a droppable target for cross-position drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `droppable-${position}` });

  // IDs for SortableContext
  const sortableIds = players.map((p) => `player-${p.id}-${position}`);

  return (
    <div
      ref={setDropRef}
      className={`flex min-w-[120px] flex-col items-center gap-1.5 rounded-lg p-1 transition-colors ${
        isOver ? 'bg-white/20' : ''
      }`}
    >
      {/* Position badge */}
      <span className="rounded bg-white/90 px-2.5 py-1 text-xs font-bold text-neutral-900 shadow-sm">
        {position}
      </span>

      {/* Sortable player cards */}
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {players.map((p, i) => (
          <DraggablePlayerCard
            key={p.id}
            player={p}
            position={position}
            index={i}
            squadType={squadType}
            onRemove={() => onRemovePlayer(p.id)}
            onPlayerClick={onPlayerClick}
          />
        ))}
      </SortableContext>

      {/* Add button — onPointerDown stops DnD sensor from swallowing the tap */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 touch-auto rounded-full bg-white/30 px-3 text-xs text-white hover:bg-white/50"
        onClick={onAdd}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Adicionar ${label}`}
      >
        <Plus className="h-3.5 w-3.5" />
        {players.length === 0 && <span className="ml-0.5">Adicionar</span>}
      </Button>
    </div>
  );
}
