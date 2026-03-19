// src/components/squad/SquadSpecialSection.tsx
// Collapsible section below the pitch for special squad groups (Dúvida, Possibilidades)
// Shows players not in a pitch position — in evaluation or external pipeline candidates
// RELEVANT FILES: src/components/squad/SquadPanelView.tsx, src/components/squad/FormationSlot.tsx, src/lib/constants.ts

'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Plus, Trash2, User } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { POSITION_LABELS } from '@/lib/constants';
import type { Player, PositionCode } from '@/lib/types';
import type { SpecialSquadSection } from '@/lib/constants';

/* ───────────── Section color config ───────────── */

const SECTION_STYLES: Record<SpecialSquadSection, {
  border: string;
  dropHighlight: string;
  headerBg: string;
  headerText: string;
  countBg: string;
  emptyText: string;
}> = {
  DUVIDA: {
    border: 'border-amber-200 dark:border-amber-800',
    dropHighlight: 'border-amber-500 bg-amber-50/50 dark:border-amber-400 dark:bg-amber-950/50',
    headerBg: 'bg-amber-50 dark:bg-amber-950/30',
    headerText: 'text-amber-800 dark:text-amber-300',
    countBg: 'bg-amber-500',
    emptyText: 'Sem jogadores em dúvida',
  },
  POSSIBILIDADE: {
    border: 'border-purple-200 dark:border-purple-800',
    dropHighlight: 'border-purple-500 bg-purple-50/50 dark:border-purple-400 dark:bg-purple-950/50',
    headerBg: 'bg-purple-50 dark:bg-purple-950/30',
    headerText: 'text-purple-800 dark:text-purple-300',
    countBg: 'bg-purple-500',
    emptyText: 'Sem possibilidades adicionadas',
  },
};

/* ───────────── Props ───────────── */

interface SquadSpecialSectionProps {
  sectionKey: SpecialSquadSection;
  label: string;
  players: Player[];
  onAdd: () => void;
  onRemovePlayer: (playerId: number) => void;
}

/* ───────────── Helper ───────────── */

/** Get display name: first + last for long names */
function displayName(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/* ───────────── Compact Player Card ───────────── */

function SectionPlayerCard({
  player,
  onRemove,
}: {
  player: Player;
  onRemove: () => void;
}) {
  const dragId = `player-${player.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId });
  const [showActions, setShowActions] = useState(false);
  const photoUrl = player.photoUrl || player.zzPhotoUrl;
  const posLabel = player.positionNormalized
    ? (POSITION_LABELS[player.positionNormalized as PositionCode] ?? player.positionNormalized)
    : null;

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
    if (wasDragged.current) { wasDragged.current = false; return; }
    setShowActions((v) => !v);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative w-full min-w-[100px] max-w-[160px] cursor-grab rounded-md bg-white/95 shadow-sm touch-none active:cursor-grabbing"
      onClick={handleCardClick}
    >
      {/* Compact card: photo + name + club + position */}
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
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-400 dark:bg-neutral-700">
            <User className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
            {displayName(player.name)}
          </p>
          <p className="truncate text-[9px] leading-tight text-neutral-500 dark:text-neutral-400">
            {player.club || '—'}
          </p>
        </div>
        {/* Position code badge — top-right corner */}
        {posLabel && (
          <span className="shrink-0 rounded bg-neutral-100 px-1 py-0.5 text-[8px] font-bold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
            {player.positionNormalized}
          </span>
        )}
      </div>

      {/* Opinion + status badges */}
      {(player.departmentOpinion || player.recruitmentStatus) && (
        <div className="flex flex-wrap gap-0.5 px-1.5 pb-1">
          <OpinionBadge opinion={player.departmentOpinion} className="px-1 py-0 text-[8px]" />
          {player.recruitmentStatus && (
            <StatusBadge status={player.recruitmentStatus} className="px-1 py-0 text-[8px]" />
          )}
        </div>
      )}

      {/* Expanded actions — shown on tap */}
      {showActions && (
        <div
          className="border-t border-neutral-100 bg-white px-1.5 pb-1 pt-1 rounded-b-md dark:border-neutral-700 dark:bg-neutral-800"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-1">
            <Link
              href={`/jogadores/${player.id}`}
              className="flex-1 rounded px-1.5 py-0.5 text-center text-[9px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
              onClick={(e) => { e.stopPropagation(); setShowActions(false); }}
            >
              Ver perfil
            </Link>
            <button
              className="flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-medium text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/30"
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

/* ───────────── Main Component ───────────── */

export function SquadSpecialSection({
  sectionKey,
  label,
  players,
  onAdd,
  onRemovePlayer,
}: SquadSpecialSectionProps) {
  const styles = SECTION_STYLES[sectionKey];

  // Droppable zone — accepts dragged players from the pitch (same DndContext)
  const { setNodeRef, isOver } = useDroppable({ id: `droppable-${sectionKey}` });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 ${isOver ? styles.dropHighlight : styles.border} overflow-hidden transition-colors`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 ${styles.headerBg}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wide ${styles.headerText}`}>
            {label}
          </span>
          {players.length > 0 && (
            <span className={`${styles.countBg} flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white`}>
              {players.length}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`flex h-6 w-6 items-center justify-center rounded-full ${styles.headerText} hover:bg-black/5 dark:hover:bg-white/10`}
          onClick={onAdd}
          aria-label={`Adicionar jogador a ${label}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content — wrapping player cards (SortableContext for drag) */}
      <div className="p-2">
        {players.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground italic">
            {styles.emptyText}
          </p>
        ) : (
          <SortableContext items={players.map((p) => `player-${p.id}`)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-wrap gap-2">
              {players.map((player) => (
                <SectionPlayerCard
                  key={player.id}
                  player={player}
                  onRemove={() => onRemovePlayer(player.id)}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}
