// src/components/squad/FormationSlot.tsx
// Formation slot showing position badge, draggable player cards with badges
// Each slot is a droppable area; each player card is draggable for reordering
// RELEVANT FILES: src/components/squad/FormationView.tsx, src/lib/constants.ts, src/lib/types/index.ts

'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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
  onToggleDoubt?: (playerId: number, isDoubt: boolean) => void;
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
  index,
  squadType,
  onRemove,
  onToggleDoubt,
}: {
  player: Player;
  index: number;
  squadType: 'real' | 'shadow';
  onRemove: () => void;
  onToggleDoubt?: (playerId: number, isDoubt: boolean) => void;
}) {
  const dragId = `player-${player.id}`;
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
      className={`relative w-full min-w-[100px] max-w-[160px] cursor-grab rounded-md shadow-sm touch-none active:cursor-grabbing ${
        player.isDoubt
          ? 'border border-dashed border-amber-400 bg-amber-50/90 opacity-80'
          : 'bg-white/95'
      } ${
        squadType === 'shadow' ? RANK_BORDER[index] ?? 'border-l-2 border-l-neutral-200' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Doubt flag — bottom-right corner */}
      {player.isDoubt && (
        <span className="absolute -bottom-1 -right-0.5 z-10 rounded-full bg-amber-500 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-white shadow-sm" title="Dúvida">
          Dúvida
        </span>
      )}

      {/* Rank corner badge — top-right */}
      {squadType === 'shadow' && (
        <span className={`absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-bl-md rounded-tr-md text-[9px] font-bold ${RANK_CORNER[index] ?? 'bg-neutral-100 text-neutral-400'}`}>
          {index + 1}
        </span>
      )}

      {/* Compact card: photo + name + club only */}
      <div className="flex items-center gap-1.5 p-1.5">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            width={28}
            height={28}
            unoptimized
            className="h-7 w-7 shrink-0 rounded object-cover"
          />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-400">
            <User className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold leading-tight text-neutral-900">
            {displayName(player.name)}
          </p>
          <p className="truncate text-[9px] leading-tight text-neutral-500">
            {player.club || '—'}
          </p>
        </div>
      </div>

      {/* Expanded details — shown on tap before actions */}
      {showActions && (
        <div
          className="border-t border-neutral-100 bg-white px-1.5 pb-1 pt-0.5 rounded-b-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Extra info row */}
          <div className="flex flex-wrap gap-x-2 text-[9px] text-neutral-500">
            {posLabel && <span><span className="text-neutral-400">Pos:</span> <span className="font-medium text-neutral-700">{posLabel}</span></span>}
            {player.foot && <span><span className="text-neutral-400">Pé:</span> <span className="font-medium text-neutral-700">{player.foot}</span></span>}
            {dobLabel && <span><span className="text-neutral-400">Nasc:</span> <span className="font-medium text-neutral-700">{dobLabel}</span></span>}
          </div>
          {/* Badges */}
          <div className="mt-0.5 flex flex-wrap gap-0.5">
            <OpinionBadge opinion={player.departmentOpinion} className="px-1 py-0 text-[8px]" />
            {player.recruitmentStatus && (
              <StatusBadge status={player.recruitmentStatus} className="px-1 py-0 text-[8px]" />
            )}
          </div>
          {/* Action buttons */}
          <div className="mt-1 flex items-center justify-between gap-1">
            {onToggleDoubt && (
              <button
                className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                  player.isDoubt
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'text-amber-600 hover:bg-amber-50'
                }`}
                onClick={(e) => { e.stopPropagation(); onToggleDoubt(player.id, !player.isDoubt); }}
                aria-label={player.isDoubt ? 'Remover dúvida' : 'Marcar como dúvida'}
              >
                {player.isDoubt ? '✓ Dúvida' : '? Dúvida'}
              </button>
            )}
            <Link
              href={`/jogadores/${player.id}`}
              className="flex-1 rounded px-1.5 py-0.5 text-center text-[9px] font-medium text-blue-600 hover:bg-blue-50"
              onClick={(e) => { e.stopPropagation(); setShowActions(false); }}
            >
              Ver perfil
            </Link>
            <button
              className="flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-medium text-red-600 hover:bg-red-100"
              onClick={(e) => { e.stopPropagation(); setShowActions(false); onRemove(); }}
              aria-label={`Remover ${player.name}`}
            >
              <Trash2 className="h-2.5 w-2.5" />
              Remover
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Formation Slot (droppable + sortable container) ───────────── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- onPlayerClick kept in interface for backward compat, Link replaced onClick
export function FormationSlot({ position, slotId, positionLabel, players, squadType, onAdd, onRemovePlayer, onPlayerClick, onToggleDoubt }: FormationSlotProps) {
  const label = positionLabel ?? ((POSITION_LABELS as Record<string, string>)[position] ?? position);
  const displayCode = positionLabel ?? position;
  const dndId = slotId ?? position;

  // Make this slot a droppable target for cross-position drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `droppable-${dndId}` });

  // IDs for SortableContext — player-{id} format enables cross-position drag
  const sortableIds = players.map((p) => `player-${p.id}`);

  return (
    <div
      ref={setDropRef}
      className={`flex min-w-[110px] flex-col items-center gap-1 rounded-lg p-1 transition-colors ${
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
            index={i}
            squadType={squadType}
            onRemove={() => onRemovePlayer(p.id)}
            onToggleDoubt={onToggleDoubt}
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
