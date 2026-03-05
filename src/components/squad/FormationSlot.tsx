// src/components/squad/FormationSlot.tsx
// Formation slot showing position badge, draggable player cards with badges
// Each slot is a droppable area; each player card is draggable for reordering
// RELEVANT FILES: src/components/squad/FormationView.tsx, src/lib/constants.ts, src/lib/types/index.ts

'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, User } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { POSITION_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { Player, PositionCode } from '@/lib/types';

interface FormationSlotProps {
  position: string;
  /** Unique slot ID for DnD droppable — defaults to position */
  slotId?: string;
  /** Override the display label (e.g. "DC (E)") */
  positionLabel?: string;
  players: Player[];
  squadType: 'real' | 'shadow';
  onAdd: () => void;
  onRemovePlayer: (playerId: number) => void;
  onPlayerClick?: (playerId: number) => void;
}

/* ───────────── Rank styling for shadow squad priority ───────────── */

/** Left border color by rank (0-indexed) */
const RANK_BORDER: Record<number, string> = {
  0: 'border-l-3 border-l-amber-400',    // 1st — gold
  1: 'border-l-3 border-l-neutral-400',   // 2nd — silver
  2: 'border-l-3 border-l-amber-700',     // 3rd — bronze
};

/** Corner badge style by rank (0-indexed) */
const RANK_CORNER: Record<number, string> = {
  0: 'bg-amber-400 text-white',
  1: 'bg-neutral-300 text-white',
  2: 'bg-amber-700 text-white',
};

/** Get display name: first + last for long names */
function displayName(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/* ───────────── Draggable Player Card ───────────── */

function DraggablePlayerCard({
  player,
  dndId,
  index,
  squadType,
  onRemove,
  onPlayerClick,
}: {
  player: Player;
  /** Slot-based ID for drag (e.g. 'DC_E') */
  dndId: string;
  index: number;
  squadType: 'real' | 'shadow';
  onRemove: () => void;
  onPlayerClick?: (playerId: number) => void;
}) {
  const dragId = `player-${player.id}-${dndId}`;
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

  const photoUrl = player.photoUrl || player.zzPhotoUrl;
  const posLabel = player.positionNormalized
    ? (POSITION_LABELS[player.positionNormalized as PositionCode] ?? player.positionNormalized)
    : null;

  /** Format dob to dd/MM/yyyy */
  const dobLabel = player.dob
    ? (() => { try { return new Date(player.dob!).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return player.dob; } })()
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative w-full min-w-[180px] max-w-[240px] cursor-grab rounded-lg bg-white/95 shadow-sm touch-none active:cursor-grabbing ${
        squadType === 'shadow' ? RANK_BORDER[index] ?? 'border-l-2 border-l-neutral-200' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Rank corner badge — top-right */}
      {squadType === 'shadow' && (
        <span className={`absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-bl-md rounded-tr-lg text-[10px] font-bold ${RANK_CORNER[index] ?? 'bg-neutral-100 text-neutral-400'}`}>
          {index + 1}
        </span>
      )}

      {/* Card content — horizontal layout like the tooltip */}
      <div className="flex items-center gap-2.5 p-2">
        {/* Photo or placeholder */}
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
            <User className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {/* Name */}
          <p className="truncate text-xs font-semibold leading-tight text-neutral-900">
            {displayName(player.name)}
          </p>
          {/* Club */}
          <p className="mt-0.5 truncate text-[10px] leading-tight text-neutral-500">
            {player.club || '—'}
          </p>
          {/* Position, foot, DOB — inline details */}
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px]">
            {posLabel && (
              <span>
                <span className="text-neutral-400">Pos: </span>
                <span className="font-medium text-neutral-700">{posLabel}</span>
              </span>
            )}
            {player.foot && (
              <span>
                <span className="text-neutral-400">Pé: </span>
                <span className="font-medium text-neutral-700">{player.foot}</span>
              </span>
            )}
            {dobLabel && (
              <span>
                <span className="text-neutral-400">Nasc: </span>
                <span className="font-medium text-neutral-700">{dobLabel}</span>
              </span>
            )}
          </div>
          {/* Compact badges */}
          <div className="mt-0.5 flex flex-wrap gap-0.5">
            <OpinionBadge opinion={player.departmentOpinion} className="px-1 py-0 text-[8px]" />
            {player.recruitmentStatus && (
              <StatusBadge status={player.recruitmentStatus} className="px-1 py-0 text-[8px]" />
            )}
          </div>
        </div>
      </div>

      {/* Action bar — slides in on tap */}
      {showActions && (
        <div
          className="flex items-center justify-between gap-1 border-t border-neutral-200 bg-white px-1.5 py-1 rounded-b-lg"
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

export function FormationSlot({ position, slotId, positionLabel, players, squadType, onAdd, onRemovePlayer, onPlayerClick }: FormationSlotProps) {
  const label = positionLabel ?? ((POSITION_LABELS as Record<string, string>)[position] ?? position);
  const displayCode = positionLabel ?? position;
  const dndId = slotId ?? position;

  // Make this slot a droppable target for cross-position drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `droppable-${dndId}` });

  // IDs for SortableContext — use dndId so DC_E and DC_D have unique drag IDs
  const sortableIds = players.map((p) => `player-${p.id}-${dndId}`);

  return (
    <div
      ref={setDropRef}
      className={`flex min-w-[190px] flex-col items-center gap-1.5 rounded-lg p-1 transition-colors ${
        isOver ? 'bg-white/20' : ''
      }`}
    >
      {/* Position badge */}
      <span className="rounded bg-white/90 px-2.5 py-1 text-xs font-bold text-neutral-900 shadow-sm">
        {displayCode}
      </span>

      {/* Sortable player cards */}
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {players.map((p, i) => (
          <DraggablePlayerCard
            key={p.id}
            player={p}
            dndId={dndId}
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
